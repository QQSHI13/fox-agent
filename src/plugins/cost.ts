/**
 * bundled:cost — session cost tallying as a plugin, not a core feature.
 *
 * Design (pi-style, and the reason the core keeps no cost tables):
 *   - the DB stores TOKENS ONLY (immutable facts reported by the provider);
 *   - cost is a derived view: tokens x catalog rates, computed at render time
 *     from the models.dev cache. If prices change mid-session, later messages
 *     simply price at the new rate — the ledger never goes stale the way a
 *     stored-dollar figure would;
 *   - no rate for a model means "unknown", shown as such — never guessed.
 *
 * Surfaces: the /cost command, and a "cost" status segment (wired by the TUI
 * via costSegment(), since plugin segments resolve without session context).
 */
import type { FoxPlugin } from "./types.ts";
import { sessionUsage } from "../store/db.ts";
import { lookupCatalogModel } from "../providers/modelsdev.ts";

/** Active model per session, snapshotted at turn start (the turn's model is fixed for its steps). */
const activeModel = new Map<string, string>();

/**
 * The host has one active session at a time; hooks keep it current so the
 * status segment (resolved with no context) can price the right session.
 */
let lastSession: string | null = null;

export interface Rate {
  input: number; // USD / Mtok
  output: number;
  cacheRead?: number;
  cacheWrite?: number;
}

/** Catalog rate for a model id, or null when the catalog doesn't price it. */
export function rateFor(model: string): Rate | null {
  const c = lookupCatalogModel(model)?.cost;
  if (!c || typeof c.input !== "number" || typeof c.output !== "number") return null;
  return { input: c.input, output: c.output, cacheRead: c.cache_read, cacheWrite: c.cache_write };
}

/** Session cost in USD from stored token totals x catalog rates. Null = no rate. */
export function sessionCost(sessionId: string, model: string): number | null {
  const r = rateFor(model);
  if (!r) return null;
  const u = sessionUsage(sessionId);
  // cached input bills at the cache_read rate when the catalog has one;
  // the uncached remainder bills at the input rate
  const cached = Math.min(u.cached, u.prompt);
  const fresh = u.prompt - cached;
  const cachedRate = r.cacheRead ?? r.input;
  return (fresh * r.input + cached * cachedRate + u.completion * r.output) / 1e6;
}

function fmt(usd: number): string {
  if (usd >= 100) return `$${usd.toFixed(0)}`;
  if (usd >= 1) return `$${usd.toFixed(2)}`;
  return `$${usd.toFixed(4)}`;
}

const costPlugin: FoxPlugin = {
  name: "bundled:cost",
  hooks: {
    onSessionStart: (c) => {
      lastSession = c.sessionId;
      activeModel.set(c.sessionId, c.model);
    },
    onTurnStart: (c) => {
      lastSession = c.sessionId;
      activeModel.set(c.sessionId, c.model);
    },
    onSessionEnd: (c) => {
      if (lastSession === c.sessionId) lastSession = null;
      activeModel.delete(c.sessionId);
    },
  },
  commands: [
    {
      name: "/cost",
      description: "session cost from provider token totals x models.dev rates",
      usage: "[model]",
      run: (arg, ctx) => {
        const model = arg.trim() || activeModel.get(ctx.sessionId) || "unknown";
        const rate = rateFor(model);
        const u = sessionUsage(ctx.sessionId);
        if (!rate) {
          return {
            handled: true,
            output: `no catalog rate for ${model} — tokens this session: ${(u.prompt / 1000).toFixed(1)}k in / ${(u.completion / 1000).toFixed(1)}k out (${u.cached >= 1000 ? `${(u.cached / 1000).toFixed(1)}k cached` : "none cached"})`,
          };
        }
        const usd = sessionCost(ctx.sessionId, model) ?? 0;
        const cached = Math.min(u.cached, u.prompt);
        return {
          handled: true,
          output: [
            `model ${model} — in $${rate.input}/Mtok, out $${rate.output}/Mtok${rate.cacheRead != null ? `, cached $${rate.cacheRead}/Mtok` : ""} (models.dev)`,
            `this session: ${(u.prompt / 1000).toFixed(1)}k in (${(cached / 1000).toFixed(1)}k cached) / ${(u.completion / 1000).toFixed(1)}k out = ${fmt(usd)}`,
          ].join("\n"),
        };
      },
    },
  ],
};

/** Cost line for a session; null hides the segment (no model yet, or no rate, or nothing spent). */
export function costSegment(sessionId: string): string | null {
  const model = activeModel.get(sessionId);
  if (!model) return null;
  const usd = sessionCost(sessionId, model);
  return usd == null || usd === 0 ? null : fmt(usd);
}

export default costPlugin;
