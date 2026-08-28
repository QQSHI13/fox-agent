// The MCP bridge against a real server process.
//
// Everything here was previously untested: src/tools/mcp.ts had one test, for
// `buildRegistry` with *zero* servers configured, so the spawn, the handshake,
// `listTools`, the tool naming, the output cap and the two failure paths had
// never executed. The fixture in test/fixtures/mcp-server.ts is the other end.
//
// Gated on the SDK's server half being present rather than assumed: fox-agent imports
// the MCP SDK dynamically so it can run without it, and a test that hard-failed
// on a client-only install would contradict that.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BIG_LEN } from "./fixtures/mcp-server.ts";

const FIXTURE = join(import.meta.dir, "fixtures", "mcp-server.ts");
const SDK_SERVER = join(import.meta.dir, "..", "node_modules", "@modelcontextprotocol", "sdk", "dist", "esm", "server", "index.js");
const CAN_RUN = existsSync(SDK_SERVER);

/** OUT_CAP_MCP in src/tools/mcp.ts — private there, restated here on purpose. */
const OUT_CAP_MCP = 30_000;

let home: string;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "fox-mcp-"));
  process.env.FOX_AGENT_HOME = home;
});

afterEach(async () => {
  // the module-level client cache outlives a test, so a leaked child would be
  // inherited by the next one and make failures order-dependent
  const { closeMcp } = await import("../src/tools/mcp.ts");
  await closeMcp();
  rmSync(home, { recursive: true, force: true });
});

/** The fixture as an McpServerConfig. `bun run <file>` — it is TypeScript. */
function fixtureCfg(name = "fix") {
  return { [name]: { command: process.execPath, args: ["run", FIXTURE] } };
}

/** Live processes running the fixture, so a leak is observable. */
function fixtureProcs(): number {
  const p = Bun.spawnSync(["ps", "-eo", "args"]);
  return p.stdout
    .toString()
    .split("\n")
    .filter((l) => l.includes("mcp-server.ts")).length;
}

