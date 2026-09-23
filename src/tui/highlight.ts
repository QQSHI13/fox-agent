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

// ---- rich tool-output tinting (all gated behind `tuiRich`) ----

/**
 * A ```diff fence in assistant markdown: per-line add/del/hunk colors, with
 * non-marker lines falling through to plain-code tinting. Returns null when a
 * line has no diff marker (caller decides the fallback).
 */
export function diffFenceLine(line: string): Seg[] | null {
  if (/^\+(?!\+\+)/.test(line)) return [{ t: line, fg: R.DADD }];
  if (/^-(?!---)/.test(line)) return [{ t: line, fg: R.DDEL }];
  if (/^@@|^diff |^index |^--- |^\+\+\+ /.test(line)) return [{ t: line, fg: R.DHUNK }];
  return null;
}

const JSON_SEG =
  /("(?:[^"\\]|\\.)*")(\s*:)?|(\/\/.*$)|\b(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)\b|\b(true|false|null)\b/g;

/**
 * Tint one line of JSON: keys accent, strings ok, numbers tool, literals
 * keyword, comments hint. Line-local like the code highlighter.
 */
export function jsonSegs(line: string): Seg[] {
  const segs: Seg[] = [];
  let i = 0;
  JSON_SEG.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = JSON_SEG.exec(line))) {
    if (m.index > i) segs.push({ t: line.slice(i, m.index) });
    if (m[1] !== undefined) {
      if (m[2]) {
        // key: the quoted name is accent, the colon stays plain
        segs.push({ t: m[1], fg: R.KW });
        if (m[2]) segs.push({ t: m[2] });
      } else segs.push({ t: m[1], fg: R.STR });
    } else if (m[3]) segs.push({ t: m[3], fg: R.COM, italic: true });
    else if (m[4] !== undefined) segs.push({ t: m[4], fg: R.NUM });
    else if (m[5]) segs.push({ t: m[5], fg: R.KW });
    i = JSON_SEG.lastIndex;
  }
  if (i < line.length) segs.push({ t: line.slice(i) });
  return segs.length ? segs : [{ t: line }];
}

/** test-runner / CLI status prefixes: word → color slot */
const STATUS = /\b(PASS|PASSSED|FAIL|FAILED|ERROR|WARN(ING)?|OK|SKIP(PED)?|DONE|SUCCESS|BUILD)\b/;

/**
 * Status words in tool output: PASS/OK/DONE/SUCCESS green, FAIL/ERROR red,
 * WARN yellow-ish (tool), SKIP dim. Whole-line prefix rules stay in diffSegs.
 */
export function statusSegs(line: string): Seg[] | null {
  if (!STATUS.test(line)) return null;
  const segs: Seg[] = [];
  let i = 0;
  const re = new RegExp(STATUS.source, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(line))) {
    if (m.index > i) segs.push({ t: line.slice(i, m.index) });
    const w = m[0];
    const up = w.startsWith("PASS") || w === "OK" || w === "DONE" || w === "SUCCESS" || w === "BUILD";
    const down = w.startsWith("FAIL") || w === "ERROR";
    if (up) segs.push({ t: w, fg: R.DADD, bold: true });
    else if (down) segs.push({ t: w, fg: R.DDEL, bold: true });
    else if (w.startsWith("WARN")) segs.push({ t: w, fg: R.NUM, bold: true });
    else segs.push({ t: w, fg: R.COM }); // SKIP etc.
    i = re.lastIndex;
  }
  if (i < line.length) segs.push({ t: line.slice(i) });
  return segs;
}

