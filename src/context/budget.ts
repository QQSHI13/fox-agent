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
 * When the harness intervenes, as a fraction of the model's context window.
 *
 * There is no automatic compaction any more: the agent owns its own window via
 * `ctx`, and a host that silently summarizes behind its back both destroys
 * information the agent was still using and spends an LLM call it never asked
 * for. What the harness keeps is the two things only it can do — TELL the agent
 * (it cannot see the provider's own numbers) and, at the limit, TAKE AWAY the
 * tools that would make the window worse.
 */
export interface BudgetThresholds {
  /** at/above this fraction the runtime header tells the agent to compact */
  warnAt: number;
  /** at/above this fraction only `ctx` may be called */
  ctxOnlyAt: number;
}

/**
 * Which intervention the window calls for.
 *
 * `none` — nothing; `warn` — say so, agent still has every tool; `ctxOnly` —
 * the window is nearly full, so only `ctx` is callable: it is the one tool that
 * makes the problem smaller, and leaving the others reachable is how a session
 * digs past the limit while "looking for" something to trim.
 *
 * Ordered from the strictest down: `ctxOnlyAt` is checked first so a config
 * that sets it below `warnAt` still degrades to the safe state rather than
 * reporting a warning that implies tools are available.
 */
export type BudgetStage = "none" | "warn" | "ctxOnly";

export function budgetStage(ratio: number, t: BudgetThresholds): BudgetStage {
  if (ratio >= t.ctxOnlyAt) return "ctxOnly";
  if (ratio >= t.warnAt) return "warn";
  return "none";
}

export interface BudgetCheck {
  /** prompt size from the provider's own report, or the estimate before the first call */
  reported: number;
  /** the window this is measured against */
  limit: number;
  /** reported / limit */
  ratio: number;
  stage: BudgetStage;
  thresholds: BudgetThresholds;
}

/**
 * How full the context window is.
 *
 * `reported` comes from `lastPromptTokens` — the number the API actually billed
 * for the previous call, which includes the system prompt, tool schemas and
 * message framing that a chars/4 estimate had to fudge. Before the first call
 * there is no report and the window is definitionally empty.
 *
 * Prefer passing `reportedPrecomputed`: the turn loop already measures this
 * once per step, and re-walking the view here would compute the same number
 * twice.
 */
export function checkBudget(
  sessionId: string,
  model: string,
  thresholds: BudgetThresholds,
  reportedPrecomputed?: number,
): BudgetCheck {
  const info = modelBudget(model);
  const reported = reportedPrecomputed ?? sessionContextTokens(sessionId);
  const ratio = info.contextWindow > 0 ? reported / info.contextWindow : 0;
  return {
    reported,
    limit: info.contextWindow,
    ratio,
    stage: budgetStage(ratio, thresholds),
    thresholds,
  };
}
