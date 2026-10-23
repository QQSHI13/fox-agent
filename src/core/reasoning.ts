/**
 * Reasoning effort — the ONE vocabulary every layer agrees on.
 *
 * It lives in its own module (importing nothing) because three places need it
 * and a cycle between them would be a load-order hazard: the config parses and
 * saves it, the provider layer turns it into each SDK's native option, and the
 * /thinking command lists and validates it.
 *
 * `off` is first-class on purpose. Clearing the effort used to mean "say
 * nothing and let the provider decide" — which on a reasoning model still means
 * ON, so there was no way to ask for a fast, non-thinking answer. `off` is an
 * explicit request, and each provider has its own way to say it (Anthropic
 * `thinking: {type: "disabled"}`, Google `thinkingBudget: 0`, OpenAI-family
 * `reasoningEffort: "none"`).
 *
 * The middle values are a shared scale, not a claim that every provider has
 * every rung: Anthropic and Google take a token BUDGET, so their ladder is
 * numeric (see THINKING_BUDGET); the OpenAI family takes a NAME and its ladder
 * is the SDK's own enum. Each provider clamps to what it actually accepts.
 */
export type ReasoningEffort = "off" | "minimal" | "low" | "medium" | "high" | "xhigh";

/**
 * The scale, cheapest first. `off` is the absence of reasoning; `xhigh` is the
 * top rung OpenAI exposes. Providers without a rung degrade to the nearest one
 * they have rather than failing the request.
 */
export const REASONING_EFFORTS: readonly ReasoningEffort[] = ["off", "minimal", "low", "medium", "high", "xhigh"];

export function isReasoningEffort(v: unknown): v is ReasoningEffort {
  return typeof v === "string" && (REASONING_EFFORTS as readonly string[]).includes(v);
}

/**
 * Token budgets for the providers that take a number instead of a name.
 *
 * `xhigh` is deliberately the same as `high`: Google caps most models at 32768
 * and Anthropic's practical ceiling is bounded by max_tokens, so asking for
 * more than this ladder's top would be a request the endpoint rejects.
 */
export const THINKING_BUDGET: Record<Exclude<ReasoningEffort, "off">, number> = {
  minimal: 1_024,
  low: 2_048,
  medium: 8_192,
  high: 32_768,
  xhigh: 32_768,
};
