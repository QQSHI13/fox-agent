/**
 * Push-based compositor.
 *
 * Owns the one shared cell grid every panel writes into. There are no layers
 * and no merge step: a panel writes its content (clipped to its rect) whenever
 * that content changes — an event handler, a stream callback, a keystroke —
 * and the frame loop only flushes the dirty rows to the terminal. Nothing in
 * the frame path calls panel code.
 *
 * The thing that made the old pull model freeze: the transcript re-wrap
 * (renderMarkdown + wrapCodeAware) ran INSIDE computeFrame, which the frame
 * called synchronously. One slow derive blocked every other panel. Here the
 * re-wrap happens in the transcript's own push function, off the frame path;
 * between its chunks the event loop runs, flush() fires, and the spinner,
 * dock, floats and overlay stay live from the last rows they pushed.
 *
 * Panels share one vertical budget, so a small amount of geometry is shared:
 * the dock owns inputRows/shownCount/inputTop, the transcript owns vh/scroll,
 * the floats own queueH. When one changes, the coordinator recomputes the
 * derived fields and notifies the panels that depend on them, so they can
 * re-push at their new positions. The coordinator is pure integer math — it is
 * NOT a panel draw and never calls panel paint code.
 */
import type { Term } from "./term.ts";
import { charWidth, type Style } from "./screen.ts";

export type { Style };

/** One panel's write surface: clipped to its rect on the shared grid. */
export interface PanelWriter {
  text(x: number, y: number, str: string, st: number): number;
  fillRow(y: number, x0: number, x1: number, st: number): void;
  restyle(y: number, x0: number, x1: number, bg: string): void;
  clearRows(y0: number, y1: number): void;
}

/** Shared geometry. One record, owned cooperatively, read by all panels. */
export interface Geometry {
  W: number;
  H: number;
  /** dock-owned */
  inputRows: number;
  shownCount: number;
  inputTop: number;
  firstShown: number;
  /** transcript-owned */
  vh: number;
  total: number;
  scrollTop: number;
  stick: boolean;
  /** floats-owned */
  queueH: number;
}

export type GeometryListener = (changed: Partial<Geometry>) => void;

export class Compositor {
  w = 0;
  h = 0;
  private chars: (string | undefined)[] = [];
  private sty: Uint16Array = new Uint16Array(0);
  private prevHash: Float64Array = new Float64Array(0);
  private dirtyRows: Uint8Array = new Uint8Array(0);

  styles: Style[] = [];
  private styleIdx = new Map<string, number>();
  private defSty = -1;
  private _lastDirty = false;
  private lastHref = "";

  /** geometry + who listens for changes to which fields */
  geom: Geometry = {
    W: 0, H: 0,
    inputRows: 1, shownCount: 1, inputTop: 0, firstShown: 0,
    vh: 0, total: 0, scrollTop: 0, stick: true,
    queueH: 0,
  };
  private listeners: { fields: (keyof Geometry)[]; fn: GeometryListener }[] = [];
  private inFlush = false;

  /** Per-region clipped writers into the ONE shared grid. There is no separate
   * plane buffer and no composite() merge: a plane writes straight to the grid,
   * clipped to its rect, so a region physically cannot paint outside itself and
   * the frame loop only flushes. `composite()` remains as a no-op so the call
   * sites read honestly while the merge step is gone. */
  private planes = new Map<string, { z: number; rect: [number, number, number, number] }>();

  constructor(private term: Term) {}

