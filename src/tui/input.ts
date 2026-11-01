/**
 * Input dock: the soft-wrapped editor buffer, its layout, and caret math.
 *
 * Split out of app.ts because it is self-contained logic that can be tested
 * without a terminal: word-aware wrapping, cursor-to-visual-row mapping,
 * buffer-index hit-testing, and vertical caret motion. Everything here is
 * pure over the buffer contents; the only side effects are `markDirty()`
 * calls, passed in as a dependency so the module stays decoupled.
 *
 * The buffer holds one entry per code point (`Ch`), but a user sees
 * graphemes — deletion and motion walk whole clusters via edit.ts.
 */
import { charWidth } from "./screen.ts";
import type { Ch } from "./edit.ts";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

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

/** Dependencies the input module needs from the app closure. */
export interface InputDeps {
  /** Current buffer contents as a flat string (for width/wrap math). */
  display(): string;
  /** True when the active prompt step is a secret (bullets, not text). */
  isSecret(): boolean;
  /** Screen width — the dock wraps to `W - 4`. */
  width(): number;
  /** Mark the screen dirty after a mutation. */
  markDirty(): void;
  /** Dock geometry for hit-testing (inputTop, shownCount, firstShown). */
  dockGeom(): {
    layout: InputLayout;
    firstShown: number;
    inputTop: number;
    shownCount: number;
  };
}

