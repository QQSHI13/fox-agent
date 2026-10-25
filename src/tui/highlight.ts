// opt-in "rich" rendering helpers: regex syntax tinting for code fences and
// diff coloring for tool output. Deliberately dependency-free and line-local
// (no cross-line state): good enough to read, cheap enough to run per frame.
import type { Seg } from "./wrap.ts";
import { liveTheme, theme, type Theme } from "./themes.ts";

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

// ---- real grammar highlighting via @speed-highlight/core ----
//
// speed-highlight is a compact regex tokenizer: no WASM engine, no TextMate
// grammar compilation. Measured on the same code, the same way (forced GC
// before every reading):
//
//   shiki (wasm, 73 grammars)   2401ms cold, 1166ms first fence, +117 MB
//   starry-night (wasm)         44ms cold,   418ms first fence, +120 MB
//   highlight.js (193 langs)    812ms cold,    61ms first fence,  +38 MB
//   speed-highlight (34 langs)   12ms cold,      1ms first fence,   +8 MB
//
// The TextMate options all pay the same toll — instantiating the Oniguruma WASM
// costs ~60-80 MB and a few hundred ms before the first token even lands — and
// speed-highlight is 15x lighter and ~400x faster to first token than Shiki for
// the 34 languages a model actually emits in a fence. That is the trade: long
// tail languages (elm, solidity, terraform) render flat instead of colored.
//
// Language modules are imported STATICALLY, not by the library's lazy loader:
// a dynamic specifier cannot be resolved by `bun build --compile`, so a lazy
// language lookup would work in dev and fail in the shipped binary. Each
// module is 0.07-1.6 kB, so importing all 34 costs ~264 kB.
import { tokenizeWith } from "@speed-highlight/core/tokenize";
import * as L_asm from "@speed-highlight/core/languages/asm.js";
import * as L_bash from "@speed-highlight/core/languages/bash.js";
import * as L_bf from "@speed-highlight/core/languages/bf.js";
import * as L_c from "@speed-highlight/core/languages/c.js";
import * as L_css from "@speed-highlight/core/languages/css.js";
import * as L_csv from "@speed-highlight/core/languages/csv.js";
import * as L_diff from "@speed-highlight/core/languages/diff.js";
import * as L_docker from "@speed-highlight/core/languages/docker.js";
import * as L_git from "@speed-highlight/core/languages/git.js";
import * as L_go from "@speed-highlight/core/languages/go.js";
import * as L_html from "@speed-highlight/core/languages/html.js";
import * as L_http from "@speed-highlight/core/languages/http.js";
import * as L_ini from "@speed-highlight/core/languages/ini.js";
import * as L_java from "@speed-highlight/core/languages/java.js";
import * as L_js from "@speed-highlight/core/languages/js.js";
import * as L_json from "@speed-highlight/core/languages/json.js";
import * as L_lua from "@speed-highlight/core/languages/lua.js";
import * as L_make from "@speed-highlight/core/languages/make.js";
import * as L_md from "@speed-highlight/core/languages/md.js";
import * as L_pl from "@speed-highlight/core/languages/pl.js";
import * as L_py from "@speed-highlight/core/languages/py.js";
import * as L_rs from "@speed-highlight/core/languages/rs.js";
import * as L_sql from "@speed-highlight/core/languages/sql.js";
import * as L_toml from "@speed-highlight/core/languages/toml.js";
import * as L_ts from "@speed-highlight/core/languages/ts.js";
import * as L_uri from "@speed-highlight/core/languages/uri.js";
import * as L_xml from "@speed-highlight/core/languages/xml.js";
import * as L_yaml from "@speed-highlight/core/languages/yaml.js";
// The library ships no C++ grammar (see the module for why mapping `cpp` onto C
// was not good enough: every C++-only keyword would render as a bare identifier).
import { cppGrammar } from "./langs/cpp.ts";

type LangData = Parameters<typeof tokenizeWith>[1];

