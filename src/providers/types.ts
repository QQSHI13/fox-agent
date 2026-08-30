export interface ToolCall {
  id: string;
  name: string;
  arguments: string; // raw JSON string
}

/** A binary attachment on a message: base64 bytes plus its IANA media type. */
export interface MediaPart {
  mimeType: string;
  data: string; // base64
  filename?: string;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  /** binary attachments (images/audio/video from `read`); tool messages only */
  media?: MediaPart[];
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
  /**
   * `"openai-compatible"`, `"anthropic"` and `"google"` are built in. Any other
   * string must be registered by a plugin (`FoxPlugin.providers`);
   * `resolveChat` throws a named error listing what is available if it is not.
   * Typed as a plain string rather than a union for that reason — the set is
   * open at runtime.
   */
  provider?: string;
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
