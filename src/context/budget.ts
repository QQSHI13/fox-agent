import { lookupModel, type ModelInfo } from "../providers/models.ts";
import { lastPromptTokens } from "../store/db.ts";

export function modelBudget(model: string): ModelInfo {
  return lookupModel(model);
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
 */
export function checkBudget(sessionId: string, model: string, _unused = 0, compactAt = 0.85): BudgetCheck {
  const info = modelBudget(model);
  const reported = lastPromptTokens(sessionId);
  const threshold = Math.floor(info.contextWindow * compactAt);
  return { reported, limit: info.contextWindow, over: reported >= threshold, ratio: reported / info.contextWindow };
}