/** fence id -> grammar. The library ships 34; these aliases cover what we map. */
const GRAMMARS: Record<string, LangData> = {
  asm: L_asm.default as LangData, bash: L_bash.default as LangData, bf: L_bf.default as LangData,
  c: L_c.default as LangData, css: L_css.default as LangData, csv: L_csv.default as LangData,
  // C++ — the grammar lives in ./langs/cpp.ts because the library ships none.
  // The extensions are here too: a model writes ```cpp, ```c++, or ```hpp
  // about equally often, and a fence id it guesses is a fence id we should serve.
  cpp: cppGrammar as LangData, "c++": cppGrammar as LangData, cxx: cppGrammar as LangData,
  hpp: cppGrammar as LangData, hxx: cppGrammar as LangData, cc: cppGrammar as LangData,
  cxxm: cppGrammar as LangData, h: cppGrammar as LangData,
  diff: L_diff.default as LangData, dockerfile: L_docker.default as LangData, docker: L_docker.default as LangData,
  git: L_git.default as LangData, go: L_go.default as LangData, html: L_html.default as LangData,
  http: L_http.default as LangData, ini: L_ini.default as LangData, java: L_java.default as LangData,
  json: L_json.default as LangData, lua: L_lua.default as LangData, make: L_make.default as LangData,
  markdown: L_md.default as LangData, perl: L_pl.default as LangData, python: L_py.default as LangData,
  py: L_py.default as LangData,
  rust: L_rs.default as LangData, sql: L_sql.default as LangData, toml: L_toml.default as LangData,
  uri: L_uri.default as LangData, xml: L_xml.default as LangData, yaml: L_yaml.default as LangData,
  // one grammar serves the JS family: no separate tsx/jsx, and the tokenizer
  // copes with the angle-bracket generics that distinguish them
  typescript: L_ts.default as LangData, ts: L_ts.default as LangData, mts: L_ts.default as LangData, cts: L_ts.default as LangData,
  tsx: L_ts.default as LangData, javascript: L_js.default as LangData, js: L_js.default as LangData,
  jsx: L_js.default as LangData, mjs: L_js.default as LangData, cjs: L_js.default as LangData,
  // shell: the bash grammar is the same rule set
  sh: L_bash.default as LangData, zsh: L_bash.default as LangData, shell: L_bash.default as LangData,
  yml: L_yaml.default as LangData, md: L_md.default as LangData, log: L_ini.default as LangData,
};

/**
 * speed-highlight's token type -> a theme slot.
 *
 * The library emits 15 short names, mapped onto slots the theme already has so
 * a fenced block matches the rest of the TUI without new config. `hl*` slots let
 * a theme retune any of them; everything falls back to the established color.
 */
/**
 * speed-highlight's token type -> a color for a code fence.
 *
 * The default is a REAL code palette (one-dark-pro's hexes), not the TUI's
 * prose slots: mapping all 15 types onto accent/ok/hint/tool collapsed a fence
 * to four colors, and a fenced block that reads as one paragraph instead of
 * code. A theme can still override any of them via the hl* slots, and an
 * override falls back to this palette rather than to the UI slots — so a theme
 * that customises one token does not have to customise all fourteen.
 *
 * `var` and undefined stay uncolored: identifiers and punctuation are the
 * background of the fence, and tinting them is what made a fence noisy.
 */
const CODE_PALETTE: Record<string, string> = {
  kwd: "#C678DD", // keywords, control flow — purple
  section: "#B48EAD", // imports/exports/headings — a muted mauve, reads beside kwd without merging
  str: "#98C379", // strings, char literals — green
  esc: "#B5CEA8", // escape sequences inside a string — a lighter green, so \n inside "…" reads
  cmnt: "#7F848E", // comments — gray, deliberately quiet
  num: "#D19A66", // numbers, constants — orange
  type: "#E5C07B", // type annotations, primitives — yellow
  class: "#F0C674", // class/struct/enum names — a lighter yellow than a type annotation
  func: "#61AFEF", // function and method names — blue
  bool: "#56B6C2", // true/false/null — cyan
  oper: "#7EA6C4", // operators and binding punctuation — a muted blue, distinct from a call
  err: "#E06C75", // error markers — red
  insert: "#98C379", // diff: a "+" line — green (semantic, shares with strings)
  deleted: "#E06C75", // diff: a "-" line — red (semantic, shares with errors)
  // "var" (identifiers) has no palette entry: it falls back to the theme's own
  // foreground, so identifiers are defined but never a hue of their own.
};

/** Theme slot per token kind, so a theme can retune one without the rest. */
const CODE_SLOT: Record<string, string | undefined> = {
  kwd: "hlKeyword", str: "hlString", cmnt: "hlComment", num: "hlNumber",
  type: "hlType", class: "hlClass", func: "hlFunc", bool: "hlBool",
  oper: "hlOper", section: "hlSection", esc: "hlEscape", err: "hlError",
  insert: "hlInsert", deleted: "hlDeleted", var: "hlVar",
};

function tokenColor(type: string | undefined): string | undefined {
  if (!type) return undefined;
  const pal = CODE_PALETTE[type];
  const t = theme() as unknown as Record<string, string | undefined>;
  const slot = CODE_SLOT[type];
  if (pal) return (slot ? t[slot] : undefined) ?? pal;
  // an identifier: the theme's own foreground, so it is defined and themeable
  // rather than "no color at all"
  if (type === "var") return t.hlVar ?? t.fg;
  return undefined;
}

