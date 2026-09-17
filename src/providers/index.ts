// Provider resolution: one registry, seeded by the bundled formats plugin,
// extended by user plugins. Both SDKs load lazily — importing this module (or
// anything that reaches it, like the turn loop) must not pull the AI SDK in
// until a request is actually made. Tests inject their own ChatFn and pay nothing.
import type { ChatFn, ProviderConfig } from "./types.ts";
import { FoxError } from "../core/errors.ts";
import { BUNDLED_PROVIDER_NAMES, bundledProviderFns, isAnthropic } from "./bundled.ts";

export { isAnthropic };
export * from "./types.ts";
/**
 * Providers a plugin registered, by config name. Bundled formats seed the map
 * at import; user plugins overlay it — except the reserved bundled names (see
 * `setCustomProviders`).
 *
 * Module-level rather than threaded through `resolveChat`'s signature, because
 * `resolveChat` is a `ChatFn` — the shape the whole loop, the SDK and every test
 * mock is typed against. Widening it to carry a registry would change five call
 * sites to pass something only this function reads.
 */
const bundled = new Map<string, ChatFn>(Object.entries(bundledProviderFns));
const custom = new Map<string, ChatFn>();
/** Bundled formats switched off via `disabledPlugins` (replaced per registry build). */
const disabledBundled = new Set<string>();

/** Replace the set of disabled bundled formats — called per buildRegistry from config. */
export function setDisabledBundledProviders(names: string[]): void {
  disabledBundled.clear();
  for (const n of names) disabledBundled.add(n);
}

/**
 * Register plugin providers. Called from the turn loop after `loadPlugins`;
 * replaces the set rather than adding to it, so a config that stops naming a
 * plugin stops offering its provider.
 */
export function setCustomProviders(providers: Map<string, ChatFn>): void {
  custom.clear();
  for (const [name, fn] of providers) {
    // shadowing a bundled name would make `provider = "anthropic"` mean
    // something other than Anthropic, which no amount of documentation makes safe
    if ((BUNDLED_PROVIDER_NAMES as readonly string[]).includes(name)) continue;
    custom.set(name, fn);
  }
}

/** The provider names currently resolvable, bundled and plugin-registered. */
export function availableProviders(): string[] {
  return [...bundled.keys(), ...custom.keys()].filter((n) => !disabledBundled.has(n));
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

/** Thinking budgets for providers that take a token budget rather than a name. */
const THINKING_BUDGET: Record<string, number> = { low: 2_048, medium: 8_192, high: 32_768 };

/**
 * Provider options for reasoning effort, keyed the way each AI SDK expects
 * them (`reasoningEffort` travels in `sampling` like any sampling override).
 * Undefined when no effort is set — the provider's native default then rules.
 */
export function reasoningProviderOptions(cfg: ProviderConfig): { providerOptions: Record<string, import("@ai-sdk/provider").JSONObject> } | undefined {
  const effort = cfg.sampling?.reasoningEffort;
  if (typeof effort !== "string" || !/^(low|medium|high)$/.test(effort)) return undefined;
  const options: Record<string, import("@ai-sdk/provider").JSONObject> = {};
  if (cfg.provider === "anthropic") options.anthropic = { thinking: { type: "enabled", budgetTokens: THINKING_BUDGET[effort] } };
  else if (cfg.provider === "google") options.google = { thinkingConfig: { thinkingBudget: THINKING_BUDGET[effort] } };
  else if (cfg.provider === "openai-responses") options.openai = { reasoningEffort: effort };
  // openai-compatible (and anything else speaking the chat-completions shape):
  // the SDK's option namespace is "openaiCompatible"
  else options.openaiCompatible = { reasoningEffort: effort };
  return { providerOptions: options };
}

/** Resolved default ChatFn honoring cfg.provider — one lookup across the bundled formats and plugin providers. */
export const resolveChat: ChatFn = async function* (cfg, messages, tools, signal) {
  const name = cfg.provider?.trim() || "openai-compatible";
  const fn = !disabledBundled.has(name) ? (custom.get(name) ?? bundled.get(name)) : undefined;
  // Previously any unrecognized name fell through to openai-compatible, which
  // meant a typo'd provider produced a confusing 401 from the wrong endpoint
  // instead of saying what was wrong.
  if (!fn) {
    throw new FoxError(`unknown provider '${name}' — available: ${availableProviders().join(", ")}`);
  }
  yield* fn(cfg, messages, tools, signal);
};
