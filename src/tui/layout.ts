// Pure frame geometry — the single source of truth for what goes where on
// screen. No Screen, no Term, no closures over mutable app state: everything
// comes in through the argument, everything goes out through the returned
// Frame. paint() computes one Frame per frame and STAMPS the grid from it;
// hit-tests answer from that same stored Frame. A click can therefore never
// disagree with the pixels — the old drift bugs were all "two places computed
// the geometry differently".
//
// Plugins get this as their clean surface too: a theme or panel can call
// viewportHeight()/dockFrame() without reaching into the app's internals.
import type { Seg } from "./wrap.ts";

export interface Row {
  segs: Seg[];
  /** background fill style for the whole row (0 = default) — tool rows use
   *  the theme's toolBg so calls read as one block in the transcript */
  bg?: number;
}

/** Everything computeFrame needs to lay out one frame. Rendering callbacks are
 *  injected so this module stays free of theme/markdown/highlight deps. */
export interface FrameInput {
  W: number;
  H: number;
  scrollTop: number;
  stick: boolean;
  /** scrollbar enabled by config; when false no column is reserved */
  scrollbar: boolean;
  items: { kind: string; k: number; toolResult?: boolean }[];
  streamText: string | null;
  /** render one item's rows at width w (app-side: theme + markdown live there).
   *  MUST return edge-stripped rows (layout's spacing contract). */
  renderItem: (it: any, w: number) => Row[];
  /** cheap row count for one item at width w — lineCache hits app-side */
  countItem: (it: any, w: number) => number;
  /** render the streaming tail at width w */
  renderStream: (text: string, w: number) => Row[];
  /** cheap row count for the streaming tail */
  countStream: (text: string, w: number) => number;
  /** input dock: how many visual rows the editor buffer wraps to, and where
   *  the caret sits among them (for the flex-window firstShown choice) */
  inputRows: number;
  caretRow: number;
  INPUT_MAX_ROWS: number;
  /** queued + steering line count floating above the dock */
  pendingCount: number;
}

/** One frame's geometry — immutable once returned; paint stamps from it and
 *  hit-tests read it. `rows`/`owner` are parallel arrays. */
export interface Frame {
  /** width rows were built at (W, or W-2 when the scrollbar strip shows) */
  contentWidth: number;
  sbShowing: boolean;
  sb: { ty: number; th: number };
  /** clamped/stuck scroll offset — the value this frame was painted with */
  scrollTop: number;
  /** whether this frame is stuck to the bottom (recomputed: at-bottom == stuck) */
  stick: boolean;
  /** transcript viewport height in rows */
  vh: number;
  rows: Row[];
  owner: number[];
  /** window rows actually built */
  rowCount: number;
  /** absolute row index of rows[0]: the viewport starts at winOffset inside
   *  the slice (rows before it are scroll-up margin) */
  winOffset: number;
  /** TOTAL transcript rows — real scroll length without building everything */
  total: number;
  // dock
  inputTop: number;
  shownCount: number;
  firstShown: number;
  // floats above the dock
  queueH: number;
}

/**
 * Assemble one frame. Two-pass width decision: count at full W; only if that
 * overflows the viewport recount at W-2 (text paints from column 1, so the
 * strip's column must come out of the text budget) and show the scrollbar.
 * The decision comes from THIS frame's data — keying it off the previous
 * frame's flag once made the wrap width flip-flop at the overflow boundary.
 */
