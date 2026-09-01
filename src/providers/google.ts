// Google (Gemini) provider via the AI SDK. Gemini takes image, audio and video
// natively, which is why `read`/`fetch` gate media on the models table's
// audio/video flags — this is currently the only built-in provider where
// those flags are reachable.
import { streamText, jsonSchema, type ToolSet } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import type { ChatMessage, ProviderConfig, StreamEvent, ToolDef } from "./types.ts";
import { classifyProviderError } from "../core/errors.ts";
import { startWatchdog } from "./watchdog.ts";
import { samplingOptions } from "./index.ts";
import { toModelMessages } from "./convert.ts";

export async function* streamChat(
  cfg: ProviderConfig,
  messages: ChatMessage[],
  tools: ToolDef[],
  signal?: AbortSignal,
): AsyncGenerator<StreamEvent> {
  const provider = createGoogleGenerativeAI({
    apiKey: cfg.apiKey,
    // the openai-compatible default baseUrl would be nonsense here; only honor
    // one that was actually pointed at a Gemini-compatible endpoint
    ...(cfg.baseUrl && !/api\.openai\.com/.test(cfg.baseUrl) ? { baseURL: cfg.baseUrl } : {}),
    ...(cfg.headers && Object.keys(cfg.headers).length ? { headers: cfg.headers } : {}),
  });
  const model = provider.languageModel(cfg.model);

  const toolSet: ToolSet = {};
  for (const t of tools) toolSet[t.name] = { description: t.description, inputSchema: jsonSchema(t.parameters as never) };

  const wd = startWatchdog(cfg.requestTimeoutMs, signal);
  try {
    const sys = messages
      .filter((m) => m.role === "system")
      .map((m) => m.content)
      .join("\n\n");
    const rest = toModelMessages(messages.filter((m) => m.role !== "system"));
    if (!rest.length) rest.push({ role: "user", content: "(begin)" });

    const result = streamText({
      model,
      ...(sys ? { system: sys } : {}),
      messages: rest,
      ...(tools.length ? { tools: toolSet } : {}),
      ...samplingOptions(cfg.sampling),
      abortSignal: wd.signal,
    });

    let finish = "";
    for await (const part of result.fullStream) {
      wd.progress(); // any part counts as progress: rearm the idle clock
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
          throw classifyProviderError(part.error);
        case "finish":
          finish = part.finishReason;
          if (part.totalUsage)
            yield {
              type: "usage",
              prompt_tokens: part.totalUsage.inputTokens ?? 0,
              completion_tokens: part.totalUsage.outputTokens ?? 0,
            };
          break;
      }
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
    yield { type: "done", reason: finish || "stop" };
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
    throw classifyProviderError(e);
  } finally {
    wd.done();
  }
}
