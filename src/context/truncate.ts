/**
 * Presentation truncation for tool results.
 *
 * The store keeps a tool result WHOLE. Truncation is a *view* concern, applied
 * as an ordinary `replace` op (the same mechanism the `ctx` tool uses), so:
 *
 *   - `messages.content` is the ground truth and never loses a byte;
 *   - the model reads the truncated presentation, because `renderContext`
 *     renders the view;
 *   - `/undo` and a `restore` bring the original back without a migration;
 *   - the log stays INSERT-only, so replay is deterministic.
 *
 * Every op this module produces carries `version`, the policy that produced it.
 * Without it a replayed old session cannot distinguish "truncated by policy 1"
 * from "the tool really returned this", and a future policy change could not
 * tell what to re-derive. Bump `TRUNCATE_VERSION` whenever the shape of the
 * produced text changes, not when the budget changes (the budget is config, and
 * it rides in the op too).
 */

/** Bump when the TRUNCATED SHAPE changes (marker wording, head/tail split). */
export const TRUNCATE_VERSION = 1;

/**
 * Default presentation budget for one tool result, in chars.
 *
 * Sized well above `toolOutputCap` (30k): this is the DISPLAY budget for a
 * stored result, so it should be generous enough that ordinary output never
 * hits it, and only genuinely bulky results (a huge file dump, a 5MB build log)
 * get excerpted. The stored row is always whole regardless.
 */
export const DEFAULT_PRESENTATION_CAP = 60_000;

/**
 * Tools whose output is an audit trail or a task list, never bulky raw data.
 * Truncating them would destroy the record of what the agent did to its own
 * context, or hide open tasks — both are read deliberately, not skimmed.
 */
const NEVER_TRUNCATE = new Set(["ctx", "todo"]);

export interface Truncation {
  /** the presented text — what the view will show */
  text: string;
  /** chars removed from the middle */
  dropped: number;
  /** policy version that produced `text` */
  version: number;
}

/**
 * Head-and-tail truncation.
 *
 * Head AND tail, not tail-only: a tool result's head says what the call was
 * (the first lines of a file, the path a grep listed, the start of an error),
 * and its tail says how it ended. Keeping only one end loses half the context
 * the model needs to decide whether to page or re-run, and the original is
 * always one `ctx restore` away regardless.
 *
 * Returns null when the text fits — the caller appends no op at all, so a
 * session full of small results carries zero truncation ops.
 */
export function truncateToolResult(name: string, text: string, cap: number): Truncation | null {
  if (NEVER_TRUNCATE.has(name)) return null;
  // a non-positive cap means "no presentation cap"
  if (cap <= 0 || text.length <= cap) return null;
  // the marker itself must fit, or a tiny cap would produce more marker than
  // content and the truncation would be a net loss
  const markerReserve = 120;
  if (cap <= markerReserve * 2) return null;

  const budget = cap - markerReserve;
  // 60/40 head/tail: the head identifies the call and the tail holds the
  // conclusion, but a diff or a stack trace is mostly front-loaded, so the
  // head gets the larger share.
  const headLen = Math.floor(budget * 0.6);
  const tailLen = budget - headLen;
  const dropped = text.length - headLen - tailLen;

  const marker =
    `\n\n… (${dropped} chars truncated for display: showing the first ${headLen} ` +
    `and last ${tailLen} of ${text.length}. The full result is stored — ` +
    `"ctx restore" brings it back, or re-run with a narrower request.)\n\n`;

  return {
    text: text.slice(0, headLen) + marker + text.slice(text.length - tailLen),
    dropped,
    version: TRUNCATE_VERSION,
  };
}
