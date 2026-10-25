// styled text segments + width-aware word wrapping
//
// This module is THE wrapping kernel for the whole TUI. Everything that has to
// put text into a fixed number of columns goes through `wrapSegs` (styled) or
// `wrapText` (plain) — the transcript, streaming and think bodies, markdown
// table cells and code fences, the input dock, the question wizard, and plugin
// screen regions. It used to be four independent implementations with four
// different rules for spaces and for the wrap column, which is exactly the kind
// of drift that produces "the caret is one cell off" bugs: the dock's copy
// dropped overflow spaces while the caret math counted them.
//
//   transcript / bodies   wrapSegs(segs, width)                  spaces collapse
//   editor buffer        wrapText(text, width, {lossless:true})  nothing is lost
//   right gutter         {reserve: n}                            wraps at width-n
//   indentation matters  {keepLeadSpaces: true}
import { charWidth } from "./screen.ts";

export interface Seg {
  t: string;
  fg?: string;
  bg?: string;
  bold?: boolean;
  italic?: boolean;
  /** strikethrough (~~text~~) — SGR 9/29 at flush time */
  strike?: boolean;
  /** hyperlink target: rendered as an OSC 8 hyperlink, never printed as text */
  href?: string;
}

export interface WrapOpts {
  /**
   * Keep leading spaces on the first produced line. The default suppresses
   * them: at the start of a *rendered* block they are markdown layout noise.
   * Anything that must round-trip its input (the editor, a think body wrapped
   * one source line at a time) sets this — a line-by-line wrap with the flag on
   * is byte-identical to wrapping the whole text at once.
   */
  keepLeadSpaces?: boolean;
  /**
   * Never drop a character. A run of spaces that does not fit carries over to
   * the next line instead of being truncated.
   *
   * Off by default: for rendered prose the excess spaces at a soft break are
   * invisible, and collapsing keeps the ragged right edge tidy. ON for any
   * caller whose output must correspond 1:1 to its input — the editor (the
   * caret is computed from the buffer, so a dropped space shifts every later
   * column) and pasted code, where indentation is the content.
   */
  lossless?: boolean;
  /**
   * Columns reserved on the right — a `[N]` gutter, a scrollbar strip, a
   * table cell's padding. Wrapping happens at `width - reserve`, so the caller
   * that OWNS the reserve says how much to give up instead of every call site
   * subtracting its own `width - 1` (the five-places bug layout.ts documents).
   */
  reserve?: number;
  /**
   * Use the last column. Rendered text leaves it empty by default (a ragged
   * right edge reads better and never touches the neighbouring region); an
   * editor box, a table cell or a plugin panel that paints its own border
   * wants the whole width and sets this.
   */
  exactWidth?: boolean;
}

const strWidth = (t: string): number => {
  let n = 0;
  for (const ch of t) n += charWidth(ch.codePointAt(0)!);
  return n;
};

/**
 * Wrap `segs` to visual lines (greedy, width-aware).
 *
 * `rawEnds` (optional) records, per output line, how many INPUT segs were
 * fully consumed by the time the line ENDED — a line may START mid-seg
 * (long segs split across lines), so a line's raw range is
 * [prevEnd, rawEnds[i]) in input-seg units plus possibly a prefix of
 * rawSegs[prevEnd]. Callers using ranges for incremental re-wrap must only
 * reuse lines whose range ENDS at a raw boundary (rawEnds[i] > rawEnds[i-1]
 * means this line finished a seg; ending mid-seg is fine as long as the
 * NEXT line starts at the same raw index — see rows.ts).
 *
 * Widths come from `charWidth` (the same table the screen, the editor and the
 * selection use), not Bun.stringWidth: two width models in one grid is how the
 * caret and the text end up disagreeing about a wide glyph.
 */
