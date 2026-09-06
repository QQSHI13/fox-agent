/**
 * Model lists straight from the provider endpoint.
 *
 * models.dev knows what a provider *serves in general*; only the endpoint knows
 * what *this account* can actually call (gateways and resellers especially).
 * So for any provider with credentials, `/model` prefers `GET {baseUrl}/models`
 * over the catalog.
 *
 * Same contract as the models.dev cache: synchronous reads from a memoized
 * file cache, background refreshes, never network on a render path. A missing
 * or failed fetch just means the catalog answers instead.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { agentHome } from "../core/paths.ts";
import type { CatalogModel } from "./modelsdev.ts";

const TTL_MS = 6 * 60 * 60 * 1000;

interface Entry {
  at: number;
  models: CatalogModel[];
}

function cachePath(baseUrl: string): string {
  const h = createHash("sha1").update(baseUrl).digest("hex").slice(0, 12);
  return join(agentHome(), "endpoint-models", `${h}.json`);
}

const memo = new Map<string, Entry | null>();

/** Cached models for an endpoint, or null when never fetched (or unreadable). */
export function endpointModels(baseUrl: string): CatalogModel[] | null {
  const path = cachePath(baseUrl);
  if (memo.has(path)) return memo.get(path)?.models ?? null;
  let entry: Entry | null = null;
  try {
    if (existsSync(path)) entry = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    entry = null;
  }
  memo.set(path, entry);
  return entry?.models ?? null;
}

/** Common context-window field names across openai-style, anthropic and google model listings. */
function contextOf(m: Record<string, unknown>): number | undefined {
  for (const k of ["context_window", "context_length", "max_input_tokens", "inputTokenLimit", "input_token_limit"]) {
    const v = m[k];
    if (typeof v === "number" && v > 0) return v;
  }
  return undefined;
}

/**
 * Fetch and cache the endpoint's model list. Never throws; false means the old
 * cache (or nothing) stays. Speaks the three listing shapes fox-agent has a
 * chat format for: openai-style `{data:[{id}]}`, anthropic `{data:[{id,
 * display_name}]}` and google `{models:[{name:"models/x"}]}`.
 */
export async function refreshEndpointModels(baseUrl: string, apiKey: string, format?: string): Promise<boolean> {
  const url =
    format === "google"
      ? `${baseUrl.replace(/\/$/, "")}/v1beta/models`
      : `${baseUrl.replace(/\/$/, "")}/models`;
  try {
    const headers: Record<string, string> = {};
    if (apiKey) {
      if (format === "anthropic") {
        headers["x-api-key"] = apiKey;
        headers["anthropic-version"] = "2023-06-01";
      } else if (format === "google") {
        headers["x-goog-api-key"] = apiKey;
      } else {
        headers.authorization = `Bearer ${apiKey}`;
      }
    }
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return false;
    const raw = (await res.json()) as { data?: Record<string, unknown>[]; models?: Record<string, unknown>[] };
    const list = raw.data ?? raw.models ?? [];
    const models: CatalogModel[] = [];
    for (const m of list) {
      let id = typeof m.id === "string" ? m.id : typeof m.name === "string" ? m.name : "";
      if (!id) continue;
      id = id.replace(/^models\//, ""); // google prefixes every name
      models.push({
        id,
        name: typeof m.display_name === "string" ? m.display_name : typeof m.displayName === "string" ? m.displayName : id,
        context: contextOf(m),
      });
    }
    models.sort((a, b) => a.id.localeCompare(b.id));
    const path = cachePath(baseUrl);
    mkdirSync(join(agentHome(), "endpoint-models"), { recursive: true });
    const entry: Entry = { at: Date.now(), models };
    writeFileSync(path, JSON.stringify(entry));
    memo.set(path, entry);
    return true;
  } catch {
    return false;
  }
}

/** Refresh in the background when the cache is missing or stale. */
export function ensureEndpointModels(baseUrl: string, apiKey: string, format?: string): void {
  if (!/^https?:\/\//.test(baseUrl)) return;
  const path = cachePath(baseUrl);
  const entry = memo.get(path);
  if (entry && Date.now() - entry.at < TTL_MS) return;
  void refreshEndpointModels(baseUrl, apiKey, format);
}
