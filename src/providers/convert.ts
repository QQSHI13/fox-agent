// ChatMessage[] -> AI SDK ModelMessage[] conversion shared by all providers.
import type { ModelMessage, AssistantContent } from "ai";
import type { ChatMessage } from "./types.ts";

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s || "{}");
  } catch {
    return {};
  }
}

// toolName is recovered from the preceding assistant's tool_calls, which the
// context renderer always keeps paired (orphan repair lives in context/view).
export function toModelMessages(messages: ChatMessage[]): ModelMessage[] {
  const names = new Map<string, string>();
  for (const m of messages) for (const c of m.tool_calls ?? []) names.set(c.id, c.name);

  return messages.map((m): ModelMessage => {
    if (m.role === "system" || m.role === "user") return { role: m.role, content: m.content };
    if (m.role === "assistant") {
      if (!m.tool_calls?.length) return { role: "assistant", content: m.content };
      const parts: AssistantContent = [];
      if (m.content) parts.push({ type: "text", text: m.content });
      for (const c of m.tool_calls)
        parts.push({
          type: "tool-call",
          toolCallId: c.id,
          toolName: c.name,
          input: safeJson(c.arguments),
        });
      return { role: "assistant", content: parts };
    }
    return {
      role: "tool",
      content: [
        {
          type: "tool-result",
          toolCallId: m.tool_call_id!,
          toolName: names.get(m.tool_call_id!) ?? "unknown",
          output: { type: "text", value: m.content },
        },
      ],
    };
  });
}
