// OpenAI Responses API provider (`/v1/responses`). Same stream contract as
// openai-compatible.ts; only the SDK entry point differs — reasoning items
// and tool calls surface through the same fullStream parts.
import { streamText, jsonSchema, type ToolSet } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import type { ChatMessage, ProviderConfig, StreamEvent, ToolDef } from "./types.ts";
import { streamFailure, TruncatedStreamError } from "../core/errors.ts";
import { startWatchdog } from "./watchdog.ts";
import { providerOptionsFor, samplingOptions, outputTokenOptions } from "./index.ts";
import { toModelMessages } from "./convert.ts";

export * from "./types.ts";

export async function* streamChat(
  cfg: ProviderConfig,
  messages: ChatMessage[],
  tools: ToolDef[],
  signal?: AbortSignal,
): AsyncGenerator<StreamEvent> {
  const provider = createOpenAI({
    baseURL: cfg.baseUrl,
    apiKey: cfg.apiKey,
    ...(cfg.headers && Object.keys(cfg.headers).length ? { headers: cfg.headers } : {}),
  });
  const model = provider.responses(cfg.model);

  const toolSet: ToolSet = {};
  for (const t of tools) toolSet[t.name] = { description: t.description, inputSchema: jsonSchema(t.parameters as never) };

  const wd = startWatchdog(cfg.requestTimeoutMs, signal);
  // true once any part has arrived: a later failure cut off a streamed answer,
  // which is resumable rather than a fresh request that just failed
  let sawPart = false;
  try {
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
    for await (const part of result.fullStream) {
      wd.progress();
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
          break;
      }
    }
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
    if (wd.timedOut) throw wd.error();
    if (signal?.aborted) {
      const err = new Error("aborted");
      err.name = "AbortError";
      throw err;
    }
    throw streamFailure(cfg.model, e, sawPart);
  } finally {
    wd.done();
  }
}
