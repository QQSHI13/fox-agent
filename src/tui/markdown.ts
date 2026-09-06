// lightweight markdown -> styled segments (streaming-safe: re-parses whole buffer cheaply)
import type { Seg } from "./wrap.ts";
import { liveTheme } from "./themes.ts";
import { charWidth } from "./screen.ts";

// live theme lookups: a /theme switch recolors markdown on the next frame
const MD = liveTheme<"ACCENT" | "CODE_FG" | "HEAD" | "DIM" | "LINK">({
  ACCENT: "accent",
  CODE_FG: "ok",
  HEAD: "user",
  DIM: "hint",
  LINK: "info",
});

/**
 * Parser state that can cross a call boundary. The streaming path in the TUI
 * parses the settled prefix once and only re-parses the tail on each frame;
 * `state` is how the tail parse knows it begins inside a code fence (and
 * whether that fence has emitted any code lines yet — an empty one gets a
 * placeholder row). Callers parsing a whole document pass nothing.
 */
export interface MdState {
  inFence: boolean;
  hadCode: boolean;
}

export function renderMarkdown(src: string, state?: MdState): Seg[][] {
  const out: Seg[][] = [];
  const lines = src.split("\n");
  let i = 0;
  // local aliases; written back into `state` (if given) as the parse advances
  let inFence = state?.inFence ?? false;
  let hadCode = state?.hadCode ?? false;

  const inline = (text: string, base?: Partial<Seg>): Seg[] => {
    const segs: Seg[] = [];
    const re = /(\*\*([^*]+)\*\*|__([^_]+)__|\*([^*\s][^*]*)\*|`([^`]+)`|\[([^\]]+)\]\(([^)]+)\))/g;
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      if (m.index > last) segs.push({ t: text.slice(last, m.index), ...base });
      if (m[2] || m[3]) segs.push({ t: m[2] ?? m[3]!, bold: true, ...base });
      else if (m[4]) segs.push({ t: m[4], italic: true, ...base });
      else if (m[5]) segs.push({ t: m[5], fg: MD.CODE_FG, ...base });
      else if (m[6]) {
        segs.push({ t: m[6], fg: MD.LINK, ...base });
        segs.push({ t: ` (${m[7]})`, fg: MD.DIM, ...base });
      }
      last = re.lastIndex;
    }
    if (last < text.length) segs.push({ t: text.slice(last), ...base });
    return segs.length ? segs : [{ t: "", ...base }];
  };

  while (i < lines.length) {
    const line = lines[i];

    // inside a fence every line is literal code; the opener itself emits nothing
    if (inFence) {
      if (/^```/.test(line)) {
        inFence = false;
        if (state) {
          state.inFence = false;
          state.hadCode = false;
        }
        if (!hadCode) out.push([{ t: "│", fg: MD.CODE_FG }]);
      } else {
        hadCode = true;
        if (state) state.hadCode = true;
        out.push([{ t: "│ " + line, fg: MD.CODE_FG }]);
      }
      i++;
      continue;
    }

    if (/^```/.test(line)) {
      inFence = true;
      hadCode = false;
      if (state) {
        state.inFence = true;
        state.hadCode = false;
      }
      i++;
      continue;
    }

    const h = /^(#{1,6})\s+(.*)/.exec(line);
    if (h) {
      const styled: Seg[] = inline(h[2]).map((seg) => ({ ...seg, bold: true, fg: MD.HEAD }));
      out.push(styled);
      i++;
      continue;
    }

    if (/^\s*([-*_])\1{2,}\s*$/.test(line)) {
      out.push([{ t: "─".repeat(24), fg: MD.DIM }]);
      i++;
      continue;
    }

    const quote = /^>\s?(.*)/.exec(line);
    if (quote) {
      out.push(inline(quote[1], { italic: true, fg: MD.DIM }));
      i++;
      continue;
    }

    const ul = /^(\s*)[-*+]\s+(.*)/.exec(line);
    if (ul) {
      out.push([{ t: `${ul[1]}• `, fg: MD.ACCENT }, ...inline(ul[2])]);
      i++;
      continue;
    }

    const ol = /^(\s*)(\d+)[.)]\s+(.*)/.exec(line);
    if (ol) {
      out.push([{ t: `${ol[1]}${ol[2]}. `, fg: MD.ACCENT }, ...inline(ol[3])]);
      i++;
      continue;
    }

    // GFM table: a header row, a |---| separator, then body rows. Rendered as
    // aligned plain columns — borders would double the width cost.
    const isTableLine = (l: string) => /^\s*\|.*\|\s*$/.test(l);
    const isSep = (l: string) => /^\s*\|[\s:|-]+\|\s*$/.test(l);
    if (isTableLine(line) && i + 1 < lines.length && isSep(lines[i + 1])) {
      const rows: string[][] = [];
      while (i < lines.length && isTableLine(lines[i])) {
        if (!isSep(lines[i]))
          rows.push(lines[i].trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim()));
        i++;
      }
      const width = (s: string) => [...s].reduce((w, c) => w + charWidth(c.codePointAt(0)!), 0);
      const cols = Math.max(...rows.map((r) => r.length));
      const widths = Array.from({ length: cols }, () => 1);
      for (const r of rows) for (let c = 0; c < r.length; c++) widths[c] = Math.max(widths[c], width(r[c]));
      rows.forEach((r, ri) => {
        const segs: Seg[] = [];
        for (let c = 0; c < cols; c++) {
          const cell = r[c] ?? "";
          const cellSegs = inline(cell, ri === 0 ? { bold: true } : undefined);
          const pad = c < cols - 1 ? widths[c] - width(cell) : 0; // no trailing pad on the last column
          if (pad > 0) cellSegs.push({ t: " ".repeat(pad) });
          segs.push(...cellSegs);
          if (c < cols - 1) segs.push({ t: "  ", fg: MD.DIM });
        }
        out.push(segs);
        if (ri === 0) out.push([{ t: widths.map((w) => "─".repeat(w)).join("──"), fg: MD.DIM }]);
      });
      continue;
    }

    if (!line.trim()) {
      out.push([]);
      i++;
      continue;
    }

    // paragraph: gather until blank line
    const para = [line];
    i++;
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^(#{1,6}\s|```|>)/.test(lines[i]) &&
      !/^\s*\|.*\|\s*$/.test(lines[i]) // a table row is not a paragraph line
    )
      para.push(lines[i++]);
    for (const pl of para) out.push(inline(pl));
  }
  return out;
}
