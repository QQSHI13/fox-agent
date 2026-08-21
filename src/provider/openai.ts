// Minimal OpenAI-compatible streaming client (tokenguard-ready: one base URL + key).

export interface ToolCall {
  id: string;
  name: string;
  arguments: string; // raw JSON string
}

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

export interface ToolDef {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema
}

export type StreamEvent =
  | { type: "text"; delta: string }
  | { type: "tool_call"; call: ToolCall }
  | { type: "usage"; prompt_tokens: number; completion_tokens: number }
  | { type: "done"; reason: string };

export interface ProviderConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export function providerFromEnv(): ProviderConfig {
  const baseUrl = process.env.FOXC_BASE_URL ?? process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1";
  const apiKey = process.env.FOXC_API_KEY ?? process.env.OPENAI_API_KEY ?? "";
  const model = process.env.FOXC_MODEL ?? "gpt-4o-mini";
  if (!apiKey) throw new Error("foxc: set FOXC_API_KEY / OPENAI_API_KEY (or FOXC_BASE_URL pointing at tokenguard)");
  return { baseUrl: baseUrl.replace(/\/$/, ""), apiKey, model };
}

interface ChunkChoiceDelta {
  content?: string | null;
  tool_calls?: { index: number; id?: string; function?: { name?: string; arguments?: string } }[];
  finish_reason?: string | null;
}

export async function* streamChat(
  cfg: ProviderConfig,
  messages: ChatMessage[],
  tools: ToolDef[],
  signal?: AbortSignal,
): AsyncGenerator<StreamEvent> {
  const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
    method: "POST",
    signal,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify({
      model: cfg.model,
      messages,
      ...(tools.length ? { tools: tools.map((t) => ({ type: "function", function: t })) } : {}),
      stream: true,
      stream_options: { include_usage: true },
    }),
  });
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    yield { type: "done", reason: `error ${res.status}: ${text.slice(0, 500)}` };
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  const pending = new Map<number, ToolCall>();
  let usage: { prompt_tokens: number; completion_tokens: number } | null = null;
  let finish = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (data === "[DONE]") continue;
      let chunk: any;
      try {
        chunk = JSON.parse(data);
      } catch {
        continue;
      }
      if (chunk.usage) usage = { prompt_tokens: chunk.usage.prompt_tokens, completion_tokens: chunk.usage.completion_tokens };
      const choice = chunk.choices?.[0];
      if (!choice) continue;
      const delta: ChunkChoiceDelta = choice.delta ?? {};
      if (delta.content) yield { type: "text", delta: delta.content };
      for (const tc of delta.tool_calls ?? []) {
        const p = pending.get(tc.index) ?? { id: "", name: "", arguments: "" };
        if (tc.id) p.id = tc.id;
        if (tc.function?.name) p.name += tc.function.name;
        if (tc.function?.arguments) p.arguments += tc.function.arguments;
        pending.set(tc.index, p);
      }
      if (choice.finish_reason) finish = choice.finish_reason;
    }
  }

  // flush completed tool calls once the stream ends
  for (const call of [...pending.values()].sort((a, b) => a.id.localeCompare(b.id))) {
    if (call.name) yield { type: "tool_call", call };
  }
  if (usage) yield { type: "usage", ...usage };
  yield { type: "done", reason: finish || "stop" };
}
