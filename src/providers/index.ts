// Provider resolution: explicit config wins, then claude-* model sniffing.
// Both SDKs load lazily — importing this module (or anything that reaches it,
// like the turn loop) must not pull the AI SDK in until a request is actually
// made. Tests inject their own ChatFn and pay nothing.
import type { ChatFn, ProviderConfig } from "./types.ts";

export * from "./types.ts";

export function isAnthropic(cfg: ProviderConfig): boolean {
  if (cfg.provider === "anthropic") return true;
  if (cfg.provider === "openai-compatible") return false;
  return /^claude/i.test(cfg.model) && !/openai\.com/.test(cfg.baseUrl);
}

/** Resolved default ChatFn honoring cfg.provider. */
export const resolveChat: ChatFn = async function* (cfg, messages, tools, signal) {
  const mod = isAnthropic(cfg) ? await import("./anthropic.ts") : await import("./openai-compatible.ts");
  yield* mod.streamChat(cfg, messages, tools, signal);
};
