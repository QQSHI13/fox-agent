// styled text segments + width-aware word wrapping
import { charWidth } from "./screen.ts";

export interface Seg {
  t: string;
  fg?: string;
  bg?: string;
  bold?: boolean;
  italic?: boolean;
}

export function segWidth(s: string): number {
  let w = 0;
  for (const ch of s) w += charWidth(ch.codePointAt(0)!);
  return w;
}

export function wrapSegs(segs: Seg[], width: number): Seg[][] {
  if (width < 4) width = 4;
  const out: Seg[][] = [];
  let line: Seg[] = [];
  let lineW = 0;

  const push = (seg: Seg) => {
    line.push(seg);
    lineW += segWidth(seg.t);
  };
  const newline = () => {
    out.push(line);
    line = [];
    lineW = 0;
  };

  for (const raw of segs) {
    const parts = raw.t.split(/(\n| +)/);
    for (const part of parts) {
      if (!part) continue;
      if (part === "\n") {
        newline();
        continue;
      }
      if (/^ +$/.test(part)) {
        const room = width - 1 - lineW;
        const sp = Math.min(part.length, Math.max(0, room));
        if (sp > 0 && !(line.length === 0 && out.length === 0)) {
          push({ ...raw, t: " ".repeat(sp) });
        } else if (sp > 0 && line.length === 0) {
          push({ ...raw, t: " ".repeat(sp) });
        }
        continue;
      }
      let word = part;
      for (;;) {
        const ww = segWidth(word);
        if (lineW + ww <= width - 1) {
          push({ ...raw, t: word });
          break;
        }
        if (line.length === 0) {
          // lone oversized word: fill the line then continue
          let take = "";
          let tw = 0;
          for (const ch of word) {
            const cw = charWidth(ch.codePointAt(0)!);
            if (tw + cw > width - 1) break;
            take += ch;
            tw += cw;
          }
          if (!take) break;
          push({ ...raw, t: take });
          newline();
          word = word.slice(take.length);
          if (!word) break;
          continue;
        }
        newline();
      }
    }
  }
  if (line.length || !out.length) out.push(line);
  return out;
}
