/**
 * ONE MCP pool for the whole machine, shared by every fox instance and every
 * config.
 *
 * `buildRegistry` runs per turn (`loop/turn.ts:501`), so before this file every
 * fox process dialed its own MCP children: N TUI windows, a `--acp` server and
 * each `task` subagent meant N chrome-devtools stacks. Measured on this machine:
 * a second instance on the same Chrome profile costs +327 MiB of *private*
 * memory and a 30-45 s cold start, while the TUI front-end it serves is ~5 MiB.
 * The pool is the part worth sharing, not the loop.
 *
 * Shape: a detached `fox --mcp-pool <sock>` owns the clients and answers over a
 * unix socket. Each instance still sees the single `mcp` tool it always had.
 *
 * There is exactly ONE daemon (fixed socket name, no config hash). It holds
 * every server any instance has ever asked for, keyed by SERVER NAME, and dials
 * incrementally — so two configs that both name `chrome` share one child
 * instead of spawning two. Each caller still only SEES the servers its own
 * config declares: the daemon filters the catalog it returns, so a user with
 * `[mcpServers.chrome]` never gets `pg` tools appearing because another window
 * configured postgres.
 *
 * Lifetime is the daemon's own: it exits after IDLE_EXIT_MS with no connections
 * and kills what it owns. An instance shutting down closes its socket and
 * nothing else — a session ending must not stop servers another session is
 * using.
 *
 * Deliberately NOT shared: tool execution generally, the loop, the session store.
 * Those are ~3.4 MiB of private memory per instance and a protocol each; the MCP
 * pool is ~58 MiB per instance and needs only two messages.
 */
import { existsSync, rmSync } from "node:fs";
import { connect as netConnect, createServer, type Socket } from "node:net";
import { join } from "node:path";
import { agentHome } from "../core/paths.ts";
import { childEnv } from "../core/childenv.ts";
import type { McpServerConfig } from "../core/config.ts";
import type { Tool, ToolResult } from "../core/tool.ts";
import { fail } from "../core/tool.ts";

/** argv flag the daemon entry point (and the spawner) agree on. */
export const POOL_FLAG = "--mcp-pool";

/** No connections for this long and the daemon exits: nothing outlives its users forever. */
const IDLE_EXIT_MS = 10 * 60_000;
/** How long a spawner waits for the daemon's socket, or for a concurrent one's bind. */
const CONNECT_DEADLINE_MS = 5_000;
/** A single MCP call can legitimately take minutes (a browser navigation). */
const CALL_TIMEOUT_MS = 15 * 60_000;

/**
 * The daemon's socket. ONE name, not a config hash.
 *
 * The old path carried `sha256(config).slice(0,16)`, which meant every distinct
 * server set got its own daemon — so `{chrome}` and `{chrome,pg}` each spawned a
 * daemon and `chrome` ran TWICE, on the same profile, which is the exact
 * duplication the pool exists to prevent.
 */
export function poolSocketPath(): string {
  return join(agentHome(), "mcp-pool.sock");
}

/** One newline-delimited JSON request/response channel. Client asks, daemon answers. */
class Link {
  private buf = "";
  private decoder = new TextDecoder();
  private pending = new Map<number, (v: unknown) => void>();
  private nextId = 1;
  closed = false;

  constructor(
    readonly sock: Socket,
    private onRequest?: (msg: Record<string, unknown>) => Promise<unknown>,
  ) {
    sock.on("data", (b: Buffer) => {
      this.buf += this.decoder.decode(b, { stream: true });
      let i: number;
      while ((i = this.buf.indexOf("\n")) >= 0) {
        const line = this.buf.slice(0, i);
        this.buf = this.buf.slice(i + 1);
        if (line) void this.dispatch(line);
      }
    });
    sock.on("close", () => this.teardown());
    sock.on("error", () => this.teardown());
  }

  private teardown() {
    if (this.closed) return;
    this.closed = true;
    for (const done of this.pending.values()) done(undefined);
    this.pending.clear();
  }

  private async dispatch(line: string) {
    let msg: Record<string, unknown> & { id?: number; result?: unknown; error?: unknown };
    try {
      msg = JSON.parse(line);
    } catch {
      return; // one garbled line is one bad message, not a broken channel
    }
    if (typeof msg.id !== "number") return;
    const waiting = this.pending.get(msg.id);
    if (waiting) {
      this.pending.delete(msg.id);
      return waiting(msg.error ? { error: String(msg.error) } : msg.result);
    }
    if (!this.onRequest) return;
    try {
      this.send({ id: msg.id, result: await this.onRequest(msg) });
    } catch (e) {
      this.send({ id: msg.id, error: (e as Error).message });
    }
  }

  send(obj: unknown) {
    if (this.closed) return;
    try {
      this.sock.write(JSON.stringify(obj) + "\n");
    } catch {
      this.teardown();
    }
  }

