// MCP client bridge: connects configured stdio servers behind ONE `mcp` tool.
// Instead of flattening every server tool into the registry as
// mcp__<server>__<tool> (dozens of entries that bloat the prompt and the tool
// loop), the model calls `mcp { server, tool, arguments }` and this module
// routes to the live client. The SDK is a dynamic import so fox-agent still
// runs (without MCP) if it isn't installed.
import type { McpServerConfig } from "../core/config.ts";
import type { MediaPart, ToolDef } from "../providers/types.ts";
import type { Tool, ToolContext, ToolResult } from "../core/tool.ts";
import { fail, ok } from "../core/tool.ts";
import { childEnv } from "../core/childenv.ts";
import { VERSION } from "../core/version.ts";

const OUT_CAP_MCP = 30_000;

/** One advertised tool as the catalog carries it across the wire. */
export interface McpToolInfo {
  name: string;
  description: string;
}

/**
 * The `mcp` tool's description rides in EVERY system prompt, so the catalog
 * face is budgeted: a per-tool description excerpt and a total cap, beyond
 * which the list truncates with a count. An unbounded face would tax every
 * turn of every session for the sake of a tool roster most prompts never use.
 */
const FACE_DESC_PER_TOOL = 140;
const FACE_DESC_BUDGET = 2_400;

/** Accept both catalog shapes: rich entries, or legacy bare name strings
 *  (a pool daemon from before the rich catalog upgrade still speaks those). */
