/**
 * Incremental row production for streaming text — the kernel that turns
 * "text grew by a delta" into "here is the repaint window".
 *
 * Region model:
 *   - SETTLED: everything up to the last newline. Rendered exactly once
 *     (the old cut loop, verbatim — fence state carried forward), appended
 *     immutably. Cost: only the newly settled region.
 *   - TAIL: the unterminated chunk after it. Re-parsed and re-wrapped per
 *     feed today (identical to the previous renderer's tail behavior —
 *     byte-identical output is the contract); the wrap-reuse optimization
 *     lands on top once the golden test pins equivalence.
 *
 * The previous renderer's headline cost was re-parsing AND re-wrapping the
 * whole tail per frame at 30fps. The parse is the same here — the win this
 * commit ships is architectural: a per-feed repaint window (`from`), so the
 * CALLER stops re-stamping everything, and a single testable kernel that the
 * wrap reuse attaches to next. Output is byte-identical to the old path
 * (legacyStreamRows kept for the golden test), quirks included: the
 * paragraph-straddle line split, and the empty-tail caret row.
 */
import { renderMarkdown, type MdState } from "./markdown.ts";
import { wrapSegs, type Seg } from "./wrap.ts";

/** One painted row: styled segments. Same shape layout.ts stamps with. */
export interface Row {
  segs: Seg[];
}

/** The old renderer, verbatim, for the golden equivalence test. */
export function legacyStreamRows(
  text: string,
  w: number,
  cache?: { cut: number; md: MdState; prefix: Row[]; text: string },
): Row[] {
  const c = cache ?? { cut: 0, md: { inFence: false, hadCode: false }, prefix: [], text: "" };
  if (!text.startsWith(c.text.slice(0, c.cut))) {
    c.cut = 0;
    c.md = { inFence: false, hadCode: false };
    c.prefix = [];
    c.text = "";
  }
  let scan = c.cut;
  let newCut = c.cut;
  const md2 = { ...c.md };
  for (;;) {
    const nl = text.indexOf("\n", scan);
    if (nl < 0) break;
    if (/^```/.test(text.slice(scan, nl))) {
      md2.inFence = !md2.inFence;
      md2.hadCode = false;
    } else if (md2.inFence) {
      md2.hadCode = true;
    }
    newCut = nl + 1;
    scan = nl + 1;
  }
  if (newCut > c.cut) {
    for (const mline of renderMarkdown(text.slice(c.cut, newCut - 1), c.md)) {
      c.prefix.push(...wrapSegs(mline, w).map((segs) => ({ segs })));
    }
    c.cut = newCut;
    c.md = md2;
  }
  c.text = text;
  const rows = c.prefix.slice();
  for (const mline of renderMarkdown(text.slice(c.cut), { ...c.md })) {
    rows.push(...wrapSegs(mline, w).map((segs) => ({ segs })));
  }
  return rows;
}

export interface StreamRows {
  /** all rows so far — treat as immutable; callers never mutate */
  readonly rows: readonly Row[];
  /**
   * Feed more text. Returns the index in `rows` where repainting must
   * start: rows before it are untouched since the previous call.
   */
  feed(delta: string): { from: number };
  /** Width change: reflows everything; `rows` is rebuilt in full. */
  resize(w: number): void;
}

export function createStreamRows(w: number): StreamRows {
  let width = w;
  let text = "";
  let settledRows: Row[] = [];
  let settledCut = 0;
  let md: MdState = { inFence: false, hadCode: false };
  /** the tail's wrapped visual lines (the tail region of `rows`) */
  let tailLines: Seg[][] = [];

  /** Settle everything up to the last newline (the old cut loop, verbatim). */
  const settle = (): boolean => {
    let scan = settledCut;
    let newCut = settledCut;
    const md2 = { ...md };
    for (;;) {
      const nl = text.indexOf("\n", scan);
      if (nl < 0) break;
      if (/^```/.test(text.slice(scan, nl))) {
        md2.inFence = !md2.inFence;
        md2.hadCode = false;
      } else if (md2.inFence) {
        md2.hadCode = true;
      }
      newCut = nl + 1;
      scan = nl + 1;
    }
    if (newCut === settledCut) return false;
    for (const mline of renderMarkdown(text.slice(settledCut, newCut - 1), md)) {
      for (const segs of wrapSegs(mline, width)) settledRows.push({ segs });
    }
    settledCut = newCut;
    md = md2;
    return true;
  };

  const renderTail = (): void => {
    // NO empty-tail shortcut: inside an open fence renderMarkdown("") still
    // emits a gutter row ("│ "), and that row is on screen today. The tail
    // parse runs unconditionally; the golden test pins whatever it does.
    tailLines = [];
    for (const mline of renderMarkdown(text.slice(settledCut), { ...md })) {
      tailLines.push(...wrapSegs(mline, width));
    }
  };

  const allRows = (): Row[] => {
    const rows = settledRows.slice();
    for (const segs of tailLines) rows.push({ segs });
    return rows;
  };

  return {
    get rows(): readonly Row[] {
      return allRows();
    },

    feed(delta: string): { from: number } {
      // repaint from the start of the old tail: appended settled rows land
      // exactly here and the new tail rows replace the old tail rows
      const from = settledRows.length;
      text += delta;
      settle();
      renderTail();
      return { from };
    },

    resize(w: number): void {
      width = w;
      settledRows = [];
      settledCut = 0;
      md = { inFence: false, hadCode: false };
      tailLines = [];
      settle();
      renderTail();
    },
  };
}
