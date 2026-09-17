/**
 * A plugin that packs integrations and a slash command instead of tools.
 *
 * Exercises the marketplace shape: MCP servers and delegation targets without
 * a config file, plus a command. The MCP server points at a binary that does
 * not exist, on purpose — connecting is the bridge's job (covered in
 * mcp.test.ts); here only the merge matters, and an unreachable server proves
 * which entry the registry actually dialed via the warning it produces.
 */
import type { FoxPlugin } from "../../src/plugins/types.ts";

const plugin: FoxPlugin = {
  name: "pack",

  mcpServers: {
    packed: { command: "definitely-not-a-real-mcp-binary" },
  },

  agents: {
    packedreviewer: { url: "https://reviewer.example.com" },
  },

  commands: [
    {
      name: "/packed",
      description: "A slash command contributed by a plugin.",
      usage: "[arg]",
      run: (arg, ctx) => ({ handled: true as const, output: `packed ran: ${arg || "(no arg)"} in ${ctx.sessionId}` }),
    },
  ],
};

export default plugin;