export function toolInfos(list: readonly (McpToolInfo | string)[]): McpToolInfo[] {
  return list.map((t) => (typeof t === "string" ? { name: t, description: t } : t));
}

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
  call: (args: unknown, onProgress?: (delta: string) => void) => Promise<ToolResult>;
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
      const sdk = await import("@modelcontextprotocol/sdk/client/index.js").catch((e) => {
        // The SDK is an optional dependency: fox-agent runs without it, but an
        // MCP config without the SDK used to fail with a raw "Cannot find
        // module" and no way forward.
        throw new Error(
          `the @modelcontextprotocol/sdk package is not installed (${(e as Error).message?.split("\n")[0] ?? e}) — ` +
            `run 'bun add @modelcontextprotocol/sdk' in the fox-agent directory`,
        );
      });
      const client = new sdk.Client({ name: "fox-agent", version: VERSION });

      // one entry is one transport: remote (streamable HTTP) or local (stdio child)
      let transport: { connect: (t: unknown) => Promise<void>; close?: () => Promise<void> } & Record<string, unknown>;
      if (slot.cfg.url) {
        const http = await import("@modelcontextprotocol/sdk/client/streamableHttp.js");
        transport = new http.StreamableHTTPClientTransport(new URL(slot.cfg.url), {
          requestInit: slot.cfg.headers ? { headers: slot.cfg.headers } : undefined,
        }) as never;
      } else {
        if (!slot.cfg.command?.trim()) throw new Error("needs a 'command' (stdio) or 'url' (remote)");
        const stdio = await import("@modelcontextprotocol/sdk/client/stdio.js");
        transport = new stdio.StdioClientTransport({
          command: slot.cfg.command,
          args: slot.cfg.args ?? [],
          env: childEnv(slot.cfg.env),
          // SDK default is stderr inherit, which points at the parent's stderr —
          // the TUI's own surface. A chatty server (npm exec wrappers print
          // notices/warnings by the line) then smears garbage across the screen;
          // its diagnostics are not worth the pixels, matching lsp/client.ts.
          stderr: "ignore",
        }) as never;
      }

      // created after connect so the pid is real: the pre-connect value is
      // always undefined (stdio spawns in start()), which used to quietly
      // disable closeClients' SIGKILL fallback for wedged children
      const live: LiveClient = { close: () => client.close(), pid: undefined, alive: true };
      const markDead = () => {
        live.alive = false;
        if (slot.client === live) slot.client = null;
      };
      transport.onclose = markDead;
      transport.onerror = markDead;

      await withTimeout(client.connect(transport as never), MCP_DIAL_TIMEOUT_MS, `mcp '${slot.name}' connect`);
      live.pid = (transport as { pid?: number | null }).pid ?? undefined;
      const res = await withTimeout(client.listTools(), MCP_DIAL_TIMEOUT_MS, `mcp '${slot.name}' listTools`);

      slot.tools = res.tools.map((tool) => ({
        name: tool.name,
        description: tool.description ?? tool.name,
        schema: (tool.inputSchema as Record<string, unknown>) ?? { type: "object" },
        call: async (args: unknown, onProgress?: (delta: string) => void): Promise<ToolResult> => {
          try {
            const r = await withTimeout(
              client.callTool(
                { name: tool.name, arguments: args as Record<string, unknown> },
                undefined,
                // forward the server's progress notifications as live output —
                // a browser navigation or long build shows its heartbeat in the
                // TUI instead of a silent multi-minute wait
                {
                  onprogress: onProgress
                    ? (p: { progress?: number; total?: number; message?: string }) => {
                        const frac = typeof p.progress === "number" ? `${p.progress}/${p.total ?? "?"}` : "";
                        const msg = [frac, p.message].filter(Boolean).join(" ");
                        if (msg) onProgress(`mcp ${slot.name}/${tool.name}: ${msg}\n`);
                      }
                    : undefined,
                },
              ),
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

/** Server name -> its advertised tools, descriptions included. */
export function mcpCatalog(): Record<string, McpToolInfo[]> {
  const out: Record<string, McpToolInfo[]> = {};
  for (const [srv, list] of cache?.servers ?? []) out[srv] = list.map((t) => ({ name: t.name, description: t.description }));
  return out;
}

/**
 * `mcp {server}` status for `/mcp`: connectivity, tools, last error, backoff.
 * Works on the local pool; the socket pool answers the same shape from the
 * daemon (which owns the clients in shared mode).
 */
export interface McpSlotStatus {
  connected: boolean;
  transport: "stdio" | "remote";
  tools: McpToolInfo[];
  lastError: string | null;
  nextAttemptInMs: number;
}
export function mcpStatus(only?: readonly string[]): Record<string, McpSlotStatus> {
  const out: Record<string, McpSlotStatus> = {};
  for (const [name, slot] of cache?.slots ?? []) {
    if (only && !only.includes(name)) continue;
    out[name] = {
      connected: !!slot.client?.alive,
      transport: slot.cfg.url ? "remote" : "stdio",
      tools: slot.tools.map((t) => ({ name: t.name, description: t.description })),
      lastError: slot.lastError,
      nextAttemptInMs: Math.max(0, slot.nextAttemptAt - Date.now()),
    };
  }
  return out;
}

/** `name — one-line description` lines for error messages; bounded. */
function toolListing(tools: ServerTool[]): string {
  return tools.map((t) => `- ${t.name}${t.description && t.description !== t.name ? ` — ${t.description.slice(0, 120)}` : ""}`).join("\n");
}

/**
 * Add servers to the live pool INCREMENTALLY, keyed by name.
 *
 * The daemon serves one machine-wide pool, so it accumulates the union of every
 * config any instance has declared. `mcpTools` cannot express that: its cache
 * key is the WHOLE config, so a second caller naming one extra server
 * invalidated everything and closed every child — re-dialing a 30-45 s Chrome
 * bridge because someone else's window mentioned postgres.
 *
 * So this dials only what is genuinely new (or whose config text changed) and
 * leaves every other slot untouched. Returns one warning per server that could
 * not come up.
 */
export async function mcpAddServers(incoming: Record<string, McpServerConfig>): Promise<string[]> {
  const warnings: string[] = [];
  if (!cache) cache = { key: "", warnings: [], clients: [], servers: new Map(), slots: new Map(), tools: new Map() };
  const pool = cache;

  const toDial: [string, McpServerConfig][] = [];
  for (const [name, cfg] of Object.entries(incoming)) {
    const existing = pool.slots.get(name);
    if (!existing) {
      toDial.push([name, cfg]);
      continue;
    }
    // Same name, different command/args/env: the caller changed this server, so
    // replace just this slot. Every other server keeps its child.
    if (JSON.stringify(existing.cfg) !== JSON.stringify(cfg)) {
      const i = pool.clients.indexOf(existing.client as LiveClient);
      if (i >= 0) pool.clients.splice(i, 1);
      if (existing.client) void closeClients([existing.client]);
      toDial.push([name, cfg]);
    }
  }

  await Promise.all(
    toDial.map(async ([name, cfg]) => {
      const slot: ServerSlot = { name, cfg, client: null, tools: [], lastError: null, failures: 0, nextAttemptAt: 0, dialing: null };
      pool.slots.set(name, slot);
      const up = await dialSlot(pool, slot);
      if (!up && slot.lastError) warnings.push(`mcp server '${name}' unavailable: ${slot.lastError.slice(0, 200)}`);
    }),
  );

  // Keep `key` equal to the union that is now live, so a later whole-config
  // `mcpTools()` call for exactly that set still hits the cache instead of
  // tearing the pool down.
  const union: Record<string, McpServerConfig> = {};
  for (const [n, s] of pool.slots) union[n] = s.cfg;
  pool.key = JSON.stringify(union);
  pool.warnings = [...pool.warnings, ...warnings];
  rebuildToolFace(pool);
  return warnings;
}

/**
 * Run one tool on one server, optionally restricted to a caller's own servers.
 *
 * `allowed` is the daemon's cross-config guard: the pool holds every server any
 * instance declared, so without it a caller could invoke a server it never
 * configured (and never sees in its catalog).
 */
export async function mcpRunTool(
  server: string,
  tool: string,
  args: unknown,
  allowed?: readonly string[],
  onProgress?: (delta: string) => void,
): Promise<ToolResult> {
  const pool = cache;
  if (!pool) return fail("error: the MCP pool is not initialized");
  if (allowed && !allowed.includes(server)) {
    return fail(`error: no MCP server '${server}' configured here`);
  }
  const slot = pool.slots.get(server);
  if (!slot) {
    const known = [...pool.slots.keys()];
    return fail(
      known.length
        ? `error: no MCP server '${server}' configured (configured: ${known.join(", ")})`
        : "error: no MCP servers are configured — add [mcpServers.*] to fox-agent.toml, then /reload",
    );
  }
  const up = await ensureSlot(pool, slot);
  if (!up) {
    const wait = Math.max(0, slot.nextAttemptAt - Date.now());
    const why = slot.lastError ? `last error: ${slot.lastError}` : "not connected";
    return fail(
      `error: mcp server '${server}' is down — ${why}` +
        (wait > 0 ? `; next reconnect attempt in ${Math.ceil(wait / 1000)}s` : ""),
    );
  }
  const st = slot.tools.find((t) => t.name === tool);
  if (!st) {
    const have = slot.tools.map((t) => t.name);
    return fail(
      have.length
        ? `error: server '${server}' has no tool '${tool}' (available:\n${toolListing(slot.tools)})`
        : `error: server '${server}' connected but advertises no tools`,
    );
  }
  return st.call(args ?? {}, onProgress);
}

/**
 * The single registry entry's definition, built from a catalog alone.
 *
 * Shared with `mcp/pool.ts`: the daemon publishes the catalog, each instance
 * rebuilds the identical tool face from it, so a pooled `mcp` tool and a local
 * one are indistinguishable to the model (and to the prompt roster). Each tool
 * rides with a one-line description excerpt — names alone made the model guess
 * what a tool does and what arguments it takes.
 */
export function mcpToolDef(catalog: Record<string, readonly (McpToolInfo | string)[]>): ToolDef {
  const servers = Object.keys(catalog);
  const lines: string[] = [];
  let budget = FACE_DESC_BUDGET;
  let omitted = 0;
  for (const s of servers) {
    for (const raw of catalog[s] ?? []) {
      const t = typeof raw === "string" ? { name: raw, description: "" } : raw;
      const desc = t.description && t.description !== t.name ? ` — ${t.description.slice(0, FACE_DESC_PER_TOOL)}` : "";
      const line = `- ${s}/${t.name}${desc}`;
      if (budget - line.length < 0) {
        omitted++;
        continue;
      }
      budget -= line.length;
      lines.push(line);
    }
  }
  const roster = lines.join("\n") + (omitted ? `\n… and ${omitted} more (see the server's own docs)` : "");
  return {
    name: "mcp",
    description:
      `Call a tool on a connected MCP (Model Context Protocol) server. Use this for ` +
      `any capability an MCP server provides (browser automation, fetching, external APIs). ` +
      `Reachable servers and their tools:\n${roster}`,
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
  const catalog: Record<string, McpToolInfo[]> = {};
  for (const [srv, list] of pool.servers) catalog[srv] = list.map((t) => ({ name: t.name, description: t.description }));
  const def: ToolDef = mcpToolDef(catalog);

  tools.set(def.name, {
    def,
    run: async (args: { server?: string; tool?: string; arguments?: unknown }, ctx?: ToolContext): Promise<ToolResult> => {
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
            ? `error: server '${srv}' has no tool '${toolName}' (available:\n${toolListing(slot.tools)})`
            : `error: server '${srv}' connected but advertises no tools`,
        );
      }
      // MCP progress notifications stream to the UI as tool_output deltas, so a
      // long call (browser navigation) shows its heartbeat instead of silence.
      const emit = ctx?.emit && ctx.callId ? (delta: string) => ctx.emit!({ type: "tool_output", id: ctx.callId!, delta }) : undefined;
      return st.call(args.arguments ?? {}, emit);
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
        // A cleared timer, not Bun.sleep: see exitedWithin. The sleep's timer is
        // referenced, so an instant close still held the loop for the full 3 s.
        await new Promise<void>((resolve) => {
          const t = setTimeout(resolve, MCP_CLOSE_TIMEOUT_MS);
          t.unref?.();
          void Promise.resolve(c.close()).then(
            () => {
              clearTimeout(t);
              resolve();
            },
            () => {
              clearTimeout(t);
              resolve();
            },
          );
        });
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
