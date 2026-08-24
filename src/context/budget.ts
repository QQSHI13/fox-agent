import { lookupModel, type ModelInfo } from "../providers/models.ts";
import { projectView } from "./view.ts";
import { viewTokenEstimate } from "./render.ts";

/** Conservative overhead fudge: system prompt + message framing. */
export const PROMPT_OVERHEAD_TOKENS = 1_500;

export function modelBudget(model: string): ModelInfo {
  return lookupModel(model);
}

export interface BudgetCheck {
  estimated: number;
  limit: number;
  over: boolean;
  ratio: number;
}

export function checkBudget(sessionId: string, model: string, systemExtraTokens = 0, compactAt = 0.85): BudgetCheck {
  const info = modelBudget(model);
  const estimated = viewTokenEstimate(projectView(sessionId)) + PROMPT_OVERHEAD_TOKENS + systemExtraTokens;
  const threshold = Math.floor(info.contextWindow * compactAt);
  return { estimated, limit: info.contextWindow, over: estimated >= threshold, ratio: estimated / info.contextWindow };
}
