// MCP client bridge: connects configured stdio servers behind ONE `mcp` tool.
// Instead of flattening every server tool into the registry as
// mcp__<server>__<tool> (dozens of entries that bloat the prompt and the tool
// loop), the model calls `mcp { server, tool, arguments }` and this module
// routes to the live client. The SDK is a dynamic import so fox-agent still
// runs (without MCP) if it isn't installed.
import type { McpServerConfig } from "../core/config.ts";
import type { MediaPart, ToolDef } from "../providers/types.ts";
import type { Tool, ToolResult } from "../core/tool.ts";
import { fail, ok } from "../core/tool.ts";
import { childEnv } from "../core/childenv.ts";
import { VERSION } from "../core/version.ts";

const OUT_CAP_MCP = 30_000;

/** Live clients + the per-server tool table, so the single `mcp` tool routes. */
interface LiveClient {
  close: () => Promise<void>;
  /** the stdio child's pid — closeMcp SIGKILLs it when a polite close hangs */
  pid?: number;
  /** false the moment the transport reports the child went away */
  alive: boolean;
}
interface ServerTool {
  /** the tool name as the server reports it (no mcp__ prefix) */
  name: string;
  description: string;
  schema: Record<string, unknown>;
  call: (args: unknown) => Promise<ToolResult>;
}

/**
 * One server's connection state, kept across reconnects.
 *
 * MCP children die (a crashed browser bridge, an npx wrapper that exits, an
 * OOM kill) and nothing used to notice: the tool table was a stale snapshot, so
 * every later call failed forever with the SDK's error and no diagnosis. A slot
 * is the durable half — the config, the tools it last advertised, and the
 * backoff bookkeeping — so a call can reconnect before it runs.
 */
interface ServerSlot {
  name: string;
  cfg: McpServerConfig;
  client: LiveClient | null;
  tools: ServerTool[];
  /** last dial failure, so the model learns WHY, not just that it failed */
  lastError: string | null;
  /** consecutive failed dials since the last success */
  failures: number;
  /** earliest time the next dial may run (exponential backoff) */
  nextAttemptAt: number;
  /** in-flight dial, so concurrent calls share one attempt instead of racing */
  dialing: Promise<boolean> | null;
}

interface McpPool {
  key: string;
  warnings: string[];
  clients: LiveClient[];
  /** server name -> its tools (for the `mcp` tool's enum + routing) */
  servers: Map<string, ServerTool[]>;
  /** every configured server, connected or not — routing, liveness, diagnosis */
  slots: Map<string, ServerSlot>;
  /** the single built `mcp` tool, cached so a config-cache hit returns the
   * identical Map (callers/tests rely on reference identity, not just equality) */
  tools: Map<string, Tool>;
}
let cache: McpPool | null = null;

// ---- lifetime ---------------------------------------------------------------

/** Spawn + handshake + listTools for one server. Generous: npx cold starts. */
const MCP_DIAL_TIMEOUT_MS = 60_000;
/** One tool call. Browser navigation legitimately takes minutes. */
const MCP_CALL_TIMEOUT_MS = 15 * 60_000;
/** Backoff for consecutive dial failures: 1s, 2s, 4s … capped at 60s. */
const MCP_BACKOFF_BASE_MS = 1_000;
const MCP_BACKOFF_MAX_MS = 60_000;

