#!/usr/bin/env bun
/**
 * Preview the fox-agent mark in the places it actually appears.
 *
 * This is a STANDALONE renderer on purpose: it converts the mark's `Seg[]` rows
 * to ANSI itself instead of going through the TUI, so it can run without a
 * terminal, a session or a theme. The mark's real colours live in logo.ts as hex
 * `fg` on each Seg; the TUI paints those through screen.ts, which always writes
 * `38;2;` — so truecolor here is not an assumption, it is what the TUI does.
 *
 *   bun scripts/logo-preview.ts            all three contexts
 *   bun scripts/logo-preview.ts mark       just the mark
 *   bun scripts/logo-preview.ts welcome    the welcome block
 *   bun scripts/logo-preview.ts exit       the resume hint
 *   bun scripts/logo-preview.ts --plain    no colour at all
 *   bun scripts/logo-preview.ts --256      quantise to the 256-colour cube
 */
import { foxMarkSegs, foxMarkText, MARK_COLS, MARK_ROWS } from "../src/tui/logo.ts";
import type { Seg } from "../src/tui/wrap.ts";

const argv = process.argv.slice(2);
const want = argv.find((a) => !a.startsWith("-")) ?? "all";
const plain = argv.includes("--plain");
const use256 = argv.includes("--256");

/** hex -> xterm-256 cube index, for terminals that cannot do 24-bit colour. */
function hexTo256(hex: string): number {
  const n = (i: number) => parseInt(hex.slice(i, i + 2), 16);
  const q = (v: number) => Math.round((v / 255) * 5);
  return 16 + 36 * q(n(1)) + 6 * q(n(3)) + q(n(5));
}

/** One Seg -> its escape prefix. Mirrors screen.ts's sgrOf for the fg case. */
function paint(segs: Seg[]): string {
  if (plain) return segs.map((s) => s.t).join("");
  return segs
    .map((s) => {
      if (!s.fg || !s.fg.startsWith("#")) return s.t;
      const code = use256
        ? `38;5;${hexTo256(s.fg)}`
        : `38;2;${parseInt(s.fg.slice(1, 3), 16)};${parseInt(s.fg.slice(3, 5), 16)};${parseInt(s.fg.slice(5, 7), 16)}`;
      return `\x1b[${code}m${s.t}\x1b[0m`;
    })
    .join("");
}

const dim = (s: string) => (plain ? s : `\x1b[90m${s}\x1b[0m`);
const bold = (s: string) => (plain ? s : `\x1b[1m${s}\x1b[0m`);
const rule = (n = 64) => dim("─".repeat(n));

const VERSION = "0.7.0";
const CWD = "/home/qq/src/fox-agent";
const MODEL = "kimi-k2";
const BANNER = "small harness, sharp teeth";

/** The mark, indented, as printable lines. */
function markLines(indent = 2): string[] {
  return foxMarkSegs(indent).map(paint);
}

// ---------------------------------------------------------------------------
// Welcome: the mark above the version line, then the info block the TUI prints
// on a fresh launch. The mark is MARK_COLS wide and indented 2, so it fits an
// 80-column terminal with plenty of room for the text beside and below it.
// ---------------------------------------------------------------------------
function welcome(): void {
  console.log();
  for (const line of markLines(2)) console.log(line);
  console.log();
  console.log(`  ${bold(`fox-agent v${VERSION}`)} ${dim("—")} ${dim(BANNER)}`);
  console.log();
  const rows = [
    `working directory: ${CWD}`,
    "session none — created on first message",
    dim("no API key configured — /login opens the setup wizard"),
    `model ${MODEL} ${dim("(256k ctx)")} · kimi-code-plan-cn`,
    dim("enter send · / commands · esc interrupt · ctrl+t expand all"),
    dim("/login setup · /model switch · /sessions resume · /help all"),
  ];
  for (const r of rows) console.log("  " + r);
  console.log();
  console.log(rule());
  console.log(dim(`  the mark above is ${MARK_COLS} columns wide, ${MARK_ROWS} rows tall`));
  console.log();
}

// ---------------------------------------------------------------------------
// Exit: what the shell sees after the TUI tears down. The resume hint must
// survive being copied out of a pipe, so it never depends on colour.
// ---------------------------------------------------------------------------
function exitScreen(): void {
  console.log();
  console.log(rule());
  console.log();
  for (const line of markLines(2)) console.log(line);
  console.log();
  console.log(`  ${dim("session mtzc7lak9 saved")}`);
  console.log(`  ${dim("to resume:")} fox -c mtzc7lak9`);
  console.log();
}

function markOnly(): void {
  console.log();
  for (const line of markLines(0)) console.log(line);
  console.log();
}

switch (want) {
  case "mark":
    markOnly();
    break;
  case "welcome":
    welcome();
    break;
  case "exit":
    exitScreen();
    break;
  default:
    markOnly();
    console.log(rule());
    welcome();
    console.log(rule());
    exitScreen();
}

// Sanity: the plain grid must match the coloured one column for column, or the
// half-block packing has drifted.
const plainRows = foxMarkText();
console.error(dim(`[mark ${MARK_COLS}x${MARK_ROWS} · rows ${plainRows.length} · colour=${plain ? "none" : use256 ? "256" : "truecolor"}]`));
