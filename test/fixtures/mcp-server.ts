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
  {
    name: "shot",
    description: "Return one PNG image part plus a text caption.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "textonly",
    description: "Return plain text only (no image part).",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "progress",
    description: "Emit two progress notifications, then finish.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "register",
    description: "Dynamically add a tool and fire notifications/tools/list_changed.",
    inputSchema: { type: "object", properties: { name: { type: "string" } }, required: ["name"] },
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
    case "shot":
      // a 1x1 transparent PNG, base64 — the shape chrome-devtools screenshots arrive in
      return {
        content: [
          { type: "text", text: "screenshot attached" },
          { type: "image", data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", mimeType: "image/png" },
        ],
      };
    case "textonly":
      return { content: [{ type: "text", text: "no media here" }] };
    case "progress": {
      // the client only attaches a progressToken when it asked for progress —
      // mirror that: no token, no notifications, just the result
      const token = (req.params as { _meta?: { progressToken?: number } })._meta?.progressToken;
      if (token !== undefined) {
        for (const [i, message] of ["step one", "step two"].entries()) {
          // a real server reports progress as work happens, never in one burst;
          // back-to-back writes in the same tick also get coalesced somewhere
          // in the bun stdio pipe and the client then sees only the first
          await Bun.sleep(50);
          await server.notification({
            method: "notifications/progress",
            params: { progressToken: token, progress: i + 1, total: 2, message },
          });
        }
      }
      return { content: [{ type: "text", text: "progress: done" }] };
    }
    case "register": {
      const toolName = (args as { name?: string } | undefined)?.name ?? "dyn";
      if (!TOOLS.some((t) => t.name === toolName)) {
        TOOLS.push({ name: toolName, description: `Dynamic tool ${toolName}.`, inputSchema: { type: "object", properties: {} } });
        await server.notification({ method: "notifications/tools/list_changed", params: {} });
      }
      return { content: [{ type: "text", text: `registered ${toolName}` }] };
    }
    default:
      return { content: [{ type: "text", text: `unknown tool ${name}` }], isError: true };
  }
});

await server.connect(new StdioServerTransport());