export function computeFrame(inp: FrameInput): Frame {
  const vh0 = viewportHeight(inp);
  // ---- pass 1: cheap row counts, per width, until the wrap width is known ----
  // `total` is scrollTop-independent, which is what lets the scroll position be
  // settled BEFORE any window is built around it.
  let counted = countRows(inp, inp.W);
  let grand = counted.total;
  let w = inp.W;
  let sbShowing = false;
  if (inp.scrollbar && inp.W >= 12 && grand > vh0) {
    counted = countRows(inp, inp.W - 2);
    grand = counted.total;
    w = inp.W - 2;
    sbShowing = true;
  }

  // dock geometry: the input box flexes with its wrapped rows, capped by what
  // the window affords (dockRows — same cap viewportHeight assumed)
  const shownCount = dockRows(inp.H, inp.inputRows, inp.INPUT_MAX_ROWS);
  const inputTop = inp.H - 1 - shownCount;
  let firstShown = 0;
  if (inp.inputRows > shownCount) {
    firstShown = Math.max(0, Math.min(inp.caretRow - (shownCount - 1), inp.inputRows - shownCount));
    if (inp.caretRow < firstShown) firstShown = inp.caretRow;
  }
  // queued/steering stack lives directly above the input box, capped to the
  // space actually available, +1 "… N more" row when it overflows
  let queueH = 0;
  if (inp.pendingCount) {
    const shown = Math.min(inp.pendingCount, Math.max(1, inputTop - 1));
    queueH = shown + (inp.pendingCount > shown ? 1 : 0);
  }
  // -1 status bar; NO spacer: content flows straight down to the dock
  const vh = Math.max(3, inp.H - 1 - shownCount - queueH);

  // scroll position: clamp first, then "at the bottom" IS stuck — every scroll
  // path (scrub, wheel, pgdn, drag-past-edge) inherits follow-for-free. FINAL
  // before assembly: the window has to wrap the range the viewport will show,
  // not the offset that came in. Sticking can move scrollTop by more than a
  // screen (first paint into a long session, a big tool dump, compaction), and
  // building for the incoming offset left `winOffset` past `rowCount` — a
  // frame that painted nothing.
  let scrollTop = Math.max(0, Math.min(inp.scrollTop, Math.max(0, grand - vh)));
  const stick = scrollTop >= Math.max(0, grand - vh) ? true : inp.stick;
  if (stick) scrollTop = Math.max(0, grand - vh);

  const { rows, owner, winOffset } = assemble(inp, w, counted.counts, grand, vh, scrollTop);
  const sb = scrollbarGeom(grand, vh, scrollTop);
  return { contentWidth: w, sbShowing, sb, scrollTop, stick, winOffset, vh, rows, owner, rowCount: rows.length, total: grand, inputTop, shownCount, firstShown, queueH };
}

/** Pass 1: cheap per-item row counts at width `w`, blank separators included.
 *  The per-item counts ride along because pass 2 needs the same offsets, and
 *  `countItem` is cached app-side — calling it twice per item costs a lookup,
 *  so counts are computed once and shared. */
function countRows(inp: FrameInput, w: number): { counts: number[]; total: number } {
  const counts: number[] = [];
  let total = 0;
  let prevKind: string | null = null;
  for (let i = 0; i < inp.items.length; i++) {
    const it = inp.items[i];
    let n = inp.countItem(it, w);
    // interior blanks kept: countItem reports the POST-strip count, so the
    // item's own edge blanks are already excluded from `n`
    if (i > 0 && n > 0 && !glued(prevKind, it.kind)) n += 1; // blank between
    counts.push(n);
    if (n > 0) prevKind = it.kind;
    total += n;
  }
  if (inp.streamText !== null) total += inp.countStream(inp.streamText, w);
  return { counts, total };
}

/** Build the transcript row array at one width, with the spacing rules.
 *  Returns rows plus the parallel owner array (item key per row, -1 for the
 *  streaming tail) so hit-testing has one consistent map. `counts`/`grand` are
 *  pass 1's output and `scrollTop` the already-settled scroll position. */
function assemble(
  inp: FrameInput,
  w: number,
  counts: number[],
  grand: number,
  vh: number,
  scrollTop: number,
): { rows: Row[]; owner: number[]; winOffset: number } {
  // ---- pass 2: render only the window [from, to) ----
  // The caller (paint) scrolls; everything outside the window is estimated
  // rows — never rendered, so a 100k-row session scrolls as fast as a 50-row
  // one. The window covers the viewport plus a screenful of margin so wheel
  // and pgdn land inside already-rendered rows.
  const from = Math.max(0, scrollTop - vh);
  const to = Math.min(grand, scrollTop + vh * 2);
  // rows[0] is absolute row `from`; the viewport begins at scrollTop, i.e.
  // winOffset rows INTO the built slice. Paint reads this — drawing rows[0]
  // at screen y=0 would show the margin as content.
  const winOffset = scrollTop - from;
  const owner: number[] = [];
  const rows: Row[] = [];
  const skipAbove = from; // rows before the window: represented but not built

  let idx = 0; // absolute row counter
  let prevKind2: string | null = null;
  for (let i = 0; i < inp.items.length; i++) {
    const it = inp.items[i];
    const n = counts[i];
    if (n === 0) continue;
    const hasBlank = idx > 0 && !glued(prevKind2, it.kind);
    const blankAt = hasBlank ? idx : -1;
    // `n` already contains this item's separator blank, so idx + n IS the next
    // item's absolute start. Deriving it from bodyStart would add the blank a
    // second time and push `idx` one row past the item's real end.
    const bodyEnd = idx + n;
    prevKind2 = it.kind;
    // WHOLE-ITEM skip: the [blank..body] block ends before the window starts —
    // renderItem (which allocates) is never called for it. This is what keeps
    // frame cost O(window), not O(session).
    if (bodyEnd < from || (blankAt >= 0 && blankAt >= to)) {
      idx = bodyEnd;
      continue;
    }
    if (hasBlank) {
      if (blankAt >= from && blankAt < to) {
        rows.push({ segs: [] });
        owner.push(-1);
      }
      idx++;
    }
    // only materialize rows that can land in the window
    const itemRows = inp.renderItem(it, w);
    const sliceFrom = Math.max(0, from - idx);
    const sliceTo = Math.min(itemRows.length, to - idx);
    for (let r = sliceFrom; r < sliceTo; r++) {
      rows.push(itemRows[r]);
      owner.push(it.k);
    }
    idx += itemRows.length;
  }
  if (inp.streamText !== null) {
    const streamRows = inp.renderStream(inp.streamText, w);
    const sFrom = Math.max(0, from - idx);
    const sTo = Math.min(streamRows.length, to - idx);
    for (let r = sFrom; r < sTo; r++) {
      rows.push(streamRows[r]);
      owner.push(-1);
    }
    idx += streamRows.length;
  }
  void skipAbove;
  return { rows, owner, winOffset };
}

