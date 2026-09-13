// opt-in "rich" rendering helpers: regex syntax tinting for code fences and
// diff coloring for tool output. Deliberately dependency-free and line-local
// (no cross-line state): good enough to read, cheap enough to run per frame.
import type { Seg } from "./wrap.ts";
import { liveTheme } from "./themes.ts";

// the rich colors are optional theme fields — presets that predate them and
// plugin themes fall back to the nearest established color
const R = liveTheme<"KW" | "STR" | "COM" | "NUM" | "DADD" | "DDEL" | "DHUNK">({
  KW: "accent",
  STR: "ok",
  COM: "hint",
  NUM: "tool",
  DADD: "ok",
  DDEL: "error",
  DHUNK: "info",
});

export function richColors() {
  return { kw: R.KW, str: R.STR, com: R.COM, num: R.NUM, add: R.DADD, del: R.DDEL, hunk: R.DHUNK };
}

const KEYWORDS = new Set(
  (`const let var function return if else for while do switch case default break continue new class extends super this import export from
async await try catch finally throw typeof instanceof of in delete void yield static get set null undefined true false
def elif fi end begin rescue ensure lambda pass global nonlocal with as except raise assert match nonlocal del is not and or
pub fn struct enum impl trait where mut ref use mod macro crate self Self
local then function end repeat until goto nil true false do end
package func interface map chan go defer select range type int string bool byte rune float64 any error
SELECT FROM WHERE INSERT UPDATE DELETE JOIN ON GROUP BY ORDER LIMIT CREATE TABLE INDEX INTO VALUES SET AND OR NOT NULL PRIMARY KEY
abstract final private protected public synchronized volatile transient implements throws interface enum record sealed permits
instanceof strictfp native transient volatile assert synchronized goto const`).split(/\s+/),
);

/** Comment introducer per language family. */
function commentStyle(lang: string): { line?: RegExp; block?: boolean } {
  const l = lang.toLowerCase();
  if (/(js|jsx|ts|tsx|java|c|cc|cpp|h|hpp|cs|go|rs|rust|swift|kt|scala|php|css)/.test(l)) return { line: /\/\//, block: true };
  if (/(py|sh|bash|zsh|rb|pl|pm|yaml|yml|toml|ini|cfg|r|make|docker|ps1)/.test(l)) return { line: /#/, block: false };
  if (/(sql|lua|hs|elm|ada|vhd)/.test(l)) return { line: /--/, block: false };
  if (/(lua)/.test(l)) return { line: /--/, block: false };
  if (/(html|xml|vue|svelte)/.test(l)) return { block: true }; // <!-- --> blocks only
  return { line: /\/\//, block: true }; // guess C-family
}

const TOKEN =
  /(\/\/.*$|#.*$|--.*$)|("(?:[^"\\\n]|\\.)*"?|'(?:[^'\\\n]|\\.)*'?|`(?:[^`\\]|\\.)*`?)|(\b\d[\d_]*(?:\.\d+)?(?:[eE][+-]?\d+)?\b)|(\b[A-Za-z_$][A-Za-z0-9_$]*\b)/g;

/**
 * Tint one line of code. Line-local on purpose: a string opened on a previous
 * line paints plain until it closes — a wrong tint on a wrapped line is far
 * better than a stateful parser in the frame loop.
 */
export function highlightLine(line: string, lang: string): Seg[] {
  const style = commentStyle(lang);
  const segs: Seg[] = [];
  let i = 0;
  TOKEN.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TOKEN.exec(line))) {
    if (m.index > i) segs.push({ t: line.slice(i, m.index) });
    const tok = m[0];
    const isCommentTok = m[1] !== undefined;
    if (isCommentTok) {
      // only treat it as a comment when this language uses that introducer
      if (style.line && style.line.test(tok)) segs.push({ t: tok, fg: R.COM, italic: true });
      else segs.push({ t: tok });
    } else if (m[2] !== undefined) segs.push({ t: tok, fg: R.STR });
    else if (m[3] !== undefined) segs.push({ t: tok, fg: R.NUM });
    else if (m[4] !== undefined) {
      const isType = /^[A-Z]/.test(tok) && tok.length > 1;
      if (KEYWORDS.has(tok)) segs.push({ t: tok, fg: R.KW, bold: isType });
      else if (isType) segs.push({ t: tok, fg: R.NUM });
      else segs.push({ t: tok });
    }
    i = TOKEN.lastIndex;
  }
  if (i < line.length) segs.push({ t: line.slice(i) });
  return segs.length ? segs : [{ t: line }];
}

/**
 * Diff coloring for a tool-output line: unified-diff and git-style markers get
 * their own colors, everything else stays plain. Returns null for plain lines.
 */
export function diffSegs(line: string): Seg[] | null {
  if (/^\+(?!\+\+)|^!/.test(line)) return [{ t: line, fg: R.DADD }];
  if (/^-(?!---)|^</.test(line)) return [{ t: line, fg: R.DDEL }];
  if (/^@@|^diff |^index |^--- |^\+\+\+ |^=+$/.test(line)) return [{ t: line, fg: R.DHUNK }];
  if (/^\+\+\+ |^--- /.test(line)) return [{ t: line, fg: R.DHUNK }];
  return null;
}
