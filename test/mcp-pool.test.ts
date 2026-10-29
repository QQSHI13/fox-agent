// The shared MCP pool.
//
// The bug this file pins: `buildRegistry` runs per TURN, so before the pool
// every fox process dialed its own MCP children. Two windows, a `--acp` server
// and each subagent meant that many chrome-devtools stacks — measured at +327
// MiB of private memory and a 30-45 s handshake for the second one.
//
// Tested against the real fixture server over the real socket, not a mock: the
// claim "two instances, one set of children" is only true of real processes.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const FIXTURE = join(import.meta.dir, "fixtures", "mcp-server.ts");
const SDK_SERVER = join(import.meta.dir, "..", "node_modules", "@modelcontextprotocol", "sdk", "dist", "esm", "server", "index.js");
const CAN_RUN = existsSync(SDK_SERVER);
const CLI = join(import.meta.dir, "..", "src", "cli.ts");

let home: string;
let daemon: ReturnType<typeof Bun.spawn> | null = null;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "fox-pool-"));
  process.env.FOX_AGENT_HOME = home;
  process.env.FOX_AGENT_CONFIG = join(home, "config.toml");
});

afterEach(async () => {
  if (daemon) {
    daemon.kill("SIGKILL");
    daemon = null;
  }
  // the daemon's children are grandchildren of the test process; the daemon's
  // death does not reap them, so clean up by name
  Bun.spawnSync(["pkill", "-f", "mcp-server.ts"]);
  rmSync(home, { recursive: true, force: true });
  delete process.env.FOX_AGENT_HOME;
  delete process.env.FOX_AGENT_CONFIG;
});

function fixtureCfg() {
  return { fix: { command: process.execPath, args: ["run", FIXTURE] } };
}

/** Live fixture processes: the observable form of "how many pools exist". */
function fixtureProcs(): number {
  return Bun.spawnSync(["ps", "-eo", "args"])
    .stdout.toString()
    .split("\n")
    .filter((l) => l.includes("mcp-server.ts")).length;
}

/** Start the daemon as a real process and wait for its socket. */
async function startDaemon(sockPath: string): Promise<void> {
  daemon = Bun.spawn([process.execPath, "run", CLI, "--mcp-pool", sockPath], {
    env: { ...process.env },
    stdout: "ignore",
    stderr: "ignore",
    stdin: "ignore",
  });
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (existsSync(sockPath)) return;
    await Bun.sleep(25);
  }
  throw new Error("pool daemon never created its socket");
}

describe.skipIf(!CAN_RUN)("the shared MCP pool", () => {
  test("two instances share one set of children, and both can call", async () => {
    const { poolSocketPath, poolTools } = await import("../src/mcp/pool.ts");
    const servers = fixtureCfg();
    const sockPath = poolSocketPath(servers);
    await startDaemon(sockPath);

    // two independent "instances" — separate connections, separate tool objects
    const a = await poolTools(servers);
    const b = await poolTools(servers);
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(a!.tools.has("mcp")).toBe(true);

    const callA = await a!.tools.get("mcp")!.run({ server: "fix", tool: "echo", arguments: { message: "one" } }, {} as never);
    const callB = await b!.tools.get("mcp")!.run({ server: "fix", tool: "echo", arguments: { message: "two" } }, {} as never);
    expect(callA).toMatchObject({ ok: true, output: "echo: one" });
    expect(callB).toMatchObject({ ok: true, output: "echo: two" });

    // THE claim: one pool, not one per instance. The fixture is one process
    // (bun run <file>), so two pools would show up as two.
    expect(fixtureProcs()).toBe(1);
  }, 60_000);

  test("the socket path is keyed by the server config", async () => {
    const { poolSocketPath } = await import("../src/mcp/pool.ts");
    const one = poolSocketPath({ fix: { command: "x", args: ["a"] } });
    const same = poolSocketPath({ fix: { command: "x", args: ["a"] } });
    const other = poolSocketPath({ fix: { command: "x", args: ["b"] } });
    expect(one).toBe(same);
    // two different configs must never share a pool: they would cross-route calls
    expect(other).not.toBe(one);
  });
});

describe("pool fallback", () => {
  test("no reachable daemon and no way to spawn one -> null, so the caller dials locally", async () => {
    // Under bun test, Bun.main is THIS file, so relaunching it with --mcp-pool
    // would start the wrong program: the pool must decline rather than guess.
    const { poolTools } = await import("../src/mcp/pool.ts");
    const { canSelfExec } = await import("../src/core/selfexec.ts");
    expect(canSelfExec()).toBe(false);
    const out = await poolTools({ nowhere: { command: "definitely-not-a-real-binary-xyz", args: [] } });
    expect(out).toBeNull();
  }, 20_000);
});
