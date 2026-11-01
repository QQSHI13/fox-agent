/**
 * Pure render helpers for the TUI — no terminal, no closure state, unit-testable.
 *
 * Extracted from app.ts because they are the part of rendering that can be
 * wrong in a way tests can catch. Everything here is a pure function over
 * strings and numbers; the closure-heavy paint logic stays in app.ts.
 */

/**
 * One-line "what actually ran" for a tool head: the meaningful field when the
 * args have an obvious one (cmd, path, pattern, url), else compacted JSON.
 */
export function argsSummary(args: string): string {
  const t = (args ?? "").trim();
  if (!t || t === "{}") return "";
  try {
    const a = JSON.parse(t);
    const v = a?.cmd ?? a?.path ?? a?.pattern ?? a?.file ?? a?.url ?? a?.command ?? a?.job ?? null;
    if (typeof v === "string" && v.trim()) return ` ${v.replace(/\s+/g, " ").slice(0, 200)}`;
  } catch {}
  return ` ${t.replace(/\s+/g, " ").slice(0, 200)}`;
}

/**
 * The full "what actually ran", whitespace-flattened and capped but NOT
 * truncated to the head-line width — the tool head is expandable, and the
 * expanded view may use the whole screen width.
 *
 * A single-field args object (cmd/path/pattern) is shown whole; a call that
 * also carries content (write's new text, edit's old/new strings, task's
 * prompt) gets those fields appended — the expanded view is the only place
 * the call's actual payload is visible, so showing only the path there would
 * leave the content permanently invisible.
 */
export function argsFull(args: string): string {
  const t = (args ?? "").trim();
  if (!t || t === "{}") return "";
  try {
    const a = JSON.parse(t);
    const v = a?.cmd ?? a?.path ?? a?.pattern ?? a?.file ?? a?.url ?? a?.command ?? a?.job ?? null;
    if (typeof v !== "string" || !v.trim()) return t.replace(/\s+/g, " ").slice(0, 4_000);
    const extra: string[] = [];
    for (const k of ["old_string", "new_string", "content", "text", "prompt", "task", "description", "ids", "ops"]) {
      const x = a?.[k];
      if (typeof x === "string" && x.trim()) extra.push(`${k}: ${x.replace(/\s+/g, " ").slice(0, 2_000)}`);
      else if (x !== undefined) extra.push(`${k}: ${JSON.stringify(x).replace(/\s+/g, " ").slice(0, 2_000)}`);
    }
    return [v.replace(/\s+/g, " ").slice(0, 4_000), ...extra].join("\n  ");
  } catch {}
  return t.replace(/\s+/g, " ").slice(0, 4_000);
}

/**
 * The tool call's arguments as pretty-printed JSON — what the expandable head
 * reveals on click. This is the model's actual call verbatim (2-space
 * indented, key order preserved), not a reconstruction: auditing "what did it
 * send" wants ground truth. Unparseable args degrade to the raw string.
 */
export function argsJson(args: string): string {
  const t = (args ?? "").trim();
  if (!t || t === "{}") return "{}";
  try {
    return JSON.stringify(JSON.parse(t), null, 2).slice(0, 8_000);
  } catch {}
  return t.slice(0, 8_000);
}

/**
 * Cap a tool result's kept text at the TAIL, not the head. The most recent
 * output is what the model needs, so for an over-long result we keep the end
 * and note the dropped head — same direction the live streaming body already
 * keeps (`slice(-KEPT_TOOL_CHARS)`), so a body the user watched stream does not
 * snap to a disjoint prefix the moment it settles. Exported for testing.
 */
export function keepTail(text: string, cap: number): string {
  return text.length > cap ? `… (${text.length - cap} chars dropped)\n${text.slice(-cap)}` : text;
}

/**
 * Diff-and-touch, as a pure helper so it is unit-testable without reaching into
 * startTui's closure. Given the previous and current item list, return the keys
 * whose render signature CHANGED (and so must be re-rendered). A prior node is
 * append-only — its stored content never changes — so an unchanged node keeps
 * its cached rows; only a node whose kind/text/expand/policy moved is touched.
 * This replaces the old blanket "touch every item on refresh", which made each
 * rebuild O(history) re-wrap instead of O(nodes that changed).
 *
 * `sig` maps an item to a render signature; `sigs` is the caller-held map of
 * key -> signature, mutated in place so it stays in sync across rebuilds.
 */
export function diffTouchKeys<T>(prev: T[], curr: T[], key: (t: T) => number, sig: (t: T) => string, sigs: Map<number, string>): number[] {
  const changed: number[] = [];
  const prevKeys = new Set(prev.map(key));
  const seen = new Set<number>();
  for (const it of curr) {
    const k = key(it);
    seen.add(k);
    if (sigs.get(k) !== sig(it)) {
      changed.push(k);
      sigs.set(k, sig(it));
    }
  }
  // nodes that vanished (ctx hid them, session trimmed): drop their sigs so a
  // later same-key node is not mistaken for the old one
  for (const k of prevKeys) if (!seen.has(k)) sigs.delete(k);
  return changed;
}
