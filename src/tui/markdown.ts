// lightweight markdown -> styled segments (streaming-safe: re-parses whole buffer cheaply)
import type { Seg } from "./wrap.ts";
import { liveTheme } from "./themes.ts";
import { charWidth } from "./screen.ts";
import { wrapSegs } from "./wrap.ts";
import { highlightBlockRich, diffFenceLine, jsonSegs } from "./highlight.ts";

// live theme lookups: a /theme switch recolors markdown on the next frame
const MD = liveTheme<"ACCENT" | "CODE_FG" | "HEAD" | "DIM" | "LINK">({
  ACCENT: "accent",
  CODE_FG: "ok",
  HEAD: "user",
  DIM: "hint",
  LINK: "info",
});

/**
 * Grammar highlighting is always on (there is no "rich" toggle): code fences
 * get per-token syntax tinting (Shiki), falling back per line to the fast
 * diff/json/regex paths while the async block tokenization is still running.
 */

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
  // buffered body lines of the fence currently being parsed; flushed as one
  // block (for grammar highlighting) when the closer is seen
  let fenceBody: string[] = [];

  // Render the buffered fence body. Grammar highlighting tokenizes the WHOLE
  // block at once (per-line tokenizing starves Shiki of context and collapses
  // each line to one color); while that async tokenization is still running we
  // so a frame never blocks on grammar load. diff/json keep their dedicated
  // paths even after the block cache warms; other languages show flat until the
  // grammar tokenizes (the regex fallback was removed — Shiki is the one path).
  const flushFence = (): void => {
    const block = highlightBlockRich(fenceLang, fenceBody.join("\n"));
    for (let li = 0; li < fenceBody.length; li++) {
      const body = fenceBody[li];
      let lineSegs: Seg[] | null = block?.[li] ?? null;
      if (!lineSegs) {
        if (/^(diff|patch)$/i.test(fenceLang)) lineSegs = diffFenceLine(body) ?? [{ t: body }];
        else if (/^(json|jsonc)$/i.test(fenceLang)) lineSegs = jsonSegs(body);
      }
      out.push(lineSegs ? [{ t: "│ ", fg: MD.CODE_FG }, ...lineSegs.map((s) => ({ fg: MD.CODE_FG, ...s }))] : [{ t: "│ " + body, fg: MD.CODE_FG }]);
    }
  };

  // GFM footnotes: an inline `[^id]` becomes a small dim superscript-style
  // reference; a `[^id]: body` line at the start of a line becomes a dim
  // definition. Terminal can't do real superscript, so the marker renders as
  // a receded `[id]`.
  const FN_REF = /\[\^([^\]]+)\]/g;
  const FN_DEF = /^\[\^([^\]]+)\]:\s*(.*)/;

  const inline = (text: string, base?: Partial<Seg>): Seg[] => {
    const segs: Seg[] = [];
    // Ordered most-delimiter-first so `***` wins over `**`/`*` and `___` over
    // `__`/`_`. Double/triple content may contain SINGLE inner delimiters
    // (`\*(?!\*)` = a star not followed by another) so `**foo *bar* baz`**
    // nests — `[^*]+` used to reject any inner star, so nesting leaked the raw
    // `**` and half-matched a stray italic from the second star (the "some
    // highlights work, some leak asterisks" report). Lazy `+?` finds the
    // shortest close, recursion styles the inner span.
    // `_` delimiters only emphasize at a WORD boundary (lookaround requires
    // non-word neighbors, `[\p{L}\p{N}_]` so Unicode letters like Cyrillic
    // count too) — CommonMark's flanking rule: an intraword `_` run can't
    // open or close emphasis (rules for `_` are stricter than for `*`), so
    // snake_case like MAX_BG_TASKS_PER_SESSION or a__b__c renders literal
    // instead of sprouting spurious emphasis. `*` still emphasizes mid-word
    // (foo*bar*baz). `_` CONTENT may span inner inert runs (`_+(?!_)` = a run
    // of underscores that isn't the closing delimiter), so the spec's
    // `_foo_bar_baz_` -> <em>foo_bar_baz</em> and
    // `__foo__bar__baz__` -> <strong>foo__bar__baz</strong> examples hold; a
    // lone inner `_` never matches as a delimiter (the lookarounds reject
    // alphanumeric neighbors), so the run is inert text inside the span.
    // Divergence from the spec's delimiter-stack algorithm: the single-`*`
    // span is greedy, so sibling emphasis like `*foo *bar**` doesn't nest
    // (the first `*` closes at the last one rather than pairing inward).
    const re = /(\*\*\*((?:[^*]|\*(?!\*))+?)\*\*\*|(?<![\p{L}\p{N}_])___((?:[^_]|_(?!__))+?)___(?![\p{L}\p{N}_])|\*\*((?:[^*]|\*(?!\*))+?)\*\*|(?<![\p{L}\p{N}_])__((?:[^_]|_(?!_))+?)__(?![\p{L}\p{N}_])|\*([^*\s][^*]*)\*|(?<![\p{L}\p{N}_])_((?:[^_]|_(?!_))+?)_(?![\p{L}\p{N}_])|`([^`]+)`|!\[([^\]]*)\]\(([^)\s]+)\)|\[([^\]]+)\]\(([^)\s]+)\)|~~([^~]+)~~)/gu;
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      if (m.index > last) segs.push({ t: text.slice(last, m.index), ...base });
      if (m[2] !== undefined || m[3] !== undefined) {
        // ***bold italic*** / ___bold italic___: recurse on the inner text so
        // nested inline (code, links) still parses, then apply both styles
        segs.push(...inline(m[2] ?? m[3]!, { ...base, bold: true, italic: true }));
      } else if (m[4] !== undefined || m[5] !== undefined) {
        segs.push(...inline(m[4] ?? m[5]!, { ...base, bold: true }));
      } else if (m[6] !== undefined) segs.push(...inline(m[6], { ...base, italic: true }));
      else if (m[7] !== undefined) segs.push(...inline(m[7], { ...base, italic: true }));
      else if (m[8] !== undefined) segs.push({ t: m[8], fg: MD.CODE_FG, ...base });
      else if (m[9] !== undefined) {
        // image: a terminal cannot show it — a dim placeholder that still
        // hyperlinks to the target so a click (or terminal link handler) opens it
        segs.push({ t: `[image: ${m[9]}]`, fg: MD.DIM, href: m[10], ...base });
      } else if (m[11] !== undefined) {
        // link: the label is parsed for inline formatting (bold/code/italic)
        // and tinted as a link; the URL rides in an OSC 8 hyperlink, never
        // printed — so [a `b` c](url) shows a styled label, not raw markdown
        segs.push(...inline(m[11], { ...base, fg: MD.LINK, href: m[12] }));
      } else if (m[13] !== undefined) segs.push(...inline(m[13], { ...base, strike: true }));
      last = re.lastIndex;
    }
    if (last < text.length) segs.push({ t: text.slice(last), ...base });
    // Footnote references `[^id]` become a receded superscript-style marker.
    // Post-pass over the produced segs (skipping link labels, which already
    // resolved their brackets) so a bare [^1] anywhere in prose is caught.
    if (text.includes("[^")) {
      const expanded: Seg[] = [];
      for (const sg of segs) {
        if (!sg.href && sg.t.includes("[^")) {
          FN_REF.lastIndex = 0;
          let lm: RegExpExecArray | null;
          let llast = 0;
          let hit = false;
          while ((lm = FN_REF.exec(sg.t))) {
            hit = true;
            if (lm.index > llast) expanded.push({ ...sg, t: sg.t.slice(llast, lm.index) });
            expanded.push({ t: `[${lm[1]}]`, fg: MD.DIM, italic: true });
            llast = FN_REF.lastIndex;
          }
          if (hit && llast < sg.t.length) expanded.push({ ...sg, t: sg.t.slice(llast) });
          if (!hit) expanded.push(sg);
        } else expanded.push(sg);
      }
      return expanded.length ? expanded : segs;
    }
    return segs.length ? segs : [{ t: "", ...base }];
  };

  while (i < lines.length) {
    const line = lines[i];

    // inside a fence every line is literal code; the opener itself emits nothing.
    // Shiki tokenizes the WHOLE block at once (per-line tokenizing starves it of
    // context and collapses each line to one color), so the body lines are
    // buffered here and flushed as one block when the closer is seen.
    if (inFence) {
      if (/^```/.test(line)) {
        inFence = false;
        if (state) {
          state.inFence = false;
          state.hadCode = false;
          state.lang = "";
        }
        if (!hadCode) {
          out.push([{ t: "│", fg: MD.CODE_FG }]);
        } else if (fenceBody.length) {
          flushFence();
        }
        fenceBody = [];
      } else {
        hadCode = true;
        if (state) state.hadCode = true;
        fenceBody.push(line);
        // streaming tail: emit each line as it arrives using the fast paths,
        // so a growing block renders without waiting for the closer
        if (i === lines.length - 1 || /^```/.test(lines[i + 1] ?? "")) {
          // last buffered line (closer next): nothing yet — flushFence runs at close
        }
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
        // ASCII state glyphs like /todo (x done, ~ in progress, . pending) —
        // no emoji. The todo tool emits exactly this syntax, so agent task
        // lists read as status, not punctuation.
        if (mark === "x") {
          out.push([{ t: `${ul[1]}[x] `, fg: MD.CODE_FG }, ...inline(content, { fg: MD.DIM })]);
        } else if (mark === "~") {
          out.push([{ t: `${ul[1]}[~] `, fg: MD.ACCENT }, ...inline(content, { bold: true })]);
        } else {
          out.push([{ t: `${ul[1]}[.] `, fg: MD.DIM }, ...inline(content)]);
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
    // Split a row into cells WITHOUT splitting inside a backtick span and
    // honoring the GFM `\|` escape (literal pipe). Models emit code cells
    // containing `|` constantly ("a `b | c` code cell"); a naive split() on
    // every `|` turned that into a phantom column — the composed table
    // overflowed, the caller's re-wrap at `width` clipped the final gutter,
    // and a vertical pipe "went missing".
    const splitRow = (l: string) => {
      const body = l.trim().replace(/^\||\|$/g, "");
      const cells: string[] = [];
      let cur = "";
      let inCode = false;
      for (let k = 0; k < body.length; k++) {
        const ch = body[k];
        if (ch === "\\" && body[k + 1] === "|") {
          cur += "|"; // `\|` is a literal pipe, not a column break
          k++;
        } else if (ch === "`") {
          inCode = !inCode;
          cur += ch;
        } else if (ch === "|" && !inCode) {
          cells.push(cur.trim());
          cur = "";
        } else cur += ch;
      }
      cells.push(cur.trim());
      return cells;
    };
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

    // GFM footnote definition: `[^id]: body` — render as a receded dim entry.
    const fnDef = FN_DEF.exec(line);
    if (fnDef) {
      out.push([{ t: `  [${fnDef[1]}] `, fg: MD.DIM, italic: true }, ...inline(fnDef[2], { fg: MD.DIM })]);
      i++;
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
  // an UNCLOSED fence (the block is still streaming in — no ``` yet): flush what
  // has arrived so a growing code block renders instead of staying blank until
  // the closer. The block cache is keyed on the partial text; once the real
  // closer lands the full block re-tokenizes with full context.
  if (inFence && fenceBody.length) flushFence();
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
  return !/^\s*(\[[x.~]\]|[-*]|\d+[.)])\s/.test(t);
}

/**
 * Wrap one rendered markdown row to `width`, re-applying the code-fence gutter
 * on continuation rows. A fenced code line is a single logical row `[│ , ...]`;
 * the plain wrap drops the `│ ` on every continuation (the oversized-word
 * branch), so a long code line renders with a gutter on only its first row and
 * bare text on the rest. This wraps then re-stamps `│ ` (minus a column, so the
 * code still aligns under the first row's content) on each continuation. Non-code
 * rows pass through unchanged.
 */
export function wrapCodeAware(row: Seg[], width: number): Seg[][] {
  const wrapped = wrapSegs(row, width);
  if (!codeGutterRow(row) || wrapped.length <= 1) return wrapped;
  const contGutter: Seg = { t: "│ ", fg: MD.CODE_FG };
  return wrapped.map((r, i) => (i === 0 ? r : [contGutter, ...r]));
}
