/**
 * Do the bundled adapters actually surface the provider's prefix-cache reads?
 *
 * The chain is provider wire field -> provider package (`inputTokens.cacheRead`)
 * -> `ai`'s `asLanguageModelUsage` (`inputTokenDetails.cacheReadTokens`) -> our
 * adapter (`cached_tokens` on the usage event). Only the last hop is ours, and
 * it reads a field name that exists in no type we control — so each adapter is
 * driven against a local server speaking its real wire protocol and the usage
 * event is checked against what the server sent.
 *
 * These run the genuine `ai` + `@ai-sdk/*` stack over loopback HTTP: no
 * mocking of the SDK, no network, no keys.
 */
import { describe, expect, test } from "bun:test";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { StreamEvent } from "../src/providers/types.ts";

/** An SSE body: `{event, data}` frames; `raw` frames are emitted verbatim. */
type Frame = { event?: string; data?: unknown; raw?: string };
const sse = (frames: Frame[]): string =>
  frames
    .map((f) => (f.raw ?? `${f.event ? `event: ${f.event}\n` : ""}data: ${JSON.stringify(f.data)}\n\n`))
    .join("");

function listen(handler: (req: IncomingMessage, res: ServerResponse) => void): Promise<{ server: Server; url: string }> {
  return new Promise((resolve) => {
    const server = createServer(handler);
    server.listen(0, "127.0.0.1", () =>
      resolve({ server, url: `http://127.0.0.1:${(server.address() as { port: number }).port}` }),
    );
  });
}

async function collect(gen: AsyncGenerator<StreamEvent>): Promise<StreamEvent[]> {
  const out: StreamEvent[] = [];
  for await (const ev of gen) out.push(ev);
  return out;
}

const usageOf = (events: StreamEvent[]) => events.find((e): e is Extract<StreamEvent, { type: "usage" }> => e.type === "usage")!;

describe("adapter cache-read surfacing", () => {
  test("openai-compatible: prompt_tokens_details.cached_tokens -> cached_tokens", async () => {
    const { server, url } = await listen((req, res) => {
      res.writeHead(200, { "content-type": "text/event-stream" });
      res.end(
        sse([
          { data: { id: "1", object: "chat.completion.chunk", created: 0, model: "m", choices: [{ index: 0, delta: { role: "assistant", content: "hi" } }] } },
          // the usage chunk: cached is a SUBSET of prompt_tokens, as every
          // OpenAI-style gateway reports it
          {
            data: {
              id: "1",
              object: "chat.completion.chunk",
              created: 0,
              model: "m",
              choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
            },
          },
          {
            data: {
              id: "1",
              object: "chat.completion.chunk",
              created: 0,
              model: "m",
              choices: [],
              usage: { prompt_tokens: 100, completion_tokens: 5, prompt_tokens_details: { cached_tokens: 60 } },
            },
          },
          { raw: "data: [DONE]\n\n" },
        ]),
      );
    });
    try {
      const { streamChat } = await import("../src/providers/openai-compatible.ts");
      const events = await collect(
        streamChat({ baseUrl: `${url}/v1`, apiKey: "test", model: "m", requestTimeoutMs: 10_000 } as any, [{ role: "user", content: "hi" }], []),
      );
      const u = usageOf(events);
      expect(u.prompt_tokens).toBe(100); // the billed total — cached included
      expect(u.cached_tokens).toBe(60); // the hit-rate numerator
      expect(u.cached_tokens).toBeLessThanOrEqual(u.prompt_tokens);
      expect(events.at(-1)).toMatchObject({ type: "done" });
    } finally {
      server.close();
    }
  });

  test("openai-compatible: no cache details reported -> cached_tokens is 0, not undefined", async () => {
    const { server, url } = await listen((req, res) => {
      res.writeHead(200, { "content-type": "text/event-stream" });
      res.end(
        sse([
          { data: { id: "1", object: "chat.completion.chunk", created: 0, model: "m", choices: [{ index: 0, delta: { content: "x" } }] } },
          { data: { id: "1", object: "chat.completion.chunk", created: 0, model: "m", choices: [{ index: 0, delta: {}, finish_reason: "stop" }] } },
          { data: { id: "1", object: "chat.completion.chunk", created: 0, model: "m", choices: [], usage: { prompt_tokens: 40, completion_tokens: 2 } } },
          { raw: "data: [DONE]\n\n" },
        ]),
      );
    });
    try {
      const { streamChat } = await import("../src/providers/openai-compatible.ts");
      const events = await collect(
        streamChat({ baseUrl: `${url}/v1`, apiKey: "test", model: "m", requestTimeoutMs: 10_000 } as any, [{ role: "user", content: "hi" }], []),
      );
      const u = usageOf(events);
      expect(u.prompt_tokens).toBe(40);
      expect(u.cached_tokens).toBe(0); // a number: the hit rate must be computable
    } finally {
      server.close();
    }
  });

  test("anthropic: cache_read_input_tokens -> cached_tokens, and billed input includes it", async () => {
    const { server, url } = await listen((req, res) => {
      res.writeHead(200, { "content-type": "text/event-stream" });
      res.end(
        sse([
          {
            event: "message_start",
            data: {
              type: "message_start",
              message: {
                id: "msg_1",
                type: "message",
                role: "assistant",
                model: "claude-test",
                content: [],
                stop_reason: null,
                usage: { input_tokens: 100, output_tokens: 1, cache_read_input_tokens: 80, cache_creation_input_tokens: 10 },
              },
            },
          },
          { event: "content_block_start", data: { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } } },
          { event: "content_block_delta", data: { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "hi" } } },
          { event: "content_block_stop", data: { type: "content_block_stop", index: 0 } },
          {
            event: "message_delta",
            data: {
              type: "message_delta",
              delta: { stop_reason: "end_turn", stop_sequence: null },
              usage: { input_tokens: 100, output_tokens: 5, cache_read_input_tokens: 80, cache_creation_input_tokens: 10 },
            },
          },
          { event: "message_stop", data: { type: "message_stop" } },
        ]),
      );
    });
    try {
      const { streamChat } = await import("../src/providers/anthropic.ts");
      const events = await collect(
        streamChat({ baseUrl: url, apiKey: "test", model: "claude-test", requestTimeoutMs: 10_000 } as any, [{ role: "user", content: "hi" }], []),
      );
      const u = usageOf(events);
      // anthropic bills input_tokens + cache_creation + cache_read, so the
      // cached part is a subset of prompt_tokens and cached/prompt is a rate
      expect(u.prompt_tokens).toBe(190);
      expect(u.cached_tokens).toBe(80);
      expect(u.cached_tokens).toBeLessThanOrEqual(u.prompt_tokens);
    } finally {
      server.close();
    }
  });
});