export interface InputModule {
  /** Bump on every buffer mutation; the layout cache keys on this. */
  readonly rev: () => number;
  bumpRev(): void;
  /** Buffer contents, with secret steps masked as bullets. */
  inputText(): string;
  /** Cached soft-wrap layout of the current buffer. */
  inputLayout(): InputLayout;
  /** Map cursor index -> visual row + display-width column. */
  caretPos(layout: InputLayout, cur: number): { visRow: number; colW: number };
  /** Anchored selection range, or null when there is none. */
  inSelRange(anchor: number | null, cur: number): [number, number] | null;
  /** Delete the selection if present; returns true when it did. */
  deleteInSel(buf: Ch[], cur: number, anchor: number | null): { buf: Ch[]; cur: number; anchor: number | null; did: boolean };
  /** Buffer-index range one visual row covers (newline excluded). */
  rowBufRange(layout: InputLayout, v: number): [number, number];
  /** (x, y) in the input dock -> buffer index; null when y is above the dock. */
  inputIndexAt(x: number, y: number, round?: boolean): number | null;
  /** up/down inside a multi-line input, keeping the display column. */
  moveCaretVertical(dir: -1 | 1, extend: boolean, cur: number, anchor: number | null): { cur: number; anchor: number | null };
  /** Drop the cached layout (width changed — a stale wrap must not survive). */
  invalidate(): void;
  /** Pure word-aware wrap, kept for reuse and testing. */
  wrapByWidth(s: string, maxCols: number): string[];
  /** Buffer index of the first char whose cell would start past targetW columns. */
  indexAtWidth(s: string, targetW: number): number;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createInputModule(deps: InputDeps): InputModule {
  let inputRev = 0; // bumped on every buffer mutation
  let layoutCache: { rev: number; layout: InputLayout } | null = null;

  /** Word-aware wrap, matching the transcript's wrapSegs: break at spaces so
   *  a word never splits mid-glyph; a single oversized word still fills then
   *  continues (hard char-split). The old version cut at exactly maxCols,
   *  which broke words in the middle — this breaks at the space before maxCols.
   *
   *  Leading spaces are KEPT, unconditionally. wrapSegs suppresses them (spaces
   *  at the very start of a transcript line are layout noise), and this used
   *  to copy that rule — which silently dropped the indentation a user had
   *  typed: "  hello" painted as "hello" while the caret, computed from the
   *  real buffer, sat 2 columns past the end of the text. With 4 spaces it was
   *  4 off, and it hit every indented block — the exact input (pasted code,
   *  YAML, a markdown list) where leading whitespace is the content. An editor
   *  must round-trip what it is given; the suppression is for rendering, not
   *  for editing. */
  /** Display width of `s` in cells (CJK-aware). Shared by wrapByWidth and indexAtWidth. */
  function measureWidth(s: string): number {
    let n = 0;
    for (const ch of s) n += charWidth(ch.codePointAt(0)!);
    return n;
  }

  function wrapByWidth(s: string, maxCols: number): string[] {
    if (s.length === 0) return [""];
    const out: string[] = [];
    let line = "";
    for (const word of s.split(/( +)/)) {
      if (!word) continue;
      if (/^ +$/.test(word)) {
        const room = maxCols - currentWidth();
        const sp = Math.min(word.length, Math.max(0, room));
        if (sp > 0) add(" ".repeat(sp));
        continue;
      }
      let w = word;
      for (;;) {
        if (currentWidth() + measureWidth(w) <= maxCols) {
          add(w);
          break;
        }
        if (line.length === 0) {
          // lone oversized word: fill the line, hard-split the rest
          let take = "";
          let tw = 0;
          for (const ch of w) {
            const cw = charWidth(ch.codePointAt(0)!);
            if (tw + cw > maxCols) break;
            take += ch;
            tw += cw;
          }
          if (!take) break;
          add(take);
          flush();
          w = w.slice(take.length);
          if (!w) break;
          continue;
        }
        flush();
      }
    }
    flush();
    return out.length ? out : [""];
    // -- tiny helpers over the in-progress line --
    function currentWidth(): number {
      return measureWidth(line);
    }
    function add(t: string): void {
      line += t;
    }
    function flush(): void {
      out.push(line);
      line = "";
    }
  }

  /** Buffer index of the first char whose cell would start past `targetW`
   *  display columns. `round` snaps to the nearest boundary (for selection —
   *  a caret or highlight sits BETWEEN chars, not on one), so a drag only needs
   *  to cross half a cell to move; without it the first drag cell does nothing
   *  and selecting 2 chars takes 3. */
  function indexAtWidth(s: string, targetW: number, round = false): number {
    let w = 0;
    let i = 0;
    for (const ch of s) {
      const cw = charWidth(ch.codePointAt(0)!);
      if (round && w + cw / 2 > targetW) break;
      if (!round && w + cw > targetW) break;
      w += cw;
      i++;
    }
    return i;
  }

  /** What the input dock paints. Identical to the buffer except on a secret
   *  prompt step (an api key), where every non-newline code point is a bullet —
   *  one bullet per code point keeps the caret math honest (see caretPos). */
  function inputText(): string {
    const d = deps.display();
    if (!deps.isSecret()) return d;
    return [...d].map((c) => (c === "\n" ? c : "•")).join("");
  }

  function inputLayout(): InputLayout {
    if (layoutCache && layoutCache.rev === inputRev) return layoutCache.layout;
    const d = inputText();
    const logical = d.split("\n");
    const maxCols = Math.max(8, deps.width() - 4);
    const rows: VisualRow[] = [];
    const lineStarts: number[] = [];
    let idx = 0;
    for (let li = 0; li < logical.length; li++) {
      lineStarts.push(idx);
      idx += logical[li].length + 1;
      // Word-aware wrap breaks at spaces, so a visual row is NOT maxCols wide.
      // startCol is the display column where the row begins (cumulative width of
      // prior parts + skipped break spaces); rowW is this row's own width, so the
      // caret/selection math no longer assumes every row spans the full maxCols.
      const parts = wrapByWidth(logical[li], maxCols);
      let colAt = 0;
      for (let pi = 0; pi < parts.length; pi++) {
        const partW = parts[pi].length ? [...parts[pi]].reduce((a, ch) => a + charWidth(ch.codePointAt(0)!), 0) : 0;
        rows.push({ text: parts[pi], logical: li, startCol: colAt, rowW: partW, index: rows.length });
        colAt += partW;
        // the break space between wrapped parts is consumed, not painted
        if (pi + 1 < parts.length && logical[li].length > colAt && logical[li][colAt] === " ") colAt += 1;
      }
    }
    const layout = { rows, logical, lineStarts, maxCols };
    layoutCache = { rev: inputRev, layout };
    return layout;
  }

  /** Map cursor index -> visual row + display-width column. */
  function caretPos(layout: InputLayout, cur: number): { visRow: number; colW: number } {
    // walk the painted text (inputText), not buf: a secret step's bullets are
    // all width 1, and the wrap this maps into was computed on those bullets
    const chars = [...inputText()];
    let li = 0;
    let colW = 0;
    for (let i = 0; i < cur && i < chars.length; i++) {
      if (chars[i] === "\n") {
        li++;
        colW = 0;
      } else colW += charWidth(chars[i].codePointAt(0)!);
    }
    // A row spans [startCol, startCol + rowW) — word-wrap leaves rowW < maxCols,
    // so matching against maxCols would let a short row swallow the next row's
    // columns. Rows are contiguous (next.startCol = this.startCol + rowW + 1 for
    // the consumed break space), so the last row on the line absorbs the EOL.
    let visRow = layout.rows.findIndex((r) => r.logical === li && colW >= r.startCol && colW < r.startCol + Math.max(r.rowW, 1));
    // No match means colW landed exactly on a row's end width — which is the
    // NORMAL state for the caret at the end of a line (it sits just past the
    // last char, before the newline), and equally the last row of a wrapped
    // line. It must stay on THIS line's final row. The old fallback took
    // `rows.length - 1`, the last row of the whole layout, so end-of-line put
    // the caret on a different line entirely in any multi-line input ("first\n
    // second" — end of "first" jumped down onto "second"). Comment claimed
    // "the last row on the line"; the code never scoped it to the line.
    if (visRow < 0) {
      for (let i = layout.rows.length - 1; i >= 0; i--) {
        if (layout.rows[i].logical === li) {
          visRow = i;
          break;
        }
      }
    }
    if (visRow < 0) visRow = layout.rows.length - 1; // past EOL lands on last row
    return { visRow, colW: colW - layout.rows[Math.max(0, visRow)].startCol };
  }

  /** Anchored selection range, or null when there is none. */
  function inSelRange(anchor: number | null, cur: number): [number, number] | null {
    return anchor !== null && anchor !== cur ? [Math.min(anchor, cur), Math.max(anchor, cur)] : null;
  }

  /** Delete the selection if present; returns the new buffer/cursor/anchor. */
  function deleteInSel(buf: Ch[], cur: number, anchor: number | null) {
    const r = inSelRange(anchor, cur);
    if (!r) return { buf, cur, anchor, did: false };
    const nb = buf.slice();
    nb.splice(r[0], r[1] - r[0]);
    inputRev++;
    deps.markDirty();
    return { buf: nb, cur: r[0], anchor: null, did: true };
  }

  /** buffer-index range one visual row covers (the newline excluded) */
  function rowBufRange(layout: InputLayout, v: number): [number, number] {
    const row = layout.rows[v];
    const chars = [...inputText()];
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

  /** (x, y) in the input dock -> buffer index; null when y is above the dock. */
  function inputIndexAt(x: number, y: number, round = false): number | null {
    const { layout, firstShown, inputTop, shownCount } = deps.dockGeom();
    if (y < inputTop || y >= inputTop + shownCount) return null;
    const v = Math.min(firstShown + (y - inputTop), layout.rows.length - 1);
    const [s, e] = rowBufRange(layout, v);
    const targetW = Math.max(0, x - 3); // 1 margin + 2 for the "❯ " prefix
    return s + indexAtWidth(inputText().slice(s, e), targetW, round);
  }

  /** up/down inside a multi-line input, keeping the display column. */
  function moveCaretVertical(dir: -1 | 1, extend: boolean, cur: number, anchor: number | null) {
    let na = anchor;
    if (extend && na === null) na = cur;
    if (!extend) na = null;
    const layout = inputLayout();
    const pos = caretPos(layout, cur);
    const tv = pos.visRow + dir;
    let nc: number;
    if (tv < 0) nc = 0;
    else if (tv >= layout.rows.length) nc = deps.display().length;
    else {
      const [s, e] = rowBufRange(layout, tv);
      nc = s + indexAtWidth(inputText().slice(s, e), pos.colW);
    }
    deps.markDirty();
    return { cur: nc, anchor: na };
  }

  return {
    rev: () => inputRev,
    bumpRev: () => { inputRev++; },
    inputText,
    inputLayout,
    caretPos,
    inSelRange,
    deleteInSel,
    rowBufRange,
    inputIndexAt,
    moveCaretVertical,
    wrapByWidth,
    indexAtWidth,
    invalidate: () => { layoutCache = null; },
  };
}
