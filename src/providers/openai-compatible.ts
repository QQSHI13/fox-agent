// OpenAI-compatible streaming provider (any gateway / OpenAI).
// Contract: throws ProviderError (classified, retriable flag set) on
// transport/API failure and AbortError-shaped errors on interrupt; yields
// StreamEvents otherwise. Never reports errors via `done` reason strings.
import { streamText, jsonSchema, type ToolSet } from "ai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { ChatMessage, ProviderConfig, StreamEvent, ToolDef } from "./types.ts";
import { streamFailure, TruncatedStreamError } from "../core/errors.ts";
import { debugInfo, debugError } from "../core/debuglog.ts";
import { startWatchdog } from "./watchdog.ts";
import { providerOptionsFor, samplingOptions, outputTokenOptions, cacheKeyFor } from "./index.ts";
import { toModelMessages } from "./convert.ts";

export * from "./types.ts";

export async function* streamChat(
  cfg: ProviderConfig,
  messages: ChatMessage[],
  tools: ToolDef[],
  signal?: AbortSignal,
): AsyncGenerator<StreamEvent> {
  // includeUsage asks for stream_options.include_usage: without it most
  // OpenAI-compatible gateways never send a usage chunk, and every downstream
  // figure (status bar ctx%, the agent's own context meter, /usage) silently
  // stays at "no report yet" forever
  const cacheKey = cacheKeyFor(cfg);
  const provider = createOpenAICompatible({
    name: "fox-agent",
    baseURL: cfg.baseUrl,
    apiKey: cfg.apiKey,
    includeUsage: true,
    ...(cfg.headers && Object.keys(cfg.headers).length ? { headers: cfg.headers } : {}),
    // `prompt_cache_key` is a body field, and this SDK's providerOptions
    // pass-through keys off the provider NAME (split('.')[0] of "fox-agent"),
    // so providerOptions would silently match nothing. transformRequestBody is
    // the supported insertion point for a body field. Only added when there IS
    // a session: a one-off call has no affinity worth claiming, and a key it
    // never revisits would just occupy a shard.
    ...(cacheKey
      ? { transformRequestBody: (body: Record<string, any>) => ({ ...body, prompt_cache_key: cacheKey }) }
      : {}),
  });
  const model = provider.chatModel(cfg.model);

  const toolSet: ToolSet = {};
  for (const t of tools) toolSet[t.name] = { description: t.description, inputSchema: jsonSchema(t.parameters as never) };

  const wd = startWatchdog(cfg.requestTimeoutMs, signal);
  const started = Date.now();
  // true once any part has arrived: a failure after that point cut off an
  // answer that has already streamed, which the turn can resume
  let sawPart = false;
  debugInfo("provider", `request → ${cfg.baseUrl}`, `model=${cfg.model} format=${cfg.provider ?? "openai-compatible"} messages=${messages.length} tools=${tools.length} maxTokens=${outputTokenOptions(cfg).maxOutputTokens ?? "(provider default)"}`);
  try {
    // ai v7 requires system content via the dedicated option, not in messages[]
    const sys = messages
      .filter((m) => m.role === "system")
      .map((m) => m.content)
      .join("\n\n");
    const rest = toModelMessages(messages.filter((m) => m.role !== "system"), "user-fallback");
    if (!rest.length) rest.push({ role: "user", content: "(begin)" });

    const result = streamText({
      model,
      ...(sys ? { system: sys } : {}),
      messages: rest,
      ...(tools.length ? { tools: toolSet } : {}),
      // the SDK clamps a model it does not recognize to a small output ceiling
      // and logs a warning; we know the real one (config, /models, models.dev)
      ...outputTokenOptions(cfg),
      ...samplingOptions(cfg.sampling),
      ...providerOptionsFor(cfg),
      abortSignal: wd.signal,
    });

    let finish = "";
    // Race the stream against the abort signal: a bare `for await (fullStream)`
    // only notices an abort when the NEXT chunk arrives, so an ESC during an
    // idle think (no bytes in flight) sat until the socket moved or timed out.
    // Pulling the iterator by hand and racing each next() against the signal
    // returns the moment the caller aborts, not the moment the provider sends.
    const iter = result.fullStream[Symbol.asyncIterator]();
    let aborted = false;
    const abortPromise = new Promise<never>((_, rej) => {
      if (wd.signal?.aborted) return rej(new Error("aborted"));
      wd.signal?.addEventListener("abort", () => rej(new Error("aborted")), { once: true });
    });
    try {
      for (;;) {
        const { done, value: part } = await Promise.race([iter.next(), abortPromise]);
        if (done) break;
        wd.progress(); // any part counts as progress: rearm the idle clock
        if (part.type !== "error") sawPart = true;
        switch (part.type) {
        case "text-delta":
          if (part.text) yield { type: "text", delta: part.text };
          break;
        case "reasoning-delta":
          if (part.text) yield { type: "reasoning", delta: part.text };
          break;
        case "tool-call":
          yield {
            type: "tool_call",
            call: {
              id: part.toolCallId,
              name: part.toolName,
              arguments: typeof part.input === "string" ? part.input : JSON.stringify(part.input ?? {}),
            },
          };
          break;
        case "error":
          // retriable + already streaming = a cut-off answer, not a refusal:
          // mark it so the loop resumes instead of dropping what streamed
          throw streamFailure(cfg.model, part.error, sawPart);
        case "finish":
          finish = part.finishReason;
          if (part.totalUsage)
            yield {
              type: "usage",
              prompt_tokens: part.totalUsage.inputTokens ?? 0,
              completion_tokens: part.totalUsage.outputTokens ?? 0,
              // input re-sent from the prefix cache: the part of the bill that
              // stops getting charged once a prompt has been seen before
              cached_tokens: part.totalUsage.inputTokenDetails?.cacheReadTokens ?? 0,
            };
          debugInfo("provider", `response ← ${cfg.model}`, `finish=${finish} in=${part.totalUsage?.inputTokens ?? 0} out=${part.totalUsage?.outputTokens ?? 0} cached=${part.totalUsage?.inputTokenDetails?.cacheReadTokens ?? 0} ms=${Date.now() - started}`);
          break;
        }
      }
    } finally {
      // release the stream so an aborted connection is closed, not leaked
      try {
        await iter.return?.();
      } catch {}
    }
    // An aborted stream does NOT throw — `fullStream` simply ends. Without
    // these checks a timeout would look like a clean "stop" and the turn would
    // report success on a provider that never answered.
    if (wd.timedOut) throw wd.error();
    if (signal?.aborted) {
      const err = new Error("aborted");
      err.name = "AbortError";
      throw err;
    }
    // No finish part = the connection was cut mid-answer. Reporting that as
    // "stop" claimed a clean success on a truncated reply, so the turn never
    // retried it. Throw instead: the turn loop retries it.
    if (!finish) throw new TruncatedStreamError(cfg.model);
    yield { type: "done", reason: finish };
  } catch (e) {
    // ORDER MATTERS: the watchdog aborts via the same combined signal, so
    // `signal.aborted` is true for an idle timeout too. Checking abort first
    // would report every timeout as a user interrupt and skip the retry.
    if (wd.timedOut) throw wd.error();
    if (signal?.aborted) {
      const err = new Error("aborted");
      err.name = "AbortError";
      throw err;
    }
    const pe = streamFailure(cfg.model, e, sawPart);
    // the full truth about a failed call: endpoint, model, status, the provider's
    // own message, and the raw body. This is where a "400 Invalid max_tokens"
    // becomes legible instead of a bare upstream string.
    debugError("provider", `request failed (${pe.status ?? "?"})`, `url=${cfg.baseUrl} model=${cfg.model} ms=${Date.now() - started}\n${pe.message}\n${pe.detail ?? ""}`);
    throw pe;
  } finally {
    wd.done();
  }
}
