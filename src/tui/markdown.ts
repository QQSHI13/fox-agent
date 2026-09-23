// lightweight markdown -> styled segments (streaming-safe: re-parses whole buffer cheaply)
import type { Seg } from "./wrap.ts";
import { liveTheme } from "./themes.ts";
import { charWidth } from "./screen.ts";
import { highlightLine } from "./highlight.ts";

// live theme lookups: a /theme switch recolors markdown on the next frame
const MD = liveTheme<"ACCENT" | "CODE_FG" | "HEAD" | "DIM" | "LINK">({
  ACCENT: "accent",
  CODE_FG: "ok",
  HEAD: "user",
  DIM: "hint",
  LINK: "info",
});

/**
 * Rich rendering mode (config `tuiRich`, default off): code fences get
 * per-token syntax tinting instead of one flat color.
 */
let rich = false;
export function setRichMarkdown(on: boolean): void {
  rich = on;
}

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
  /** language tag from the fence opener, for rich syntax tinting */
  lang?: string;
}

export function renderMarkdown(src: string, state?: MdState): Seg[][] {
  const out: Seg[][] = [];
  const lines = src.split("\n");
  let i = 0;
  // local aliases; written back into `state` (if given) as the parse advances
  let inFence = state?.inFence ?? false;
  let hadCode = state?.hadCode ?? false;
  let fenceLang = state?.lang ?? "";

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
          state.lang = "";
        }
        if (!hadCode) out.push([{ t: "│", fg: MD.CODE_FG }]);
      } else {
        hadCode = true;
        if (state) state.hadCode = true;
        // rich mode tints tokens; the gutter bar keeps the flat code color so
        // the block still reads as one unit
        out.push(rich ? [{ t: "│ ", fg: MD.CODE_FG }, ...highlightLine(line, fenceLang).map((s) => ({ fg: MD.CODE_FG, ...s }))] : [{ t: "│ " + line, fg: MD.CODE_FG }]);
      }
      i++;
      continue;
    }

    if (/^```/.test(line)) {
      inFence = true;
      hadCode = false;
      fenceLang = /^\s*```(\S*)/.exec(line)?.[1] ?? "";
      if (state) {
        state.inFence = true;
        state.hadCode = false;
        state.lang = fenceLang;
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
      // GFM task list: [x] done (✔ + receded), [~] in progress (▸ + bold),
      // [ ] pending (☐). The todo tool emits exactly this syntax, so agent
      // task lists read as status, not punctuation.
      const task = /^\[(.)\]\s+(.*)/.exec(ul[2]);
      if (task) {
        const mark = task[1].toLowerCase();
        const content = task[2];
        if (mark === "x") {
          out.push([{ t: `${ul[1]}✔ `, fg: MD.CODE_FG }, ...inline(content, { fg: MD.DIM })]);
        } else if (mark === "~") {
          out.push([{ t: `${ul[1]}▸ `, fg: MD.ACCENT }, ...inline(content, { bold: true })]);
        } else {
          out.push([{ t: `${ul[1]}☐ `, fg: MD.DIM }, ...inline(content)]);
        }
        i++;
        continue;
      }
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
    // a bordered box (│ / ├─┼─┤) with per-column alignment from the separator
    // row (:--- left, :---: center, ---: right) — the old borderless columns
    // collapsed into unreadable soup on more than two columns.
    const isTableLine = (l: string) => /^\s*\|.*\|\s*$/.test(l);
    const isSep = (l: string) => /^\s*\|[\s:|-]+\|\s*$/.test(l);
    const splitRow = (l: string) => l.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
    if (isTableLine(line) && i + 1 < lines.length && isSep(lines[i + 1])) {
      const aligns = splitRow(lines[i + 1]).map((cell) => {
        const left = cell.startsWith(":");
        const right = cell.endsWith(":");
        return left && right ? "center" : right ? "right" : "left";
      });
      const rows: string[][] = [];
      while (i < lines.length && isTableLine(lines[i])) {
        if (!isSep(lines[i])) rows.push(splitRow(lines[i]));
        i++;
      }
      const width = (s: string) => [...s].reduce((w, c) => w + charWidth(c.codePointAt(0)!), 0);
      const cols = Math.max(aligns.length, ...rows.map((r) => r.length));
      const widths = Array.from({ length: cols }, () => 1);
      for (const r of rows) for (let c = 0; c < r.length; c++) widths[c] = Math.max(widths[c], width(r[c]));
      const padCell = (cell: string, w: number, align: string): string => {
        const pad = Math.max(0, w - width(cell));
        if (align === "right") return " ".repeat(pad) + cell;
        if (align === "center") {
          const l = Math.floor(pad / 2);
          return " ".repeat(l) + cell + " ".repeat(pad - l);
        }
        return cell + " ".repeat(pad);
      };
      rows.forEach((r, ri) => {
        // padding is applied to the plain cell first so inline styling
        // (bold header, `code`) never inherits into the gutter
        const cells = Array.from({ length: cols }, (_, c) => padCell(r[c] ?? "", widths[c], aligns[c] ?? "left"));
        const segs: Seg[] = [{ t: "│ ", fg: MD.DIM }];
        cells.forEach((cell, c) => {
          segs.push(...inline(cell, ri === 0 ? { bold: true } : undefined));
          segs.push({ t: c < cols - 1 ? " │ " : " │", fg: MD.DIM });
        });
        out.push(segs);
        if (ri === 0) out.push([{ t: "├" + widths.map((w) => "─".repeat(w + 2)).join("┼") + "┤", fg: MD.DIM }]);
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
