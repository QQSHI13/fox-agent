// ChatMessage[] -> AI SDK ModelMessage[] conversion shared by all providers.
import type { ModelMessage, AssistantContent, ToolResultPart } from "ai";
import type { ChatMessage, MediaPart } from "./types.ts";

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s || "{}");
  } catch {
    return {};
  }
}

/**
 * How a provider consumes media attached to tool results.
 *
 * - "native": the SDK maps tool-result content file parts to real media
 *   blocks (anthropic: base64 image blocks; google: inlineData in the
 *   functionResponse). Media stays in the tool message.
 * - "user-fallback": the SDK STRINGIFIES tool-result content
 *   (`JSON.stringify(output.value)` — verified in @ai-sdk/openai-compatible
 *   and @ai-sdk/openai chat mappers), so the model receives the base64 blob
 *   as literal text and understands nothing. Media must move to the one
 *   multipart-safe role: a synthetic user message right after the tool
 *   result, carrying real file parts the SDK maps to `image_url` /
 *   `input_audio` / `video_url`.
 */
export type MediaRouting = "native" | "user-fallback";

/** The file-part shape the tool-result content union expects (narrower
 *  than the SDK's broad FilePart — `data` must be the tagged data form). */
function mediaFilePart(p: MediaPart) {
  return {
    type: "file" as const,
    data: { type: "data" as const, data: p.data },
    mediaType: p.mimeType,
    ...(p.filename ? { filename: p.filename } : {}),
  };
}

/** The tool message keeps its text; media moves out when routing demands. */
function toolOutput(m: ChatMessage, routing: MediaRouting): ToolResultPart["output"] {
  const media = routing === "user-fallback" ? undefined : m.media;
  return media?.length
    ? {
        type: "content",
        value: [
          { type: "text", text: m.content },
          ...media.map((p) => mediaFilePart(p)),
        ],
      }
    : { type: "text", value: m.content };
}

/**
 * MediaPart[] -> the synthetic user message that carries media for
 * user-fallback providers. The text note marks it harness-generated so the
 * model never reads it as something the person typed.
 */
function mediaUserMessage(toolContent: string, media: MediaPart[]): ModelMessage {
  const names = media.map((p) => `${p.filename ?? "attachment"} (${p.mimeType})`).join(", ");
  return {
    role: "user",
    content: [
      {
        type: "text",
        text: `[attachment] tool result above returned media: ${names} — shown below as attached files`,
      },
      ...media.map((p) => mediaFilePart(p)),
    ],
  };
}

// toolName is recovered from the preceding assistant's tool_calls, which the
// context renderer always keeps paired (orphan repair lives in context/view).
export function toModelMessages(messages: ChatMessage[], routing: MediaRouting = "native"): ModelMessage[] {
  const names = new Map<string, string>();
  for (const m of messages) for (const c of m.tool_calls ?? []) names.set(c.id, c.name);

  const out: ModelMessage[] = [];
  for (const m of messages) {
    if (m.role === "system" || m.role === "user") {
      out.push({ role: m.role, content: m.content });
      continue;
    }
    if (m.role === "assistant") {
      if (!m.tool_calls?.length) {
        out.push({ role: "assistant", content: m.content });
        continue;
      }
      const parts: AssistantContent = [];
      if (m.content) parts.push({ type: "text", text: m.content });
      for (const c of m.tool_calls)
        parts.push({
          type: "tool-call",
          toolCallId: c.id,
          toolName: c.name,
          input: safeJson(c.arguments),
        });
      out.push({ role: "assistant", content: parts });
      continue;
    }
    // tool result
    out.push({
      role: "tool",
      content: [
        {
          type: "tool-result",
          toolCallId: m.tool_call_id!,
          toolName: names.get(m.tool_call_id!) ?? "unknown",
          // Media rides as file parts next to the text note — natively where
          // the SDK maps them, or moved to a user message where stringifying
          // would feed the model raw base64 (see MediaRouting).
          output: toolOutput(m, routing),
        },
      ],
    });
    if (routing === "user-fallback" && m.media?.length) {
      out.push(mediaUserMessage(m.content, m.media));
    }
  }
  return out;
}
