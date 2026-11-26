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
 *
 * ONE deliberate divergence: table-ish blocks are held in the tail instead
 * of settling line-by-line, so a GFM table composes live during streaming
 * instead of snapping into a box when the node finishes (see settle()'s
 * holdback). For non-table content the golden equivalence is unchanged.
 */
import { renderMarkdown, type MdState } from "./markdown.ts";
import { wrapSegs, type Seg } from "./wrap.ts";

/** One painted row: styled segments. Same shape layout.ts stamps with. */
export interface Row {
  segs: Seg[];
}

/**
 * True when `next` cannot be an append-only continuation of what the stream
 * kernel already holds (`prev`, the text fed so far): it shrank, or it
 * diverged inside the fed prefix.
 *
 * The caller keys kernels by width only, so a NEW message after a tool call
 * reuses the old kernel's slot: message one streams "做完了" (3 chars),
 * settles, message two arrives and its first painted frame already holds 12
 * chars. Comparing LENGTHS alone misses that (12 > 3), and comparing `next`
 * against its OWN prefix (`next.startsWith(next.slice(0, prev.length))`) can
 * never fire — every string starts with its own prefix — so the kernel used
 * to keep the old text and append the new: the new node's head was the last
 * message's body until the node settled. Comparing against `prev` is the
 * check that actually fires.
 *
 * When the prefix does agree, appending is CORRECT, not just tolerated: the
 * fence/md state the kernel carries is a pure function of the text prefix, so
 * an identical prefix implies identical state.
 */