/** toolhead->toolbody and think/toolbody->think and think->toolhead stay glued */
function glued(a: string | null, b: string): boolean {
  if (a === "toolhead" && b === "toolbody") return true;
  if ((a === "think" || a === "toolbody") && b === "think") return true;
  if (a === "think" && b === "toolhead") return true;
  return false;
}

/**
 * The span `[a, b)` of rows that actually carry segments: an item's leading and
 * trailing blank rows are dropped, because `assemble` puts ONE blank between
 * items itself, so an item must not bring extra edges of its own.
 *
 * `countItem` and `renderItem` in the app's `frameInput` BOTH go through this,
 * on purpose — they have to agree, or three things break at once. Counting
 * stripped while painting unstripped left `total` short by a row per
 * newline-terminated message: the window cap `to = min(grand, …)` then closed
 * early, the scroll clamp stopped at `grand - vh` instead of the real end, and
 * the scrollbar, fed the same `grand`, stopped with it. The last screenful of a
 * long session became unreachable.
 */
export function itemEdgeSpan(rows: readonly Row[]): [number, number] {
  let a = 0;
  let b = rows.length;
  while (a < b && !rows[a].segs.length) a++;
  while (b > a && !rows[b - 1].segs.length) b--;
  return [a, b];
}

/** Scrollbar geometry for `rows` lines in a viewport of `vh`. */
export interface ScrollbarGeom {
  showing: boolean;
  ty: number;
  th: number;
}
export function scrollbarGeom(rows: number, vh: number, scrollTop: number): ScrollbarGeom {
  if (rows <= vh || vh < 4) return { showing: false, ty: 0, th: vh };
  const th = Math.max(1, Math.floor((vh * vh) / rows));
  const maxScroll = rows - vh;
  const ty = maxScroll > 0 ? Math.floor((Math.max(0, Math.min(scrollTop, maxScroll)) / maxScroll) * (vh - th)) : 0;
  return { showing: true, ty, th };
}

/**
 * Dock height the window can actually afford: the editor's wrapped rows capped
 * by INPUT_MAX_ROWS, then capped again so the status bar keeps its row and the
 * viewport keeps its floor of 3. Every consumer (computeFrame, viewportHeight,
 * the TUI's pre-paint dockGeom) must derive from this one helper or a short
 * window overcommits rows — the dock's bottom landed on the status bar.
 */
export function dockRows(H: number, inputRows: number, INPUT_MAX_ROWS: number): number {
  const wrapped = Math.max(1, Math.min(INPUT_MAX_ROWS, inputRows));
  return Math.max(1, Math.min(wrapped, Math.max(1, H - 1 - 3)));
}

/** Inverse for the mouse scrub: a press at viewport row `y` maps to a scroll offset. */
export function scrollbarScrollTop(rows: number, vh: number, y: number): number {
  const g = scrollbarGeom(rows, vh, 0);
  if (!g.showing || rows <= vh) return 0;
  return Math.round((Math.max(0, Math.min(vh - 1, y)) / Math.max(1, vh - 1)) * (rows - vh));
}

/** Transcript viewport height before a frame is built (scroll keys, clamps). */
export function viewportHeight(inp: Pick<FrameInput, "H" | "inputRows" | "INPUT_MAX_ROWS" | "pendingCount">): number {
  const n = dockRows(inp.H, inp.inputRows, inp.INPUT_MAX_ROWS);
  const pend = inp.pendingCount;
  const qH = pend ? Math.min(pend, Math.max(1, inp.H - n - 5)) + (pend > Math.max(1, inp.H - n - 5) ? 1 : 0) : 0;
  // matches computeFrame: -1 status bar, no spacer row
  return Math.max(3, inp.H - 1 - n - qH);
}
