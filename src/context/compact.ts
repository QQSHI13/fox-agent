// Host-driven auto-compaction. When the last provider-reported prompt size
// reaches the compaction trigger (see budget.ts), the oldest span — everything
// above a protected tail of the newest KEEP_TOKENS — is summarized by the model
// itself and hidden with a single delete+summary op — the same machinery
// ctx_edit uses, so /undo reverts it too.
import { appendOps, lastPromptTokens } from "../store/db.ts";
import type { ChatMessage, ChatFn } from "../providers/types.ts";
import { estimateTokens } from "../providers/models.ts";
import { projectView, visibleNodes } from "./view.ts";
import { viewTokenEstimate } from "./render.ts";
import { DEFAULT_COMPACT_AT_TOKENS, triggerTokens } from "./budget.ts";
import type { AgentEvent } from "../core/events.ts";

/**
 * Newest history a compaction leaves visible, in tokens.
 *
 * This used to be a fraction of the window (55% of it, plus a 35% tail that was
 * never compactable at all), which on a window the registry overstates means
 * "keep half a million tokens". A keep-size is the only form that is correct
 * no matter what the window turns out to be — and it is what every other harness
 * does (opencode keeps 15_000). Bounded by half the trigger below, so a
 * compaction always frees something.
 */
const KEEP_TOKENS = 32_000;

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
  opts: { compactAt?: number; compactAtTokens?: number; signal?: AbortSignal } = {},
): Promise<AgentEvent | null> {
  /**
   * The trigger is the provider's own last-reported prompt size — the one
   * number that is definitionally the truth about how full the window is. A
   * chars/4 estimate used to drive this, which both over-fired on dense
   * Unicode and under-fired on chatty English. No report yet means no
   * completed call yet, which means the window cannot be full.
   *
   * `triggerTokens` additionally caps the report against an absolute number,
   * because the window it would be measured against is a best-effort guess
   * (see DEFAULT_COMPACT_AT_TOKENS): a report *below* `0.85 * window` is not
   * evidence that the window is really that large.
   */
  const trigger = triggerTokens(cfg.model, opts.compactAt ?? 0.85, opts.compactAtTokens ?? DEFAULT_COMPACT_AT_TOKENS);
  const reported = lastPromptTokens(sessionId);
  if (!reported || reported < trigger) return null;
  const before = reported;
  // half the trigger at most: a compaction that frees nothing is a billable
  // summarization call that leaves the next step just as expensive
  const keep = Math.min(KEEP_TOKENS, Math.floor(trigger / 2));

  const nodes = projectView(sessionId);

  // pick oldest-span candidates up to the protected tail boundary
  const vis = visibleNodes(nodes);
  // the newest `keep` tokens are never compacted; the 6-node floor keeps very
  // short sessions coherent
  let tail = Math.min(vis.length, 6);
  let tailTok = 0;
  for (let i = vis.length - 1; i >= 0 && tailTok < keep; i--) {
    tailTok += estimateTokens(vis[i].content) + 8;
    tail = Math.max(tail, vis.length - i);
  }
  const maxBoundary = vis.length - tail;
  if (maxBoundary <= 1) return null;

  const protectFrom = before - keep;
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
    .map((n) => `[${n.msg.seq}] ${n.msg.role}: ${n.content.slice(0, 2000)}`)
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
