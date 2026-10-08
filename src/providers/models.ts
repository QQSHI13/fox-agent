/**
 * Model registry: context windows / output caps / capabilities. Lookup order:
 * user config → the active endpoint's own /models listing → the cached
 * models.dev catalog → conservative defaults. No hardcoded model table, no
 * hardcoded costs: the catalog is the single source (it knows models this
 * code has never heard of), and cost tallying is a bundled plugin's job
 * (plugins/cost), priced from the same catalog at render time.
 */
import { lookupCatalogModel, type CatalogModel } from "./modelsdev.ts";
import { endpointModels } from "./endpointmodels.ts";

export interface ModelInfo {
  contextWindow: number;
  maxOutput: number;
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
}[] = [];

export function setConfiguredModels(models: typeof configured): void {
  configured = models;
}

/**
 * The base URL the active provider points at, set on config load and on
 * /model//login switches. The endpoint's own /models listing outranks the
 * catalog for THIS endpoint: the catalog lags real upgrades (it still says
 * 262k for kimi-for-coding, which the endpoint now serves as a 1M-context
 * model). Module-level for the same reason as `configured` — lookupModel is
 * called from render paths with just an id.
 */
let activeEndpoint: string | null = null;
export function setActiveEndpoint(baseUrl: string | null | undefined): void {
  activeEndpoint = baseUrl ? baseUrl.replace(/\/$/, "") : null;
}

export function lookupModel(id: string): ModelInfo {
  // The user's own config wins first: it is the only source that can describe a
  // model no endpoint and no catalog knows about.
  const c = configured.find((m) => m.id === id);
  if (c) {
    return {
      contextWindow: c.contextWindow ?? UNKNOWN.contextWindow,
      maxOutput: c.maxOutput ?? UNKNOWN.maxOutput,
      vision: c.input?.includes("image"),
      audio: c.input?.includes("audio"),
      video: c.input?.includes("video"),
      reasoning: c.reasoning,
    };
  }
  // The active endpoint's own /models listing outranks the catalog: endpoints
  // know what they serve TODAY (model swaps, gated variants), the catalog
  // lags. An unknown id here just falls through to the catalog merge.
  if (activeEndpoint) {
    const fromCatalog = (cat: CatalogModel): ModelInfo => ({
      contextWindow: cat.context ?? UNKNOWN.contextWindow,
      maxOutput: cat.output ?? UNKNOWN.maxOutput,
      vision: cat.inputs?.includes("image"),
      audio: cat.inputs?.includes("audio"),
      video: cat.inputs?.includes("video"),
      reasoning: cat.reasoning,
    });
    const ep = endpointModels(activeEndpoint)?.find((m) => m.id === id);
    if (ep?.context) return fromCatalog(ep);
  }
  // Exact figures from the models.dev catalog — the single source for model
  // facts. Nothing hardcodes a model here.
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
  // Unknown to every source: conservative defaults so budget checks stay safe.
  return UNKNOWN;
}

/** chars/4 heuristic — swappable; real usage comes from API responses. */
export function estimateTokens(s: string): number {
  return Math.ceil((s?.length ?? 0) / 4);
}
