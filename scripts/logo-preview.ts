#!/usr/bin/env bun
/**
 * Preview the fox-agent mark in the three places it actually appears.
 *
 * Not a screenshot tool — it prints the same strings the TUI would, at the same
 * column widths, so a layout problem shows up here instead of in a terminal at
 * 80 columns. Run it with no arguments to see all three.
 *
 *   bun scripts/logo-preview.ts            all three contexts
 *   bun scripts/logo-preview.ts mark       just the mark
 *   bun scripts/logo-preview.ts welcome    the welcome block
 *   bun scripts/logo-preview.ts exit       the resume hint
 *   bun scripts/logo-preview.ts --plain    no color at all
 *   bun scripts/logo-preview.ts --256      256-color, for a limited terminal
 */
import { foxMark, foxMarkWidth, markColor, type MarkColor } from "../src/tui/logo.ts";

const argv = process.argv.slice(2);
const want = argv.find((a) => !a.startsWith("-")) ?? "all";
const forced: MarkColor | undefined = argv.includes("--plain")
  ? "none"
  : argv.includes("--256")
    ? "256"
    : argv.includes("--truecolor")
      ? "truecolor"
      : undefined;

const color = forced ?? markColor();
const dim = (s: string) => (color === "none" ? s : `\x1b[90m${s}\x1b[0m`);
const bold = (s: string) => (color === "none" ? s : `\x1b[1m${s}\x1b[0m`);
const rule = (n = 64) => dim("─".repeat(n));

const VERSION = "0.7.0";
const CWD = "/home/qq/src/fox-agent";
const MODEL = "kimi-k2";
const BANNER = "small harness, sharp teeth";

/** The mark, indented to sit on its own line above a block of text. */
function markBlock(indent = 2): string[] {
  return foxMark({ color, indent });
}

function banner(): void {
  console.log();
  for (const line of markBlock(2)) console.log(line);
  console.log();
  console.log(`  ${bold(`fox-agent v${VERSION}`)} ${dim("—")} ${dim(BANNER)}`);
  console.log();
}

// ---------------------------------------------------------------------------
// Welcome screen: the mark above the version line, then the info block the TUI
// prints on a fresh launch. The mark is 20 columns, and the info block below is
// indented 2, so the whole thing fits an 80-column terminal with room to spare.
// ---------------------------------------------------------------------------
function welcome(): void {
  banner();
  const indent = "  ";
  const rows = [
    `working directory: ${CWD}`,
    "session none — created on first message",
    dim("no API key configured — /login opens the setup wizard"),
    `model ${MODEL} ${dim("(256k ctx)")} · kimi-code-plan-cn`,
    dim("enter send · / commands · esc interrupt · ctrl+t expand all"),
    dim("/login setup · /model switch · /sessions resume · /help all"),
  ];
  for (const r of rows) console.log(indent + r);
  console.log();
  console.log(rule());
  console.log(dim("  the mark above is 20 columns wide, 4 rows tall"));
  console.log();
}

// ---------------------------------------------------------------------------
// Exit: what the shell sees after the TUI tears down. The mark is deliberately
// NOT here — a full mark after every quit is noise, and the resume hint has to
// survive being copied out of a pipe. So: one dim line, no color dependency.
// ---------------------------------------------------------------------------
function exit_(): void {
  console.log();
  console.log(rule());
  console.log();
  for (const line of markBlock(2)) console.log(line);
  console.log();
  console.log(`  ${dim("session mtzc7lak9 saved")}`);
  console.log(`  ${dim("to resume:")} fox -c mtzc7lak9`);
  console.log();
}

function markOnly(): void {
  console.log();
  for (const line of markBlock(0)) console.log(line);
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
    exit_();
    break;
  default:
    markOnly();
    console.log(rule());
    welcome();
    console.log(rule());
    exit_();
}

// A one-line sanity check, so a broken geometry is obvious in a log too.
console.error(dim(`[mark ${foxMarkWidth("none")}x${foxMark({ color: "none" }).length} cols x rows · color=${color}]`));
