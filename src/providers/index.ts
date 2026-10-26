// Provider resolution: one registry, seeded by the bundled formats plugin,
// extended by user plugins. Both SDKs load lazily — importing this module (or
// anything that reaches it, like the turn loop) must not pull the AI SDK in
// until a request is actually made. Tests inject their own ChatFn and pay nothing.
import type { ChatFn, ProviderConfig } from "./types.ts";
import { lookupModel } from "./models.ts";
import { FoxError } from "../core/errors.ts";
import { BUNDLED_PROVIDER_NAMES, bundledProviderFns, isAnthropic } from "./bundled.ts";
import { REASONING_EFFORTS, THINKING_BUDGET, isReasoningEffort, type ReasoningEffort } from "../core/reasoning.ts";
import { debugError } from "../core/debuglog.ts";

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

/**
 * `maxOutputTokens` — sent ONLY when the user configured it explicitly.
 *
 * The catalog's figure for a model is the MODEL's output capability, not the
 * ENDPOINT's enforced ceiling. A gateway that serves a model with a bigger
 * budget (the catalog says 512000) but caps `max_tokens` lower (393216) rejects
 * the whole request — `HTTP 400 Invalid max_tokens value` — so passing the
 * catalog number broke the call outright rather than raising a ceiling.
 *
 * The provider's own default is the safe answer: it is the one value the
 * endpoint actually accepts, and it does not need fox-agent to know the
 * endpoint's cap. So the catalog value is no longer sent; a user who wants a
 * specific ceiling sets `sampling.maxOutputTokens` and that is sent verbatim.
 */
export function outputTokenOptions(cfg: ProviderConfig): { maxOutputTokens?: number } {
  const explicit = samplingOptions(cfg.sampling).maxOutputTokens;
  if (typeof explicit === "number" && Number.isFinite(explicit) && explicit > 0) {
    return { maxOutputTokens: explicit };
  }
  return {};
}

/**
 * Which rung of the shared scale each provider can express.
 *
 * The scale (`off` … `xhigh`) is what the user picks; this is what the wire
 * accepts. A provider that has no `xhigh` gets `high` — degrading to the nearest
 * rung it HAS beats failing the request, because the user's intent ("think as
 * hard as you can") is still satisfiable.
 */
const OPENAI_EFFORTS: ReadonlySet<string> = new Set(["none", "minimal", "low", "medium", "high", "xhigh"]);

function clampEffort(e: ReasoningEffort, accepted: ReadonlySet<string>): string {
  const wanted = e === "off" ? "none" : e;
  if (accepted.has(wanted)) return wanted;
  // nearest rung downward, never upward — asking for more than a provider has
  // is a rejected request, asking for less is just a cheaper answer
  const order = e === "off" ? [] : (REASONING_EFFORTS as readonly string[]);
  const i = order.indexOf(e);
  for (let j = i; j >= 0; j--) if (accepted.has(order[j] as string)) return order[j] as string;
  return "minimal";
}

/**
 * Every providerOptions the request needs, merged into ONE object.
 *
 * Each helper returns `{ providerOptions: {<namespace>: {...}} }`, and spreading
 * two of those into `streamText` would let the second replace the first (same
 * top-level key). Merging by namespace keeps reasoning effort and the cache key
 * on a request that wants both.
 */
export function providerOptionsFor(cfg: ProviderConfig): { providerOptions?: Record<string, import("@ai-sdk/provider").JSONObject> } {
  const parts = [reasoningProviderOptions(cfg), cacheAffinityOptions(cfg)];
  const merged: Record<string, import("@ai-sdk/provider").JSONObject> = {};
  for (const p of parts) {
    if (!p) continue;
    for (const [ns, opts] of Object.entries(p.providerOptions)) {
      // two helpers touching the same namespace merge field-by-field
      merged[ns] = { ...(merged[ns] ?? {}), ...opts };
    }
  }
  return Object.keys(merged).length ? { providerOptions: merged } : {};
}

/**
 * The prompt-cache affinity key for this request, or undefined.
 *
 * OpenAI-shaped endpoints take a `prompt_cache_key`, and a STABLE value per
 * conversation is what keeps consecutive steps on the same cache shard: without
 * it the backend is free to route each request independently, so a prompt that
 * was fully cached on step N can be a total miss on step N+1. The session id is
 * exactly the right granularity — one conversation, many steps — and it must not
 * be shared across unrelated sessions, which would only pollute a shard nothing
 * asks for again.
 *
 * Only the OpenAI families get it: Anthropic's Messages API has no such field
 * (it uses explicit `cache_control` breakpoints, which we already send) and
 * Google's caching is configured out-of-band. An unknown body field there is at
 * best ignored and at worst a 400.
 */
