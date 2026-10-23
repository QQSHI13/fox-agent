// The reasoning-effort vocabulary is ONE scale (off … xhigh) that three layers
// agree on: the config parses and saves it, /thinking lists and validates it,
// and each provider turns it into its own SDK's native option. These tests pin
// that agreement, and the two behaviours that were missing: `off` exists at all,
// and each provider expresses it the way ITS api expects.
import { describe, expect, test } from "bun:test";
import { REASONING_EFFORTS, THINKING_BUDGET, isReasoningEffort } from "../src/core/reasoning.ts";
import { reasoningProviderOptions } from "../src/providers/index.ts";

const opts = (provider: string, effort?: string) =>
  reasoningProviderOptions({ model: "m", baseUrl: "u", apiKey: "k", provider, sampling: effort === undefined ? undefined : { reasoningEffort: effort } })
    ?.providerOptions;

describe("the shared vocabulary", () => {
  test("off is a real rung, not the absence of one", () => {
    expect(REASONING_EFFORTS[0]).toBe("off");
    expect(isReasoningEffort("off")).toBe(true);
    // ...and the old three-rung names all still validate, so no config breaks
    for (const e of ["low", "medium", "high"]) expect(isReasoningEffort(e)).toBe(true);
  });

  test("junk is rejected rather than passed through", () => {
    for (const v of ["", "none", "OFF", "max", 3, null, undefined]) expect(isReasoningEffort(v)).toBe(false);
  });

  test("every budgeted rung has a budget, and the ladder ascends", () => {
    const rungs = REASONING_EFFORTS.filter((e) => e !== "off") as Exclude<(typeof REASONING_EFFORTS)[number], "off">[];
    for (const r of rungs) expect(THINKING_BUDGET[r]).toBeGreaterThan(0);
    const n = rungs.map((r) => THINKING_BUDGET[r]);
    expect([...n].sort((a, b) => a - b)).toEqual(n); // non-decreasing
  });
});

describe("each provider expresses 'off' its own way", () => {
  test("anthropic disables thinking instead of sending a budget", () => {
    expect(opts("anthropic", "off")).toEqual({ anthropic: { thinking: { type: "disabled" } } });
    // a budget with "disabled" would be a contradiction the API rejects
    const o = opts("anthropic", "off")!.anthropic as { thinking: Record<string, unknown> };
    expect(o.thinking.budgetTokens).toBeUndefined();
  });

  test("google zeroes the budget instead of omitting the config", () => {
    expect(opts("google", "off")).toEqual({ google: { thinkingConfig: { thinkingBudget: 0 } } });
  });

  test("the openai family names it 'none'", () => {
    expect(opts("openai-responses", "off")).toEqual({ openai: { reasoningEffort: "none" } });
    expect(opts("openai-compatible", "off")).toEqual({ openaiCompatible: { reasoningEffort: "none" } });
  });
});

describe("the enabled rungs reach each provider", () => {
  test("anthropic + google receive a token budget, ascending with the rung", () => {
    for (const [provider, key] of [["anthropic", "anthropic"], ["google", "google"]] as const) {
      const lo = opts(provider, "low")![key] as Record<string, any>;
      const hi = opts(provider, "high")![key] as Record<string, any>;
      const loB = lo.thinking?.budgetTokens ?? lo.thinkingConfig?.thinkingBudget;
      const hiB = hi.thinking?.budgetTokens ?? hi.thinkingConfig?.thinkingBudget;
      expect(loB).toBe(THINKING_BUDGET.low);
      expect(hiB).toBe(THINKING_BUDGET.high);
      expect(hiB).toBeGreaterThan(loB);
    }
  });

  test("the openai family receives the name, including the top rung", () => {
    expect(opts("openai-responses", "xhigh")).toEqual({ openai: { reasoningEffort: "xhigh" } });
    expect(opts("openai-responses", "medium")).toEqual({ openai: { reasoningEffort: "medium" } });
  });

  test("unset sends nothing at all, so the provider default rules", () => {
    for (const provider of ["anthropic", "google", "openai-responses", "openai-compatible"]) {
      expect(opts(provider, undefined)).toBeUndefined();
    }
  });

  test("an unknown value is ignored rather than forwarded", () => {
    expect(opts("anthropic", "turbo")).toBeUndefined();
    expect(opts("openai-compatible", "turbo")).toBeUndefined();
  });
});