/** Await `p`, but fail after `ms` naming which deadline bit. */
async function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      p,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${what} timed out after ${Math.round(ms / 1000)}s`)), ms);
        (timer as { unref?: () => void }).unref?.();
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function backoffMs(failures: number): number {
  const step = Math.max(0, Math.min(failures, 16) - 1);
  return Math.min(MCP_BACKOFF_MAX_MS, MCP_BACKOFF_BASE_MS * 2 ** step);
}

/**
 * MCP content parts -> ToolResult. Text joins as output; image parts become
 * real MediaParts so a vision-capable model sees the picture instead of a
 * JSON-stringified base64 blob (which is how chrome-devtools screenshots
 * used to arrive — megabytes of base64 as plain text).
 */
function toResult(content: unknown, isError: boolean): ToolResult {
  const parts = content as { type?: string; text?: string; data?: string; mimeType?: string }[] | null;
  if (!Array.isArray(parts)) {
    const s = JSON.stringify(content ?? {});
    return isError ? fail(s) : ok(s);
  }
  const text: string[] = [];
  const media: MediaPart[] = [];
  for (const p of parts) {
    if (p?.type === "image" && typeof p.data === "string") {
      media.push({ mimeType: p.mimeType ?? "image/png", data: p.data });
    } else if (typeof p?.text === "string") {
      text.push(p.text);
    } else {
      text.push(JSON.stringify(p));
    }
  }
  const base = isError ? fail(text.join("\n").slice(0, OUT_CAP_MCP)) : ok(text.join("\n").slice(0, OUT_CAP_MCP));
  return media.length ? { ...base, media } : base;
}

/**
 * Build (or return the cached) single `mcp` tool that fronts every configured
 * server. The tool's description enumerates the reachable server/tool pairs so
 * the model can pick among them; `run` routes { server, tool, arguments } to
 * the live client. One registry entry no matter how many servers/tools exist.
 */
export async function mcpTools(
  servers: Record<string, McpServerConfig>,
): Promise<{ tools: Map<string, Tool>; warnings: string[] }> {
  const key = JSON.stringify(servers);
  if (cache?.key === key) return { tools: cache.tools, warnings: cache.warnings };
  // config changed — drop the old children before standing up new ones
  // (fire-and-forget: the cache is cleared synchronously so the new pool
  // builds fresh; the old children's SIGKILL reap runs in the background)
  if (cache) closeMcp();

  const warnings: string[] = [];
  const slots = new Map<string, ServerSlot>();
  const pool: McpPool = { key, warnings, clients: [], servers: new Map(), slots, tools: new Map() };

  // dial every server in parallel: N cold npx starts used to run in sequence,
  // so three servers meant three handshakes end to end
  await Promise.all(
    Object.entries(servers).map(async ([name, cfg]) => {
      const slot: ServerSlot = {
        name,
        cfg,
        client: null,
        tools: [],
        lastError: null,
        failures: 0,
        nextAttemptAt: 0,
        dialing: null,
      };
      slots.set(name, slot);
      const up = await dialSlot(pool, slot);
      if (!up && slot.lastError) warnings.push(`mcp server '${name}' unavailable: ${slot.lastError.slice(0, 200)}`);
    }),
  );

  rebuildToolFace(pool);
  cache = pool;
  return { tools: pool.tools, warnings };
}

/**
 * Connect one slot: spawn, handshake, list tools — all bounded.
 *
 * Marks the client dead when the transport closes, so a child that dies later
 * cannot leave the slot advertising tools it can no longer serve (the old code
 * cached a snapshot forever: every later call failed with the SDK error and no
 * diagnosis). Concurrent callers share the in-flight attempt, so ten parallel
 * calls against a dead server start ONE child, not ten.
 */
async function dialSlot(pool: McpPool, slot: ServerSlot): Promise<boolean> {
  if (slot.dialing) return slot.dialing;
  const attempt = (async () => {
    try {
      const sdk = await import("@modelcontextprotocol/sdk/client/index.js");
      const stdio = await import("@modelcontextprotocol/sdk/client/stdio.js");
      const client = new sdk.Client({ name: "fox-agent", version: VERSION });
      const transport = new stdio.StdioClientTransport({
        command: slot.cfg.command,
        args: slot.cfg.args ?? [],
        env: childEnv(slot.cfg.env),
        // SDK default is stderr inherit, which points at the parent's stderr —
        // the TUI's own surface. A chatty server (npm exec wrappers print
        // notices/warnings by the line) then smears garbage across the screen;
        // its diagnostics are not worth the pixels, matching lsp/client.ts.
        stderr: "ignore",
      });

      const live: LiveClient = { close: () => client.close(), pid: transport.pid ?? undefined, alive: true };
      const markDead = () => {
        live.alive = false;
        if (slot.client === live) slot.client = null;
      };
      const t = transport as { onclose?: () => void; onerror?: () => void };
      t.onclose = markDead;
      t.onerror = markDead;

      await withTimeout(client.connect(transport), MCP_DIAL_TIMEOUT_MS, `mcp '${slot.name}' connect`);
      const res = await withTimeout(client.listTools(), MCP_DIAL_TIMEOUT_MS, `mcp '${slot.name}' listTools`);

      slot.tools = res.tools.map((tool) => ({
        name: tool.name,
        description: tool.description ?? tool.name,
        schema: (tool.inputSchema as Record<string, unknown>) ?? { type: "object" },
        call: async (args: unknown): Promise<ToolResult> => {
          try {
            const r = await withTimeout(
              client.callTool({ name: tool.name, arguments: args as Record<string, unknown> }),
              MCP_CALL_TIMEOUT_MS,
              `mcp '${slot.name}/${tool.name}'`,
            );
            return toResult(r.content, r.isError === true);
          } catch (e) {
            if (!live.alive) slot.client = null; // the child went away mid-call
            return fail(`error: mcp '${slot.name}/${tool.name}' call failed: ${(e as Error).message}`);
          }
        },
      }));

      slot.client = live;
      slot.lastError = null;
      slot.failures = 0;
      slot.nextAttemptAt = 0;
      pool.clients.push(live);
      rebuildToolFace(pool);
      return true;
    } catch (e) {
      slot.client = null;
      slot.tools = [];
      slot.failures++;
      slot.lastError = (e as Error).message ?? String(e);
      slot.nextAttemptAt = Date.now() + backoffMs(slot.failures);
      rebuildToolFace(pool);
      return false;
    } finally {
      slot.dialing = null;
    }
  })();
  slot.dialing = attempt;
  return attempt;
}

/**
 * Make sure a slot is connected, reconnecting under backoff if it is not.
 *
 * The backoff gate is what keeps a broken command from burning a turn: before
 * `nextAttemptAt` the caller is told the server is down (with the last real
 * error) instead of paying another dial.
 */
async function ensureSlot(pool: McpPool, slot: ServerSlot, force = false): Promise<boolean> {
  if (slot.client?.alive) return true;
  if (!force && Date.now() < slot.nextAttemptAt) return false;
  return dialSlot(pool, slot);
}

/** Rebuild the single `mcp` tool so its description and enums match the live set. */
function rebuildToolFace(pool: McpPool): void {
  pool.servers = new Map();
  for (const [name, slot] of pool.slots) if (slot.tools.length) pool.servers.set(name, slot.tools);
  pool.tools = buildMcpToolMap(pool);
}

/** Server name -> its tool names: the face every instance shows the model. */
export function mcpCatalog(): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [srv, list] of cache?.servers ?? []) out[srv] = list.map((t) => t.name);
  return out;
}

/**
 * The single registry entry's definition, built from a catalog alone.
 *
 * Shared with `mcp/pool.ts`: the daemon publishes the catalog, each instance
 * rebuilds the identical tool face from it, so a pooled `mcp` tool and a local
 * one are indistinguishable to the model (and to the prompt roster).
 */
export function mcpToolDef(catalog: Record<string, string[]>): ToolDef {
  const servers = Object.keys(catalog);
  const lines = servers.map((s) => `- ${s}: ${catalog[s]!.join(", ")}`);
  return {
    name: "mcp",
    description:
      `Call a tool on a connected MCP (Model Context Protocol) server. Use this for ` +
      `any capability an MCP server provides (browser automation, fetching, external APIs). ` +
      `Reachable servers and their tools:\n${lines.join("\n")}`,
    parameters: {
      type: "object",
      properties: {
        server: { type: "string", enum: servers, description: "which MCP server to call" },
        tool: { type: "string", description: "the tool name on that server" },
        arguments: { type: "object", description: "the tool's arguments (per its schema)", additionalProperties: true },
      },
      required: ["server", "tool"],
    },
  };
}

/** The single registry entry: one `mcp` tool routing to every live server. */
function buildMcpToolMap(pool: McpPool): Map<string, Tool> {
  const tools = new Map<string, Tool>();
  if (pool.servers.size === 0) return tools;

  // enumerate reachable server/tool pairs in the description so the model can
  // pick among them without guessing names; the `server`/`tool` params are
  // also typed as enums for the same reason
  const serverEnum = [...pool.servers.keys()];
  const catalog: Record<string, string[]> = {};
  for (const [srv, list] of pool.servers) catalog[srv] = list.map((t) => t.name);
  const def: ToolDef = mcpToolDef(catalog);

  tools.set(def.name, {
    def,
    run: async (args: { server?: string; tool?: string; arguments?: unknown }): Promise<ToolResult> => {
      const srv = args?.server;
      const toolName = args?.tool;
      if (typeof srv !== "string" || typeof toolName !== "string") {
        return fail("error: mcp requires { server, tool, arguments? }");
      }
      const slot = pool.slots.get(srv);
      if (!slot) {
        // an unknown NAME is a different mistake from a dead server, and the
        // model needs to be able to tell them apart
        const known = [...pool.slots.keys()];
        return fail(
          known.length
            ? `error: no MCP server '${srv}' configured (configured: ${known.join(", ")})`
            : "error: no MCP servers are configured — add [mcpServers.*] to fox-agent.toml, then /reload",
        );
      }

      // Reconnect before running, so a child that died since the last call is
      // replaced instead of failing on a stale handle. Backoff-gated: inside
      // the window this returns false immediately rather than paying a dial.
      const up = await ensureSlot(pool, slot);
      if (!up) {
        const wait = Math.max(0, slot.nextAttemptAt - Date.now());
        const why = slot.lastError ? `last error: ${slot.lastError}` : "not connected";
        return fail(
          `error: mcp server '${srv}' is down — ${why}` +
            (wait > 0 ? `; next reconnect attempt in ${Math.ceil(wait / 1000)}s` : ""),
        );
      }

      const st = slot.tools.find((t) => t.name === toolName);
      if (!st) {
        const have = slot.tools.map((t) => t.name);
        return fail(
          have.length
            ? `error: server '${srv}' has no tool '${toolName}' (available: ${have.join(", ")})`
            : `error: server '${srv}' connected but advertises no tools`,
        );
      }
      return st.call(args.arguments ?? {});
    },
  });
  return tools;
}

/**
 * Disconnect every live MCP client, killing their stdio children.
 *
 * Detached: the snapshot of live clients is taken and the cache cleared
 * synchronously (so a follow-up session builds a fresh pool), but the actual
 * close — and the SIGKILL safety net for a wedged child — runs in the
 * background and is NOT awaited. Each close used to be raced against a 3s
 * deadline inside the awaited shutdown path, so one hung server (measured: an
 * npx chrome-devtools bridge over WSL interop whose close never settles)
 * stalled the terminal handoff for the whole deadline even though the user
 * had already been shown the resume hint. The polite window per server is
 * unchanged; it now just overlaps process teardown instead of gating it.
 */
export function closeMcp(): void {
  const live = cache?.clients ?? [];
  cache = null;
  if (!live.length) return;
  // fire-and-forget: callers must not await; the SIGKILL fallback in
  // closeClients still reaps a child whose polite close hangs
  void closeClients(live);
}

/** The bounded close + SIGKILL fallback, exposed so tests can pin it.
 *
 * Runs detached from shutdown (closeMcp no longer awaits it), but stays
 * bounded internally: a wedged client.close() that never settles must still
 * yield to the SIGKILL within the polite window, or the background reaper
 * would itself leak a hung promise and a live child.
 */
const MCP_CLOSE_TIMEOUT_MS = 3_000;
export async function closeClients(clients: LiveClient[]): Promise<void> {
  await Promise.all(
    clients.map(async (c) => {
      try {
        await Promise.race([c.close(), Bun.sleep(MCP_CLOSE_TIMEOUT_MS)]);
      } catch {}
      // still alive after the polite window (close rejected, hung, or the
      // promise settled while the child lingers) — the kill is unconditional:
      // ESRCH for an already-dead pid is not an error state here
      if (c.pid) {
        try {
          process.kill(c.pid, "SIGKILL");
        } catch {}
      }
    }),
  );
}
