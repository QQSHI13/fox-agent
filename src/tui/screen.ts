// immediate-mode cell screen with row-diff flushing
import type { Term } from "./term.ts";

export interface Style {
  fg?: string;
  bg?: string;
  bold?: boolean;
  italic?: boolean;
  /** strikethrough: SGR 9 on, 29 off */
  strike?: boolean;
  /** OSC 8 hyperlink target; empty string ends a hyperlink */
  href?: string;
}

function rgb(hex?: string): number {
  if (!hex) return 0;
  const h = hex.replace("#", "");
  return parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16) || 0;
}

export function charWidth(cp: number): number {
  if (cp === 0) return 0;
  if (cp >= 0x20 && cp < 0x7f) return 1; // printable ASCII fast path
  if (
    (cp >= 0x0300 && cp <= 0x036f) ||
    (cp >= 0x200b && cp <= 0x200f) ||
    (cp >= 0xfe00 && cp <= 0xfe0f) ||
    cp === 0x20d7 ||
    cp === 0xfe0f
  )
    return 0;
  if (
    (cp >= 0x1100 && cp <= 0x115f) ||
    (cp >= 0x2e80 && cp <= 0xa4cf && cp !== 0x303f) ||
    (cp >= 0xac00 && cp <= 0xd7a3) ||
    (cp >= 0xf900 && cp <= 0xfaff) ||
    (cp >= 0xfe30 && cp <= 0xfe4f) ||
    (cp >= 0xff00 && cp <= 0xff60) ||
    (cp >= 0xffe0 && cp <= 0xffe6) ||
    // true emoji planes ONLY. 0x2600-0x27BF (misc symbols/dingbats: ✗ ✆ ❯ ❨
    // …) was tried here and is WRONG: those are East-Asian-AMBIGUOUS — most
    // terminals render them narrow, so counting them wide desyncs the grid
    // (the "❯ " prompt prefix collapsed and every dock x was off by one).
    (cp >= 0x1f1e6 && cp <= 0x1f1ff) || // regional indicators (flags)
    (cp >= 0x1f300 && cp <= 0x1f5ff) || // misc symbols and pictographs
    (cp >= 0x1f600 && cp <= 0x1f64f) || // emoticons
    (cp >= 0x1f680 && cp <= 0x1f6ff) || // transport + map
    (cp >= 0x1f900 && cp <= 0x1f9ff) || // supplemental symbols
    (cp >= 0x1fa70 && cp <= 0x1faff) || // extended-A symbols
    (cp >= 0x20000 && cp <= 0x2fffd) ||
    (cp >= 0x30000 && cp <= 0x3fffd)
  )
    return 2;
  // Everything else: the tables above can never be exhaustive — the zero-width
  // gaps (combining marks past U+036F, U+FEFF, soft hyphen, VS15/17, format
  // chars) each made caret math count a cell the terminal never paints, which
  // displaced the input cursor one cell per such char. Bun.stringWidth carries
  // the real Unicode width tables; the fast paths keep the hot loops allocation-
  // free for ASCII, CJK and the common combining ranges.
  return Bun.stringWidth(String.fromCodePoint(cp));
}

export class Screen {
  // grid geometry — visible to Plane (same module, shared buffers); only
  // resize() mutates either
  w = 0;
  h = 0;
  private chars: (string | undefined)[] = [];
  private sty: Uint16Array = new Uint16Array(0);
  private prevHash: Float64Array = new Float64Array(0);
  styles: Style[] = []; // visible to Plane (same module, shared style table)
  private styleIdx = new Map<string, number>();
  /** interned id of the empty style, so cleared cells never inherit a stale one */
  private defSty = -1;
  private _lastDirty = false;
  /** href of the currently open OSC 8 hyperlink ("" = none) */
  private lastHref = "";
  /** compositing planes, keyed by name; bottom-most z composites first */
  private planes = new Map<string, Plane>();

  constructor(private term: Term) {}

  /** interned empty style — Plane uses it too (same module, shared table) */
  defaultStyle(): number {
    if (this.defSty < 0) this.defSty = this.sgr({});
    return this.defSty;
  }

  sgr(s: Style): number {
    const key = `${s.fg ?? ""}|${s.bg ?? ""}|${s.bold ? 1 : 0}|${s.italic ? 1 : 0}|${s.strike ? 1 : 0}|${s.href ?? ""}`;
    let i = this.styleIdx.get(key);
    if (i === undefined) {
      i = this.styles.push(s) - 1;
      this.styleIdx.set(key, i);
    }
    return i;
  }

