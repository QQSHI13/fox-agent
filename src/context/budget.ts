import { lookupModel, type ModelInfo } from "../providers/models.ts";
import { lastPromptTokens } from "../store/db.ts";
import { projectView, visibleNodes, parseToolCalls, type ViewNode } from "./view.ts";
import { nodeTokenEstimate } from "./render.ts";

export function modelBudget(model: string): ModelInfo {
  return lookupModel(model);
}

/**
 * True when a node renders to nothing and so costs nothing to send: a deleted
 * node, or an assistant whose text is empty AND every tool call it carried is
 * hidden (a "kept" call is one whose tool result is still visible). This is
 * the renderer's own rule (renderNode's early `return base`), lifted out so
 * the budget estimate and the renderer agree on what is actually on the wire —
 * one definition, not a second hand-rolled heuristic.
 */
export function nodeRendersToNothing(n: ViewNode, visibleToolIds: Set<string>): boolean {
  if (n.deleted) return true;
  if (n.msg.role !== "assistant") return false;
  const text = n.content;
  const kept = n.msg.tool_calls ? parseToolCalls(n.msg).filter((c) => visibleToolIds.has(c.id)) : [];
  return !text && kept.length === 0;
}

/**
 * Current context size: the larger of the provider's last report and the
 * estimate of the whole visible history, where a node's cost is counted only
 * if it actually renders (see nodeRendersToNothing — the same rule the renderer
 * uses, so the estimate and what is really sent cannot drift apart). The report
 * alone under-reads whenever the endpoint tokenizes loosely (probed on kimi-for-
 * coding: ~1 token/word, ~25% under chars/4) and lags the live window; the
 * estimate alone misses system-prompt/tool-schema overhead the report captures.
 * `max` tracks the window better than either — and never double-counts, since
 * both are totals of the same history.
 */
export function sessionContextTokens(sessionId: string): number {
  const measured = lastPromptTokens(sessionId);
  const vis = visibleNodes(projectView(sessionId));
  // the same visible-tool set the renderer builds (renderContext) — a call
  // counts only while its result is visible, so a hidden result stops its
  // call from billing without a second, parallel notion of "visible".
  const visibleToolIds = new Set(
    vis.filter((n) => n.msg.role === "tool" && n.msg.tool_call_id).map((n) => n.msg.tool_call_id!),
  );
  let estimated = 0;
  for (const n of vis) {
    if (nodeRendersToNothing(n, visibleToolIds)) continue;
    estimated += nodeTokenEstimate(n);
  }
  return Math.max(measured, estimated);
}

/**
 * Absolute prompt-token ceiling for auto-compaction (0 = window fraction only).
 *
 * The window fraction alone is exactly as trustworthy as `lookupModel`'s idea of
 * the window, and that number is best-effort: the endpoint's own `/models`
 * listing often omits a context field, and the models.dev catalog then answers
 * with a size the endpoint does not actually serve — 100,000,000 for one local
 * proxy. Against such a window `0.85 * window` is unreachable, so compaction
 * never fired and the context grew monotonically to the provider's real limit,
 * re-billed in full on every step.
 *
 * This default is therefore 0 (window fraction only): for a model whose window
 * is known-correct — user config, or the endpoint's own /models listing, which
 * outranks the catalog — the fraction is the right trigger and an absolute cap
 * only throws away usable context (131072 on a real 1M window is 12.5%). Set
 * `compactAtTokens` in config to re-enable the ceiling for a window the
 * registry overstates.
 */
export const DEFAULT_COMPACT_AT_TOKENS = 0;

/**
 * Prompt tokens at which compaction fires: the smaller of the window fraction
 * and the absolute ceiling. Shared by `checkBudget` (what tells the agent to
 * prune) and `compactIfNeeded` (what actually fires) so the nudge and the thing
 * it describes cannot drift apart.
 */
export function triggerTokens(model: string, compactAt = 0.85, compactAtTokens = DEFAULT_COMPACT_AT_TOKENS): number {
  const windowAt = Math.floor(modelBudget(model).contextWindow * compactAt);
  return compactAtTokens > 0 ? Math.min(windowAt, compactAtTokens) : windowAt;
}

export interface BudgetCheck {
  /** provider-reported size of the last request's prompt; 0 before the first call */
  reported: number;
  limit: number;
  over: boolean;
  ratio: number;
}

/**
 * How full the context window is, per the provider's own accounting.
 *
 * This deliberately does not estimate: `lastPromptTokens` is the number the
 * API billed us for the previous call, which includes the system prompt, tool
 * schemas and message framing — everything a chars/4 estimate had to fudge
 * (PROMPT_OVERHEAD_TOKENS, RIP). Before the first call there is no report and
 * the window is definitionally near-empty, so `reported` is 0 and `over` false.
 *
 * `over` is measured against `triggerTokens`, not the raw fraction — the agent
 * must be told when the *compaction* threshold is near, which on an overstated
 * window is far below the fraction of the window the same report is divided by.
 */
export function checkBudget(
  sessionId: string,
  model: string,
  compactAt = 0.85,
  compactAtTokens = DEFAULT_COMPACT_AT_TOKENS,
  reportedPrecomputed?: number,
): BudgetCheck {
  const info = modelBudget(model);
  // The turn loop measures this once per step and hands it in, so compaction and
  // the budget header read the SAME number instead of each re-walking the view.
  const reported = reportedPrecomputed ?? sessionContextTokens(sessionId);
  return {
    reported,
    limit: info.contextWindow,
    over: reported >= triggerTokens(model, compactAt, compactAtTokens),
    ratio: reported / info.contextWindow,
  };
}
