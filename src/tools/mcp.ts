// MCP client bridge: connects configured stdio servers, merges their tools
// into the registry under mcp__<server>__<tool>. The SDK is a dynamic import
// so fox still runs (without MCP) if it isn't installed.
import type { McpServerConfig } from "../core/config.ts";
import type { ToolDef } from "../providers/types.ts";
import type { Tool, ToolResult } from "./types.ts";
import { fail, ok } from "./types.ts";
import { childEnv } from "../core/childenv.ts";
import { VERSION } from "../core/version.ts";

const OUT_CAP_MCP = 30_000;

/** Live clients, so shutdownTools() can reap the stdio children. */
interface LiveClient {
  close: () => Promise<void>;
}
let cache: { key: string; tools: Map<string, Tool>; warnings: string[]; clients: LiveClient[] } | null = null;

function textify(content: unknown): string {
  const parts = content as { type?: string; text?: string }[] | null;
  if (!Array.isArray(parts)) return JSON.stringify(content ?? {});
  return parts
    .map((p) => (typeof p?.text === "string" ? p.text : JSON.stringify(p)))
    .join("\n")
    .slice(0, OUT_CAP_MCP);
}

export async function mcpTools(
  servers: Record<string, McpServerConfig>,
): Promise<{ tools: Map<string, Tool>; warnings: string[] }> {
  const key = JSON.stringify(servers);
  if (cache?.key === key) return { tools: cache.tools, warnings: cache.warnings };
  // config changed — drop the old children before standing up new ones
  if (cache) await closeMcp();

  const tools = new Map<string, Tool>();
  const warnings: string[] = [];
  const clients: LiveClient[] = [];

  for (const [name, cfg] of Object.entries(servers)) {
    try {
      const sdk = await import("@modelcontextprotocol/sdk/client/index.js");
      const stdio = await import("@modelcontextprotocol/sdk/client/stdio.js");
      const client = new sdk.Client({ name: "fox-agent", version: VERSION });
      const transport = new stdio.StdioClientTransport({
        command: cfg.command,
        args: cfg.args ?? [],
        env: childEnv(cfg.env),
      });
      await client.connect(transport);
      clients.push({ close: () => client.close() });
      const res = await client.listTools();
      for (const t of res.tools) {
        const def: ToolDef = {
          name: `mcp__${name}__${t.name}`,
          description: `[mcp:${name}] ${t.description ?? t.name}`,
          parameters: (t.inputSchema as Record<string, unknown>) ?? { type: "object" },
        };
        tools.set(def.name, {
          def,
          run: async (args: any): Promise<ToolResult> => {
            try {
              const r = await client.callTool({ name: t.name, arguments: args });
              return r.isError ? fail(textify(r.content)) : ok(textify(r.content));
            } catch (e) {
              return fail(`error: mcp call failed: ${(e as Error).message}`);
            }
          },
        });
      }
    } catch (e) {
      // every failing server is reported, not just the last one
      const w = `mcp server '${name}' unavailable: ${(e as Error).message.slice(0, 200)}`;
      warnings.push(w);
      console.error(`fox: ${w}`);
    }
  }

  cache = { key, tools, warnings, clients };
  return { tools, warnings };
}

/** Disconnect every live MCP client, killing their stdio children. */
export async function closeMcp(): Promise<void> {
  const live = cache?.clients ?? [];
  cache = null;
  await Promise.all(live.map((c) => c.close().catch(() => {})));
}