/** normalize a fence language id; null when the library has no grammar for it. */
function shikiLang(lang: string): LangData | null {
  const l = lang.toLowerCase().replace(/^language-/, "").replace(/^c\+\+$/, "cpp");
  return GRAMMARS[l] ?? null;
}

// Block cache: tokenizing ONE LINE at a time starves any tokenizer of context
// (the `import ... from "..."` line collapsed to a single token). Tokenizing the
// WHOLE fence at once gives every token its own span, so we cache per
// (lang, text) -> per-line Seg[][], tokenize once when the block is first
// requested, and the renderer reads each line.
const blockCache = new Map<string, (Seg[] | null)[] | null>();
const pendingBlocks = new Set<string>();
const BLOCK_CACHE_MAX = 256;
let lastKick = 0;
const KICK_MS = 60;
// Bumped every time a block finishes tokenizing. Renderers cache their rows;
// keying that cache on this version makes a settled item re-render once its
// grammar lands, instead of staying flat forever (the "colors never appear"
// bug — the first paint happens while Shiki is still async, and nothing
// invalidated the cached flat rows when the block warmed).
let version = 0;
export function highlightVersion(): number {
  return version;
}
// Set by the TUI: called (off the async tokenize) each time a block lands, so
// the frame loop repaints cached-flat rows in their grammar colors. Without
// this the first paint freezes the lines flat until some unrelated input
// happens — the "code never highlights" bug.
let onDone: (() => void) | null = null;
export function setHighlightDone(fn: (() => void) | null): void {
  onDone = fn;
}

async function tokenizeBlock(lang: string, text: string): Promise<void> {
  const key = lang + "\0" + text;
  try {
    const grammar = shikiLang(lang);
    if (!grammar) {
      blockCache.set(key, null);
      return;
    }
    // speed-highlight emits a flat token stream (text, type) across the whole
    // block, so we accumulate per line ourselves and split on the newlines inside
    // a token's text. `type` is a short name we map onto theme slots below.
    const lines: Seg[][] = [[]];
    tokenizeWith(text, grammar, (raw: string, type?: string) => {
      const parts = raw.split("\n");
      for (let i = 0; i < parts.length; i++) {
        if (i > 0) lines.push([]);
        const piece = parts[i];
        if (!piece) continue;
        const fg = tokenColor(type);
        const last = lines[lines.length - 1];
        const prev = last[last.length - 1];
        // merge only when the style actually MATCHES. The first version of this
        // tested `fg && !prev.fg` — merging a colored token INTO an uncolored
        // one — which silently dropped the color: 3 colored spans out of 41.
        if (prev && prev.fg === fg) last[last.length - 1].t += piece;
        else last.push({ t: piece, ...(fg ? { fg } : {}) });
      }
    });
    if (blockCache.size >= BLOCK_CACHE_MAX) blockCache.clear();
    blockCache.set(key, lines.map((segs) => (segs.length ? segs : null)));
    version++; // a block landed — cached flat rows must re-render
    onDone?.();
  } catch {
    blockCache.set(key, null);
  } finally {
    pendingBlocks.delete(key);
  }
}

/**
 * Grammar-highlight a whole fence block with Shiki, cached per (lang, text).
 * Returns the per-line segments, or null while tokenization is still running
 * or on failure — the caller then shows the line flat (diff/json keep their
 * dedicated paths). Kicks off async tokenization once per block (throttled).
 */
export function highlightBlockRich(lang: string, text: string): (Seg[] | null)[] | null {
  const key = lang + "\0" + text;
  if (blockCache.has(key)) return blockCache.get(key) ?? null;
  if (!shikiLang(lang)) return null;
  if (!pendingBlocks.has(key) && (pendingBlocks.size === 0 || Date.now() - lastKick >= KICK_MS)) {
    lastKick = Date.now();
    pendingBlocks.add(key);
    tokenizeBlock(lang, text).catch(() => {});
  }
  return null;
}

// ---- diff / json / structural tool-output tinting ----
export function diffSegs(line: string): Seg[] | null {
  if (/^\+(?!\+\+)|^!/.test(line)) return [{ t: line, fg: R.DADD }];
  if (/^-(?!---)|^</.test(line)) return [{ t: line, fg: R.DDEL }];
  if (/^@@|^diff |^index |^--- |^\+\+\+ |^=+$/.test(line)) return [{ t: line, fg: R.DHUNK }];
  if (/^\+\+\+ |^--- /.test(line)) return [{ t: line, fg: R.DHUNK }];
  return null;
}

// ---- rich tool-output tinting (always on; there is no toggle) ----

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
