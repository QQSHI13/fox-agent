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

/** Take everything steered since the last step boundary. */
export function drainSteer(sessionId: string): string[] {
  const q = pending.get(sessionId);
  if (!q?.length) return [];
  pending.delete(sessionId);
  return q;
}
