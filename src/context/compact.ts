// Host-driven auto-compaction. When the projected view approaches the
// model's context window, the oldest span (up to a protected tail) is
// summarized by the model itself and hidden with a single delete+summary op
// — the same machinery ctx_edit uses, so /undo reverts it too.
import { appendOps, lastPromptTokens } from "../store/db.ts";
import type { ChatMessage, ChatFn } from "../providers/types.ts";
import { estimateTokens } from "../providers/models.ts";
import { projectView, visibleNodes } from "./view.ts";
import { viewTokenEstimate } from "./render.ts";
import { modelBudget } from "./budget.ts";
import type { AgentEvent } from "../core/events.ts";

const PROTECTED_TAIL_FRACTION = 0.35; // never compact the newest ~35% of the window
const TARGET_AFTER_FRACTION = 0.55;

function summarizePrompt(): ChatMessage[] {
  return [
    {
      role: "user",
      content:
        "Summarize this transcript segment for a coding agent that will continue working without it. " +
        "Keep: goals, decisions made, files touched (paths), commands run and their outcomes, current state, next steps. " +
        "Drop: raw tool output, false starts, boilerplate. Max ~300 words, terse bullet style. Output only the summary.",
    },
  ];
}

async function llmSummary(chat: ChatFn, cfg: Parameters<ChatFn>[0], segment: string, signal?: AbortSignal): Promise<string> {
  let text = "";
  const messages: ChatMessage[] = [...summarizePrompt(), { role: "user", content: segment }];
  for await (const ev of chat(cfg, messages, [], signal)) {
    if (ev.type === "text") text += ev.delta;
    else if (ev.type === "done" && ev.reason.startsWith("error")) break;
  }
  return text.trim();
}

/**
 * Check the budget and, if needed, hide the oldest span behind a summary.
 * Returns a `compacted` event when compaction happened, null otherwise.
 */
export async function compactIfNeeded(
  sessionId: string,
  cfg: Parameters<ChatFn>[0],
  chat: ChatFn,
  opts: { compactAt?: number; signal?: AbortSignal } = {},
): Promise<AgentEvent | null> {
  const info = modelBudget(cfg.model);
  const at = opts.compactAt ?? 0.85;
  /**
   * The trigger is the provider's own last-reported prompt size — the one
   * number that is definitionally the truth about how full the window is. A
   * chars/4 estimate used to drive this, which both over-fired on dense
   * Unicode and under-fired on chatty English. No report yet means no
   * completed call yet, which means the window cannot be full.
   */
  const reported = lastPromptTokens(sessionId);
  if (!reported || reported < info.contextWindow * at) return null;
  const before = reported;

  const nodes = projectView(sessionId);

  // pick oldest-span candidates up to the protected tail boundary
  const vis = visibleNodes(nodes);
  // the newest PROTECTED_TAIL_FRACTION of the window is never compacted; the
  // 6-node floor keeps very short sessions coherent
  let tail = Math.min(vis.length, 6);
  let tailTok = 0;
  const tailBudget = info.contextWindow * PROTECTED_TAIL_FRACTION;
  for (let i = vis.length - 1; i >= 0 && tailTok < tailBudget; i--) {
    tailTok += estimateTokens(vis[i].content) + 8;
    tail = Math.max(tail, vis.length - i);
  }
  const maxBoundary = vis.length - tail;
  if (maxBoundary <= 1) return null;

  const protectFrom = before - Math.floor(info.contextWindow * TARGET_AFTER_FRACTION);
  // Per-node numbers below ARE chars/4 estimates — but they only decide *where*
  // to cut, never *whether* to cut, so an inaccurate node size costs a
  // slightly different boundary, not a wrong compaction.
  let acc = 0;
  let boundary = 0; // exclusive index into `vis`
  for (; boundary < maxBoundary; boundary++) {
    acc += estimateTokens(vis[boundary].content) + 8;
    if (acc >= protectFrom) break;
  }
  if (boundary <= 0) return null;
  const candidates = vis.slice(0, boundary).filter((n) => n.msg.role !== "user" || n.content.length > 0);

  const segment = candidates
    .map((n) => `[m${n.msg.seq}] ${n.msg.role}: ${n.content.slice(0, 2000)}`)
    .join("\n\n")
    .slice(-120_000); // cap the summarizer input itself

  let summary = "";
  try {
    summary = await llmSummary(chat, cfg, segment, opts.signal);
  } catch {
    summary = ""; // fall through to mechanical note
  }
  if (!summary) summary = `(auto-compacted ${candidates.length} older messages to free context; originals in storage)`;

  const ids = candidates.map((n) => n.msg.seq);
  appendOps(sessionId, [{ kind: "delete", ids, summary }]);

  const after = viewTokenEstimate(projectView(sessionId)) + 1500;
  return { type: "compacted", removed: ids, tokens_before: before, tokens_after: after };
}
