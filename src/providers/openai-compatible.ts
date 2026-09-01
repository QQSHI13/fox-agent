// OpenAI-compatible streaming provider (tokenguard / any gateway / OpenAI).
// Contract: throws ProviderError (classified, retriable flag set) on
// transport/API failure and AbortError-shaped errors on interrupt; yields
// StreamEvents otherwise. Never reports errors via `done` reason strings.
import { streamText, jsonSchema, type ToolSet } from "ai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { ChatMessage, ProviderConfig, StreamEvent, ToolDef } from "./types.ts";
import { classifyProviderError } from "../core/errors.ts";
import { startWatchdog } from "./watchdog.ts";
import { samplingOptions } from "./index.ts";
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
  const provider = createOpenAICompatible({
    name: "fox-agent",
    baseURL: cfg.baseUrl,
    apiKey: cfg.apiKey,
    includeUsage: true,
    ...(cfg.headers && Object.keys(cfg.headers).length ? { headers: cfg.headers } : {}),
  });
  const model = provider.chatModel(cfg.model);

  const toolSet: ToolSet = {};
  for (const t of tools) toolSet[t.name] = { description: t.description, inputSchema: jsonSchema(t.parameters as never) };

  const wd = startWatchdog(cfg.requestTimeoutMs, signal);
  try {
    // ai v7 requires system content via the dedicated option, not in messages[]
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
