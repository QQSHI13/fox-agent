// lightweight markdown -> styled segments (streaming-safe: re-parses whole buffer cheaply)
import type { Seg } from "./wrap.ts";

const ACCENT = "#bb9af7";
const CODE_FG = "#9ece6a";
const HEAD = "#7aa2f7";
const DIM = "#565f89";
const LINK = "#89ddff";

export function renderMarkdown(src: string): Seg[][] {
  const out: Seg[][] = [];
  const lines = src.split("\n");
  let i = 0;

  const inline = (text: string, base?: Partial<Seg>): Seg[] => {
    const segs: Seg[] = [];
    const re = /(\*\*([^*]+)\*\*|__([^_]+)__|\*([^*\s][^*]*)\*|`([^`]+)`|\[([^\]]+)\]\(([^)]+)\))/g;
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      if (m.index > last) segs.push({ t: text.slice(last, m.index), ...base });
      if (m[2] || m[3]) segs.push({ t: m[2] ?? m[3]!, bold: true, ...base });
      else if (m[4]) segs.push({ t: m[4], italic: true, ...base });
      else if (m[5]) segs.push({ t: m[5], fg: CODE_FG, ...base });
      else if (m[6]) {
        segs.push({ t: m[6], fg: LINK, ...base });
        segs.push({ t: ` (${m[7]})`, fg: DIM, ...base });
      }
      last = re.lastIndex;
    }
    if (last < text.length) segs.push({ t: text.slice(last), ...base });
    return segs.length ? segs : [{ t: "", ...base }];
  };

  while (i < lines.length) {
    const line = lines[i];

    if (/^```/.test(line)) {
      i++;
      const code: string[] = [];
      while (i < lines.length && !/^```/.test(lines[i])) code.push(lines[i++]);
      i++;
      for (const c of code) out.push([{ t: "│ " + c, fg: CODE_FG }]);
      if (!code.length) out.push([{ t: "│", fg: CODE_FG }]);
      continue;
    }

    const h = /^(#{1,6})\s+(.*)/.exec(line);
    if (h) {
      const styled: Seg[] = inline(h[2]).map((seg) => ({ ...seg, bold: true, fg: HEAD }));
      out.push(styled);
      i++;
      continue;
    }

    if (/^\s*([-*_])\1{2,}\s*$/.test(line)) {
      out.push([{ t: "─".repeat(24), fg: DIM }]);
      i++;
      continue;
    }

    const quote = /^>\s?(.*)/.exec(line);
    if (quote) {
      out.push(inline(quote[1], { italic: true, fg: DIM }));
      i++;
      continue;
    }

    const ul = /^(\s*)[-*+]\s+(.*)/.exec(line);
    if (ul) {
      out.push([{ t: `${ul[1]}• `, fg: ACCENT }, ...inline(ul[2])]);
      i++;
      continue;
    }

    const ol = /^(\s*)(\d+)[.)]\s+(.*)/.exec(line);
    if (ol) {
      out.push([{ t: `${ol[1]}${ol[2]}. `, fg: ACCENT }, ...inline(ol[3])]);
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
      !/^(#{1,6}\s|```|>)/.test(lines[i])
    )
      para.push(lines[i++]);
    for (const pl of para) out.push(inline(pl));
  }
  return out;
}
