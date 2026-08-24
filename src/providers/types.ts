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
  | { type: "reasoning"; delta: string }
  | { type: "text"; delta: string }
  | { type: "tool_call"; call: ToolCall }
  | { type: "usage"; prompt_tokens: number; completion_tokens: number }
  | { type: "done"; reason: string };

export interface ProviderConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  provider?: "openai-compatible" | "anthropic";
  /**
   * Abort the request after this many ms with no streamed progress. The clock
   * measures idle time, not total duration, so a long legitimate response is
   * never cut off. Omitted or 0 disables it.
   */
  requestTimeoutMs?: number;
}

/**
 * The provider seam. Anything that can stream a chat completion satisfies
 * this — tests inject mocks here.
 */
export type ChatFn = (
  cfg: ProviderConfig,
  messages: ChatMessage[],
  tools: ToolDef[],
  signal?: AbortSignal,
) => AsyncGenerator<StreamEvent>;
