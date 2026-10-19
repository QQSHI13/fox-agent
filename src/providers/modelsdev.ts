/**
 * models.dev catalog: a cached copy of https://models.dev/api.json used for
 * two things — provider/model pickers in `/login`, and exact context-window
 * figures for models the static table in `models.ts` does not know.
 *
 * The cache is a plain file in the data dir (`$FOX_AGENT_HOME/models.dev.json`)
 * with a 24h TTL. Every read path is synchronous and memoized: a missing or
 * stale cache just means the static fallbacks answer until a background
 * refresh lands — the network is never on the critical path of a render or a
 * budget check.
 */
import { existsSync, readFile, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { agentHome } from "../core/paths.ts";

const API_URL = "https://models.dev/api.json";
const TTL_MS = 24 * 60 * 60 * 1000;

export interface CatalogModel {
  id: string;
  name: string;
  context?: number;
  output?: number;
  reasoning?: boolean;
  /** input modalities beyond text, e.g. ["image", "audio", "video"] */
  inputs?: string[];
  /** USD per Mtok, straight from the catalog — cost is a derived view, never stored in code */
  cost?: { input?: number; output?: number; cache_read?: number; cache_write?: number };
}

export interface CatalogProvider {
  /** models.dev id */
  id: string;
  /** human name for pickers */
  name: string;
  /** default base URL for the API, when the provider has one fixed endpoint */
  api?: string;
  /** env vars that conventionally hold this provider's key */
  env: string[];
  /** the fox-agent provider format this endpoint speaks */
  format: "openai-compatible" | "openai-responses" | "anthropic" | "google";
  models: CatalogModel[];
}

/** Static fallback when no cache exists yet; models.dev data replaces it. */
const STATIC_PRESETS: CatalogProvider[] = [
  { id: "openai", name: "OpenAI", api: "https://api.openai.com/v1", env: ["OPENAI_API_KEY"], format: "openai-compatible", models: [] },
  {
    id: "openai-responses",
    name: "OpenAI (Responses API)",
    api: "https://api.openai.com/v1",
    env: ["OPENAI_API_KEY"],
    format: "openai-responses",
    models: [],
  },
  { id: "anthropic", name: "Anthropic", api: "https://api.anthropic.com", env: ["ANTHROPIC_API_KEY"], format: "anthropic", models: [] },
  { id: "google", name: "Google Gemini", api: "https://generativelanguage.googleapis.com", env: ["GEMINI_API_KEY", "GOOGLE_API_KEY"], format: "google", models: [] },
  { id: "openrouter", name: "OpenRouter", api: "https://openrouter.ai/api/v1", env: ["OPENROUTER_API_KEY"], format: "openai-compatible", models: [] },
  { id: "deepseek", name: "DeepSeek", api: "https://api.deepseek.com/v1", env: ["DEEPSEEK_API_KEY"], format: "openai-compatible", models: [] },
  { id: "xai", name: "xAI", api: "https://api.x.ai/v1", env: ["XAI_API_KEY"], format: "openai-compatible", models: [] },
  { id: "groq", name: "Groq", api: "https://api.groq.com/openai/v1", env: ["GROQ_API_KEY"], format: "openai-compatible", models: [] },
  { id: "mistral", name: "Mistral", api: "https://api.mistral.ai/v1", env: ["MISTRAL_API_KEY"], format: "openai-compatible", models: [] },
  { id: "moonshotai", name: "Kimi (Moonshot AI)", api: "https://api.moonshot.ai/v1", env: ["MOONSHOT_API_KEY"], format: "openai-compatible", models: [] },
];

/**
 * Which fox-agent provider format a models.dev provider id speaks.
 *
 * The id alone is not enough: several providers expose an ANTHROPIC-shaped
 * endpoint under their own name — minimax, minimax-cn, minimax-cn-coding-plan,
 * minimax-coding-plan and thinkingmachines all serve
 * `https://api.<host>/anthropic/v1`. `formatFor` used to take the endpoint and
 * throw it away (`void api`), so every one of them was written to config as
 * "openai-compatible" — the chat-completions shape, which their endpoint does
 * not speak. That produced the runtime warning
 * `anthropic.messages / <model>: the model is unknown … limited to 4096` on
 * every call, and (before the maxOutputTokens fix) a silently clamped output
 * budget.
 *
 * So: the endpoint is the evidence. An `/anthropic` path segment means the
 * Messages API, whatever the provider is called. models.dev is the source of
 * the endpoint, and the user can still override per profile in config.
 */
function formatFor(id: string, api: string | undefined): CatalogProvider["format"] {
  if (id === "anthropic") return "anthropic";
  if (id === "google" || id === "google-vertex") return "google";
  // a `/anthropic` path segment on a THIRD-PARTY endpoint speaks the Messages
  // API (minimax, thinkingmachines, …) even though the id is not "anthropic"
  if (api && /\/anthropic(?:\/|$)/i.test(api)) return "anthropic";
  // models.dev's openai entry serves both chat completions and responses on
  // /v1; chat is the safer default for a generic harness, responses is its
  // own preset so the choice is explicit.
  return "openai-compatible";
}

function cachePath(): string {
  // overridable directly, and FOX_AGENT_HOME-aware either way, so tests never
  // touch the real home cache
  return process.env.FOX_AGENT_MODELS_CACHE ?? join(agentHome(), "models.dev.json");
}

type Catalog = { at: number; providers: CatalogProvider[] };
let memo: { path: string; data: Catalog | null } | undefined;

/** Cached catalog, or null when nothing has ever been fetched. Memoized per path.
 * F2: the first parse is kicked off ASYNC (startCatalogParse) so it never
 * blocks startup — loadCatalog returns null until the background parse lands,
 * and callers fall through to their cheap default. Once ready, the memo fills
 * and later calls get real figures. */
let parseStartedPath: string | null = null;
export function loadCatalog(): Catalog | null {
  const path = cachePath();
  if (memo?.path === path) return memo.data;
  // Not parsed yet — start it in the background rather than parse synchronously
  // here (a 1.7MB JSON.parse on the main thread was part of the startup cost).
  startCatalogParse(path);
  return null;
}

/** Read + parse the catalog off the synchronous path. Idempotent per path — a
 * new path (e.g. a test pointing the cache elsewhere) re-arms the parse. */
function startCatalogParse(path: string): void {
  if (parseStartedPath === path) return;
  parseStartedPath = path;
  void (async () => {
    try {
      const text: string = await new Promise((resolve, reject) => {
        readFile(path, "utf8", (err, data) => (err ? reject(err) : resolve(data as string)));
      });
      if (cachePath() !== path) return; // home changed mid-read
      memo = { path, data: JSON.parse(text) as Catalog };
    } catch {
      memo = { path, data: null };
    }
  })();
}

/**
 * Fetch the catalog and write the cache. Never throws — a failed refresh
 * leaves the old cache (or nothing) in place and returns false.
 */
export async function refreshCatalog(): Promise<boolean> {
  if (/^(1|true|yes)$/i.test(process.env.FOX_AGENT_MODELS_OFFLINE ?? "")) return false;
  try {
    const res = await fetch(API_URL, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return false;
    const raw = (await res.json()) as Record<string, {
      name?: string;
      api?: string;
      env?: string[];
      models?: Record<string, {
        name?: string;
        reasoning?: boolean;
        limit?: { context?: number; output?: number };
        modalities?: { input?: string[] };
        cost?: { input?: number; output?: number; cache_read?: number; cache_write?: number };
      }>;
    }>;
    const providers: CatalogProvider[] = [];
    for (const [id, p] of Object.entries(raw)) {
      const models: CatalogModel[] = [];
      for (const [mid, m] of Object.entries(p.models ?? {})) {
        models.push({
          id: mid,
          name: m.name ?? mid,
          context: m.limit?.context,
          output: m.limit?.output,
          reasoning: m.reasoning,
          inputs: m.modalities?.input?.filter((x) => x !== "text"),
          cost: m.cost,
        });
      }
      models.sort((a, b) => a.id.localeCompare(b.id));
      providers.push({
        id,
        name: p.name ?? id,
        api: p.api,
        env: p.env ?? [],
        format: formatFor(id, p.api),
        models,
      });
    }
    providers.sort((a, b) => a.id.localeCompare(b.id));
    const data = { at: Date.now(), providers };
    mkdirSync(dirname(cachePath()), { recursive: true });
    writeFileSync(cachePath(), JSON.stringify(data));
    memo = { path: cachePath(), data };
    return true;
  } catch {
    return false;
  }
}

/** Refresh in the background when the cache is missing or stale. */
export function ensureFreshCatalog(): void {
  const c = loadCatalog();
  if (c && Date.now() - c.at < TTL_MS) return;
  void refreshCatalog();
}

/**
 * The provider presets `/login` offers: the models.dev catalog when cached,
 * and static fallbacks for anything the catalog missed — deduped by id.
 */
export function providerPresets(): CatalogProvider[] {
  const out = new Map<string, CatalogProvider>();
  const cat = loadCatalog();
  if (cat) {
    // the well-known names first, then everything else alphabetically
    const preferred = ["openai", "anthropic", "google", "openrouter", "deepseek", "xai", "groq", "mistral", "moonshotai"];
    const ordered = [
      ...preferred.map((id) => cat.providers.find((p) => p.id === id)).filter((p): p is CatalogProvider => !!p),
      ...cat.providers.filter((p) => !preferred.includes(p.id)),
    ];
    for (const p of ordered) if (!out.has(p.id)) out.set(p.id, p);
    // OpenAI also speaks the Responses API; offer it as its own preset.
    const oai = cat.providers.find((p) => p.id === "openai");
    if (oai && !out.has("openai-responses")) {
      out.set("openai-responses", { ...oai, id: "openai-responses", name: "OpenAI (Responses API)", format: "openai-responses" });
    }
  } else {
    for (const p of STATIC_PRESETS) if (!out.has(p.id)) out.set(p.id, p);
  }
  return [...out.values()];
}

/** One preset by id, from locals, the cache, or the static fallback. */
export function presetById(id: string): CatalogProvider | undefined {
  return providerPresets().find((p) => p.id === id);
}

/** Exact context-window/output figures for a model id, when the cache knows it. */
export function lookupCatalogModel(modelId: string): CatalogModel | undefined {
  const cat = loadCatalog();
  if (!cat) return undefined;
  const m = modelId.toLowerCase();
  // Many resellers list the same model with sparser records than the source
  // provider, and an alphabetical scan would let the weakest record win —
  // merge every match instead: widest window, union of modalities, any
  // reasoning flag.
  let merged: CatalogModel | undefined;
  for (const p of cat.providers) {
    for (const model of p.models) {
      if (model.id.toLowerCase() !== m) continue;
      if (!merged) {
        merged = { ...model, inputs: model.inputs ? [...model.inputs] : undefined };
        continue;
      }
      merged.context = Math.max(merged.context ?? 0, model.context ?? 0) || undefined;
      merged.output = Math.max(merged.output ?? 0, model.output ?? 0) || undefined;
      merged.reasoning = merged.reasoning || model.reasoning;
      merged.inputs = [...new Set([...(merged.inputs ?? []), ...(model.inputs ?? [])])];
      // resellers list the same model with missing or skewed prices; the first
      // record that carries one wins (the source provider usually sorts first)
      merged.cost ??= model.cost;
    }
  }
  return merged;
}
