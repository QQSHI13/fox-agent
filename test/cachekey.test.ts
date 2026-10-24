/**
 * Does the request actually carry a prompt-cache affinity key?
 *
 * OpenAI-shaped endpoints route a request to a prefix-cache shard by the
 * `prompt_cache_key` BODY field. Without one, consecutive steps of a single
 * conversation can be routed independently, so a prompt that was fully cached on
 * step N is a total miss on step N+1 — the agent pays full input price on every
 * step of a long turn.
 *
 * This is the one hop we control: the SDK builds the body, and the key has to
 * reach it. Two insertion points exist and only one works for the compat SDK
 * (its providerOptions pass-through keys off the provider NAME, and ours is
 * "fox-agent"), which is exactly the kind of thing that silently no-ops. So the
 * assertion is on the wire body a real server receives — not on our own config
 * object, which would pass whether or not the SDK acted on it.
 *
 * Loopback HTTP, no mocking of the SDK, no network, no keys.
 */
import { describe, expect, test } from "bun:test";
import { createServer, type Server } from "node:http";
import { streamChat } from "../src/providers/openai-compatible.ts";
import { cacheKeyFor, cacheAffinityOptions } from "../src/providers/index.ts";
import type { ProviderConfig, StreamEvent } from "../src/providers/types.ts";

/** A chat-completions SSE reply: one text delta, then finish + usage. */
const reply = (res: import("node:http").ServerResponse) => {
  res.writeHead(200, { "content-type": "text/event-stream" });
  const chunk = (o: unknown) => res.write(`data: ${JSON.stringify(o)}\n\n`);
  chunk({ id: "1", object: "chat.completion.chunk", created: 1, model: "m", choices: [{ index: 0, delta: { role: "assistant", content: "ok" }, finish_reason: null }] });
  chunk({ id: "1", object: "chat.completion.chunk", created: 1, model: "m", choices: [{ index: 0, delta: {}, finish_reason: "stop" }], usage: { prompt_tokens: 5, completion_tokens: 1, total_tokens: 6 } });
  res.write("data: [DONE]\n\n");
  res.end();
};

/** Run one request against a loopback endpoint and return the JSON body it saw. */
async function captureBody(cfg: Omit<ProviderConfig, "baseUrl">): Promise<Record<string, unknown>> {
  let seen: Record<string, unknown> = {};
  const server: Server = createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      try {
        seen = JSON.parse(raw) as Record<string, unknown>;
      } catch {}
      reply(res);
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const { port } = server.address() as { port: number };
  try {
    const events: StreamEvent[] = [];
    for await (const ev of streamChat({ ...cfg, baseUrl: `http://127.0.0.1:${port}/v1` }, [{ role: "user", content: "hi" }], [])) {
      events.push(ev);
    }
    expect(events.some((e) => e.type === "done")).toBe(true);
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
  return seen;
}

describe("prompt-cache affinity key", () => {
  test("openai-compatible: the session id reaches the request body", async () => {
    const body = await captureBody({
      apiKey: "k",
      model: "m",
      provider: "openai-compatible",
      sessionId: "sess-abc123",
    });
    expect(body.prompt_cache_key).toBe("sess-abc123");
  });

  test("no session, no key — a one-off call claims no affinity", async () => {
    const body = await captureBody({ apiKey: "k", model: "m", provider: "openai-compatible" });
    expect(body).not.toHaveProperty("prompt_cache_key");
  });

  test("the key is stable across steps of the same session", async () => {
    // the whole point: two requests in one conversation must land on one shard
    const a = await captureBody({ apiKey: "k", model: "m", provider: "openai-compatible", sessionId: "same" });
    const b = await captureBody({ apiKey: "k", model: "m", provider: "openai-compatible", sessionId: "same" });
    expect(a.prompt_cache_key).toBe(b.prompt_cache_key);
    expect(a.prompt_cache_key).toBe("same");
  });

  test("different sessions get different keys", async () => {
    const a = await captureBody({ apiKey: "k", model: "m", provider: "openai-compatible", sessionId: "one" });
    const b = await captureBody({ apiKey: "k", model: "m", provider: "openai-compatible", sessionId: "two" });
    expect(a.prompt_cache_key).not.toBe(b.prompt_cache_key);
  });

  test("anthropic and google do NOT get an OpenAI-shaped body field", () => {
    // Anthropic uses explicit cache_control breakpoints; Google configures
    // caching out of band. An unknown body field there is a 400, not a no-op.
    expect(cacheKeyFor({ baseUrl: "x", apiKey: "k", model: "m", provider: "anthropic", sessionId: "s" })).toBeUndefined();
    expect(cacheKeyFor({ baseUrl: "x", apiKey: "k", model: "m", provider: "google", sessionId: "s" })).toBeUndefined();
    expect(cacheKeyFor({ baseUrl: "x", apiKey: "k", model: "m", provider: "openai-compatible", sessionId: "s" })).toBe("s");
  });

  test("openai-responses takes it as a native provider option, not a body key", () => {
    const opts = cacheAffinityOptions({ baseUrl: "x", apiKey: "k", model: "m", provider: "openai-responses", sessionId: "s" });
    expect(opts).toEqual({ providerOptions: { openai: { promptCacheKey: "s" } } });
    // the compat SDK path does not go through providerOptions at all
    expect(cacheAffinityOptions({ baseUrl: "x", apiKey: "k", model: "m", provider: "openai-compatible", sessionId: "s" })).toBeUndefined();
  });

  test("a blank session id is treated as absent", () => {
    expect(cacheKeyFor({ baseUrl: "x", apiKey: "k", model: "m", provider: "openai-compatible", sessionId: "   " })).toBeUndefined();
  });
});