export function wrapSegs(segs: Seg[], width: number, rawEnds?: number[], opts?: WrapOpts): Seg[][] {
  const reserve = Math.max(0, opts?.reserve ?? 0);
  // a wrap column below 4 is unusable; the floor also keeps the "lone oversized
  // word" branch from looping without progress on a 0- or 1-column budget
  const cols = Math.max(4, width - reserve);
  // fit limit for a line that already has content: one column short unless the
  // caller wants the full width (see exactWidth)
  const fit = opts?.exactWidth ? cols : cols - 1;
  const leadKept = !!opts?.keepLeadSpaces;
  const lossless = !!opts?.lossless;
  const out: Seg[][] = [];
  let line: Seg[] = [];
  let lineW = 0;
  let rawIdx = 0; // input segs fully consumed so far
  let lastRawEnd = 0; // raw segs consumed by PREVIOUS completed lines

  const push = (seg: Seg) => {
    line.push(seg);
    lineW += strWidth(seg.t);
  };
  const newline = () => {
    out.push(line);
    if (rawEnds) rawEnds.push(rawIdx);
    lastRawEnd = rawIdx;
    line = [];
    lineW = 0;
  };
  // Break before the next glyph. A line that has already reached the wrap
  // column takes its break FIRST (that is where a full-bleed row ends), so the
  // caret at the end of such a row maps to the next row's column 0 instead of a
  // column past the box — see inputwrap.ts's caret rule.
  const breakIfFull = (): boolean => {
    if (lineW >= cols) {
      newline();
      return true;
    }
    return false;
  };

  for (const raw of segs) {
    const parts = raw.t.split(/(\n| +)/);
    for (const part of parts) {
      if (!part) continue;
      if (part === "\n") {
        newline();
        continue;
      }
      if (/^ +$/.test(part)) {
        if (lossless) {
          // Carry the overflow instead of dropping it. Dropping made the
          // painted text a lossy projection of the input: every discarded
          // space shifted a later column, and a caller that maps a buffer index
          // to a painted column (the editor's caret) drifted left and never
          // came back.
          let rest = part;
          while (rest) {
            if (breakIfFull()) continue; // an empty row always has room
            const room = cols - lineW;
            const chunk = rest.slice(0, room);
            addSpaces(raw, chunk);
            rest = rest.slice(chunk.length);
            if (rest) newline();
          }
        } else {
          const room = cols - lineW;
          const sp = Math.min(part.length, Math.max(0, room));
          if (sp > 0 && (leadKept || line.length > 0 || out.length > 0)) addSpaces(raw, " ".repeat(sp));
        }
        continue;
      }
      let word = part;
      for (;;) {
        const ww = strWidth(word);
        if (lineW + ww <= fit) {
          push({ ...raw, t: word });
          break;
        }
        if (line.length === 0) {
          // lone oversized word: fill the line then continue
          let take = "";
          let tw = 0;
          for (const ch of word) {
            const cw = charWidth(ch.codePointAt(0)!);
            if (tw + cw > fit) break;
            take += ch;
            tw += cw;
          }
          if (!take) break;
          push({ ...raw, t: take });
          newline();
          word = word.slice(take.length);
          if (!word) break;
          continue;
        }
        newline();
      }
    }
    rawIdx++; // this input seg is fully distributed (possibly across lines)
  }
  if (line.length || !out.length) {
    out.push(line);
    if (rawEnds) rawEnds.push(rawIdx);
  }
  return out;

  function addSpaces(raw: Seg, text: string): void {
    if (!text) return;
    if (leadKept || line.length > 0 || out.length > 0) push({ ...raw, t: text });
  }
}

/**
 * Plain-text wrap: `wrapSegs` with one unstyled seg, joined back into strings.
 *
 * This is what an editor, a wizard header or a plugin panel wants — text in,
 * text out, no styling to carry around. It is the SAME kernel as the
 * transcript's, so a line that fits there fits here.
 */
export function wrapText(text: string, width: number, opts?: WrapOpts): string[] {
  const lines = wrapSegs([{ t: text }], width, undefined, opts);
  return lines.map((l) => l.map((s) => s.t).join(""));
}

/**
 * Wrap by words, collapsing every whitespace run to a single space — the
 * "prose" variant for text whose spacing carries no meaning (a question
 * wizard's header, a one-line summary). Newlines are whitespace here too, so
 * the result is one paragraph flowed into the column.
 */
export function wrapProse(text: string, width: number, reserve = 0): string[] {
  const cols = Math.max(4, width - reserve);
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (strWidth(next) <= cols) {
      cur = next;
      continue;
    }
    if (cur) lines.push(cur);
    if (strWidth(w) > cols) {
      // a single word longer than the column: hard-split it so nothing is lost
      let chunk = "";
      for (const ch of w) {
        if (strWidth(chunk + ch) > cols) {
          lines.push(chunk);
          chunk = ch;
        } else chunk += ch;
      }
      cur = chunk;
    } else cur = w;
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [""];
}

// ---- editor geometry: buffer <-> (visual row, column) ----
//
// An editable buffer needs more than its rows: it needs to map a cursor index
// to the cell it paints at, and back. That lives here rather than in a second
// module because it is a property OF the wrap — the maps below are only exact
// when the wrap is lossless, so the two must not be able to drift apart into
// different files. The input dock is the only caller today, but a plugin panel
// with a text field, the wizard's multi-line answer, or a search box would use
// the same three functions.
//
// The wrap is LOSSLESS: every character of the buffer appears in exactly one
// row. That identity is the invariant caretPos and rowBufRange rely on.