export function isStreamRewind(prev: string, next: string): boolean {
  return next.length < prev.length || !next.startsWith(prev);
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
    for (const mline of renderMarkdown(text.slice(c.cut, newCut - 1), c.md, w)) {
      c.prefix.push(...wrapSegs(mline, w).map((segs) => ({ segs })));
    }
    c.cut = newCut;
    c.md = md2;
  }
  c.text = text;
  const rows = c.prefix.slice();
  for (const mline of renderMarkdown(text.slice(c.cut), { ...c.md }, w)) {
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

export function createStreamRows(w: number, opts?: { firstReserve?: number }): StreamRows {
  let width = w;
  /** columns the FIRST visual row gives up for a caller-painted gutter (the
   *  [N] chip). Only the item's very first row has the chip; once that row is
   *  settled every tail line starts at the usual margin and uses full width. */
  const firstReserve = Math.max(0, opts?.firstReserve ?? 0);
  /** the chip row's wrap width — also the width a table is composed at while
   *  it opens the stream, since a table is laid out as one unit */
  const firstWidth = Math.max(4, w - firstReserve);
  let text = "";
  let settledRows: Row[] = [];
  let settledCut = 0;
  let md: MdState = { inFence: false, hadCode: false };
  /** the tail's wrapped visual lines (the tail region of `rows`) */
  let tailLines: Seg[][] = [];
  /** the parsed segments tailLines was wrapped from */
  let tailSegs: Seg[] = [];
  /** char offset (in concatenated tail seg text) at which each of the
   *  current tailLines ENDS — the reuse boundaries */
  let tailCharEnds: number[] = [];
  /** the markdown state the current tailLines were rendered under */
  let tailMd: MdState = { inFence: false, hadCode: false };

  /**
   * Settle everything up to the last newline — EXCEPT the current block when
   * it looks like a table (see holdback below). The old cut loop, verbatim,
   * plus the table holdback.
   */
  const settle = (): boolean => {
    // Collect the newly completed lines first; the cut decision needs them.
    const lines: { start: number; end: number }[] = [];
    let scan = settledCut;
    for (;;) {
      const nl = text.indexOf("\n", scan);
      if (nl < 0) break;
      lines.push({ start: scan, end: nl });
      scan = nl + 1;
    }
    if (!lines.length) return false;

    // Table holdback. A GFM table only promotes when the header row and its
    // |---| separator are visible TOGETHER (see markdown.ts), so settling the
    // lines one by one rendered each as pipe prose and the table "snapped"
    // into a box only when the node finished — in a long reply every table
    // stayed raw until the very end. Blank lines are block boundaries, so
    // hold the whole current block in the (per-feed re-rendered) tail when it
    // contains a pipe line: renderMarkdown then sees header+separator
    // together and composes the table live. The block settles as one unit
    // once its terminating blank line arrives. Fence blanks are safe: fence
    // state is carried, so a fence split at an interior blank still renders
    // as code on both sides.
    let lastBlank = -1;
    for (let i = 0; i < lines.length; i++) {
      if (text.slice(lines[i].start, lines[i].end).trim() === "") lastBlank = i;
    }
    let settleCount = lines.length;
    for (let i = lastBlank + 1; i < lines.length; i++) {
      if (text.slice(lines[i].start, lines[i].end).includes("|")) {
        settleCount = lastBlank + 1;
        break;
      }
    }
    if (settleCount === 0) return false; // the whole new region is held
    const newCut = lines[settleCount - 1].end + 1;

    // fence state advances over the SETTLED lines only
    const md2 = { ...md };
    for (let i = 0; i < settleCount; i++) {
      const t = text.slice(lines[i].start, lines[i].end);
      if (/^```/.test(t)) {
        md2.inFence = !md2.inFence;
        md2.hadCode = false;
      } else if (md2.inFence) {
        md2.hadCode = true;
      }
    }
    // a chip row that has not settled yet is the one this slice opens with;
    // its first line gives up the gutter, everything after it is full width
    const chipRow = settledRows.length === 0 && firstReserve > 0;
    let firstLine = chipRow;
    for (const mline of renderMarkdown(text.slice(settledCut, newCut - 1), md, chipRow ? firstWidth : width)) {
      for (const segs of wrapSegs(mline, width, undefined, firstLine ? { firstReserve } : undefined)) settledRows.push({ segs });
      firstLine = false;
    }
    settledCut = newCut;
    md = md2;
    return true;
  };

  const renderTail = (): void => {
    // NO empty-tail shortcut: inside an open fence renderMarkdown("") still
    // emits a gutter row ("│ "), and that row is on screen today (golden).
    const tailText = text.slice(settledCut);
    // the tail opens the item only while nothing has settled, and then its
    // first row is the chip row (a table at that position is composed narrow)
    const opensItem = settledRows.length === 0 && firstReserve > 0;
    const fresh: Seg[] = [];
    for (const mline of renderMarkdown(tailText, { ...md }, opensItem ? firstWidth : width)) fresh.push(...mline);
    if (!fresh.length) {
      // legacy: zero markdown lines (e.g. the tail is only a fence opener)
      // produce ZERO rows; the [[]] caret row comes from the EMPTY tail only.
      tailLines = tailText ? [] : [[]];
      tailCharEnds = [];
      tailSegs = [];
      tailMd = { ...md };
      return;
    }
    // Reuse boundary in CHARACTERS over the concatenated seg text: the
    // char prefix where fresh agrees with the previous tail (pure growth =
    // the whole old text). A fence-state flip invalidates everything.
    const mdSame =
      md.inFence === tailMd.inFence && md.hadCode === tailMd.hadCode && md.lang === tailMd.lang;
    let commonChars = 0;
    if (mdSame) {
      // seg-by-seg first: fully-matching leading segs cost one compare each,
      // no big string builds (the 100KB-string concat per feed showed up in
      // the profile). Only the first MISMATCHING seg pair needs a char walk.
      const common = Math.min(fresh.length, tailSegs.length);
      let i = 0;
      for (; i < common; i++) {
        const a = fresh[i];
        const b = tailSegs[i];
        if (a.t === b.t && a.fg === b.fg && a.bg === b.bg && a.bold === b.bold && a.italic === b.italic && a.strike === b.strike && a.href === b.href) {
          commonChars += a.t.length;
          continue;
        }
        // first diverging seg pair: walk the shorter text
        const n = Math.min(a.t.length, b.t.length);
        let c = 0;
        while (c < n && a.t[c] === b.t[c]) c++;
        commonChars += c;
        break;
      }
      // i === common: every shared seg matched — commonChars is the full old
      // prefix length, and the split lands in the next (new) seg
    }
    // Reuse lines that END at or before commonChars, except the previous
    // FINAL line (new text may join it).
    let reuse = 0;
    let splitBias = 0; // spaces snapped past the split point (word-boundary rule)
    if (commonChars > 0) {
      const maxReuse = tailLines.length - 1;
      // Cheap scan first: the last old line fully inside the common prefix.
      // (charAt() walks the seg list from 0 — O(segs) per call — so it runs
      // once below, not per line; per-line calls were 900*6000 ops a feed.)
      let lastLi = -1;
      for (let li = 0; li < Math.min(tailCharEnds.length, maxReuse); li++) {
        if (tailCharEnds[li] > commonChars) break;
        lastLi = li;
      }
      if (lastLi >= 0) {
        // The split must be a WORD boundary: wrapSegs breaks lines between
        // words, so rewrapping from a word boundary reproduces the full
        // wrap's lines; a mid-word or space-run boundary rewraps differently
        // (doc4). Inter-word spaces belong to NO wrapped line, so a line-end
        // offset can sit ON a space — snap forward over the run.
        let at = tailCharEnds[lastLi];
        const total = freshTextLen(fresh);
        while (at < total && charAt(fresh, at) === " ") at++;
        if (at < total && (at === 0 || charAt(fresh, at - 1) === " ")) {
          reuse = lastLi + 1;
          splitBias = at - tailCharEnds[lastLi]; // spaces the rewrap skips
        }
      }
    }
    // Split the fresh segs at the reuse boundary char: the piece before is
    // consumed by reused lines; the piece from it re-wraps. Splitting copies
    // the seg's style — wrapSegs itself splits raw segs into pieces the same
    // way, so downstream nothing can tell.
    let from = 0;
    let splitAt = -1;
    if (reuse > 0) {
      from = tailCharEnds[reuse - 1] + splitBias;
      // Never split inside a surrogate pair: if the char BEFORE `from` is a
      // high surrogate, the offset lands mid-glyph — snap forward one unit
      // (the pair then sits whole in the rewrapped piece).
      let acc0 = 0;
      for (const seg of fresh) {
        const pos = from - acc0;
        const t = seg.t;
        if (pos < t.length) {
          if (pos > 0 && t.charCodeAt(pos - 1) >= 0xd800 && t.charCodeAt(pos - 1) <= 0xdbff) from++;
          break;
        }
        acc0 += t.length;
      }
      // find the seg containing `from`
      let acc = 0;
      for (let i = 0; i < fresh.length; i++) {
        const len = fresh[i].t.length;
        if (from < acc + len) {
          splitAt = i;
          break;
        }
        acc += len;
      }
    }
    let sliced: Seg[];
    if (reuse > 0 && splitAt >= 0) {
      // acc starts at the TOTAL LENGTH of segs before splitAt — `from` is
      // absolute over the concatenated fresh text (off-by-that-prefix made
      // the piece start mid-word: golden doc4 row1 began "me" not "over")
      let acc = 0;
      for (let i = 0; i < splitAt; i++) acc += fresh[i].t.length;
      sliced = [];
      for (let i = splitAt; i < fresh.length; i++) {
        const seg = fresh[i];
        if (i === splitAt && from > acc) {
          sliced.push({ ...seg, t: seg.t.slice(from - acc) });
        } else {
          sliced.push(seg);
        }
      }
    } else {
      sliced = fresh;
    }
    tailLines = reuse > 0 ? [...tailLines.slice(0, reuse), ...wrapSegs(sliced, width)] : wrapSegs(sliced, width, undefined, opensItem ? { firstReserve } : undefined);
    // record new char ends by walking the final lines' text
    tailCharEnds = [];
    let pos = 0;
    for (const line of tailLines) {
      for (const seg of line) pos += seg.t.length;
      tailCharEnds.push(pos);
    }
    tailSegs = fresh;
    tailMd = { ...md };
  };

  function freshTextLen(segs: Seg[]): number {
    let n = 0;
    for (const s of segs) n += s.t.length;
    return n;
  }
  function charAt(segs: Seg[], pos: number): string {
    let acc = 0;
    for (const s of segs) {
      if (pos < acc + s.t.length) return s.t[pos - acc];
      acc += s.t.length;
    }
    return "";
  }

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
      tailSegs = [];
      tailCharEnds = [];
      settle();
      renderTail();
    },
  };
}

/**
 * Incremental row production for PLAIN text — the think-item body. No
 * markdown pass (thinking is shown as written), so the region model is
 * simpler than StreamRows: every COMPLETED source line is wrapped exactly
 * once and appended immutably; only the unterminated tail re-wraps per
 * feed. Each line is wrapped with keepLeadSpaces so a line-by-line wrap
 * is byte-identical to wrapping the whole text at once (a whole-wrap only
 * suppresses leading spaces on its very first output line, and the header
 * "▾ thinking\n" guarantees that first row is never a body line).
 */
export interface PlainRows {
  /** all rows so far — treat as immutable; callers never mutate */
  readonly rows: readonly Row[];
  /** Feed more text. Returns the index in `rows` where repainting must
   *  start: rows before it are untouched since the previous call. */
  feed(delta: string): { from: number };
  /** Width change: reflows everything; `rows` is rebuilt in full. */
  resize(w: number): void;
}

export function createPlainRows(w: number, style?: Partial<Seg>): PlainRows {
  const st = style ?? {};
  let width = w;
  let text = "";
  let doneRows: Row[] = []; // wrapped lines ended by a newline — immutable
  let doneChars = 0; // chars of `text` covered by doneRows
  let tailRows: Row[] = []; // re-wrap of text.slice(doneChars)

  const wrapTail = (): void => {
    const tail = text.slice(doneChars);
    if (!tail) {
      tailRows = [];
      return;
    }
    // a trailing incomplete surrogate pair cannot be wrapped yet
    const last = tail.charCodeAt(tail.length - 1);
    const safe = last >= 0xd800 && last <= 0xdbff ? tail.slice(0, -1) : tail;
    tailRows = wrapSegs([{ t: safe, ...st }], width, undefined, { keepLeadSpaces: true }).map((segs) => ({ segs }));
  };

  const k: PlainRows = {
    get rows() {
      // wrapSegs("") === [[]] — one empty row. Match it so the app-side pop
      // of a trailing empty row sees identical input either path.
      if (!text) return [{ segs: [] }];
      return doneRows.length ? [...doneRows, ...tailRows] : tailRows;
    },
    feed(delta) {
      text += delta;
      // settle: every source line terminated by a newline wraps once
      let nl: number;
      let scan = doneChars;
      for (;;) {
        nl = text.indexOf("\n", scan);
        if (nl < 0) break;
        const line = text.slice(doneChars, nl); // exclude the newline
        for (const segs of wrapSegs([{ t: line, ...st }], width, undefined, { keepLeadSpaces: true })) {
          doneRows.push({ segs });
        }
        doneChars = nl + 1;
        scan = doneChars;
      }
      wrapTail();
      return { from: doneRows.length };
    },
    resize(w2: number) {
      width = w2;
      // reflow everything from the source text
      doneRows = [];
      doneChars = 0;
      // re-settle line by line (same code path, now under the new width)
      let scan = 0;
      for (;;) {
        const nl = text.indexOf("\n", scan);
        if (nl < 0) break;
        for (const segs of wrapSegs([{ t: text.slice(scan, nl), ...st }], width, undefined, { keepLeadSpaces: true })) {
          doneRows.push({ segs });
        }
        doneChars = nl + 1;
        scan = doneChars;
      }
      wrapTail();
    },
  };
  return k;
}