  createPlane(name: string, z: number): PanelWriter & { clip: [number, number, number, number] } {
    const entry = { z, rect: [0, 0, this.w, this.h] as [number, number, number, number] };
    this.planes.set(name, entry);
    const self = this;
    const pw: PanelWriter & { clip: [number, number, number, number] } = {
      get clip() { return entry.rect; },
      set clip(r: [number, number, number, number]) { entry.rect = r; },
      text(x, y, str, st) { const [px, py] = [entry.rect[0] + x, entry.rect[1] + y]; return px < entry.rect[2] && py < entry.rect[3] ? self.text(px, py, str, st) : x; },
      fillRow(y, a, b, st) { self.fillRow(entry.rect[1] + y, entry.rect[0] + a, entry.rect[0] + b, st); },
      restyle(y, a, b, bg) { self.restyle(entry.rect[1] + y, entry.rect[0] + a, entry.rect[0] + b, bg); },
      clearRows(a, b) { self.clearRows(entry.rect[1] + a, entry.rect[1] + b); },
    };
    return pw;
  }
  dropPlane(name: string): void { this.planes.delete(name); }
  planeNames(): string[] { return [...this.planes.keys()]; }
  /** No merge: the grid already holds every region's clipped writes. Kept so the
   * frame loop's structure is honest about what used to happen here. */
  composite(): void {}
  forceRepaintAll(): void { this.prevHash.fill(NaN); this.markAllDirty(); }
  clear(): void { this.clearCells(); this.markAllDirty(); }
  dumpGrid(): string {
    let out = "";
    for (let y = 0; y < this.h; y++) {
      let line = "";
      for (let x = 0; x < this.w; x++) line += this.chars[y * this.w + x] ?? " ";
      out += line + "\n";
    }
    return out;
  }

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
    this.w = w; this.h = h;
    this.chars = new Array(w * h).fill(undefined);
    this.sty = new Uint16Array(w * h).fill(this.defaultStyle());
    this.prevHash = new Float64Array(h).fill(NaN);
    this.dirtyRows = new Uint8Array(h).fill(1);
    this.geom.W = w; this.geom.H = h;
    this.lastHref = "";
    this.notifyGeometry({ W: w, H: h });
  }

  markRowDirty(y: number): void {
    if (y >= 0 && y < this.h) this.dirtyRows[y] = 1;
  }
  markAllDirty(): void {
    this.dirtyRows.fill(1);
  }

  /** Register a panel to be told when specific geometry fields change. */
  onGeometry(fields: (keyof Geometry)[], fn: GeometryListener): void {
    this.listeners.push({ fields, fn });
  }

  /** Update geometry and notify listeners whose watched fields moved. */
  pushGeometry(patch: Partial<Geometry>): void {
    const changed: Partial<Geometry> = {};
    for (const k of Object.keys(patch) as (keyof Geometry)[]) {
      if (this.geom[k] !== patch[k]) {
        (changed as any)[k] = patch[k];
        (this.geom as any)[k] = patch[k];
      }
    }
    if (Object.keys(changed).length) this.notifyGeometry(changed);
  }

  private notifyGeometry(changed: Partial<Geometry>): void {
    for (const l of this.listeners) {
      if (l.fields.some((f) => f in changed)) {
        try {
          l.fn(changed);
        } catch {
          /* a listener that throws must not break the others */
        }
      }
    }
  }

  /** A clipped write surface for one panel's rect. */
  panelWriter(x0: number, y0: number, x1: number, y1: number): PanelWriter {
    const self = this;
    return {
      text(x, y, str, st) {
        return self.text(x0 + x, y0 + y, str, st);
      },
      fillRow(y, a, b, st) {
        self.fillRow(y0 + y, x0 + a, x0 + b, st);
      },
      restyle(y, a, b, bg) {
        self.restyle(y0 + y, x0 + a, x0 + b, bg);
      },
      clearRows(a, b) {
        self.clearRows(y0 + a, y0 + b);
      },
    };
  }

  /** The whole screen as a writer (for panels that span it, e.g. status). */
  fullWriter(): PanelWriter {
    const self = this;
    return {
      text(x, y, str, st) { return self.text(x, y, str, st); },
      fillRow(y, a, b, st) { self.fillRow(y, a, b, st); },
      restyle(y, a, b, bg) { self.restyle(y, a, b, bg); },
      clearRows(a, b) { self.clearRows(a, b); },
    };
  }

  text(x: number, y: number, str: string, st: number): number {
    if (y < 0 || y >= this.h) return x;
    const want = this.styles[st] ?? {};
    let cx = x;
    let wrote = false;
    for (const ch of str) {
      const cw = charWidth(ch.codePointAt(0)!);
      if (cw === 0) continue;
      if (cx >= this.w) break;
      const i = y * this.w + cx;
      let finalSt = st;
      if (!want.bg) {
        const curBg = (this.styles[this.sty[i]] ?? {}).bg;
        if (curBg) finalSt = this.sgr({ ...want, bg: curBg });
      }
      this.chars[i] = ch;
      this.sty[i] = finalSt;
      wrote = true;
      if (cw === 2 && cx + 1 < this.w) {
        this.chars[i + 1] = "";
        this.sty[i + 1] = finalSt;
        cx += 2;
      } else {
        cx += cw;
      }
    }
    if (wrote) this.dirtyRows[y] = 1;
    return cx;
  }

  fillRow(y: number, x0: number, x1: number, st: number) {
    if (y < 0 || y >= this.h) return;
    const lo = Math.max(0, x0);
    const hi = Math.min(this.w, x1);
    if (hi <= lo) return;
    for (let x = lo; x < hi; x++) {
      const i = y * this.w + x;
      this.chars[i] = " ";
      this.sty[i] = st;
    }
    this.dirtyRows[y] = 1;
  }

  restyle(y: number, x0: number, x1: number, bg: string) {
    if (y < 0 || y >= this.h) return;
    const lo = Math.max(0, x0);
    const hi = Math.min(this.w, x1);
    if (hi <= lo) return;
    for (let x = lo; x < hi; x++) {
      const i = y * this.w + x;
      const ch = this.chars[i];
      if (ch === undefined) this.chars[i] = " ";
      const cur = this.styles[this.sty[i]] ?? {};
      this.sty[i] = this.sgr({ ...cur, bg });
    }
    this.dirtyRows[y] = 1;
  }

  clearRows(y0: number, y1: number) {
    const lo = Math.max(0, y0);
    const hi = Math.min(this.h, y1);
    for (let y = lo; y < hi; y++) {
      const base = y * this.w;
      for (let x = 0; x < this.w; x++) {
        this.chars[base + x] = undefined;
        this.sty[base + x] = this.defaultStyle();
      }
      this.dirtyRows[y] = 1;
    }
  }

  private clearCells(): void {
    this.chars.fill(undefined);
    this.sty.fill(this.defaultStyle());
  }

  private rowHash(y: number): number {
    const base = y * this.w;
    let h = 0;
    for (let x = 0; x < this.w; x++) {
      const ch = this.chars[base + x];
      if (ch !== undefined) h = ((h * 31 + ch.charCodeAt(0)) | 0) >>> 0;
      const s = this.sty[base + x];
      h = ((h * 31 + s) | 0) >>> 0;
    }
    return h || 1;
  }

  flush(): boolean {
    if (this.inFlush) return this._lastDirty;
    this.inFlush = true;
    try {
      let dirty = false;
      let out = "";
      for (let y = 0; y < this.h; y++) {
        if (!this.dirtyRows[y]) continue;
        this.dirtyRows[y] = 0;
        const hash = this.rowHash(y);
        if (hash === this.prevHash[y]) continue;
        dirty = true;
        this.prevHash[y] = hash;
        out += `\x1b[${y + 1};1H`;
        let runSgr = "";
        let line = "";
        let painted = 0;
        let physX = 0;
        const base = y * this.w;
        for (let x = 0; x < this.w; x++) {
          const ch = this.chars[base + x];
          if (ch === undefined || ch === "") continue;
          if (x !== physX) {
            if (painted < this.w) {
              if (runSgr) {
                if (this.lastHref) { line += "\x1b]8;;\x1b\\"; this.lastHref = ""; }
                line += "\x1b[0m";
                runSgr = "";
              }
              line += "\x1b[K";
            }
            line += `\x1b[${y + 1};${x + 1}H`;
            physX = x;
          }
          const s = this.styles[this.sty[base + x]] ?? {};
          const href = s.href ?? "";
          const sgr = sgrOf(s);
          if (sgr !== runSgr || href !== this.lastHref) {
            if (this.lastHref && href !== this.lastHref) line += "\x1b]8;;\x1b\\";
            line += runSgr ? `\x1b[0m${sgr}` : sgr;
            if (href) line += `\x1b]8;;${href}\x1b\\`;
            runSgr = sgr;
            this.lastHref = href;
          }
          line += ch;
          physX = x + (ch.length > 1 ? 2 : 1);
          painted = physX;
        }
        if (this.lastHref) { line += "\x1b]8;;\x1b\\"; this.lastHref = ""; }
        if (painted < this.w) line += "\x1b[0m\x1b[K";
        out += line;
      }
      if (out) this.term.write(out);
      this._lastDirty = dirty;
      return dirty;
    } finally {
      this.inFlush = false;
    }
  }

  lastDirty(): boolean {
    return this._lastDirty;
  }
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
  if (s.faint) out += "\x1b[2m";
  if (s.italic) out += "\x1b[3m";
  if (s.strike) out += "\x1b[9m";
  return out;
}

function rgb(hex?: string): number {
  if (!hex) return 0;
  const h = hex.replace("#", "");
  return parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16) || 0;
}

const NAMED: Record<string, number> = { black: 0, red: 1, green: 2, yellow: 3, blue: 4, magenta: 5, cyan: 6, white: 7 };
function ansiColor(name: string, bg: boolean): string {
  const base = NAMED[name];
  if (base !== undefined) return `\x1b[${bg ? 4 : 3}${base}m`;
  return `\x1b[${bg ? 48 : 38};5;${parseInt(name, 10) || 0}m`;
}