  resize(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.chars = new Array(w * h).fill(undefined);
    this.sty = new Uint16Array(w * h).fill(this.defaultStyle());
    this.prevHash = new Float64Array(h).fill(NaN);
    this.lastHref = "";
    for (const p of this.planes.values()) p.realloc();
  }

  // ---- planes ----
  // Regions paint into their own cell buffers; composite() folds them into
  // the grid bottom-up. An UNDEFINED plane cell is transparent: the plane
  // below shows through. Correctness never depends on a region "clearing
  // what it painted last frame" — every plane is a complete picture of its
  // region, so one region's transitions can never wipe another's output.

  createPlane(name: string, z: number): Plane {
    const existing = this.planes.get(name);
    if (existing) return existing; // idempotent: same name, same plane
    const p = new Plane(name, z, this);
    this.planes.set(name, p);
    return p;
  }

  dropPlane(name: string): void {
    this.planes.delete(name); // gone from the next composite; grid self-heals
  }

  hasPlane(name: string): boolean {
    return this.planes.has(name);
  }

  plane(name: string): Plane | undefined {
    return this.planes.get(name);
  }

  /** all plane names (debug + plane-lifecycle sweeps) */
  planeNames(): string[] {
    return [...this.planes.keys()];
  }

  /** fold every plane into the grid, bottom-most z first; ties by creation order */
  composite(): void {
    // the grid is a PURE PRODUCT of the planes: reset it first, or cells no
    // plane covers this frame would keep the PREVIOUS composite's content —
    // the row-hash would then report "unchanged" for rows the terminal still
    // shows (scrolled-away transcript staying on screen, duplicated rows)
    // and flush's stale-tail erase would never fire (it looks for undefined
    // cells, and stale cells are not undefined — they are old content)
    this.clear();
    const sorted = [...this.planes.values()].sort((a, b) => a.z - b.z);
    for (const p of sorted) {
      const pc = p.chars;
      const ps = p.sty;
      for (let i = 0; i < pc.length; i++) {
        const ch = pc[i];
        if (ch === undefined) continue; // transparent: lower plane shows through
        this.chars[i] = ch;
        this.sty[i] = ps[i];
      }
    }
  }

  dims() {
    return { w: this.w, h: this.h };
  }

  clear() {
    this.chars.fill(undefined);
    // styles too: a cell's style must come from THIS frame's fills, or text()
    // inheriting a background would pick up one from three frames ago
    this.sty.fill(this.defaultStyle());
  }

  /** Clear rows [y0, y1) to the default style — the region-paint primitive:
   *  a region re-derives into a CLEANED range, or shrunken content leaves
   *  stale cells that the row-hash diff happily reports as "unchanged". */
  clearRows(y0: number, y1: number) {
    const lo = Math.max(0, y0);
    const hi = Math.min(this.h, y1);
    for (let y = lo; y < hi; y++) {
      const base = y * this.w;
      for (let x = 0; x < this.w; x++) {
        this.chars[base + x] = undefined;
        this.sty[base + x] = this.defaultStyle();
      }
    }
  }

  private rowHash(y: number): number {
    let h = 2166136261;
    const base = y * this.w;
    for (let x = 0; x < this.w; x++) {
      const ch = this.chars[base + x];
      h = (h ^ (ch ? ch.codePointAt(0)! : 32)) >>> 0;
      h = (h * 16777619) >>> 0;
      h = (h ^ this.sty[base + x]) >>> 0;
      h = (h * 16777619) >>> 0;
    }
    return h;
  }

  text(x: number, y: number, str: string, st: number): number {
    if (y < 0 || y >= this.h) return x;
    const want = this.styles[st] ?? {};
    let cx = x;
    for (const ch of str) {
      const cw = charWidth(ch.codePointAt(0)!);
      if (cw === 0) continue;
      if (cx >= this.w) break;
      const i = y * this.w + cx;
      // Text painted over a filled row keeps the fill's background: compositing
      // belongs in the grid, not in terminal SGR state that leaks sideways.
      let finalSt = st;
      if (!want.bg) {
        const curBg = (this.styles[this.sty[i]] ?? {}).bg;
        if (curBg) finalSt = this.sgr({ ...want, bg: curBg });
      }
      this.chars[i] = ch;
      this.sty[i] = finalSt;
      if (cw === 2 && cx + 1 < this.w) {
        this.chars[i + 1] = "";
        this.sty[i + 1] = finalSt;
        cx += 2;
      } else {
        cx += cw;
      }
    }
    return cx;
  }

