/**
 * fox-agent's own API formats, as a plugin like any other.
 *
 * Each format is a `ChatFn` registered under its config name — exactly the
 * shape a user plugin contributes through `FoxPlugin.providers`. The only
 * thing special about these four names is that they are *reserved*: a user
 * plugin registering one is refused (see `setCustomProviders`), so
 * `provider = "anthropic"` can never silently mean something else.
 *
 * Lazy by construction: every format dynamic-imports its SDK module inside
 * the ChatFn, so importing this module (or anything that reaches it, like the
 * turn loop) pulls no AI SDK in until a request is actually made.
 */
import { FoxError } from "../core/errors.ts";
import type { ChatFn, ProviderConfig } from "./types.ts";
import type { FoxPlugin } from "../plugins/types.ts";

/** Config names fox-agent itself speaks. Reserved against user plugins. */
export const BUNDLED_PROVIDER_NAMES = ["openai-compatible", "openai-responses", "anthropic", "google"] as const;

export function isAnthropic(cfg: ProviderConfig): boolean {
  if (cfg.provider === "anthropic") return true;
  if (cfg.provider === "openai-compatible" || cfg.provider === "openai-responses" || cfg.provider === "google") return false;
  return /^claude/i.test(cfg.model) && !/openai\.com/.test(cfg.baseUrl);
}

/**
 * The key check lives at request time, not startup: a keyless launch opens
 * the TUI fine (that's what /login is for), and the error names the fix at
 * the moment it actually matters. Local gateways (ollama, a localhost
 * proxy, …) legitimately need no key.
 */
function requireKey(cfg: ProviderConfig): void {
  if (!cfg.apiKey && !/^https?:\/\/(localhost|127\.|\[::1\])/.test(cfg.baseUrl)) {
    throw new FoxError(`no API key configured — use /login, or set FOX_AGENT_API_KEY`);
  }
}

const openaiCompatible: ChatFn = async function* (cfg, messages, tools, signal) {
  requireKey(cfg);
  const mod = isAnthropic(cfg) ? await import("./anthropic.ts") : await import("./openai-compatible.ts");
  yield* mod.streamChat(cfg, messages, tools, signal);
};

const openaiResponses: ChatFn = async function* (cfg, messages, tools, signal) {
  requireKey(cfg);
  const mod = await import("./openai-responses.ts");
  yield* mod.streamChat(cfg, messages, tools, signal);
};

const anthropic: ChatFn = async function* (cfg, messages, tools, signal) {
  requireKey(cfg);
  const mod = await import("./anthropic.ts");
  yield* mod.streamChat(cfg, messages, tools, signal);
};

const google: ChatFn = async function* (cfg, messages, tools, signal) {
  requireKey(cfg);
  const mod = await import("./google.ts");
  yield* mod.streamChat(cfg, messages, tools, signal);
};

export const bundledProviderFns: Record<(typeof BUNDLED_PROVIDER_NAMES)[number], ChatFn> = {
  "openai-compatible": openaiCompatible,
  "openai-responses": openaiResponses,
  anthropic,
  google,
};

/** The four formats as one bundled plugin — merged through the same path as user plugins. */
export function bundledProviderPlugin(): FoxPlugin {
  return { name: "bundled:providers", providers: { ...bundledProviderFns } };
}
