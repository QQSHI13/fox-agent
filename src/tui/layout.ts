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
 * Assemble one frame. Two-pass width decision: build at full W; only if that
 * overflows the viewport rebuild at W-2 (text paints from column 1, so the
 * strip's column must come out of the text budget) and show the scrollbar.
 * The decision comes from THIS frame's data — keying it off the previous
 * frame's flag once made the wrap width flip-flop at the overflow boundary.
 */
export function computeFrame(inp: FrameInput): Frame {
  const vh0 = viewportHeight(inp);
  const wantSb = inp.scrollbar;
  let assembled = assemble(inp, inp.W);
  let { rows, owner, total: grand, winOffset: rawWinOffset } = assembled;
  let contentWidth = inp.W;
  let sbShowing = false;
  if (wantSb && inp.W >= 12 && grand > vh0) {
    assembled = assemble(inp, inp.W - 2);
    ({ rows, owner, total: grand, winOffset: rawWinOffset } = assembled);
    contentWidth = inp.W - 2;
    sbShowing = true;
  }

  // dock geometry: the input box flexes with its wrapped rows
  const shownCount = Math.max(1, Math.min(inp.INPUT_MAX_ROWS, inp.inputRows));
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
  // path (scrub, wheel, pgdn, drag-past-edge) inherits follow-for-free
  let scrollTop = Math.max(0, Math.min(inp.scrollTop, Math.max(0, grand - vh)));
  const stick = scrollTop >= Math.max(0, grand - vh) ? true : inp.stick;
  if (stick) scrollTop = Math.max(0, grand - vh);

  // the clamp moved scrollTop: the margin above shrinks by the same amount,
  // so winOffset tracks it (window base = scrollTop - winOffset must hold)
  const winOffset = rawWinOffset - (inp.scrollTop - scrollTop);
  const sb = scrollbarGeom(grand, vh, scrollTop);
  return { contentWidth, sbShowing, sb, scrollTop, stick, winOffset, vh, rows, owner, rowCount: rows.length, total: grand, inputTop, shownCount, firstShown, queueH };
}

/** Build the transcript row array at one width, with the spacing rules.
 *  Returns rows plus the parallel owner array (item key per row, -1 for the
 *  streaming tail) so hit-testing has one consistent map. */
function assemble(inp: FrameInput, w: number): { rows: Row[]; owner: number[]; total: number; winOffset: number } {
  // ---- pass 1: cheap row counts (windowing needs the item->row offsets) ----
  // renderItem is cached app-side (lineCache), so calling it twice per item
  // costs ~a map lookup. The arrays returned are SHARED — never mutate them,
  // which is why the old code copied before stripping edges. Estimated counts
  // also carry the +1 blank BETWEEN items so offsets stay exact.
  const counts: number[] = [];
  let total = 0;
  let prevKind: string | null = null;
  for (let i = 0; i < inp.items.length; i++) {
    const it = inp.items[i];
    let n = inp.countItem(it, w);
    // interior blanks kept: countItem reports the POST-strip count via
    // countItem; edges already excluded there
    if (i > 0 && n > 0 && !glued(prevKind, it.kind)) n += 1; // blank between
    counts.push(n);
    if (n > 0) prevKind = it.kind;
    total += n;
  }
  let streamCount = 0;
  if (inp.streamText !== null) streamCount = inp.countStream(inp.streamText, w);
  const grand = total + streamCount;

  // ---- pass 2: render only the window [from, to) ----
  // The caller (paint) scrolls; everything outside the window is estimated
  // rows — never rendered, so a 100k-row session scrolls as fast as a 50-row
  // one. The window covers the viewport plus a screenful of margin so wheel
  // and pgdn land inside already-rendered rows.
  const vh = viewportHeight(inp);
  const from = Math.max(0, inp.scrollTop - vh);
  const to = Math.min(grand, inp.scrollTop + vh * 2);
  // rows[0] is absolute row `from`; the viewport begins at scrollTop, i.e.
  // winOffset rows INTO the built slice. Paint reads this — drawing rows[0]
  // at screen y=0 would show the margin as content.
  const winOffset = inp.scrollTop - from;
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
    const bodyStart = idx + (hasBlank ? 1 : 0);
    const bodyEnd = bodyStart + n; // exclusive
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
  return { rows, owner, total: grand, winOffset };
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

/** Inverse for the mouse scrub: a press at viewport row `y` maps to a scroll offset. */
export function scrollbarScrollTop(rows: number, vh: number, y: number): number {
  const g = scrollbarGeom(rows, vh, 0);
  if (!g.showing || rows <= vh) return 0;
  return Math.round((Math.max(0, Math.min(vh - 1, y)) / Math.max(1, vh - 1)) * (rows - vh));
}

/** Transcript viewport height before a frame is built (scroll keys, clamps). */
export function viewportHeight(inp: Pick<FrameInput, "H" | "inputRows" | "INPUT_MAX_ROWS" | "pendingCount">): number {
  const n = Math.max(1, Math.min(inp.INPUT_MAX_ROWS, inp.inputRows));
  const pend = inp.pendingCount;
  const qH = pend ? Math.min(pend, Math.max(1, inp.H - n - 5)) + (pend > Math.max(1, inp.H - n - 5) ? 1 : 0) : 0;
  // matches computeFrame: -1 status bar, no spacer row
  return Math.max(3, inp.H - 1 - n - qH);
}