  fillRow(y: number, x0: number, x1: number, st: number) {
    if (y < 0 || y >= this.h) return;
    for (let x = Math.max(0, x0); x < Math.min(this.w, x1); x++) {
      const i = y * this.w + x;
      this.chars[i] = " ";
      this.sty[i] = st;
    }
  }

  /**
   * Give cells [x0,x1) a background colour while keeping their own foreground.
   *
   * Selection highlighting needs this: `fillRow` would blank the text and a
   * single flat style index would flatten every colour in the range to one.
   * Empty cells inside the range are filled with a space so the highlight reads
   * as a continuous block rather than stopping at the last glyph — that is what
   * makes a multi-line selection look like a selection.
   */
  restyle(y: number, x0: number, x1: number, bg: string) {
    if (y < 0 || y >= this.h) return;
    for (let x = Math.max(0, x0); x < Math.min(this.w, x1); x++) {
      const i = y * this.w + x;
      const ch = this.chars[i];
      if (ch === undefined) this.chars[i] = " ";
      // the continuation cell of a wide char carries "" and must stay that way,
      // but it still needs the highlight or the block gets holes in it
      const cur = this.styles[this.sty[i]] ?? {};
      this.sty[i] = this.sgr({ ...cur, bg });
    }
  }

  flush(): boolean {
    let dirty = false;
    let out = "";
    for (let y = 0; y < this.h; y++) {
      const hash = this.rowHash(y);
      if (hash === this.prevHash[y]) continue;
      dirty = true;
      this.prevHash[y] = hash;
      out += `\x1b[${y + 1};1H`;
      let runSgr = "";
      let line = "";
      let painted = 0;
      let physX = 0; // terminal cursor column within this row (cells can be sparse!)
      let lastEmitX = -1; // x of the last cell actually written
      const base = y * this.w;
      for (let x = 0; x < this.w; x++) {
        const ch = this.chars[base + x];
        if (ch === undefined || ch === "") continue;
        // gap since last write -> two problems: (1) the cursor is NOT where
        // we need it, and (2) the skipped cells still hold STALE content from
        // earlier frames — the trailing \x1b[K only fires after the LAST cell
        // (e.g. the scrollbar thumb at W-2) and erases nothing. Clear the gap
        // now, while the cursor sits at the end of the previous content run.
        if (x !== physX) {
          if (painted < this.w) line += "\x1b[K";
          line += `\x1b[${y + 1};${x + 1}H`;
          physX = x;
        }
        const s = this.styles[this.sty[base + x]] ?? {};
        const href = s.href ?? "";
        const sgr = sgrOf(s);
        if (sgr !== runSgr || href !== this.lastHref) {
          // sgrOf only ever ADDS attributes — a style that drops bg/bold/italic
          // emits nothing for it, and the terminal would keep the old attribute
          // for the rest of the run (this leaked the selection highlight to
          // end-of-line). Reset first, then apply. An href change also closes
          // the old OSC 8 link before the new one opens — two styles can share
          // an identical SGR string yet differ only in href.
          if (this.lastHref && href !== this.lastHref) line += "\x1b]8;;\x1b\\";
          line += runSgr ? `\x1b[0m${sgr}` : sgr;
          if (href) line += `\x1b]8;;${href}\x1b\\`;
          runSgr = sgr;
          this.lastHref = href;
        }
        line += ch;
        const cw = Math.max(1, charWidth(ch.codePointAt(0)!));
        physX += cw;
        painted += cw;
        lastEmitX = x;
      }
      out += line;
      // every dirty row leaves the terminal clean: close any open hyperlink,
      // then drop SGR state — the next dirty row re-emits whatever it needs.
      // lastHref resets to match the terminal, or the next row would assume a
      // link is still open and skip its opener.
      if (this.lastHref) {
        out += "\x1b]8;;\x1b\\";
        this.lastHref = "";
      }
      if (runSgr) out += "\x1b[0m";
      // Trailing erase fires ONLY when undefined cells exist AFTER the last
      // written cell — stale content to clean. `painted < w` was wrong: on a
      // sparse row (plain text + scrollbar cell at W-1, gap undefined between)
      // it fired AFTER the scrollbar cell and erased the track/thumb we had
      // just drawn. Tool-filled rows painted [0,W-1) fully, hit painted==w,
      // skipped the K — which is why the scrollbar showed over tool rows and
      // nowhere else.
      let staleTail = false;
      for (let x = lastEmitX + 1; x < this.w; x++) {
        if (this.chars[base + x] === undefined) {
          staleTail = true;
          break;
        }
      }
      if (staleTail) out += "\x1b[K";
    }
    if (dirty) {
      this.term.write(out);
      if (process.env.FOX_AGENT_TRACE) {
        try {
          require("node:fs").appendFileSync(process.env.FOX_AGENT_TRACE, out + "\x00FLUSH\x00");
        } catch {}
      }
    }
    this._lastDirty = dirty;
    return dirty;
  }

