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
  /** window rows actually built (a prefix-anchored slice of the transcript) */
  rowCount: number;
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
  let { rows, owner, total: grand } = assemble(inp, inp.W);
  let contentWidth = inp.W;
  let sbShowing = false;
  if (wantSb && inp.W >= 12 && grand > vh0) {
    ({ rows, owner, total: grand } = assemble(inp, inp.W - 2));
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
  const vh = Math.max(3, inp.H - shownCount - 2 - queueH);

  // scroll position: clamp first, then "at the bottom" IS stuck — every scroll
  // path (scrub, wheel, pgdn, drag-past-edge) inherits follow-for-free
  let scrollTop = Math.max(0, Math.min(inp.scrollTop, Math.max(0, grand - vh)));
  const stick = scrollTop >= Math.max(0, grand - vh) ? true : inp.stick;
  if (stick) scrollTop = Math.max(0, grand - vh);

  const sb = scrollbarGeom(grand, vh, scrollTop);
  return { contentWidth, sbShowing, sb, scrollTop, stick, vh, rows, owner, rowCount: rows.length, total: grand, inputTop, shownCount, firstShown, queueH };
}

/** Build the transcript row array at one width, with the spacing rules.
 *  Returns rows plus the parallel owner array (item key per row, -1 for the
 *  streaming tail) so hit-testing has one consistent map. */
function assemble(inp: FrameInput, w: number): { rows: Row[]; owner: number[]; total: number } {
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
  const owner: number[] = [];
  const rows: Row[] = [];
  const skipAbove = from; // rows before the window: represented but not built

  let idx = 0; // absolute row counter
  let prevKind2: string | null = null;
  for (let i = 0; i < inp.items.length; i++) {
    const it = inp.items[i];
    let n = counts[i];
    if (n === 0) continue;
    const blankHere = idx > 0 && n > counts[i] - (glued(prevKind2, it.kind) ? 0 : 1) && !glued(prevKind2, it.kind) && idx > 0;
    // blank row occupies one absolute row; render it if inside window
    const hasBlank = idx > 0 && !glued(prevKind2, it.kind);
    if (hasBlank) {
      if (idx >= from && idx < to) {
        rows.push({ segs: [] });
        owner.push(-1);
      }
      idx++;
    }
    prevKind2 = it.kind;
    const itemRows = inp.renderItem(it, w);
    for (const r of itemRows) {
      if (idx >= from && idx < to) {
        rows.push(r);
        owner.push(it.k);
      }
      idx++;
    }
  }
  if (inp.streamText !== null) {
    const streamRows = inp.renderStream(inp.streamText, w);
    for (const r of streamRows) {
      if (idx >= from && idx < to) {
        rows.push(r);
        owner.push(-1);
      }
      idx++;
    }
  }
  void skipAbove;
  return { rows, owner, total: grand };
}

/** toolhead->toolbody and think/toolbody->think and think->toolhead stay glued */
function glued(a: string | null, b: string): boolean {
  if (a === "toolhead" && b === "toolbody") return true;
  if ((a === "think" || a === "toolbody") && b === "think") return true;
  if (a === "think" && b === "toolhead") return true;
  return false;
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
  return Math.max(3, inp.H - n - 2 - qH);
}
