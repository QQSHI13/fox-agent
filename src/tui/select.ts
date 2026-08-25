/**
 * Transcript text selection: cell columns <-> string offsets, and extraction.
 *
 * Kept separate from `app.ts` because it is the only part of selection that can
 * be wrong in a way tests can catch — everything else is paint and mouse
 * plumbing. The subtlety it exists for is that a screen column is NOT a string
 * index: `charWidth` gives CJK and emoji two cells, so a drag over 4 cells of
 * "日本語" covers two characters, not four. Every offset here is therefore a
 * *cell* column, mapped through the row's own width table.
 */
import { charWidth } from "./screen.ts";
import type { Seg } from "./wrap.ts";

/** A point in the transcript: absolute row index, and a 0-based cell column. */
export interface Anchor {
  row: number;
  col: number;
}

/**
 * A row's plain text plus, per cell column, the string range that cell renders.
 * `start[c]`/`end[c]` bracket the character occupying column `c`; a wide
 * character owns two columns that both point at the same range.
 */
export interface RowCells {
  text: string;
  start: number[];
  end: number[];
}

export function rowCells(segs: Seg[]): RowCells {
  let text = "";
  const start: number[] = [];
  const end: number[] = [];
  for (const seg of segs) {
    for (const ch of seg.t) {
      const cw = charWidth(ch.codePointAt(0)!);
      // Zero-width (combining marks, variation selectors) occupy no column;
      // they ride along in `text` and stay attached to the char before them.
      if (cw === 0) {
        text += ch;
        if (end.length) end[end.length - 1] = text.length;
        continue;
      }
      const from = text.length;
      text += ch;
      for (let i = 0; i < cw; i++) {
        start.push(from);
        end.push(text.length);
      }
    }
  }
  return { text, start, end };
}

/** Selection endpoints in reading order, whichever way the drag went. */
export function orderSel(a: Anchor, b: Anchor): [Anchor, Anchor] {
  if (a.row < b.row || (a.row === b.row && a.col <= b.col)) return [a, b];
  return [b, a];
}

/**
 * The cell columns of `row` that fall inside the selection, inclusive — or null
 * when the row is outside it, or inside it but has nothing painted there.
 * Used by the painter to re-style, and by extraction to slice.
 */
export function selRangeForRow(row: number, a: Anchor, b: Anchor, cells: RowCells): { from: number; to: number } | null {
  const [s, e] = orderSel(a, b);
  if (row < s.row || row > e.row) return null;
  const width = cells.start.length;
  if (!width) return null;
  const from = row === s.row ? s.col : 0;
  const to = row === e.row ? e.col : width - 1;
  const lo = Math.max(0, from);
  const hi = Math.min(width - 1, to);
  if (lo > hi) return null;
  return { from: lo, to: hi };
}

/**
 * The text a selection covers, ready for the clipboard.
 *
 * Trailing whitespace is dropped per line: transcript rows are padded by
 * wrapping, and a paste full of invisible trailing spaces is worse than useless.
 * Rows the selection touches but which hold no text still produce a line, so
 * blank lines between paragraphs survive the round trip.
 */
export function extractSelection(rows: Seg[][], a: Anchor, b: Anchor): string {
  const [s, e] = orderSel(a, b);
  const out: string[] = [];
  for (let r = Math.max(0, s.row); r <= e.row && r < rows.length; r++) {
    const cells = rowCells(rows[r]);
    const range = selRangeForRow(r, s, e, cells);
    if (!range) {
      out.push("");
      continue;
    }
    out.push(cells.text.slice(cells.start[range.from], cells.end[range.to]).replace(/[ \t]+$/, ""));
  }
  // leading/trailing blank rows are an artifact of where the drag stopped
  while (out.length && !out[0]) out.shift();
  while (out.length && !out[out.length - 1]) out.pop();
  return out.join("\n");
}

/**
 * How far the pointer must move before a press counts as a drag rather than a
 * tap. One cell is a slip (a shaky hand, a trackpad); two is intent.
 */
export const DRAG_SLOP = 2;

/** What a mouse gesture turned out to mean, once it is over. */
export type Gesture =
  | { kind: "none" }
  /** the pointer moved: extend the selection to here */
  | { kind: "extend" }
  /** button came up after moving: the selection is final */
  | { kind: "copy" }
  /** button came up where it went down: this was a click after all */
  | { kind: "click" };

export interface PressState {
  x: number;
  y: number;
  moved: boolean;
}

/**
 * Decide what a press/drag/release sequence means.
 *
 * This exists as a pure function because it *is* the bug the user reported:
 * "you can't drag within thinking box as it collapses on first touch, not
 * loosen touch". The old code toggled on button-DOWN, so a drag both collapsed
 * the box and lost its own start point. Two rules fix it, and both are checked
 * here rather than by eye:
 *
 *   1. Button-down decides nothing. A press only becomes a click when the
 *      button comes back up without having moved.
 *   2. A gesture that moved never clicks. Dragging across a collapsible item
 *      must select text and leave the item exactly as it was.
 */
export function gestureFor(
  action: "down" | "drag" | "up",
  press: PressState | null,
  x: number,
  y: number,
): Gesture {
  if (action === "down") return { kind: "none" }; // rule 1: pressing decides nothing
  if (!press) return { kind: "none" }; // motion or release with no press: not ours
  const moved = press.moved || Math.abs(x - press.x) + Math.abs(y - press.y) >= DRAG_SLOP;
  if (action === "drag") return moved ? { kind: "extend" } : { kind: "none" };
  return moved ? { kind: "copy" } : { kind: "click" }; // rule 2
}