  /** debug: dump the internal grid (chars + style ids) as one JSON line */
  dumpGrid(): string {
    const rows: string[] = [];
    for (let y = 0; y < this.h; y++) {
      let row = "";
      const base = y * this.w;
      for (let x = 0; x < this.w; x++) {
        const ch = this.chars[base + x];
        row += ch === undefined || ch === "" ? "\x01" : ch === " " ? "␣" : ch;
      }
      rows.push(row);
    }
    return rows.join("\n");
  }

  lastDirty() {
    return this._lastDirty;
  }

  forceRepaintAll() {
    this.prevHash.fill(NaN);
  }
}

/**
 * One compositing layer: a full-screen cell buffer an owner region stamps
 * complete content into every frame it changes. Shares the screen's style
 * table so style ids move between planes and the grid without translation.
 *
 * A plane cell is `undefined` until written — unwritten cells are TRANSPARENT
 * in composite, letting lower planes (ultimately the transcript) show
 * through. Opaqueness is per-cell, not per-region: a hint bar fillRows its
 * band, a queue box fills its panel, a bare overlay line covers only the
 * cells its glyphs occupy.
 */
export class Plane {
  chars: (string | undefined)[];
  sty: Uint16Array;
  /**
   * Write clip rect [x0,y0,x1,y1) — writes outside are dropped. Defaults to
   * the full screen (built-in regions own their layout); plugin regions get
   * the rect they registered so a plane can never paint outside its region,
   * however buggy its painter. The BUFFER stays full-screen either way:
   * regions paint disjoint moving bands, so per-plane sizing would realloc
   * every frame — containment is a clamp on writes, not a buffer shape.
   */
  clip: [number, number, number, number] | null = null;

  constructor(public readonly name: string, public z: number, private scr: Screen) {
    this.chars = new Array(scr.w * scr.h).fill(undefined);
    this.sty = new Uint16Array(scr.w * scr.h).fill(scr.defaultStyle());
  }

  private cx0(): number {
    return this.clip ? Math.max(0, this.clip[0]) : 0;
  }
  private cx1(): number {
    return this.clip ? Math.min(this.scr.w, this.clip[2]) : this.scr.w;
  }
  private cy0(): number {
    return this.clip ? Math.max(0, this.clip[1]) : 0;
  }
  private cy1(): number {
    return this.clip ? Math.min(this.scr.h, this.clip[3]) : this.scr.h;
  }

  /** screen dimensions changed — drop content; buffer sizes follow */
  realloc(): void {
    this.chars = new Array(this.scr.w * this.scr.h).fill(undefined);
    this.sty = new Uint16Array(this.scr.w * this.scr.h).fill(this.scr.defaultStyle());
  }

  clear(): void {
    this.chars.fill(undefined);
    this.sty.fill(this.scr.defaultStyle());
  }

  clearRows(y0: number, y1: number): void {
    const lo = Math.max(this.cy0(), y0);
    const hi = Math.min(this.cy1(), y1);
    for (let y = lo; y < hi; y++) {
      const base = y * this.scr.w;
      for (let x = 0; x < this.scr.w; x++) {
        this.chars[base + x] = undefined;
        this.sty[base + x] = this.scr.defaultStyle();
      }
    }
  }

