/**
 * Mid-turn steering: text the user sends while a turn is running, delivered to
 * the model at the next step boundary (after the in-flight tool finishes), as a
 * real user message — not queued for a whole new turn.
 *
 * Module-level map rather than a parameter: the TUI's key handler and the turn
 * loop never meet, and a session has at most one running turn per process, so a
 * per-session list is the whole state.
 */
const pending = new Map<string, string[]>();

/** Queue a steer for the running turn of this session. */
export function steer(sessionId: string, text: string): void {
  const q = pending.get(sessionId);
  if (q) q.push(text);
  else pending.set(sessionId, [text]);
}

/**
 * Snapshot of this session's still-undelivered steers, oldest first.
 *
 * The TUI renders these above the input dock so a steered message stays
 * visible until the turn actually consumes it — without this the message
 * vanished the moment ctrl+s was pressed and only reappeared (if at all) as
 * a transcript line at the next step boundary.
 */
export function peekSteer(sessionId: string): string[] {
  const q = pending.get(sessionId);
  return q ? [...q] : [];
}

/**
 * Withdraw the most recently steered message (the back of the queue) before
 * its step boundary arrives, so the TUI can hand it back to the editor.
 * Returns undefined when there is nothing to withdraw — the queue is empty,
 * or the turn already drained it into the context.
 */
export function withdrawSteer(sessionId: string): string | undefined {
  const q = pending.get(sessionId);
  if (!q?.length) return undefined;
  const text = q.pop();
  if (!q.length) pending.delete(sessionId);
  return text;
}

/** Take everything steered since the last step boundary. */
export function drainSteer(sessionId: string): string[] {
  const q = pending.get(sessionId);
  if (!q?.length) return [];
  pending.delete(sessionId);
  return q;
}
