// Native Anthropic provider with prompt caching. Cache breakpoints sit on
// the system prompt and the tail of the message list so long sessions stop
// re-paying for the stable prefix.
import { streamText, jsonSchema, type ToolSet } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import type { ChatMessage, ProviderConfig, StreamEvent, ToolDef } from "./types.ts";
import { classifyProviderError } from "../core/errors.ts";
import { toModelMessages } from "./convert.ts";

const CACHE_OFF = process.env.FOX_ANTHROPIC_CACHE === "0";

export async function* streamChat(
  cfg: ProviderConfig,
  messages: ChatMessage[],
  tools: ToolDef[],
  signal?: AbortSignal,
): AsyncGenerator<StreamEvent> {
  const provider = createAnthropic({ baseURL: cfg.baseUrl || undefined, apiKey: cfg.apiKey });
  const model = provider.languageModel(cfg.model);

  const toolSet: ToolSet = {};
  for (const t of tools) toolSet[t.name] = { description: t.description, inputSchema: jsonSchema(t.parameters as never) };

  try {
    const sysText = messages
      .filter((m) => m.role === "system")
      .map((m) => m.content)
      .join("\n\n");
    const rest = toModelMessages(messages.filter((m) => m.role !== "system"));
    if (!rest.length) rest.push({ role: "user", content: "(begin)" });

    // cache breakpoints: system + last two messages (conversation tail moves
    // each turn; everything before it stays a cached prefix)
    if (!CACHE_OFF && sysText) {
      (rest[rest.length - 1] as { providerOptions?: Record<string, unknown> }).providerOptions = {
        anthropic: { cacheControl: { type: "ephemeral" } },
      };
      if (rest.length > 1) {
        (rest[rest.length - 2] as { providerOptions?: Record<string, unknown> }).providerOptions = {
          anthropic: { cacheControl: { type: "ephemeral" } },
        };
      }
    }

    const result = streamText({
      model,
      ...(sysText ? { system: sysText } : {}),
      messages: rest,
      ...(tools.length ? { tools: toolSet } : {}),
      abortSignal: signal,
    });

    let finish = "";
    for await (const part of result.fullStream) {
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
    yield { type: "done", reason: finish || "stop" };
  } catch (e) {
    if (signal?.aborted) {
      const err = new Error("aborted");
      err.name = "AbortError";
      throw err;
    }
    throw classifyProviderError(e);
  }
}
