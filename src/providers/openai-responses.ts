// OpenAI Responses API provider (`/v1/responses`). Same stream contract as
// openai-compatible.ts; only the SDK entry point differs — reasoning items
// and tool calls surface through the same fullStream parts.
import { streamText, jsonSchema, type ToolSet } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import type { ChatMessage, ProviderConfig, StreamEvent, ToolDef } from "./types.ts";
import { classifyProviderError } from "../core/errors.ts";
import { startWatchdog } from "./watchdog.ts";
import { toModelMessages } from "./convert.ts";

export * from "./types.ts";

export async function* streamChat(
  cfg: ProviderConfig,
  messages: ChatMessage[],
  tools: ToolDef[],
  signal?: AbortSignal,
): AsyncGenerator<StreamEvent> {
  const provider = createOpenAI({ baseURL: cfg.baseUrl, apiKey: cfg.apiKey });
  const model = provider.responses(cfg.model);

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
      abortSignal: wd.signal,
    });

    let finish = "";
    for await (const part of result.fullStream) {
      wd.progress();
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
    if (wd.timedOut) throw wd.error();
    if (signal?.aborted) {
      const err = new Error("aborted");
      err.name = "AbortError";
      throw err;
    }
    yield { type: "done", reason: finish || "stop" };
  } catch (e) {
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
