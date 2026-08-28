/**
 * A provider that answers without credentials or a network.
 *
 * Two things in this repo can only be proved end to end — that an external ACP
 * client can drive `fox --acp`, and that a real plugin loads and its hooks fire
 * in a real turn. Both need a full turn through `resolveChat`, and neither can
 * use a real API key.
 *
 * `test/cli.test.ts` establishes the inverse of this trick: point `FOX_AGENT_BASE_URL`
 * at a closed port so an unintended provider call fails loudly instead of
 * passing quietly. This is the positive version — a port that *is* open, serving
 * a scripted answer, so a test can assert on what the harness did with it.
 *
 * The wire shape is the OpenAI-compatible streaming one that
 * `src/providers/openai-compatible.ts` consumes via the AI SDK: `data: ` framed
 * SSE, `choices[0].delta`, a final `finish_reason`, a `usage` block, then
 * `data: [DONE]`. Deliberately hand-rolled rather than built on a mock library:
 * the point is to exercise the real provider parser, so anything that smooths
 * over the framing would defeat it.
 */

/** What the provider should answer with. */
export type FakeScript = "text" | "tool";

export interface FakeProvider {
  /** pass as FOX_AGENT_BASE_URL — already includes the /v1 the config expects */
  baseUrl: string;
  /** how many completion requests arrived; a turn that never called is a bug */
  get requests(): number;
  stop(): void;
}

/** The file the `tool` script tells fox-agent to write, relative to the session cwd. */
export const FAKE_TOOL_FILE = "fake-provider-wrote-this.txt";
export const FAKE_TOOL_BODY = "written by the fake provider";
export const FAKE_TEXT_REPLY = "hello from the fake provider";

function sse(obj: unknown): string {
  return `data: ${JSON.stringify(obj)}\n\n`;
}

/**
 * One streamed choice delta. `id`/`created`/`model` are required by enough
 * clients that omitting them is asking for trouble, even if the AI SDK tolerates
 * their absence today.
 */
function chunk(delta: unknown, finish: string | null = null): string {
  return sse({
    id: "fake-1",
    object: "chat.completion.chunk",
    created: 0,
    model: "test-model",
    choices: [{ index: 0, delta, finish_reason: finish }],
  });
}

function usageChunk(): string {
  return sse({
    id: "fake-1",
    object: "chat.completion.chunk",
    created: 0,
    model: "test-model",
    choices: [],
    usage: { prompt_tokens: 11, completion_tokens: 7, total_tokens: 18 },
  });
}

/**
 * The scripted body.
 *
 * `text` is a plain answer in two deltas — two rather than one so a consumer
 * that only handles a single chunk shows up as a failure.
 *
 * `tool` emits one `write` call and then, on the *second* request of the same
 * conversation, a plain answer. Without that second branch the turn loop would
 * call back forever with the tool result and never reach `done`.
 */
function body(script: FakeScript, seenToolResult: boolean): string {
  const parts: string[] = [];
  if (script === "tool" && !seenToolResult) {
    // arguments arrive as a JSON *string*, which is what the real API sends and
    // what src/loop/turn.ts:safeParseArgs is written against
    parts.push(
      chunk({
        role: "assistant",
        tool_calls: [
          {
            index: 0,
            id: "call_fake_1",
            type: "function",
            function: { name: "write", arguments: JSON.stringify({ path: FAKE_TOOL_FILE, content: FAKE_TOOL_BODY }) },
          },
        ],
      }),
    );
    parts.push(chunk({}, "tool_calls"));
  } else {
    const half = Math.ceil(FAKE_TEXT_REPLY.length / 2);
    parts.push(chunk({ role: "assistant", content: FAKE_TEXT_REPLY.slice(0, half) }));
    parts.push(chunk({ content: FAKE_TEXT_REPLY.slice(half) }));
    parts.push(chunk({}, "stop"));
  }
  parts.push(usageChunk());
  parts.push("data: [DONE]\n\n");
  return parts.join("");
}

/** Did this request already carry a tool result? Then the tool call happened. */
function hasToolResult(payload: unknown): boolean {
  const msgs = (payload as { messages?: { role?: string }[] } | null)?.messages;
  return Array.isArray(msgs) && msgs.some((m) => m?.role === "tool");
}

export function startFakeProvider(script: FakeScript = "text", port = 0): FakeProvider {
  let requests = 0;
  const server = Bun.serve({
    port,
    // 127.0.0.1, not 0.0.0.0: a test fixture has no business being reachable
    // from off the machine
    hostname: "127.0.0.1",
    async fetch(req) {
      const url = new URL(req.url);
      if (!url.pathname.endsWith("/chat/completions")) {
        return new Response(JSON.stringify({ error: { message: `fake provider: no route ${url.pathname}` } }), {
          status: 404,
          headers: { "content-type": "application/json" },
        });
      }
      requests++;
      let payload: unknown = null;
      try {
        payload = await req.json();
      } catch {
        // a malformed body is still worth answering: the assertion belongs in
        // the test, not in a 400 that looks like a transport failure
      }
      return new Response(body(script, hasToolResult(payload)), {
        headers: { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" },
      });
    },
  });

  return {
    baseUrl: `http://127.0.0.1:${server.port}/v1`,
    get requests() {
      return requests;
    },
    stop() {
      server.stop(true);
    },
  };
}

// Standalone mode, so `scripts/acp-accept.ts` can spawn this as its own process
// and hand the URL to a `fox --acp` child. Prints one line to stdout and stays
// up until killed.
if (import.meta.main) {
  const script = (process.env.FAKE_SCRIPT as FakeScript) ?? "text";
  if (script !== "text" && script !== "tool") {
    console.error(`fake-provider: FAKE_SCRIPT must be "text" or "tool", got ${JSON.stringify(script)}`);
    process.exit(2);
  }
  const p = startFakeProvider(script, Number(process.env.FAKE_PORT ?? 0));
  console.log(p.baseUrl);
}
