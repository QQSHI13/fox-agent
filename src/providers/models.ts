/**
 * Model registry: context windows / output caps / rough cost per Mtok (USD)
 * / capabilities. Lookup is best-effort substring matching over known
 * families; unknown models fall back to conservative defaults so budget
 * checks stay safe.
 */
import { lookupCatalogModel } from "./modelsdev.ts";

export interface ModelInfo {
  contextWindow: number;
  maxOutput: number;
  costIn?: number;
  costOut?: number;
  vision?: boolean;
  /** accepts audio input (mp3/wav/...) */
  audio?: boolean;
  /** accepts video input (mp4/webm/...) */
  video?: boolean;
  reasoning?: boolean;
}

const UNKNOWN: ModelInfo = { contextWindow: 131_072, maxOutput: 16_384 };

/**
 * Model entries from `[providers.*.models]` config tables, registered by
 * `loadConfig`. Module-level for the same reason as `setCustomProviders` —
 * `lookupModel` is called from budget checks deep in the render path, where
 * threading a config through would change a dozen signatures.
 */
let configured: {
  id: string;
  contextWindow?: number;
  maxOutput?: number;
  reasoning?: boolean;
  input?: string[];
  costIn?: number;
  costOut?: number;
}[] = [];

export function setConfiguredModels(models: typeof configured): void {
  configured = models;
}

const TABLE: [RegExp, ModelInfo][] = [
  [/gpt-5|o3|o4-mini/, { contextWindow: 262_144, maxOutput: 65_536, costIn: 2, costOut: 8, vision: true, reasoning: true }],
  [/gpt-4\.1/, { contextWindow: 1_047_576, maxOutput: 32_768, costIn: 2, costOut: 8, vision: true }],
  [/gpt-4o/, { contextWindow: 128_000, maxOutput: 16_384, costIn: 2.5, costOut: 10, vision: true }],
  [/claude-(opus|sonnet)-4/, { contextWindow: 200_000, maxOutput: 64_000, costIn: 3, costOut: 15, vision: true, reasoning: true }],
  [/claude-3-7-sonnet/, { contextWindow: 200_000, maxOutput: 64_000, costIn: 3, costOut: 15, vision: true }],
  [/claude-3-5-sonnet/, { contextWindow: 200_000, maxOutput: 8_192, costIn: 3, costOut: 15, vision: true }],
  [/claude-.*haiku/, { contextWindow: 200_000, maxOutput: 8_192, costIn: 0.8, costOut: 4, vision: true }],
  // Gemini 2.x takes images, audio and video natively; the other families here
  // are vision-only through their chat APIs (gpt-4o audio is a separate
  // realtime/preview surface, not chat-completions input).
  [/gemini-2\.5/, { contextWindow: 1_048_576, maxOutput: 65_536, costIn: 1.25, costOut: 10, vision: true, audio: true, video: true }],
  [/gemini-2\.0/, { contextWindow: 1_048_576, maxOutput: 8_192, costIn: 0.1, costOut: 0.4, vision: true, audio: true, video: true }],
  [/deepseek-chat/, { contextWindow: 65_536, maxOutput: 8_192, costIn: 0.27, costOut: 1.1 }],
  [/deepseek-reasoner/, { contextWindow: 65_536, maxOutput: 8_192, costIn: 0.55, costOut: 2.19, reasoning: true }],
  [/kimi-k2/, { contextWindow: 262_144, maxOutput: 16_384, costIn: 0.6, costOut: 2.5 }],
  [/qwen3-max|qwen-max/, { contextWindow: 131_072, maxOutput: 32_768, costIn: 1.2, costOut: 6 }],
  [/grok-4/, { contextWindow: 256_000, maxOutput: 32_768, costIn: 3, costOut: 15, vision: true }],
];

export function lookupModel(id: string): ModelInfo {
  // The user's own config wins first: it is the only source that can describe a
  // model no endpoint and no catalog knows about.
  const c = configured.find((m) => m.id === id);
  if (c) {
    return {
      contextWindow: c.contextWindow ?? UNKNOWN.contextWindow,
      maxOutput: c.maxOutput ?? UNKNOWN.maxOutput,
      costIn: c.costIn,
      costOut: c.costOut,
      vision: c.input?.includes("image"),
      audio: c.input?.includes("audio"),
      video: c.input?.includes("video"),
      reasoning: c.reasoning,
    };
  }
  // Exact figures from the cached models.dev catalog beat substring guesses —
  // it knows models this static table has never heard of.
  const cat = lookupCatalogModel(id);
  if (cat?.context) {
    return {
      contextWindow: cat.context,
      maxOutput: cat.output ?? UNKNOWN.maxOutput,
      vision: cat.inputs?.includes("image"),
      audio: cat.inputs?.includes("audio"),
      video: cat.inputs?.includes("video"),
      reasoning: cat.reasoning,
    };
  }
  const m = id.toLowerCase();
  for (const [re, info] of TABLE) if (re.test(m)) return info;
  return UNKNOWN;
}

/** chars/4 heuristic — swappable; real usage comes from API responses. */
export function estimateTokens(s: string): number {
  return Math.ceil((s?.length ?? 0) / 4);
}
