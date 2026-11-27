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
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
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

/** Start the daemon as a real process and wait until it ANSWERS, not just
 *  until its socket file exists. The file appears at bind, but the first
 *  catalog/call can still race the daemon's request handling (and, under
 *  load, the fixture dial behind it) — proceeding on existsSync alone made
 *  `poolTools` return null intermittently (~50% standalone). A `status`
 *  round-trip is the true readiness signal: the daemon answers it instantly
 *  and without dialing, so it proves the socket serves requests. */
async function startDaemon(sockPath: string): Promise<void> {
  daemon = Bun.spawn([process.execPath, "run", CLI, "--mcp-pool", sockPath], {
    env: { ...process.env },
    stdout: "ignore",
    stderr: "ignore",
    stdin: "ignore",
  });
  const { poolMcpStatus } = await import("../src/mcp/pool.ts");
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (existsSync(sockPath) && (await poolMcpStatus(fixtureCfg())) !== null) return;
    await Bun.sleep(25);
  }
  throw new Error("pool daemon never became ready");
}

describe.skipIf(!CAN_RUN)("the shared MCP pool", () => {
  test("two instances share one set of children, and both can call", async () => {
    const { poolSocketPath, poolTools } = await import("../src/mcp/pool.ts");
    const servers = fixtureCfg();
    const sockPath = poolSocketPath();
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

  test("progress deltas from a pooled call reach the caller live", async () => {
    // the daemon owns the client, so progress must ride the socket back as
    // unsolicited tagged messages — a long pooled call must not sit silent
    const { poolSocketPath, poolTools } = await import("../src/mcp/pool.ts");
    await startDaemon(poolSocketPath());
    const a = await poolTools(fixtureCfg());
    expect(a).not.toBeNull();
    const events: { type: string; delta?: string }[] = [];
    const res = await a!.tools.get("mcp")!.run({ server: "fix", tool: "progress" }, {
      sessionId: "s",
      cwd: process.cwd(),
      callId: "call-1",
      emit: (ev: unknown) => events.push(ev as { type: string; delta?: string }),
    } as never);
    expect(res).toMatchObject({ ok: true, output: "progress: done" });
    const deltas = events.filter((e) => e.type === "tool_output").map((e) => e.delta ?? "");
    expect(deltas.join("")).toContain("step one");
    expect(deltas.join("")).toContain("step two");
  }, 60_000);

  test("a daemon that dies mid-session is replaced on the next call", async () => {
    // the daemon can idle-exit, OOM or be killed; the cached link used to turn
    // that into "pool connection closed" for the REST OF THE PROCESS
    const { poolSocketPath, poolTools } = await import("../src/mcp/pool.ts");
    const sockPath = poolSocketPath();
    await startDaemon(sockPath);
    const a = await poolTools(fixtureCfg());
    const before = await a!.tools.get("mcp")!.run({ server: "fix", tool: "echo", arguments: { message: "before" } }, {} as never);
    expect(before).toMatchObject({ ok: true, output: "echo: before" });

    // kill whoever actually serves the socket — the module-level handle may be
    // an EADDRINUSE loser that exited the moment another test's daemon won the bind
    const pids = Bun.spawnSync(["pgrep", "-f", sockPath]).stdout.toString().trim().split("\n").filter(Boolean);
    expect(pids.length).toBeGreaterThan(0);
    for (const pid of pids) {
      try {
        process.kill(Number(pid), "SIGKILL");
      } catch {}
    }
    await Bun.sleep(300);
    // a killed daemon leaves its socket file behind; drop it so the
    // replacement's wait-for-socket loop below actually waits for ITS socket
    try {
      rmSync(sockPath, { force: true });
    } catch {}
    // the production client respawns the daemon here; under bun test the pool
    // cannot self-exec, so a replacement stands in for that spawn — what is
    // under test is the client noticing the dead link, evicting it and
    // reconnecting (a fresh daemon also proves the call re-dials on demand)
    await startDaemon(sockPath);

    const after = await a!.tools.get("mcp")!.run({ server: "fix", tool: "echo", arguments: { message: "after" } }, {} as never);
    expect(after).toMatchObject({ ok: true, output: "echo: after" });
  }, 60_000);

  test("a changed config for the same server name replaces the child, not the pool", async () => {
    const { poolSocketPath, poolTools } = await import("../src/mcp/pool.ts");
    await startDaemon(poolSocketPath());
    const v1 = { fix: { command: process.execPath, args: ["run", FIXTURE] } };
    const a = await poolTools(v1);
    expect(await a!.tools.get("mcp")!.run({ server: "fix", tool: "echo", arguments: { message: "v1" } }, {} as never)).toMatchObject({
      ok: true,
      output: "echo: v1",
    });
    expect(fixtureProcs()).toBe(1);

    // same name, different config: the slot's child is replaced, not joined
    const v2 = { fix: { command: process.execPath, args: ["run", FIXTURE], env: { FOX_POOL_TEST_MARKER: "2" } } };
    const b = await poolTools(v2);
    expect(await b!.tools.get("mcp")!.run({ server: "fix", tool: "echo", arguments: { message: "v2" } }, {} as never)).toMatchObject({
      ok: true,
      output: "echo: v2",
    });
    await Bun.sleep(300);
    expect(fixtureProcs()).toBe(1);
  }, 60_000);

  test("callers that predate the proto field still get the legacy catalog shape", async () => {
    // a mixed fleet: an old client binary must keep working against a new
    // daemon (and vice versa) without anyone restarting a healthy pool
    const net = await import("node:net");
    const raw = (sockPath: string, msg: Record<string, unknown>): Promise<Record<string, unknown>> =>
      new Promise((resolve, reject) => {
        const sock = net.connect(sockPath);
        let buf = "";
        sock.on("connect", () => sock.write(JSON.stringify(msg) + "\n"));
        sock.on("data", (b: Buffer) => {
          buf += b.toString();
          const i = buf.indexOf("\n");
          if (i < 0) return;
          try {
            resolve(JSON.parse(buf.slice(0, i)) as Record<string, unknown>);
          } catch (e) {
            reject(e);
          }
          sock.destroy();
        });
        sock.on("error", reject);
      });

    const { poolSocketPath } = await import("../src/mcp/pool.ts");
    const sockPath = poolSocketPath();
    await startDaemon(sockPath);

    const legacy = (await raw(sockPath, { id: 1, method: "catalog", servers: fixtureCfg() })) as {
      result?: { catalog?: Record<string, string[]> };
    };
    expect(Array.isArray(legacy.result?.catalog?.fix)).toBe(true);
    expect(typeof legacy.result!.catalog!.fix[0]).toBe("string");

    const modern = (await raw(sockPath, { id: 2, method: "catalog", servers: fixtureCfg(), proto: 2 })) as {
      result?: { catalog?: Record<string, { name: string; description: string }[]> };
    };
    expect(modern.result!.catalog!.fix[0].description).toBeTruthy();
  }, 60_000);

  test("there is ONE daemon: the socket path does not depend on the config", async () => {
    // This used to be the opposite assertion — the path carried
    // sha256(config).slice(0,16), so two configs got two daemons and a server
    // both of them named (a `chrome` bridge) was spawned TWICE on the same
    // profile. One machine-wide daemon is the whole point.
    const { poolSocketPath } = await import("../src/mcp/pool.ts");
    expect(poolSocketPath()).toBe(poolSocketPath());
    expect(poolSocketPath()).toContain("mcp-pool.sock");
  });

  test("two configs naming different servers share one daemon", async () => {
    const { poolSocketPath, poolTools } = await import("../src/mcp/pool.ts");
    const sockPath = poolSocketPath();
    await startDaemon(sockPath);

    // instance A declares only `fix`
    const a = await poolTools(fixtureCfg());
    expect(a).not.toBeNull();
    expect(fixtureProcs()).toBe(1);

    // instance B declares `fix` PLUS a second server. The daemon must
    // accumulate, not restart: `fix` is untouched, so its child count stays 1.
    const both = { ...fixtureCfg(), fix2: { command: process.execPath, args: ["run", FIXTURE] } };
    const b = await poolTools(both);
    expect(b).not.toBeNull();
    // two DIFFERENT server names => two children; the point is that `fix` was
    // not re-dialed and no second daemon appeared
    expect(fixtureProcs()).toBe(2);

    // A caller only sees the servers ITS config declared.
    const aCatalog = a!.tools.get("mcp")!.def.parameters as { properties: { server: { enum: string[] } } };
    expect(aCatalog.properties.server.enum).toEqual(["fix"]);
    const bCatalog = b!.tools.get("mcp")!.def.parameters as { properties: { server: { enum: string[] } } };
    expect(bCatalog.properties.server.enum.sort()).toEqual(["fix", "fix2"]);
  }, 90_000);

  test("a caller cannot invoke a server another instance configured", async () => {
    // The daemon holds the union of every config; `declared` is the
    // authorization list, so a window that never configured `fix2` cannot call
    // it just because it is running in the pool.
    const { poolSocketPath, poolTools } = await import("../src/mcp/pool.ts");
    const sockPath = poolSocketPath();
    await startDaemon(sockPath);

    const both = { ...fixtureCfg(), fix2: { command: process.execPath, args: ["run", FIXTURE] } };
    await poolTools(both); // bring fix2 up in the pool

    const onlyFix = await poolTools(fixtureCfg());
    const res = await onlyFix!.tools.get("mcp")!.run({ server: "fix2", tool: "echo", arguments: { message: "x" } }, {} as never);
    // a tool may legally return a bare string; narrow so the assertions are
    // about the failure shape rather than an unchecked cast
    if (typeof res === "string") throw new Error(`expected a ToolResult, got ${res}`);
    expect(res.ok).toBe(false);
    expect(res.output).toContain("fix2");
    expect(res.output).toContain("configured here");
  }, 90_000);

  test("an empty config never starts a daemon", async () => {
    // It used to: {} hashed to its own socket path and spawned a pool that
    // answered an empty catalog and was dropped — 359 ms and a process for it.
    const { poolTools, warmPool } = await import("../src/mcp/pool.ts");
    const before = fixtureProcs();
    const out = await poolTools({});
    expect(out).toEqual({ tools: new Map(), warnings: [] });
    warmPool({}, true);
    await Bun.sleep(500);
    expect(fixtureProcs()).toBe(before);
  });

  test("warmPool is a no-op when the pool is switched off", async () => {
    const { warmPool, poolSocketPath } = await import("../src/mcp/pool.ts");
    const sock = poolSocketPath();
    warmPool(fixtureCfg(), false);
    await Bun.sleep(500);
    expect(existsSync(sock)).toBe(false);
  });

  test("config: mcpSharedPool is a recognised key, and only `false` opts out", async () => {
    const { loadConfig } = await import("../src/core/config.ts");
    const cfgPath = join(home, "config.toml");
    writeFileSync(cfgPath, "mcpSharedPool = false\n");
    const off = loadConfig({ cwd: home, configPath: cfgPath });
    expect(off.mcpSharedPool).toBe(false);
    // the bug this pins: the key was missing from KNOWN_KEYS, so a config that
    // set it got "unknown key" and was silently ignored
    expect(off.warnings.filter((w) => w.includes("mcpSharedPool"))).toEqual([]);

    writeFileSync(cfgPath, "mcpSharedPool = true\n");
    expect(loadConfig({ cwd: home, configPath: cfgPath }).mcpSharedPool).toBe(true);
    // absent -> true, from DEFAULTS. The field is optional on Config so a
    // hand-built config still compiles, but a loaded one always answers here;
    // callers read "on unless explicitly false".
    writeFileSync(cfgPath, "model = \"m\"\n");
    expect(loadConfig({ cwd: home, configPath: cfgPath }).mcpSharedPool).toBe(true);
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
