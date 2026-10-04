import { lookupModel, type ModelInfo } from "../providers/models.ts";
import { lastPromptTokens } from "../store/db.ts";

export function modelBudget(model: string): ModelInfo {
  return lookupModel(model);
}

/**
 * Absolute prompt-token ceiling for auto-compaction (0 = window fraction only).
 *
 * The window fraction alone is exactly as trustworthy as `lookupModel`'s idea of
 * the window, and that number is best-effort: the endpoint's own `/models`
 * listing often omits a context field, and the models.dev catalog then answers
 * with a size the endpoint does not actually serve — 1,048,576 for
 * `glm-5.3-flash`, 100,000,000 for one local proxy. Against such a window
 * `0.85 * window` is unreachable, so compaction never fired and the context
 * grew monotonically to the provider's real limit, re-billed in full on every
 * step. This ceiling is the quota-side guard that holds regardless of whether
 * the window is right.
 */
export const DEFAULT_COMPACT_AT_TOKENS = 131_072;

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
  _unused = 0,
  compactAt = 0.85,
  compactAtTokens = DEFAULT_COMPACT_AT_TOKENS,
): BudgetCheck {
  const info = modelBudget(model);
  const reported = lastPromptTokens(sessionId);
  return {
    reported,
    limit: info.contextWindow,
    over: reported >= triggerTokens(model, compactAt, compactAtTokens),
    ratio: reported / info.contextWindow,
  };
}
