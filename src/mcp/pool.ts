/**
 * ONE MCP pool per config, shared by every fox instance.
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
 * The socket path carries a hash of the server config, so two configs cannot
 * share (and silently cross-route) one pool. If the socket cannot be reached the
 * caller dials its own children exactly as before, so MCP never depends on the
 * daemon being spawnable.
 *
 * Deliberately NOT shared: tool execution generally, the loop, the session store.
 * Those are ~3.4 MiB of private memory per instance and a protocol each; the MCP
 * pool is ~58 MiB per instance and needs only two messages.
 */
import { createHash } from "node:crypto";
import { existsSync, rmSync } from "node:fs";
import { connect as netConnect, createServer, type Socket } from "node:net";
import { join } from "node:path";
import { agentHome } from "../core/paths.ts";
import { childEnv } from "../core/childenv.ts";
import type { McpServerConfig } from "../core/config.ts";
import type { Tool, ToolContext, ToolResult } from "../tools/types.ts";
import { fail } from "../tools/types.ts";

/** argv flag the daemon entry point (and the spawner) agree on. */
export const POOL_FLAG = "--mcp-pool";

/** No clients for this long and the daemon exits: nothing outlives its users forever. */
const IDLE_EXIT_MS = 10 * 60_000;
/** How long a spawner waits for the daemon's socket, or for a concurrent one's bind. */
const CONNECT_DEADLINE_MS = 5_000;
/** A single MCP call can legitimately take minutes (a browser navigation). */
const CALL_TIMEOUT_MS = 15 * 60_000;

export function poolSocketPath(servers: Record<string, McpServerConfig>): string {
  const h = createHash("sha256").update(JSON.stringify(servers)).digest("hex").slice(0, 16);
  return join(agentHome(), `mcp-pool-${h}.sock`);
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

  let dialing: Promise<Map<string, Tool>> | null = null;
  const tools = (servers: Record<string, McpServerConfig>) =>
    (dialing ??= (async () => {
      const { mcpTools } = await import("../tools/mcp.ts");
      const { tools: map, warnings } = await mcpTools(servers);
      for (const w of warnings) process.stderr.write(`fox-agent: ${w}\n`);
      return map;
    })().catch((e) => {
      dialing = null; // a failed dial must not poison the daemon for later callers
      throw e;
    }));

  let conns = 0;
  let idle: ReturnType<typeof setTimeout> | undefined;
  const armIdle = () => {
    if (idle) clearTimeout(idle);
    idle = setTimeout(() => {
      if (conns > 0) return;
      void (async () => {
        const { closeMcp } = await import("../tools/mcp.ts");
        closeMcp();
        rmSync(sockPath, { force: true });
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
      if (method === "catalog") {
        const servers = msg.servers as Record<string, McpServerConfig> | undefined;
        if (!servers) throw new Error("catalog requires the server config");
        const map = await tools(servers);
        const { mcpCatalog } = await import("../tools/mcp.ts");
        return { catalog: mcpCatalog() };
      }
      if (method === "call") {
        const map = await tools(msg.servers as Record<string, McpServerConfig>);
        const mcp = map.get("mcp");
        if (!mcp) return fail("error: no MCP servers reachable");
        return await mcp.run(
          { server: msg.server as string, tool: msg.tool as string, arguments: msg.arguments },
          // The bridge's own run() only reads its arguments — the context is
          // never touched, and the daemon has no session to give it anyway.
          { sessionId: "mcp-pool", cwd: agentHome() } as ToolContext,
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
  const sockPath = poolSocketPath(servers);
  const link = await connectOrSpawn(sockPath);
  if (!link) return null;

  const res = (await link.request({ method: "catalog", servers })) as
    | { catalog?: Record<string, string[]>; error?: string }
    | undefined;
  if (!res || res.error || !res.catalog) {
    link.sock.destroy();
    return null;
  }
  const catalog = res.catalog;
  if (!Object.keys(catalog).length) return { tools: new Map(), warnings: [] };

  const { mcpToolDef } = await import("../tools/mcp.ts");
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

/** Reuse a live pool, else spawn one and wait for its socket. */
async function connectOrSpawn(sockPath: string): Promise<Link | null> {
  const hit = await connect(sockPath);
  if (hit) return hit;

  const { selfCommand, canSelfExec } = await import("../core/selfexec.ts");
  // Under `bun test`, the SDK, or any embedder, `Bun.main` is the embedder's
  // entry — relaunching it with --mcp-pool would start the WRONG program. No
  // pool then, and the caller dials locally exactly as it did before.
  if (!canSelfExec()) return null;

  const { args } = selfCommand();
  try {
    const p = Bun.spawn({
      cmd: [...args, POOL_FLAG, sockPath],
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
    if (c) return c;
  }
  return null;
}

function connect(sockPath: string): Promise<Link | null> {
  return new Promise((resolve) => {
    const sock = netConnect(sockPath);
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
