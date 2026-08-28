/**
 * A real MCP server, as a test fixture.
 *
 * `src/tools/mcp.ts` had exactly one test before this — `buildRegistry` with
 * *zero* servers configured. The spawn, the handshake, `listTools`, the
 * `mcp__<server>__<tool>` naming, the output cap and the error branch had never
 * run. This is the other end of that wire.
 *
 * Built on the SDK's low-level `Server` with hand-written JSON Schema rather than
 * the `McpServer` + zod convenience layer. Two reasons: fox-agent does not depend on
 * zod, so a fixture that did would pin a version fox-agent has no opinion about; and
 * the raw schema is what actually crosses the wire into `def.parameters`, so
 * writing it out means the test asserts on the same thing the model would see.
 *
 * Run as a subprocess, never imported: stdout is the protocol stream.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

/** Bigger than OUT_CAP_MCP (30_000) so `textify`'s cap has something to cut. */
export const BIG_LEN = 40_000;

const TOOLS = [
  {
    name: "echo",
    description: "Echo the message back. Has a second sentence, so a formatter that splits on '. ' would cut it here.",
    inputSchema: {
      type: "object",
      properties: { message: { type: "string" } },
      required: ["message"],
    },
  },
  {
    name: "boom",
    description: "Always fails, via isError rather than by throwing.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "big",
    description: `Return ${BIG_LEN} characters.`,
    inputSchema: { type: "object", properties: {} },
  },
];

const server = new Server({ name: "fox-test-fixture", version: "1.0.0" }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;
  switch (name) {
    case "echo":
      return { content: [{ type: "text", text: `echo: ${(args as { message?: string } | undefined)?.message ?? ""}` }] };
    case "boom":
      // The distinction this exists to pin: a protocol-level *result* that is
      // flagged as an error, not a transport failure. src/tools/mcp.ts routes it
      // to fail() rather than to the catch block.
      return { content: [{ type: "text", text: "boom: deliberate tool failure" }], isError: true };
    case "big":
      return { content: [{ type: "text", text: "x".repeat(BIG_LEN) }] };
    default:
      return { content: [{ type: "text", text: `unknown tool ${name}` }], isError: true };
  }
});

await server.connect(new StdioServerTransport());