describe.skipIf(!CAN_RUN)("mcp bridge against a live server", () => {
  test("spawns, handshakes, and merges the server's tools into the registry", async () => {
    const { mcpTools } = await import("../src/tools/mcp.ts");
    const { tools, warnings } = await mcpTools(fixtureCfg());

    expect(warnings).toEqual([]);
    // the namespacing that keeps two servers with an `echo` apiece apart
    expect([...tools.keys()]).toEqual(["mcp__fix__echo", "mcp__fix__boom", "mcp__fix__big"]);

    const echo = tools.get("mcp__fix__echo")!;
    expect(echo.def.description).toStartWith("[mcp:fix] ");
    // the full description survives — this one contains a ". ", which the old
    // prompt-side formatter used to cut at (see src/loop/prompt.ts's comment)
    expect(echo.def.description).toContain("would cut it here");
    // the server's JSON Schema reaches def.parameters verbatim, because that is
    // what the provider sends to the model
    expect(echo.def.parameters).toEqual({
      type: "object",
      properties: { message: { type: "string" } },
      required: ["message"],
    });
  }, 30_000);

  test("callTool round-trips through the real server", async () => {
    const { mcpTools } = await import("../src/tools/mcp.ts");
    const { tools } = await mcpTools(fixtureCfg());
    // the output is computed by the fixture, so this cannot pass unless the
    // spawn, the initialize handshake and the tools/call round trip all happened
    const res = await tools.get("mcp__fix__echo")!.run({ message: "hi" }, {} as never);
    expect(res).toEqual({ ok: true, output: "echo: hi" });
  }, 30_000);

  test("a tool result flagged isError becomes a failure, not a throw", async () => {
    const { mcpTools } = await import("../src/tools/mcp.ts");
    const { tools } = await mcpTools(fixtureCfg());
    const res = await tools.get("mcp__fix__boom")!.run({}, {} as never);
    // `isError: true` is a protocol-level result, distinct from a transport
    // failure; both must reach the model as text it can react to
    expect(res).toEqual({ ok: false, output: "boom: deliberate tool failure" });
  }, 30_000);

  test("oversized output is capped where the bridge caps it", async () => {
    const { mcpTools } = await import("../src/tools/mcp.ts");
    const { tools } = await mcpTools(fixtureCfg());
    const res = (await tools.get("mcp__fix__big")!.run({}, {} as never)) as { ok: boolean; output: string };
    expect(BIG_LEN).toBeGreaterThan(OUT_CAP_MCP); // the fixture must actually overflow
    // capped here rather than left to the turn loop's tail-cap: an MCP server can
    // return a whole file and the loop's cap is 2x larger, so without this one
    // call could swallow the window
    expect(res.output).toHaveLength(OUT_CAP_MCP);
    expect(res.ok).toBe(true);
  }, 30_000);

  test("one unreachable server warns and leaves the others working", async () => {
    const { mcpTools } = await import("../src/tools/mcp.ts");
    const { tools, warnings } = await mcpTools({
      ...fixtureCfg("good"),
      bad: { command: join(home, "definitely-not-a-real-binary") },
    });

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("mcp server 'bad' unavailable");
    // the good server is unaffected — a typo'd entry must not cost the user
    // every other server they configured
    expect(tools.has("mcp__good__echo")).toBe(true);
    expect([...tools.keys()].some((k) => k.startsWith("mcp__bad__"))).toBe(false);
  }, 30_000);

  test("the same config is cached; a changed one reaps the old children first", async () => {
    const { mcpTools } = await import("../src/tools/mcp.ts");
    const first = await mcpTools(fixtureCfg());
    const before = fixtureProcs();
    expect(before).toBeGreaterThan(0);

    // identical config: the very same Map, no second spawn
    const again = await mcpTools(fixtureCfg());
    expect(again.tools).toBe(first.tools);
    expect(fixtureProcs()).toBe(before);

    // a different config replaces the connection set rather than accumulating —
    // otherwise a config reload per ACP run would leak a child every time
    const changed = await mcpTools(fixtureCfg("renamed"));
    expect(changed.tools).not.toBe(first.tools);
    expect(changed.tools.has("mcp__renamed__echo")).toBe(true);
    await Bun.sleep(200);
    expect(fixtureProcs()).toBe(before);
  }, 30_000);

  test("closeMcp kills the children and clears the cache", async () => {
    const { mcpTools, closeMcp } = await import("../src/tools/mcp.ts");
    const first = await mcpTools(fixtureCfg());
    expect(fixtureProcs()).toBeGreaterThan(0);

    await closeMcp();
    await Bun.sleep(200);
    expect(fixtureProcs()).toBe(0);

    // the cache went with them, so the next call is a genuine reconnect rather
    // than a Map of tools whose transport is dead
    const second = await mcpTools(fixtureCfg());
    expect(second.tools).not.toBe(first.tools);
    expect(await second.tools.get("mcp__fix__echo")!.run({ message: "again" }, {} as never)).toEqual({
      ok: true,
      output: "echo: again",
    });
  }, 30_000);

  test("buildRegistry serves built-ins and MCP tools from one map", async () => {
    const { buildRegistry } = await import("../src/tools/index.ts");
    const { loadConfig } = await import("../src/core/config.ts");
    const cfg = loadConfig({ cwd: home, model: "test-model", apiKey: "k" }, {});
    cfg.mcpServers = fixtureCfg();

    const { tools, warnings } = await buildRegistry(cfg);
    expect(warnings).toEqual([]);
    expect(tools.has("read")).toBe(true); // built-ins still there
    expect(tools.has("mcp__fix__echo")).toBe(true);
    // and the prompt roster is derived from this map, so an MCP tool is described
    // to the model with no prompt-side work (src/loop/prompt.ts:45)
    const { buildSystemPrompt } = await import("../src/loop/prompt.ts");
    const { createSession } = await import("../src/store/db.ts");
    const s = createSession(home, "test-model");
    const prompt = buildSystemPrompt({
      sessionId: s.id,
      cwd: home,
      model: "test-model",
      tools: [...tools.values()].map((t) => t.def),
    });
    expect(prompt).toContain("mcp__fix__echo");
  }, 30_000);
});
