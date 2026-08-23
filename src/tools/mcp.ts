// MCP client bridge: connects configured stdio servers, merges their tools
// into the registry under mcp__<server>__<tool>. The SDK is a dynamic import
// so fox still runs (without MCP) if it isn't installed.
import type { McpServerConfig } from "../core/config.ts";
import type { ToolDef } from "../providers/types.ts";
import type { Tool, ToolResult } from "./types.ts";
import { fail, ok } from "./types.ts";

let cache: { key: string; tools: Map<string, Tool>; warning?: string } | null = null;

function textify(content: unknown): string {
  const parts = content as { type?: string; text?: string }[] | null;
  if (!Array.isArray(parts)) return JSON.stringify(content ?? {});
  return parts
    .map((p) => (typeof p?.text === "string" ? p.text : JSON.stringify(p)))
    .join("\n")
    .slice(0, OUT_CAP_MCP);
}

const OUT_CAP_MCP = 30_000;

export async function mcpTools(
  servers: Record<string, McpServerConfig>,
): Promise<{ tools: Map<string, Tool>; warning?: string }> {
  const key = JSON.stringify(servers);
  if (cache?.key === key) return { tools: cache.tools, warning: cache.warning };

  const tools = new Map<string, Tool>();
  let warning: string | undefined;
  const entries = Object.entries(servers);

  for (const [name, cfg] of entries) {
    try {
      const sdk = await import("@modelcontextprotocol/sdk/client/index.js");
      const stdio = await import("@modelcontextprotocol/sdk/client/stdio.js");
      const client = new sdk.Client({ name: "fox-agent", version: "0.2.0" });
      const transport = new stdio.StdioClientTransport({
        command: cfg.command,
        args: cfg.args ?? [],
        env: { ...process.env, ...cfg.env } as Record<string, string>,
      });
      await client.connect(transport);
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
      warning = `mcp server '${name}' unavailable: ${(e as Error).message.slice(0, 200)}`;
      console.error(`fox: ${warning}`);
    }
  }

  cache = { key, tools, warning };
  return { tools, warning };
}
