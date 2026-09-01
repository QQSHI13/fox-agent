// Provider resolution: explicit config wins, then claude-* model sniffing.
// Both SDKs load lazily — importing this module (or anything that reaches it,
// like the turn loop) must not pull the AI SDK in until a request is actually
// made. Tests inject their own ChatFn and pay nothing.
import type { ChatFn, ProviderConfig } from "./types.ts";
import { FoxError } from "../core/errors.ts";

export * from "./types.ts";

/** Built-in names, so an unresolvable one can say what it could have been. */
const BUILT_IN = ["openai-compatible", "openai-responses", "anthropic", "google"] as const;

/**
 * Providers a plugin registered, by config name.
 *
 * Module-level rather than threaded through `resolveChat`'s signature, because
 * `resolveChat` is a `ChatFn` — the shape the whole loop, the SDK and every test
 * mock is typed against. Widening it to carry a registry would change five call
 * sites to pass something only this function reads.
 */
const custom = new Map<string, ChatFn>();

/**
 * Register plugin providers. Called from the turn loop after `loadPlugins`;
 * replaces the set rather than adding to it, so a config that stops naming a
 * plugin stops offering its provider.
 */
export function setCustomProviders(providers: Map<string, ChatFn>): void {
  custom.clear();
  for (const [name, fn] of providers) {
    // shadowing a built-in would make `provider = "anthropic"` mean something
    // other than Anthropic, which no amount of documentation makes safe
    if ((BUILT_IN as readonly string[]).includes(name)) continue;
    custom.set(name, fn);
  }
}

/** The provider names currently resolvable, built-in and plugin-registered. */
export function availableProviders(): string[] {
  return [...BUILT_IN, ...custom.keys()];
}

export function isAnthropic(cfg: ProviderConfig): boolean {
  if (cfg.provider === "anthropic") return true;
  if (cfg.provider === "openai-compatible" || cfg.provider === "openai-responses" || cfg.provider === "google") return false;
  return /^claude/i.test(cfg.model) && !/openai\.com/.test(cfg.baseUrl);
}

/**
 * Map a model config's free-form `sampling` table onto streamText's named
 * options. Unknown keys are dropped — the AI SDK has a fixed option set, and
 * passing a raw unknown key would silently do nothing anyway.
 */
export function samplingOptions(s: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!s) return {};
  const MAP: Record<string, string> = {
    temperature: "temperature",
    topP: "topP",
    top_p: "topP",
    topK: "topK",
    top_k: "topK",
    presencePenalty: "presencePenalty",
    presence_penalty: "presencePenalty",
    frequencyPenalty: "frequencyPenalty",
    frequency_penalty: "frequencyPenalty",
    seed: "seed",
    maxOutputTokens: "maxOutputTokens",
    maxTokens: "maxOutputTokens",
    max_tokens: "maxOutputTokens",
    stopSequences: "stopSequences",
    stop: "stopSequences",
  };
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(s)) {
    const target = MAP[k];
    if (!target) continue;
    if (typeof v === "number" || typeof v === "string" || Array.isArray(v)) out[target] = v;
  }
  return out;
}

/** Resolved default ChatFn honoring cfg.provider. */
export const resolveChat: ChatFn = async function* (cfg, messages, tools, signal) {
  const name = cfg.provider;
  if (name && !(BUILT_IN as readonly string[]).includes(name)) {
    const fn = custom.get(name);
    // Previously any unrecognized name fell through to openai-compatible, which
    // meant a typo'd provider produced a confusing 401 from the wrong endpoint
    // instead of saying what was wrong.
    if (!fn) {
      throw new FoxError(`unknown provider '${name}' — available: ${availableProviders().join(", ")}`);
    }
    yield* fn(cfg, messages, tools, signal);
    return;
  }
  // The key check lives at request time, not startup: a keyless launch opens
  // the TUI fine (that's what /login is for), and the error names the fix at
  // the moment it actually matters. Local gateways (tokenguard, ollama, …)
  // legitimately need no key.
  if (!cfg.apiKey && !/^https?:\/\/(localhost|127\.|\[::1\])/.test(cfg.baseUrl)) {
    throw new FoxError(`no API key configured — use /login, or set FOX_AGENT_API_KEY`);
  }
  // lazy, always: importing a provider module must not pull its SDK into a
  // process that never calls it (TUI startup, tests with injected ChatFn)
  const mod =
    name === "google"
      ? await import("./google.ts")
      : name === "openai-responses"
        ? await import("./openai-responses.ts")
        : isAnthropic(cfg)
          ? await import("./anthropic.ts")
          : await import("./openai-compatible.ts");
  yield* mod.streamChat(cfg, messages, tools, signal);
};
