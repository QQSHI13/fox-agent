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
  /**
   * Leading `[N]` transcript marker for this row: `{ label, bg }` on the FIRST
   * row of a marked item, `true` (indent only) on its continuation rows. The
   * paint loop stamps the chip in column 0 — outside the content margin — so
   * the marker hugs the very-left edge while content keeps its gutter.
   */
  marker?: { label: string; bg: string; fg: string; w: number } | { indent: number };
}

/**
 * The gutter a `[N]` chip claims: the chip's own width PLUS one uncolored gap
 * column. This ONE function is the geometry every consumer must agree with.
 *
 * It used to be re-derived in five places — the wrap width in `itemRows`, the
 * wrap width in `streamRows`, the paint loop's content offset, the selection
 * restyle, and the click-to-column mapping. Each computed it independently, so
 * fixing one drifted the others: reserving only the chip width (not the gap)
 * overflowed the row by a column and made a selected marked row look displaced;
 * mapping clicks by a flat `x - 1` put the selection `chipWidth` columns off.
 * Anything that needs "where does the text start" or "how wide may it be" now
 * calls `contentOrigin` / `contentWidth`, and `test/layout.test.ts` asserts the
 * three agree.
 */
export function chipGutter(seq: number | undefined): number {
  return seq === undefined ? 0 : `[${seq}]`.length + 1;
}

/** Screen column where a marked row's content begins; 1 for an unmarked row. */
export function contentOrigin(seq: number | undefined): number {
  return seq === undefined ? 1 : chipGutter(seq);
}

/**
 * The same origin, from a chip WIDTH rather than a seq. The paint loop holds the
 * marker (and its width), not the item, so it must not re-derive a seq to ask.
 * One function so the two spellings cannot drift.
 */
export function contentOriginForChip(chipW: number): number {
  return chipW ? chipW + 1 : 1;
}

/**
 * Width available to a row's content.
 *
 * `total` is the width rows are built at (W, or W-2 when the scrollbar strip
 * shows), and text paints from `contentOrigin`. wrapSegs keeps a ragged right
 * edge (`fit = cols - 1`), so `cols` must span from the origin THROUGH the last
 * writable column — that is exactly `total` for an unmarked row (origin 1) and
 * `total - gutter + 1` for a marked one (origin gutter). Subtracting the gutter
 * alone left marked rows a column short of the right edge.
 *
 * ONLY the first visual row of an item carries the chip; continuation rows
 * start at the usual margin and wrap at the full `total`. This width is the
 * chip row's budget, passed to the wrap as a first-line reserve.
 *
 * The 8 is a floor so a very narrow terminal still leaves a usable wrap column
 * instead of a negative one.
 */
export function contentWidth(total: number, seq: number | undefined): number {
  return seq === undefined ? total : Math.max(8, total - chipGutter(seq) + 1);
}

/** The minimum layout needs to know about one transcript item. */
export interface TranscriptSourceItem {
  kind: string;
  k: number;
  toolResult?: boolean;
}

/**
 * Random access to the transcript as layout sees it.
 *
 * `FrameInput` used to be an array plus two callbacks. A virtual transcript
 * cannot hand layout a materialized array, so layout talks to this view
 * instead. `length`, `itemAt`, `countAt` and `renderAt` are exactly the four
 * things the two frame passes read; `rowsAt` / `indexOfKey` / `itemByKey` give
 * hit-testing and paint the same view without reaching back into the host.
 */
export interface TranscriptSource<T extends TranscriptSourceItem = TranscriptSourceItem> {
  readonly length: number;
  itemAt(index: number): T;
  renderAt(index: number, width: number): Row[];
  rowsAt(index: number, width: number): Row[];
  countAt(index: number, width: number): number;
  indexOfKey(key: number): number;
  itemByKey(key: number): T | undefined;
}