  text(x: number, y: number, str: string, st: number): number {
    const w = this.scr.w;
    if (y < this.cy0() || y >= this.cy1()) return x;
    const want = this.scr.styles[st] ?? {};
    let cx = x;
    const xLimit = this.cx1();
    const xStart = this.cx0();
    for (const ch of str) {
      const cw = charWidth(ch.codePointAt(0)!);
      if (cw === 0) continue;
      if (cx >= xLimit) break;
      // cursor still advances left of the clip (the caller tracks position),
      // but no cell is written outside the region
      const i = y * w + cx;
      // same bg-inherit rule as the grid: text over a filled area keeps the
      // fill's background — compositing belongs in the buffer, not in
      // terminal SGR state that leaks sideways
      let finalSt = st;
      if (!want.bg) {
        const curBg = (this.scr.styles[this.sty[i]] ?? {}).bg;
        if (curBg) finalSt = this.scr.sgr({ ...want, bg: curBg });
      }
      if (cx >= xStart) {
        this.chars[i] = ch;
        this.sty[i] = finalSt;
      }
      if (cw === 2 && cx + 1 < w) {
        if (cx + 1 >= xStart) {
          this.chars[i + 1] = "";
          this.sty[i + 1] = finalSt;
        }
        cx += 2;
      } else {
        cx += cw;
      }
    }
    return cx;
  }

  fillRow(y: number, x0: number, x1: number, st: number): void {
    if (y < this.cy0() || y >= this.cy1()) return;
    const w = this.scr.w;
    for (let x = Math.max(this.cx0(), x0); x < Math.min(this.cx1(), x1); x++) {
      const i = y * w + x;
      this.chars[i] = " ";
      this.sty[i] = st;
    }
  }

  restyle(y: number, x0: number, x1: number, bg: string): void {
    if (y < this.cy0() || y >= this.cy1()) return;
    const w = this.scr.w;
    for (let x = Math.max(this.cx0(), x0); x < Math.min(this.cx1(), x1); x++) {
      const i = y * w + x;
      if (this.chars[i] === undefined) this.chars[i] = " ";
      const cur = this.scr.styles[this.sty[i]] ?? {};
      this.sty[i] = this.scr.sgr({ ...cur, bg });
    }
  }

  /** first/last row containing any defined cell — hit tests and debug */
  extent(): { y0: number; y1: number } | null {
    const w = this.scr.w;
    let y0 = -1;
    let y1 = -1;
    for (let y = 0; y < this.scr.h; y++) {
      const base = y * w;
      for (let x = 0; x < w; x++) {
        if (this.chars[base + x] !== undefined) {
          if (y0 < 0) y0 = y;
          y1 = y + 1;
          break;
        }
      }
    }
    return y0 < 0 ? null : { y0, y1 };
  }
}

/**
 * Scrollbar geometry for a transcript of `rows` lines in a viewport of `vh`.
 *
 * Single source of truth for paint() (where the thumb goes) and the mouse
 * scrub (which row maps to which scroll position) — the two used to compute
 * independently and could drift. Pure so it can be tested without a terminal.
 */
export interface ScrollbarGeom {
  showing: boolean;
  /** thumb top row (0-based, within the viewport) */
  ty: number;
  /** thumb height in rows (>= 1) */
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
 * Inverse of scrollbarGeom for the mouse: a press at viewport row `y` maps to
 * a scroll offset. Only meaningful when showing; returns 0 otherwise.
 */
export function scrollbarScrollTop(rows: number, vh: number, y: number): number {
  const g = scrollbarGeom(rows, vh, 0);
  if (!g.showing || rows <= vh) return 0;
  return Math.round((Math.max(0, Math.min(vh - 1, y)) / Math.max(1, vh - 1)) * (rows - vh));
}

function sgrOf(s: Style): string {
  let out = "";
  if (s.fg && s.fg.startsWith("#")) {
    const v = rgb(s.fg);
    out += `\x1b[38;2;${(v >> 16) & 255};${(v >> 8) & 255};${v & 255}m`;
  } else if (s.fg) {
    out += ansiColor(s.fg, false);
  }
  if (s.bg && s.bg.startsWith("#")) {
    const v = rgb(s.bg);
    out += `\x1b[48;2;${(v >> 16) & 255};${(v >> 8) & 255};${v & 255}m`;
  } else if (s.bg) {
    out += ansiColor(s.bg, true);
  }
  if (s.bold) out += "\x1b[1m";
  if (s.italic) out += "\x1b[3m";
  if (s.strike) out += "\x1b[9m";
  return out;
}

const NAMED: Record<string, number> = { black: 0, red: 1, green: 2, yellow: 3, blue: 4, magenta: 5, cyan: 6, white: 7 };
function ansiColor(name: string, bg: boolean): string {
  const base = NAMED[name];
  if (base !== undefined) return `\x1b[${bg ? 4 : 3}${base}m`;
  return `\x1b[${bg ? 48 : 38};5;${parseInt(name, 10) || 0}m`;
}
