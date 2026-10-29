// MCP client bridge: connects configured stdio servers behind ONE `mcp` tool.
// Instead of flattening every server tool into the registry as
// mcp__<server>__<tool> (dozens of entries that bloat the prompt and the tool
// loop), the model calls `mcp { server, tool, arguments }` and this module
// routes to the live client. The SDK is a dynamic import so fox-agent still
// runs (without MCP) if it isn't installed.
import type { McpServerConfig } from "../core/config.ts";
import type { MediaPart, ToolDef } from "../providers/types.ts";
import type { Tool, ToolResult } from "./types.ts";
import { fail, ok } from "./types.ts";
import { childEnv } from "../core/childenv.ts";
import { VERSION } from "../core/version.ts";

const OUT_CAP_MCP = 30_000;

/** Live clients + the per-server tool table, so the single `mcp` tool routes. */
interface LiveClient {
  close: () => Promise<void>;
  /** the stdio child's pid — closeMcp SIGKILLs it when a polite close hangs */
  pid?: number;
}
interface ServerTool {
  /** the tool name as the server reports it (no mcp__ prefix) */
  name: string;
  description: string;
  schema: Record<string, unknown>;
  call: (args: unknown) => Promise<ToolResult>;
}
interface McpPool {
  key: string;
  warnings: string[];
  clients: LiveClient[];
  /** server name -> its tools (for the `mcp` tool's enum + routing) */
  servers: Map<string, ServerTool[]>;
  /** the single built `mcp` tool, cached so a config-cache hit returns the
   * identical Map (callers/tests rely on reference identity, not just equality) */
  tools: Map<string, Tool>;
}
let cache: McpPool | null = null;

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
  const clients: LiveClient[] = [];
  const serversMap = new Map<string, ServerTool[]>();

  for (const [name, cfg] of Object.entries(servers)) {
    try {
      const sdk = await import("@modelcontextprotocol/sdk/client/index.js");
      const stdio = await import("@modelcontextprotocol/sdk/client/stdio.js");
      const client = new sdk.Client({ name: "fox-agent", version: VERSION });
      const transport = new stdio.StdioClientTransport({
        command: cfg.command,
        args: cfg.args ?? [],
        env: childEnv(cfg.env),
        // SDK default is stderr inherit, which points at the parent's stderr —
        // the TUI's own surface. A chatty server (npm exec wrappers print
        // notices/warnings by the line) then smears garbage across the screen;
        // its diagnostics are not worth the pixels, matching lsp/client.ts.
        stderr: "ignore",
      });
      await client.connect(transport);
      clients.push({ close: () => client.close(), pid: transport.pid ?? undefined });
      const res = await client.listTools();
      const serverTools: ServerTool[] = [];
      for (const t of res.tools) {
        serverTools.push({
          name: t.name,
          description: t.description ?? t.name,
          schema: (t.inputSchema as Record<string, unknown>) ?? { type: "object" },
          call: async (args: unknown): Promise<ToolResult> => {
            try {
              const r = await client.callTool({ name: t.name, arguments: args as Record<string, unknown> });
              return toResult(r.content, r.isError === true);
            } catch (e) {
              return fail(`error: mcp call failed: ${(e as Error).message}`);
            }
          },
        });
      }
      if (serverTools.length) serversMap.set(name, serverTools);
    } catch (e) {
      // every failing server is reported, not just the last one. console.error
      // would smear the parent TUI (same reason server stderr is "ignore"
      // above) — the warnings channel is what callers actually surface.
      warnings.push(`mcp server '${name}' unavailable: ${(e as Error).message.slice(0, 200)}`);
    }
  }

  const pool: McpPool = { key, warnings, clients, servers: serversMap, tools: new Map() };
  pool.tools = buildMcpToolMap(pool);
  cache = pool;
  return { tools: pool.tools, warnings };
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
      const list = pool.servers.get(srv);
      if (!list) return fail(`error: no MCP server '${srv}' (reachable: ${serverEnum.join(", ")})`);
      const st = list.find((t) => t.name === toolName);
      if (!st) return fail(`error: server '${srv}' has no tool '${toolName}' (${list.map((t) => t.name).join(", ")})`);
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
