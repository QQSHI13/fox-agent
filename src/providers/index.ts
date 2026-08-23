// Provider resolution: explicit config wins, then claude-* model sniffing.
// Anthropic SDK is loaded lazily so the openai-compatible path has zero
// extra cost.
import { streamChat as openAiCompatible } from "./openai-compatible.ts";
import type { ChatFn, ProviderConfig } from "./types.ts";

export * from "./types.ts";

export function isAnthropic(cfg: ProviderConfig): boolean {
  if (cfg.provider === "anthropic") return true;
  if (cfg.provider === "openai-compatible") return false;
  return /^claude/i.test(cfg.model) && !/openai\.com/.test(cfg.baseUrl);
}

/** Resolved default ChatFn honoring cfg.provider. */
export const resolveChat: ChatFn = async function* (cfg, messages, tools, signal) {
  if (isAnthropic(cfg)) {
    const mod = await import("./anthropic.ts");
    yield* mod.streamChat(cfg, messages, tools, signal);
    return;
  }
  yield* openAiCompatible(cfg, messages, tools, signal);
};