export function cacheKeyFor(cfg: ProviderConfig): string | undefined {
  const key = cfg.sessionId?.trim();
  if (!key) return undefined;
  const name = cfg.provider ?? "openai-compatible";
  if (name === "openai-responses" || name === "openai-compatible" || name === "openai") return key;
  return undefined;
}

/**
 * Provider options carrying the cache key, for endpoints that take it as a
 * proper request option rather than a bare body field.
 *
 * The compat SDK's providerOptions pass-through is NOT used here: its namespace
 * is `config.provider.split('.')[0]`, and fox registers its provider as
 * `fox-agent`, so `{openaiCompatible: {...}}` silently matches nothing. The
 * compatible endpoint gets the key through `transformRequestBody` instead (see
 * openai-compatible.ts); only the native Responses API takes an option.
 */
export function cacheAffinityOptions(cfg: ProviderConfig): { providerOptions: Record<string, import("@ai-sdk/provider").JSONObject> } | undefined {
  const key = cacheKeyFor(cfg);
  if (!key) return undefined;
  if (cfg.provider === "openai-responses") {
    // a real field on this endpoint, not a pass-through body key
    return { providerOptions: { openai: { promptCacheKey: key } } };
  }
  return undefined;
}

/**
 * The AI SDK's `onError` sink — every `streamText` call passes this.
 *
 * `streamText` defaults `onError` to `console.error(error)`, and on an
 * `APICallError` that prints the WHOLE error object: `responseBody` (a
 * gateway's multi-KB HTML/JSON error page), `requestBodyValues` (the prompt),
 * the nested retry chain, and a source excerpt per stack frame. Measured on one
 * 429 whose body was 6 KB: 37 KB of stderr. Under the TUI that dump is painted
 * by whoever flushes stderr next — and because the alternate screen has no
 * scrollback and the grid's row-hash diff sees the scribble as "already
 * painted", the frame never repairs itself: the input dock stays black.
 *
 * So the transcript keeps its one diagnosed line (see reportError in the TUI,
 * and the turn loop's persisted message) and the dump goes to the log, which is
 * the only surface that can hold it.
 *
 * `onError` is a NOTIFICATION, not a handler: the error still arrives as an
 * `error` part on `fullStream`, which each provider throws on — so nothing is
 * swallowed here, and retry/resume policy is untouched.
 */
export function streamErrorSink(cfg: ProviderConfig): (event: { error: unknown }) => void {
  return ({ error }) => debugError("provider", `stream error (${cfg.model})`, error);
}

/**
 * Provider options for reasoning effort, keyed the way each AI SDK expects
 * them (`reasoningEffort` travels in `sampling` like any sampling override).
 *
 * Undefined when no effort is set — the provider's native default then rules.
 * `off` IS set: it is an explicit request for a non-reasoning answer, and each
 * family says it differently (Anthropic disables thinking, Google zeroes the
 * budget, the OpenAI family names "none"). Previously clearing the setting was
 * the only way to reach a fast answer, which cannot work on a reasoning model —
 * the provider's default there is ON.
 */
export function reasoningProviderOptions(cfg: ProviderConfig): { providerOptions: Record<string, import("@ai-sdk/provider").JSONObject> } | undefined {
  const effort = cfg.sampling?.reasoningEffort;
  if (!isReasoningEffort(effort)) return undefined;
  const options: Record<string, import("@ai-sdk/provider").JSONObject> = {};
  if (cfg.provider === "anthropic") {
    // no budget to name when thinking is off; enabling one always carries a budget
    options.anthropic =
      effort === "off"
        ? { thinking: { type: "disabled" } }
        : { thinking: { type: "enabled", budgetTokens: THINKING_BUDGET[effort] } };
  } else if (cfg.provider === "google") {
    // 0 is the documented way to disable thinking on a budgeted model
    options.google = { thinkingConfig: { thinkingBudget: effort === "off" ? 0 : THINKING_BUDGET[effort] } };
  } else if (cfg.provider === "openai-responses") {
    options.openai = { reasoningEffort: clampEffort(effort, OPENAI_EFFORTS) };
  } else {
    // openai-compatible (and anything else speaking the chat-completions shape):
    // the SDK's option namespace is "openaiCompatible". It types this as a plain
    // string, so the value goes through as-is and a gateway that does not know
    // it ignores it — which is the correct failure mode for a vendor knob.
    options.openaiCompatible = { reasoningEffort: clampEffort(effort, OPENAI_EFFORTS) };
  }
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
