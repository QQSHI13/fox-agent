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
  /** render one item's rows at width w (app-side: theme + markdown live there) */
  renderItem: (it: any, w: number) => Row[];
  /** render the streaming tail at width w */
  renderStream: (text: string, w: number) => Row[];
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
  rowCount: number;
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
  let { rows, owner } = assemble(inp, inp.W);
  let contentWidth = inp.W;
  let sbShowing = false;
  if (wantSb && inp.W >= 12 && rows.length > vh0) {
    ({ rows, owner } = assemble(inp, inp.W - 2));
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
  let scrollTop = Math.max(0, Math.min(inp.scrollTop, Math.max(0, rows.length - vh)));
  const stick = scrollTop >= Math.max(0, rows.length - vh) ? true : inp.stick;
  if (stick) scrollTop = Math.max(0, rows.length - vh);

  const sb = scrollbarGeom(rows.length, vh, scrollTop);
  return { contentWidth, sbShowing, sb, scrollTop, stick, vh, rows, owner, rowCount: rows.length, inputTop, shownCount, firstShown, queueH };
}

/** Build the transcript row array at one width, with the spacing rules.
 *  Returns rows plus the parallel owner array (item key per row, -1 for the
 *  streaming tail) so hit-testing has one consistent map. */
function assemble(inp: FrameInput, w: number): { rows: Row[]; owner: number[] } {
  const owner: number[] = [];
  const rows: Row[] = [];
  let lastKind: string | null = null;
  let lastHadRows = false;
  for (const it of inp.items) {
    // keep interior blanks (markdown paragraphs), strip edge blanks — the
    // spacing BETWEEN items is decided here, not by the items themselves
    const itemRows = [...inp.renderItem(it, w)];
    while (itemRows.length && !itemRows[0].segs.length) itemRows.shift();
    while (itemRows.length && !itemRows[itemRows.length - 1].segs.length) itemRows.pop();
    if (!itemRows.length) continue; // fully blank item contributes nothing
    // exactly one blank row between items. Glued pairs (no blank row):
    //   toolhead→toolbody — output belongs to the call that produced it
    //   think→toolhead — a thinking block sits directly on the tool it led to
    //   toolbody→think   — and a FOLLOW-UP thinking block after a tool is
    //                      part of the same step, so no gap either
    if (
      lastHadRows &&
      !(lastKind === "toolhead" && it.kind === "toolbody") &&
      !((lastKind === "think" || lastKind === "toolbody") && it.kind === "think") &&
      !(lastKind === "think" && it.kind === "toolhead")
    ) {
      rows.push({ segs: [] });
      owner.push(-1); // blank spacing row: owned by nothing, keeps owner aligned to rows
    }
    for (const r of itemRows) {
      // tool calls (head + result body) get the theme's toolBg row fill;
      // the head's own fg stays at itemStyle — only the background changes.
      // The fill itself is applied by the app's renderItem (theme access lives
      // there); layout only forwards the rows.
      rows.push(r);
      owner.push(it.k);
    }
    lastKind = it.kind;
    lastHadRows = true;
  }
  if (inp.streamText !== null) {
    for (const r of inp.renderStream(inp.streamText, w)) {
      rows.push(r);
      owner.push(-1); // one owner per row, or hit-testing drifts below here
    }
  }
  return { rows, owner };
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