export interface VisualRow {
  text: string;
  logical: number; // logical line index
  startCol: number; // display column where this visual row begins
  rowW: number; // this row's own display width (≤ maxCols; word-wrap leaves it short)
  index: number;
}

export interface InputLayout {
  rows: VisualRow[];
  logical: string[];
  lineStarts: number[]; // buf index where each logical line starts
  maxCols: number;
}

const widthOfChars = (t: string): number => {
  let n = 0;
  for (const ch of t) n += charWidth(ch.codePointAt(0)!);
  return n;
};

/**
 * Wrap every logical line of `text` into visual rows, and record where each
 * logical line starts in the buffer.
 *
 * A row's span is [startCol, startCol + rowW) in display columns of its
 * logical line. Nothing is ever consumed or dropped between rows, so the rows
 * of a line are exactly contiguous: next.startCol === startCol + rowW.
 */
export function buildInputLayout(text: string, maxCols: number): InputLayout {
  const logical = text.split("\n");
  const rows: VisualRow[] = [];
  const lineStarts: number[] = [];
  let idx = 0;
  for (let li = 0; li < logical.length; li++) {
    lineStarts.push(idx);
    idx += logical[li].length + 1;
    const parts = wrapText(logical[li], maxCols, { lossless: true, exactWidth: true, keepLeadSpaces: true });
    let colAt = 0;
    for (const part of parts) {
      const partW = widthOfChars(part);
      rows.push({ text: part, logical: li, startCol: colAt, rowW: partW, index: rows.length });
      // no +1 for a consumed break space: the wrap drops nothing, so the next
      // row begins exactly where this one's painted text ends
      colAt += partW;
    }
  }
  return { rows, logical, lineStarts, maxCols };
}

/**
 * Map buffer index `cur` -> visual row + the column *within that row*.
 *
 * The row is the last one on the caret's logical line whose startCol is ≤ the
 * caret's column. That single rule covers all three cases the old
 * findIndex/fallback pair got wrong:
 *   - the caret inside a row's painted text (startCol ≤ col < startCol+rowW);
 *   - the caret at a row's END (col === startCol+rowW) — it must stay on THAT
 *     row, not jump to the next;
 *   - the caret past the end of a row for any other reason (a run of spaces
 *     that wrapped, an EOL) — it belongs to the row it is still past.
 * The old code matched only the first case and then fell back to the logical
 * line's LAST row, subtracting that row's startCol — so a caret at a wrap
 * boundary came out at a negative column (e.g. "aaaaaaaaaa bb" wrapped at 10:
 * col 10 -> row 1, startCol 11 -> colW -1, painted left of the text).
 */
export function caretPos(layout: InputLayout, cur: number, text: string): { visRow: number; colW: number } {
  const chars = [...text];
  let li = 0;
  let colW = 0;
  for (let i = 0; i < cur && i < chars.length; i++) {
    if (chars[i] === "\n") {
      li++;
      colW = 0;
    } else colW += charWidth(chars[i].codePointAt(0)!);
  }
  // last row of THIS line that starts at or before the caret column
  let visRow = -1;
  for (let i = 0; i < layout.rows.length; i++) {
    const r = layout.rows[i];
    if (r.logical !== li) continue;
    if (r.startCol <= colW) visRow = i;
    else break; // rows of a line are ordered by startCol
  }
  if (visRow < 0) {
    // no row starts before the caret (cannot happen for a non-empty line);
    // fall back to the line's first row, or the layout's last when the line
    // has no rows at all
    visRow = layout.rows.findIndex((r) => r.logical === li);
    if (visRow < 0) visRow = layout.rows.length - 1;
  }
  return { visRow, colW: colW - layout.rows[Math.max(0, visRow)].startCol };
}

/**
 * Buffer-index range one visual row covers (the newline excluded, the row's
 * own spaces included — the range is exactly the painted text).
 */
export function rowBufRange(layout: InputLayout, v: number, text: string): [number, number] {
  const row = layout.rows[v];
  if (!row) return [0, 0];
  const chars = [...text];
  let i = layout.lineStarts[row.logical];
  let w = 0;
  while (i < chars.length && chars[i] !== "\n" && w < row.startCol) {
    w += charWidth(chars[i].codePointAt(0)!);
    i++;
  }
  const start = i;
  // the row spans its own width (rowW), not maxCols — word-wrap leaves it
  // short, and walking maxCols would run into the next row's text
  let w2 = 0;
  while (i < chars.length && chars[i] !== "\n" && w2 < row.rowW) {
    w2 += charWidth(chars[i].codePointAt(0)!);
    i++;
  }
  return [start, i];
}