  request(msg: Record<string, unknown>, timeoutMs = CALL_TIMEOUT_MS): Promise<unknown> {
    if (this.closed) return Promise.resolve(undefined);
    const id = this.nextId++;
    return new Promise((resolve) => {
      this.pending.set(id, resolve);
      if (timeoutMs > 0) {
        const t = setTimeout(() => {
          if (this.pending.delete(id)) resolve({ error: `pool timed out after ${timeoutMs}ms` });
        }, timeoutMs);
        t.unref?.();
      }
      this.send({ ...msg, id });
    });
  }
}

/**
 * The daemon. Dialed on the FIRST request, not at listen: the socket exists
 * immediately so a concurrent spawner connects here instead of starting a
 * second pool, while the 30-45 s MCP handshake happens once, behind the first
 * caller that actually needs it.
 */
export async function runPoolDaemon(sockPath: string): Promise<void> {
  try {
    if (existsSync(sockPath)) rmSync(sockPath, { force: true });
  } catch {}

  /**
   * Bring the pool up to the union of every config seen so far, then answer
   * from it.
   *
   * INCREMENTAL on purpose. The old daemon memoized ONE dial behind
   * `dialing ??= …`, keyed on the first caller's config and never invalidated —
   * so a second instance asking for one more server silently received the first
   * instance's tool set, forever. `mcpAddServers` dials only what is genuinely
   * new or changed, so a `chrome` bridge already running for one window is not
   * re-dialed because another window mentions postgres.
   */
  const ensure = async (servers: Record<string, McpServerConfig> | undefined): Promise<void> => {
    if (!servers || !Object.keys(servers).length) return;
    const { mcpAddServers } = await import("./client.ts");
    for (const w of await mcpAddServers(servers)) process.stderr.write(`fox-agent: ${w}\n`);
  };

  let conns = 0;
  let idle: ReturnType<typeof setTimeout> | undefined;
  const armIdle = () => {
    if (idle) clearTimeout(idle);
    idle = setTimeout(() => {
      if (conns > 0) return;
      void (async () => {
        const { closeMcp } = await import("./client.ts");
        closeMcp();
        try {
          rmSync(sockPath, { force: true });
        } catch {}
        process.exit(0);
      })();
    }, IDLE_EXIT_MS);
    idle.unref?.();
  };

  const srv = createServer((sock) => {
    conns++;
    if (idle) clearTimeout(idle);
    const link = new Link(sock, async (msg) => {
      const method = msg.method;
      const servers = msg.servers as Record<string, McpServerConfig> | undefined;
      const declared = Object.keys(servers ?? {});

      if (method === "catalog") {
        if (!servers) throw new Error("catalog requires the server config");
        await ensure(servers);
        const { mcpCatalog } = await import("./client.ts");
        const full = mcpCatalog();
        // FILTER to what THIS caller declared. The pool holds the union of every
        // instance's servers; without this, a window configured only with
        // `chrome` would advertise `pg` tools because another window had
        // postgres — a tool the model can see but this session never asked for.
        const mine: Record<string, string[]> = {};
        for (const name of declared) if (full[name]) mine[name] = full[name]!;
        return { catalog: mine };
      }

      if (method === "call") {
        await ensure(servers);
        const { mcpRunTool } = await import("./client.ts");
        // `declared` is the authorization list: the daemon holds servers this
        // caller never configured, and it must not run one on request.
        return await mcpRunTool(
          msg.server as string,
          msg.tool as string,
          msg.arguments,
          declared,
        );
      }

      throw new Error(`unknown pool method ${String(method)}`);
    });
    const done = () => {
      conns--;
      if (conns === 0) armIdle();
    };
    sock.on("close", done);
    sock.on("error", done);
    void link;
  });

  srv.on("error", (e: NodeJS.ErrnoException) => {
    // EADDRINUSE: a concurrent instance won the bind a moment ago and serves
    // this client too. Exiting is the correct outcome, not a failure.
    if (e.code === "EADDRINUSE") process.exit(0);
    throw e;
  });

  await new Promise<void>((resolve) => srv.listen(sockPath, resolve));
  armIdle();
  // the listening socket alone keeps this process alive
  await new Promise<void>(() => {});
}

/**
 * Client side: the same single `mcp` tool, routed over the socket. `null` means
 * no pool is reachable, so the caller keeps today's local behaviour.
 */