/** The legacy array-backed view over the same contract. */
export function arrayTranscriptSource<T extends TranscriptSourceItem>(
  items: readonly T[],
  renderItem: (item: T, width: number) => Row[],
  countItem: (item: T, width: number) => number,
): TranscriptSource<T> {
  return {
    get length() {
      return items.length;
    },
    itemAt: (index) => items[index],
    // The caller's renderer already returns edge-stripped rows (layout's
    // spacing contract), so `renderAt` and `rowsAt` are the same rows here.
    renderAt: (index, width) => renderItem(items[index], width),
    rowsAt: (index, width) => renderItem(items[index], width),
    countAt: (index, width) => countItem(items[index], width),
    indexOfKey: (key) => items.findIndex((item) => item.k === key),
    itemByKey: (key) => items.find((item) => item.k === key),
  };
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
  /** array-backed transcript; ignored when `source` is set */
  items?: TranscriptSourceItem[];
  streamText: string | null;
  /** render one item's rows at width w (app-side: theme + markdown live there).
   *  MUST return edge-stripped rows (layout's spacing contract). */
  renderItem?: (it: any, w: number) => Row[];
  /** cheap row count for one item at width w — lineCache hits app-side */
  countItem?: (it: any, w: number) => number;
  /** resolved transcript view; when absent it is built from
   *  `items`/`renderItem`/`countItem` */
  source?: TranscriptSource;
  /** render the streaming tail at width w */
  renderStream: (text: string, w: number) => Row[];
  /** cheap row count for the streaming tail */
  countStream: (text: string, w: number) => number;
  /**
   * Optional memo for pass 1's per-item row counts.
   *
   * `computeFrame` walks every item to sum row counts — twice, because it counts
   * at `W` and again at `W-2` when the scrollbar turns out to be needed. With a
   * realistic `countItem` (a lineCache lookup plus span arithmetic) that measured
   * 1.94 ms per frame at 8000 items, and it ran on every streamed token even
   * though a streaming token changes NO item's row count.
   *
   * The host owns this because it is the only party that knows when item rows
   * change: it bumps `version()` for every mutation that could move a row count.
   * `layout.ts` stays pure — it just asks whether its last answer is still valid.
   */
  countCache?: CountCache;
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

/** Resolve the transcript view once per frame. Rebuilding the legacy adapter
 *  inside each pass would allocate an adapter and its closures per call and
 *  let `countRows` and `assemble` disagree about source identity. */
function frameSource(inp: FrameInput): TranscriptSource {
  if (inp.source) return inp.source;
  if (inp.items && inp.renderItem && inp.countItem) {
    return arrayTranscriptSource(inp.items, inp.renderItem, inp.countItem);
  }
  throw new Error("FrameInput requires source or items/renderItem/countItem");
}

/**
 * Assemble one frame. Two-pass width decision: count at full W; only if that
 * overflows the viewport recount at W-2 (text paints from column 1, so the
 * strip's column must come out of the text budget) and show the scrollbar.
 * The decision comes from THIS frame's data — keying it off the previous
 * frame's flag once made the wrap width flip-flop at the overflow boundary.
 */
export function computeFrame(inp: FrameInput): Frame {
  const src = frameSource(inp);
  const vh0 = viewportHeight(inp);
  // ---- pass 1: cheap row counts, per width, until the wrap width is known ----
  // `total` is scrollTop-independent, which is what lets the scroll position be
  // settled BEFORE any window is built around it.
  let counted = countRows(inp, inp.W, src);
  let grand = counted.total;
  let w = inp.W;
  let sbShowing = false;
  if (inp.scrollbar && inp.W >= 12 && grand > vh0) {
    counted = countRows(inp, inp.W - 2, src);
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

  const { rows, owner, winOffset } = assemble(inp, w, counted, grand, vh, scrollTop, src);
  const sb = scrollbarGeom(grand, vh, scrollTop);
  return { contentWidth: w, sbShowing, sb, scrollTop, stick, winOffset, vh, rows, owner, rowCount: rows.length, total: grand, inputTop, shownCount, firstShown, queueH };
}

/** Absolute row geometry for one counted width, excluding the streaming tail. */
export interface CountGeometry {
  /** interleaved absolute rows `[blockStart, bodyEnd]` per item */
  windowIndex: Uint32Array;
  /** whether the item carries a separator blank before its body */
  hasBlank: Uint8Array;
  /** row total of the ITEMS only — the tail is added per call */
  itemTotal: number;
}

export interface CountSnapshot extends CountGeometry {
  /** item total plus the streaming tail counted for this frame */
  total: number;
}

/** One width's memoized pass-1 result. The geometry excludes the streaming
 *  tail, so a streaming token can reuse it. */
export interface CountEntry extends CountGeometry {
  version: number;
}

/**
 * Per-width memo for pass 1; see {@link FrameInput.countCache}.
 *
 * `version()` must change whenever any item's rendered row count could change:
 * a mutation, an expand/collapse, a width change on the item side, a ctx op.
 * It does NOT change for theme or highlight, which recolour rows without
 * changing how many there are.
 */
export interface CountCache {
  version: () => number;
  at: Map<number, CountEntry>;
}

/** Pass 1: cheap per-item row counts at width `w`, blank separators included.
 *  The per-item counts ride along because pass 2 needs the same offsets, and
 *  `countItem` is cached app-side — calling it twice per item costs a lookup,
 *  so counts are computed once and shared. */
function countRows(inp: FrameInput, w: number, src: TranscriptSource): CountSnapshot {
  const cache = inp.countCache;
  const version = cache ? cache.version() : 0;
  const hit = cache?.at.get(w);
  // A hit means neither the item set nor any item's row count moved since this
  // width was last counted — the common case during streaming, where only the
  // tail grows.
  if (hit && hit.version === version) {
    const tail = inp.streamText !== null ? inp.countStream(inp.streamText, w) : 0;
    return {
      windowIndex: hit.windowIndex,
      hasBlank: hit.hasBlank,
      itemTotal: hit.itemTotal,
      total: hit.itemTotal + tail,
    };
  }

  const length = src.length;
  // A version bump means the values are stale, not necessarily the shape: when
  // the item count is unchanged, refill the same typed arrays instead of
  // allocating a new geometry set for every expand/collapse or ctx op.
  const prior = cache?.at.get(w);
  const reusable = prior !== undefined && prior.windowIndex.length === length * 2 && prior.hasBlank.length === length;
  const windowIndex = prior && reusable ? prior.windowIndex : new Uint32Array(length * 2);
  const hasBlank = prior && reusable ? prior.hasBlank : new Uint8Array(length);
  let total = 0;
  let prevKind: string | null = null;
  for (let i = 0; i < length; i++) {
    const it = src.itemAt(i);
    const rows = src.countAt(i, w);
    // interior blanks kept: countItem reports the POST-strip count, so the
    // item's own edge blanks are already excluded from `rows`
    const blank = i > 0 && rows > 0 && !glued(prevKind, it.kind) ? 1 : 0;
    const start = total;
    const body = start + blank;
    const end = body + rows;
    windowIndex[i * 2] = start;
    windowIndex[i * 2 + 1] = end;
    hasBlank[i] = blank;
    if (rows > 0) prevKind = it.kind;
    total = end;
  }
  if (cache) {
    // Bound the memo to the widths actually in play (W and W-2); anything else
    // is a resize and its entry is dead the moment the width moves again.
    if (cache.at.size > 4 && !cache.at.has(w)) cache.at.clear();
    cache.at.set(w, { version, windowIndex, hasBlank, itemTotal: total });
  }
  const tail = inp.streamText !== null ? inp.countStream(inp.streamText, w) : 0;
  return { windowIndex, hasBlank, itemTotal: total, total: total + tail };
}

/** Build the transcript row array at one width, with the spacing rules.
 *  Returns rows plus the parallel owner array (item key per row, -1 for the
 *  streaming tail) so hit-testing has one consistent map. `counts`/`grand` are
 *  pass 1's output and `scrollTop` the already-settled scroll position. */
function assemble(
  inp: FrameInput,
  w: number,
  geo: CountGeometry,
  grand: number,
  vh: number,
  scrollTop: number,
  src: TranscriptSource,
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

  // Pass 1 already recorded each item's absolute block/body rows. Binary-search
  // the intersecting item range instead of walking the whole history: a
  // cache-hit frame is O(log items + window items), not O(items). The end test
  // uses blockStart (the separator blank when there is one) so a blank exactly
  // at the window edge is still materialized even when the body is below it.
  const first = firstBodyEndAfter(geo, from);
  const last = firstBlockStartAtOrAfter(geo, to);
  for (let i = first; i < last; i++) {
    const it = src.itemAt(i);
    const blockStart = blockStartAt(geo, i);
    const bodyStart = bodyStartAt(geo, i);
    const bodyEnd = bodyEndAt(geo, i);
    if (bodyEnd === bodyStart) continue;

    const blankAt = geo.hasBlank[i] ? blockStart : -1;
    if (blankAt >= from && blankAt < to) {
      rows.push({ segs: [] });
      owner.push(-1);
    }
    // The body itself may still miss the window: its separator blank can be
    // the only row inside. Rendering that item would allocate rows only to
    // slice every one away.
    if (bodyStart >= to || bodyEnd <= from) continue;

    const itemRows = src.renderAt(i, w);
    const sliceFrom = Math.max(0, from - bodyStart);
    const sliceTo = Math.min(itemRows.length, to - bodyStart);
    for (let r = sliceFrom; r < sliceTo; r++) {
      rows.push(itemRows[r]);
      owner.push(it.k);
    }
  }

  let idx = geo.itemTotal;
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
  return { rows, owner, winOffset };
}

function blockStartAt(geo: CountGeometry, i: number): number {
  return geo.windowIndex[i * 2];
}

function bodyEndAt(geo: CountGeometry, i: number): number {
  return geo.windowIndex[i * 2 + 1];
}

function bodyStartAt(geo: CountGeometry, i: number): number {
  return blockStartAt(geo, i) + (geo.hasBlank[i] ? 1 : 0);
}

/** First item whose body ends strictly after `value`. */
function firstBodyEndAfter(geo: CountGeometry, value: number): number {
  let lo = 0;
  let hi = geo.hasBlank.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (bodyEndAt(geo, mid) <= value) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** First item whose [blank..body] block starts at or after `value`. */
function firstBlockStartAtOrAfter(geo: CountGeometry, value: number): number {
  let lo = 0;
  let hi = geo.hasBlank.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (blockStartAt(geo, mid) < value) lo = mid + 1;
    else hi = mid;
  }
  return lo;
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
  // A row is BLANK only when it has neither text NOR a [N] chip. An assistant
  // node that carries tool calls has no text of its own — the reply is the
  // calls — so it rendered as one zero-segment row and was trimmed away
  // entirely, making its marker vanish: the transcript jumped [2] think -> [4]
  // tool with [3] gone. The chip IS content (it is the node's address, the
  // thing you click to view or revert it), so it keeps the row.
  const blank = (r: Row): boolean => !r.segs.length && !(r.marker && "label" in r.marker);
  let a = 0;
  let b = rows.length;
  while (a < b && blank(rows[a])) a++;
  while (b > a && blank(rows[b - 1])) b--;
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
 * Left-status text for a transcript scrolled away from the live bottom.
 * Returns null when the position would be noise: the transcript fits, or the
 * frame is already at the newest row. The bottom test is `>=`, not `==`, so a
 * near-bottom frame does not flicker between a percentage and no label.
 */
export function scrollPositionLabel(total: number, scrollTop: number, vh: number): string | null {
  if (vh < 1 || total <= vh) return null;
  const max = total - vh;
  if (scrollTop >= max) return null;
  if (scrollTop <= 0) return "top";
  const pct = Math.max(0, Math.min(100, Math.round((scrollTop / max) * 100)));
  return `scrolled ${pct}%`;
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
