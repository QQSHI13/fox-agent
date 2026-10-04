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
  /**
   * `prompt_tokens` is the billed *total* input for the step — on providers
   * with a prefix cache it already includes the cached part (the AI SDK
   * normalizes it that way), so `cached_tokens / prompt_tokens` is a hit rate
   * and not a ratio of two disjoint buckets.
   *
   * `cached_tokens` is input *read* from cache, never written to it: it is what
   * was billed at the cheap rate, which is the number anyone asking "is my
   * prompt caching working" means. Optional rather than required so a plugin
   * or a mock `ChatFn` that never heard of it still typechecks — consumers read
   * `?? 0`.
   */
  | { type: "usage"; prompt_tokens: number; completion_tokens: number; cached_tokens?: number }
  | { type: "done"; reason: string };

export interface ProviderConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  /**
   * `"openai-compatible"`, `"openai-responses"`, `"anthropic"` and `"google"`
   * ship as the `bundled:providers` plugin. Any other
   * string must be registered by a plugin (`FoxPlugin.providers`);
   * `resolveChat` throws a named error listing what is available if it is not.
   * Typed as a plain string rather than a union for that reason — the set is
   * open at runtime.
   */
  provider?: string;
  /**
   * What the user calls this endpoint — a `[providers.*]` profile name or a
   * catalog preset id ("openrouter", "deepseek"). Display-only: the status
   * line and /model show it instead of the API format, which alone read as
   * "openai-compatible" for half the catalog. Absent for a bare format.
   */
  label?: string;
  /** extra HTTP headers from the provider profile / model config */
  headers?: Record<string, string>;
  /** sampling overrides from the model's config entry (temperature, topP, …) */
  sampling?: Record<string, unknown>;
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