export async function poolTools(
  servers: Record<string, McpServerConfig>,
): Promise<{ tools: Map<string, Tool>; warnings: string[] } | null> {
  // No servers, no pool. Without this the empty config hashed to its own socket
  // path and spawned a daemon that answered an empty catalog and was then
  // dropped — 359 ms and a process, for nothing.
  if (!Object.keys(servers).length) return { tools: new Map(), warnings: [] };

  const sockPath = poolSocketPath();
  // The socket is cached inside connectOrSpawn, so both this and warmPool share
  // one connection instead of opening their own and abandoning it.
  const link = await connectOrSpawn(sockPath);
  if (!link) return null;

  const res = (await link.request({ method: "catalog", servers })) as
    | { catalog?: Record<string, string[]>; error?: string }
    | undefined;
  if (!res || res.error || !res.catalog) {
    // a failed catalog is not a reusable connection: drop it so the next call
    // redials instead of repeating the same failure forever
    link.sock.destroy();
    poolLinks.delete(sockPath);
    return null;
  }
  const catalog = res.catalog;
  if (!Object.keys(catalog).length) return { tools: new Map(), warnings: [] };

  const { mcpToolDef } = await import("./client.ts");
  const def = mcpToolDef(catalog);
  const tool: Tool = {
    def,
    run: async (args: { server?: string; tool?: string; arguments?: unknown }): Promise<ToolResult> => {
      const out = (await link.request({
        method: "call",
        servers,
        server: args?.server,
        tool: args?.tool,
        arguments: args?.arguments,
      })) as (ToolResult & { error?: string }) | undefined;
      if (!out) return fail("error: mcp pool connection closed");
      if (out.error) return fail(`error: ${out.error}`);
      return { ok: out.ok, output: out.output, ...(out.media ? { media: out.media } : {}) };
    },
  };
  return { tools: new Map([[def.name, tool]]), warnings: [] };
}

/** One socket per pool socket path, reused for the life of the process. */
const poolLinks = new Map<string, Link>();

/**
 * Close every cached pool connection.
 *
 * Called from `shutdownTools`. Without it the cached links are REFERENCED
 * handles holding the event loop open, so the process never reaches natural
 * exit — the TUI tears down, prints the resume hint, and then sits there. The
 * sockets are also `unref`'d where created, which makes that impossible even if
 * this is never called; destroying them here is what drops the daemon's
 * connection count so its own idle timer can run.
 */
export function closePool(): void {
  for (const link of poolLinks.values()) {
    try {
      link.sock.destroy();
    } catch {}
  }
  poolLinks.clear();
}

/** Reuse a live pool, else spawn one and wait for its socket. */
async function connectOrSpawn(sockPath: string): Promise<Link | null> {
  // Cache at the source, so BOTH callers share one socket: `poolTools` per turn
  // and `warmPool` at startup. warmPool used to drop the Link on the floor,
  // leaving a connected socket nobody could close.
  const cached = poolLinks.get(sockPath);
  if (cached && !cached.closed) return cached;
  if (cached) poolLinks.delete(sockPath);

  // Reuse first: a daemon that already answers needs no spawn at all, and this
  // is the path a warm pool takes on every turn.
  const hit = await connect(sockPath);
  if (hit) {
    poolLinks.set(sockPath, hit);
    return hit;
  }

  const { selfCommand, canSelfExec } = await import("../core/selfexec.ts");
  // Under `bun test`, the SDK, or any embedder, `Bun.main` is the embedder's
  // entry — relaunching it with --mcp-pool would start the WRONG program. No
  // pool then, and the caller dials locally exactly as it did before.
  if (!canSelfExec()) return null;

  const { command, args } = selfCommand();
  try {
    const p = Bun.spawn({
      // BOTH halves: from source `command` is bun and `args` is [cli.ts]; dropping
      // either one yielded `exec cli.ts`, which is not executable, and the spawn
      // failed silently into the fallback below.
      cmd: [command, ...args, POOL_FLAG, sockPath],
      stdin: "ignore",
      stdout: "ignore",
      stderr: "ignore",
      env: childEnv(),
    });
    p.unref();
  } catch {
    return null; // cannot relaunch ourselves: the caller dials locally, as before
  }

  const deadline = Date.now() + CONNECT_DEADLINE_MS;
  while (Date.now() < deadline) {
    await Bun.sleep(25);
    const c = await connect(sockPath);
    if (c) {
      poolLinks.set(sockPath, c);
      return c;
    }
  }
  return null;
}

/**
 * Start the pool now, without waiting for it: called from every startup mode
 * (TUI, --acp, -p) so the first turn does not pay the dial.
 *
 * Deliberately fire-and-forget and silent: startup must not block on a 30-45 s
 * MCP handshake, and a pool that fails to start must leave the caller falling
 * back to a local dial exactly as if this had never been called.
 */
export function warmPool(servers: Record<string, McpServerConfig>, enabled: boolean | undefined): void {
  if (enabled === false || !Object.keys(servers).length) return;
  void connectOrSpawn(poolSocketPath()).catch(() => {});
}

function connect(sockPath: string): Promise<Link | null> {
  return new Promise((resolve) => {
    const sock = netConnect(sockPath);
    // `unref` so a cached pool socket never keeps the process alive on its own.
    // A connected socket is a referenced handle; without this the TUI could
    // finish tearing down and still never reach natural exit, because one live
    // socket remained in the event loop. I/O still works — unref only affects
    // keep-alive, and during a session stdin and the frame timer hold the loop.
    (sock as unknown as { unref?: () => void }).unref?.();
    let settled = false;
    sock.once("connect", () => {
      settled = true;
      resolve(new Link(sock));
    });
    sock.once("error", () => {
      sock.destroy();
      if (!settled) resolve(null);
    });
  });
}