/** path[:line][:col] — path part colored, the :line suffix dim */
const PATHLIKE = /(?:^|[\s"'(=])(~?\.?\/?[\w.@-]+(?:\/[\w.@-]+)+)(:\d+)?(?=[\s"'():;,!?]|$)/;

/**
 * File-path tinting for tool output: `src/foo.ts` accent, a trailing
 * `:42` line number dim. Returns null for lines without a path shape.
 */
export function pathSegs(line: string): Seg[] | null {
  const m = PATHLIKE.exec(line);
  if (!m) return null;
  // requires a slash — "2.3" or "a:b" must not match
  if (!m[1].includes("/")) return null;
  const segs: Seg[] = [];
  const start = m.index + m[0].indexOf(m[1]);
  if (m.index > 0) segs.push({ t: line.slice(0, start) });
  segs.push({ t: m[1], fg: R.KW });
  if (m[2]) segs.push({ t: m[2], fg: R.COM });
  const after = start + m[1].length + (m[2]?.length ?? 0);
  if (after < line.length) segs.push({ t: line.slice(after) });
  return segs;
}

/** one word-level delta for wordDiff */
interface WordDelta {
  text: string;
  kind: "same" | "add" | "del";
}

function splitWords(s: string): string[] {
  return s.match(/\S+|\s+/g) ?? [];
}

/**
 * Word-level diff of two changed lines (an adjacent -/+ pair): shared words
 * stay plain, words only in the new line tint as additions, words only in the
 * old line tint as deletions. LCS on word tokens, small-N linear DP.
 */
export function wordDiff(oldLine: string, newLine: string): { del: Seg[]; add: Seg[] } {
  const a = splitWords(oldLine);
  const b = splitWords(newLine);
  const n = a.length;
  const m2 = b.length;
  // dp[i][j] = LCS length of a[i..], b[j..]
  const dp: Uint16Array[] = Array.from({ length: n + 1 }, () => new Uint16Array(m2 + 1));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m2 - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const deltas: WordDelta[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m2) {
    if (a[i] === b[j]) {
      deltas.push({ text: a[i], kind: "same" });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      deltas.push({ text: a[i], kind: "del" });
      i++;
    } else {
      deltas.push({ text: b[j], kind: "add" });
      j++;
    }
  }
  while (i < n) deltas.push({ text: a[i++], kind: "del" });
  while (j < m2) deltas.push({ text: b[j++], kind: "add" });
  const merge = (kind: "add" | "del"): Seg[] => {
    const segs: Seg[] = [];
    for (const d of deltas) {
      if (d.kind !== kind && d.kind !== "same") continue;
      if (d.kind === "same") {
        segs.push({ t: d.text });
        continue;
      }
      const lastSeg = segs[segs.length - 1];
      if (lastSeg && lastSeg.fg === (kind === "add" ? R.DADD : R.DDEL)) lastSeg.t += d.text;
      else segs.push({ t: d.text, fg: kind === "add" ? R.DADD : R.DDEL });
    }
    return segs;
  };
  return { del: merge("del"), add: merge("add") };
}

// ---- ANSI passthrough ----

const ANSI_RE = /\x1b\[([0-9;]*)m/g;

/** nearest basic ANSI color for a theme hex (used to translate tool colors) */
function hexToAnsi(hex: string): number | null {
  if (!hex?.startsWith("#")) return null;
  const v = parseInt(hex.slice(1), 16);
  if (!Number.isFinite(v)) return null;
  const r = (v >> 16) & 255;
  const g = (v >> 8) & 255;
  const b = v & 255;
  // grayscale shortcut: 24 shades at the ends of the ramp
  if (Math.abs(r - g) < 12 && Math.abs(g - b) < 12) {
    const lum = Math.round((r + g + b) / 3);
    if (lum < 8) return 0;
    if (lum > 247) return 15;
    if (lum > 232) return 7;
    return 232 + Math.min(23, Math.floor((lum - 8) / 10));
  }
  const ri = r > 127 ? 1 : 0;
  const gi = g > 127 ? 1 : 0;
  const bi = b > 127 ? 1 : 0;
  return [0, 4, 2, 6, 1, 5, 3, 7][ri | (gi << 1) | (bi << 2)] ?? 7;
}

/**
 * Convert ANSI-colored tool output into themed Segs: SGR color codes map to
 * the live theme's nearest slots (fg/bg/bold/italic/strike), all other escape
 * sequences are dropped. Untracked codes (underline, 256/truecolor palettes)
 * fall back to plain text so output stays readable.
 */
export function ansiSegs(text: string): Seg[] {
  const segs: Seg[] = [];
  // interpreter state
  let fg: string | undefined;
  let bg: string | undefined;
  let bold = false;
  let italic = false;
  let strike = false;
  let plainFromHere = false; // saw an untranslatable code: flush plain until reset

  const flush = (t: string) => {
    if (!t) return;
    if (plainFromHere || (!fg && !bg && !bold && !italic && !strike)) segs.push({ t });
    else segs.push({ t, fg, bg, bold, italic, strike });
  };

  let last = 0;
  ANSI_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = ANSI_RE.exec(text))) {
    flush(text.slice(last, m.index));
    last = ANSI_RE.lastIndex;
    const params = m[1];
    const codes = params === "" ? [0] : params.split(";").map((p) => parseInt(p || "0", 10));
    for (let ci = 0; ci < codes.length; ci++) {
      const c = codes[ci];
      if (c === 0) {
        fg = bg = undefined;
        bold = italic = strike = false;
        plainFromHere = false;
      } else if (c === 1) bold = true;
      else if (c === 2) {} // dim: fold into fg if set, else ignore
      else if (c === 3) italic = true;
      else if (c === 9) strike = true;
      else if (c === 22) bold = false;
      else if (c === 23) italic = false;
      else if (c === 29) strike = false;
      else if (c >= 30 && c <= 37) fg = basicAnsiFg(c - 30);
      else if (c === 39) fg = undefined;
      else if (c >= 40 && c <= 47) bg = basicAnsiBg(c - 40);
      else if (c === 49) bg = undefined;
      else if (c === 90 || c === 91) fg = c === 90 ? R.COM : R.DADD;
      else if (c >= 100 && c <= 103) bg = undefined; // rare; drop to keep it simple
      else if (c === 38 || c === 48) {
        // extended color: 256-palette or truecolor — translate if the NEXT
        // params parse as RGB, else give up on styling this run
        const isFg = c === 38;
        let consumed = 0;
        let hex: string | null = null;
        if (codes[ci + 1] === 2 && codes.length >= ci + 5) {
          hex = rgbToHex(codes[ci + 2], codes[ci + 3], codes[ci + 4]);
          consumed = 4;
        } else if (codes[ci + 1] === 5 && codes[ci + 2] !== undefined) {
          hex = idx256ToHex(codes[ci + 2]);
          consumed = 2;
        }
        if (hex) {
          if (isFg) fg = hex;
          else bg = hex;
          ci += consumed;
        } else {
          plainFromHere = true;
          fg = bg = undefined;
          ci = codes.length; // remaining params belong to the failed parse
        }
      } else {
        // underline (4), blink, inverse — untracked: keep the text, drop style
      }
    }
  }
  flush(text.slice(last));
  return segs.length ? segs : [{ t: text }];
}

function rgbToHex(r: number, g: number, b: number): string | null {
  if ([r, g, b].some((v) => !Number.isFinite(v) || v < 0 || v > 255)) return null;
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

function idx256ToHex(idx: number): string | null {
  if (!Number.isFinite(idx) || idx < 0 || idx > 255) return null;
  if (idx < 8) return BASIC_HEX[idx];
  if (idx < 16) return BRIGHT_HEX[idx - 8];
  if (idx < 232) {
    const i = idx - 16;
    const r = Math.floor(i / 36);
    const g = Math.floor((i % 36) / 6);
    const b = i % 6;
    const sc = (v: number) => (v === 0 ? 0 : 55 + v * 40);
    return rgbToHex(sc(r), sc(g), sc(b));
  }
  const lum = 8 + (idx - 232) * 10;
  return rgbToHex(lum, lum, lum);
}

// the 16 basic ANSI colors as hex, for basic-code → theme-slot fallback
const BASIC_HEX = ["#000000", "#aa0000", "#00aa00", "#aa5500", "#0000aa", "#aa00aa", "#00aaaa", "#aaaaaa"];
const BRIGHT_HEX = ["#555555", "#ff5555", "#55ff55", "#ffff55", "#5555ff", "#ff55ff", "#55ffff", "#ffffff"];

/** map a basic ANSI fg code to a theme slot by nearest color */
function basicAnsiFg(c: number): string | undefined {
  const hex = c < 8 ? BASIC_HEX[c] : BRIGHT_HEX[c - 8];
  return nearestThemeSlot(hex) ?? hex;
}

function basicAnsiBg(c: number): string | undefined {
  return BASIC_HEX[c] ?? undefined;
}

// the theme slots ANSI colors map onto, in the order the rich palette declares them
const SLOT_ORDER = ["KW", "STR", "COM", "NUM", "DADD", "DDEL", "DHUNK"] as const;

/** nearest theme slot hex for a hex color, or null when none is close */
function nearestThemeSlot(hex: string): string | null {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  let best: string | null = null;
  let bestDist = Infinity;
  for (const slot of SLOT_ORDER) {
    const sHex = R[slot];
    const sr = parseInt(sHex.slice(1, 3), 16);
    const sg = parseInt(sHex.slice(3, 5), 16);
    const sb = parseInt(sHex.slice(5, 7), 16);
    const d = (r - sr) ** 2 + (g - sg) ** 2 + (b - sb) ** 2;
    if (d < bestDist) {
      bestDist = d;
      best = sHex;
    }
  }
  // a generous cutoff: theme colors that are nothing like any slot stay raw
  return bestDist < 3 * 90 * 90 ? best : null;
}
