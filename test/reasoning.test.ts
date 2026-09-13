import { describe, expect, test } from "bun:test";
import { reasoningProviderOptions } from "../src/providers/index.ts";

describe("reasoningProviderOptions", () => {
  const cfg = (provider: string, effort?: string) =>
    ({ baseUrl: "https://x", apiKey: "k", model: "m", provider, sampling: effort ? { reasoningEffort: effort } : undefined }) as any;

  test("unset effort yields nothing — the provider default rules", () => {
    expect(reasoningProviderOptions(cfg("openai-compatible"))).toBeUndefined();
    expect(reasoningProviderOptions(cfg("openai-compatible", "nonsense"))).toBeUndefined();
  });

  test("each format gets its own option shape", () => {
    expect(reasoningProviderOptions(cfg("openai-compatible", "high"))).toEqual({ providerOptions: { openaiCompatible: { reasoningEffort: "high" } } });
    expect(reasoningProviderOptions(cfg("openai-responses", "low"))).toEqual({ providerOptions: { openai: { reasoningEffort: "low" } } });
    expect(reasoningProviderOptions(cfg("anthropic", "medium"))).toEqual({
      providerOptions: { anthropic: { thinking: { type: "enabled", budgetTokens: 8192 } } },
    });
    expect(reasoningProviderOptions(cfg("google", "high"))).toEqual({
      providerOptions: { google: { thinkingConfig: { thinkingBudget: 32768 } } },
    });
  });
});
