// lightweight markdown -> styled segments (streaming-safe: re-parses whole buffer cheaply)
import type { Seg } from "./wrap.ts";
import { liveTheme } from "./themes.ts";
import { charWidth } from "./screen.ts";
import { wrapSegs } from "./wrap.ts";
import { highlightLine, diffFenceLine, jsonSegs } from "./highlight.ts";

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

export function renderMarkdown(src: string, state?: MdState, width?: number): Seg[][] {
  const out: Seg[][] = [];
  const lines = src.split("\n");
  let i = 0;
  // local aliases; written back into `state` (if given) as the parse advances
  let inFence = state?.inFence ?? false;
  let hadCode = state?.hadCode ?? false;
  let fenceLang = state?.lang ?? "";

  const inline = (text: string, base?: Partial<Seg>): Seg[] => {
    const segs: Seg[] = [];
    const re = /(\*\*([^*]+)\*\*|__([^_]+)__|\*([^*\s][^*]*)\*|`([^`]+)`|!\[([^\]]*)\]\(([^)\s]+)\)|\[([^\]]+)\]\(([^)]+)\)|~~([^~]+)~~)/g;
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      if (m.index > last) segs.push({ t: text.slice(last, m.index), ...base });
      if (m[2] || m[3]) segs.push(...inline(m[2] ?? m[3]!, { bold: true, ...base }));
      else if (m[4]) segs.push(...inline(m[4], { italic: true, ...base }));
      else if (m[5]) segs.push({ t: m[5], fg: MD.CODE_FG, ...base });
      else if (m[6] !== undefined) {
        // image: a terminal cannot show it — a dim placeholder that still
        // hyperlinks to the target so a click (or terminal link handler) opens it
        segs.push({ t: `[image: ${m[6]}]`, fg: MD.DIM, href: m[7], ...base });
      } else if (m[8]) {
        // link: label only, the URL rides in an OSC 8 hyperlink instead of
        // being printed after it
        segs.push({ t: m[8], fg: MD.LINK, href: m[9], ...base });
      } else if (m[10]) segs.push({ t: m[10], strike: true, ...base });
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
        // the block still reads as one unit. A ```diff fence colors by marker
        // (added/removed/hunk) instead of by syntax; non-marker lines fall
        // back to the plain code tint.
        let lineSegs: Seg[] | null = null;
        if (rich) {
          if (/^(diff|patch)$/i.test(fenceLang)) lineSegs = diffFenceLine(line) ?? [{ t: line }];
          else if (/^(json|jsonc)$/i.test(fenceLang)) lineSegs = jsonSegs(line);
          else lineSegs = highlightLine(line, fenceLang);
        }
        out.push(lineSegs ? [{ t: "│ ", fg: MD.CODE_FG }, ...lineSegs.map((s) => ({ fg: MD.CODE_FG, ...s }))] : [{ t: "│ " + line, fg: MD.CODE_FG }]);
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
    //
    // Outer pipes are OPTIONAL (GFM allows `a | b` / `--- | ---`), and models
    // emit that form constantly — the strict `|...|` test dropped those whole
    // tables into paragraph text. A line qualifies as a table row when it
    // contains a pipe at all; the separator line right after is what actually
    // promotes the pair into a table, so prose mentioning "a | b" stays prose.
    const isTableLine = (l: string) => l.includes("|");
    const isSep = (l: string) => {
      const t = l.trim().replace(/^\||\|$/g, "").trim();
      if (!t || !/^[\s:|-]+$/.test(t)) return false;
      return (t.match(/-/g) ?? []).length >= 3; // `--- | ---`, `|:--|:--:|`
    };
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
      const lineWidth = (segs: Seg[]) => segs.reduce((n, sg) => n + [...sg.t].reduce((w, c) => w + charWidth(c.codePointAt(0)!), 0), 0);
      const cols = Math.max(aligns.length, ...rows.map((r) => r.length));
      const widths = Array.from({ length: cols }, () => 1);
      for (const r of rows) for (let c = 0; c < r.length; c++) widths[c] = Math.max(widths[c], lineWidth([{ t: r[c] ?? "" }]));
      // shrink-to-fit: natural widths come from the widest cell, and one
      // prose-filled column made the table wider than the terminal — it ran
      // off-screen and the line wrap shredded the box into stray gutters.
      // Within a caller-supplied width, wide columns shrink (min 3) so cell
      // text wraps INSIDE the cell instead.
      const gutters = cols * 3 + 1; // │ + per-cell " x " + joins
      if (width !== undefined) {
        // -1: the caller re-wraps composed rows at width-1 (wrapSegs keeps a
        // continuation column), so a table composed to exactly `width` lost
        // its final gutter off every row
        const budget = Math.max(cols * 3, width - gutters - 1);
        while (widths.reduce((a, b) => a + b, 0) > budget) {
          const mi = widths.indexOf(Math.max(...widths));
          if (widths[mi] <= 3) break;
          widths[mi]--;
        }
      }
      // wrap one cell's styled text to its column, then pad each physical
      // line to the column width per the alignment — padding lands on plain
      // space segs so cell styling never bleeds into the gutter
      const cellLines = (cell: string, c: number, base?: Partial<Seg>): Seg[][] => {
        // +1: wrapSegs soft-wraps at width-1 (its width includes a
        // continuation affordance), so a cell exactly as wide as its column
        // would drop its last char onto a second line
        const lines = wrapSegs(inline(cell, base), widths[c] + 1);
        return lines.map((line) => {
          const pad = Math.max(0, widths[c] - lineWidth(line));
          const a = aligns[c] ?? "left";
          const lead = a === "right" ? pad : a === "center" ? Math.floor(pad / 2) : 0;
          const segs: Seg[] = [];
          if (lead) segs.push({ t: " ".repeat(lead) });
          segs.push(...line);
          const trail = pad - lead;
          if (trail > 0) segs.push({ t: " ".repeat(trail) });
          return segs;
        });
      };
      rows.forEach((r, ri) => {
        const base = ri === 0 ? { bold: true as const } : undefined;
        const cells = Array.from({ length: cols }, (_, c) => cellLines(r[c] ?? "", c, base));
        const height = Math.max(1, ...cells.map((cl) => cl.length));
        for (let li = 0; li < height; li++) {
          const segs: Seg[] = [{ t: "│ ", fg: MD.DIM }];
          cells.forEach((cl, c) => {
            // a cell shorter than the row (wrapped to fewer lines) pads its
            // slot with blanks — an unpadded fallback left the gutter hugging
            // the next divider on continuation lines
            segs.push(...(cl[li] ?? [{ t: " ".repeat(widths[c]) }]));
            segs.push({ t: c < cols - 1 ? " │ " : " │", fg: MD.DIM });
          });
          out.push(segs);
        }
        // the header rule follows the WHOLE header block, not its first line
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
      !isTableLine(lines[i]) // a table row is not a paragraph line
    )
      para.push(lines[i++]);
    for (const pl of para) out.push(inline(pl));
  }
  return out;
}


/**
 * Row classifiers for the code-fence hit test (click a code block to copy it).
 * They encode THIS module's paint conventions so app.ts never hardcodes them:
 * fence lines open with a `│ ` gutter seg in the code tint; wrap
 * continuations are code-tinted but gutter-less; checklist rows share the
 * code tint (their tick glyph) and are excluded by their line marker.
 */
export function codeGutterRow(segs: { t: string; fg?: string }[]): boolean {
  const s0 = segs[0];
  return !!s0 && s0.t.startsWith("\u2502") && s0.fg === MD.CODE_FG;
}

export function codeContRow(segs: { t: string; fg?: string }[]): boolean {
  if (codeGutterRow(segs)) return false;
  if (!segs.some((sg) => sg.fg === MD.CODE_FG)) return false;
  // checklist/bullet/ordered rows tint their marker with the code color — a
  // continuation of a wrapped code line never starts with one of these
  const t = segs[0]?.t ?? "";
  return !/^\s*[✔✘•\-*]\s/.test(t) && !/^\s*\d+\.\s/.test(t);
}
