// immediate-mode cell screen with row-diff flushing
import type { Term } from "./term.ts";

export interface Style {
  fg?: string;
  bg?: string;
  bold?: boolean;
  italic?: boolean;
}

function rgb(hex?: string): number {
  if (!hex) return 0;
  const h = hex.replace("#", "");
  return parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16) || 0;
}

export function charWidth(cp: number): number {
  if (cp === 0) return 0;
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
    (cp >= 0x20000 && cp <= 0x2fffd) ||
    (cp >= 0x30000 && cp <= 0x3fffd)
  )
    return 2;
  return 1;
}

export class Screen {
  private w = 0;
  private h = 0;
  private chars: (string | undefined)[] = [];
  private sty: Uint16Array = new Uint16Array(0);
  private prevHash: Float64Array = new Float64Array(0);
  private styles: Style[] = [];
  private styleIdx = new Map<string, number>();
  private cursorRow = -1;
  private lastSgr = "";

  constructor(private term: Term) {}

  sgr(s: Style): number {
    const key = `${s.fg ?? ""}|${s.bg ?? ""}|${s.bold ? 1 : 0}|${s.italic ? 1 : 0}`;
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
    this.sty = new Uint16Array(w * h);
    this.prevHash = new Float64Array(h).fill(NaN);
    this.cursorRow = -1;
  }

  dims() {
    return { w: this.w, h: this.h };
  }

  clear() {
    this.chars.fill(undefined);
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
    let cx = x;
    for (const ch of str) {
      const cw = charWidth(ch.codePointAt(0)!);
      if (cw === 0) continue;
      if (cx >= this.w) break;
      const i = y * this.w + cx;
      this.chars[i] = ch;
      this.sty[i] = st;
      if (cw === 2 && cx + 1 < this.w) {
        this.chars[i + 1] = "";
        this.sty[i + 1] = st;
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

  flush(): boolean {
    let dirty = false;
    let out = "";
    for (let y = 0; y < this.h; y++) {
      const hash = this.rowHash(y);
      if (hash === this.prevHash[y]) continue;
      dirty = true;
      this.prevHash[y] = hash;
      out += `\x1b[${y + 1};1H`;
      this.cursorRow = y;
      let runSgr = "";
      let line = "";
      let painted = 0;
      const base = y * this.w;
      for (let x = 0; x < this.w; x++) {
        const ch = this.chars[base + x];
        if (ch === undefined || ch === "") continue;
        const s = this.styles[this.sty[base + x]] ?? {};
        const sgr = sgrOf(s);
        if (sgr !== runSgr) {
          line += sgr;
          runSgr = sgr;
        }
        line += ch;
        painted += Math.max(1, charWidth(ch.codePointAt(0)!));
      }
      out += line;
      if (runSgr) out += "\x1b[0m";
      if (painted < this.w) out += "\x1b[K";
    }
    if (dirty) this.term.write(out);
    return dirty;
  }

  forceRepaintAll() {
    this.prevHash.fill(NaN);
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
  if (s.italic) out += "\x1b[3m";
  return out;
}

const NAMED: Record<string, number> = { black: 0, red: 1, green: 2, yellow: 3, blue: 4, magenta: 5, cyan: 6, white: 7 };
function ansiColor(name: string, bg: boolean): string {
  const base = NAMED[name];
  if (base !== undefined) return `\x1b[${bg ? 4 : 3}${base}m`;
  return `\x1b[${bg ? 48 : 38};5;${parseInt(name, 10) || 0}m`;
}
