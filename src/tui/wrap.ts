// styled text segments + width-aware word wrapping
import { charWidth } from "./screen.ts";

export interface Seg {
  t: string;
  fg?: string;
  bg?: string;
  bold?: boolean;
  italic?: boolean;
  /** strikethrough (~~text~~) — SGR 9/29 at flush time */
  strike?: boolean;
  /** hyperlink target: rendered as an OSC 8 hyperlink, never printed as text */
  href?: string;
}

export function segWidth(s: string): number {
  return Bun.stringWidth(s);
}

/**
 * Wrap `segs` to visual lines (greedy, width-aware).
 *
 * `rawEnds` (optional) records, per output line, how many INPUT segs were
 * fully consumed by the time the line ENDED — a line may START mid-seg
 * (long segs split across lines), so a line's raw range is
 * [prevEnd, rawEnds[i]) in input-seg units plus possibly a prefix of
 * rawSegs[prevEnd]. Callers using ranges for incremental re-wrap must only
 * reuse lines whose range ENDS at a raw boundary (rawEnds[i] > rawEnds[i-1]
 * means this line finished a seg; ending mid-seg is fine as long as the
 * NEXT line starts at the same raw index — see rows.ts).
 */
export function wrapSegs(segs: Seg[], width: number, rawEnds?: number[], opts?: { keepLeadSpaces?: boolean }): Seg[][] {
  if (width < 4) width = 4;
  // per-line callers (the think kernel wraps one source line at a time) must
  // see the same rule a whole-text wrap applies to every line AFTER the first:
  // leading spaces are kept. Whole-text wraps keep the default — spaces at the
  // very start of the output are layout noise and stay suppressed.
  const leadKept = !!opts?.keepLeadSpaces;
  const out: Seg[][] = [];
  let line: Seg[] = [];
  let lineW = 0;
  let rawIdx = 0; // input segs fully consumed so far
  let lastRawEnd = 0; // raw segs consumed by PREVIOUS completed lines

  const push = (seg: Seg) => {
    line.push(seg);
    lineW += segWidth(seg.t);
  };
  const newline = () => {
    out.push(line);
    if (rawEnds) rawEnds.push(rawIdx);
    lastRawEnd = rawIdx;
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
        if (sp > 0 && (leadKept || line.length > 0 || out.length > 0)) {
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
    rawIdx++; // this input seg is fully distributed (possibly across lines)
  }
  if (line.length || !out.length) {
    out.push(line);
    if (rawEnds) rawEnds.push(rawIdx);
  }
  return out;
}
