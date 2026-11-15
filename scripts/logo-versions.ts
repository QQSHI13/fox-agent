#!/usr/bin/env bun
/**
 * Demo: the mark re-colours itself from the version number.
 *
 * Three scales, and the point is that each is legible at a glance without being
 * told which one you are looking at:
 *
 *   patch  0.7.0 -> 0.7.1   a few degrees of hue. Recognisably the same mark.
 *   minor  0.7.0 -> 0.8.0   the gradient's DIRECTION turns.
 *   major  0.7.0 -> 1.0.0   the whole hue FAMILY changes. A different mark.
 *
 *   bun scripts/logo-versions.ts              the three scales, side by side
 *   bun scripts/logo-versions.ts --all        every family and direction
 *   bun scripts/logo-versions.ts 0.7.0 0.8.0   print specific versions
 *   bun scripts/logo-versions.ts --plain      no colour (shape only)
 */
import { markGrid } from "../src/tui/logo.ts";
import { DIRECTIONS, FAMILIES, cellColor, designForVersion, designColors } from "../src/tui/logoversion.ts";

const argv = process.argv.slice(2);
const plain = argv.includes("--plain");
const all = argv.includes("--all");
const explicit = argv.filter((a) => !a.startsWith("-") && /^\d/.test(a));

const dim = (s: string) => (plain ? s : `\x1b[90m${s}\x1b[0m`);
const bold = (s: string) => (plain ? s : `\x1b[1m${s}\x1b[0m`);

const ROWS = markGrid();

/** Render the mark as half-block lines, coloured by a version's design. */
function render(version: string): string[] {
  const d = designForVersion(version);
  const h = ROWS.length;
  const w = ROWS[0].length;
  const out: string[] = [];
  for (let y = 0; y < h; y += 2) {
    let line = "";
    for (let x = 0; x < w; x++) {
      const top = ROWS[y][x] === "#";
      const bottom = ROWS[y + 1][x] === "#";
      if (!top && !bottom) {
        line += " ";
        continue;
      }
      const ch = top && bottom ? "█" : top ? "▀" : "▄";
      if (plain) {
        line += ch;
        continue;
      }
      const hex = cellColor(d, x, top ? y : y + 1, w, h);
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      line += `\x1b[38;2;${r};${g};${b}m${ch}\x1b[0m`;
    }
    out.push(line.replace(/\s+$/, ""));
  }
  return out;
}

/** One labelled block: version, what changed, then the mark. */
function block(version: string, note: string, indent = 2): string[] {
  const d = designForVersion(version);
  const { from, to } = designColors(d);
  const lines: string[] = [];
  lines.push("");
  lines.push(
    " ".repeat(indent) +
      bold(`v${version}`) +
      "  " +
      dim(`${d.family.name} family · ${d.direction.name} gradient · ${from} -> ${to}`),
  );
  if (note) lines.push(" ".repeat(indent) + dim(note));
  lines.push("");
  for (const l of render(version)) lines.push(" ".repeat(indent) + l);
  lines.push("");
  return lines;
}

function scaleDemo(): void {
  console.log();
  console.log(bold("  the mark is a function of the version"));
  console.log(
    dim("  patch = a few degrees of hue · minor = the gradient turns · major = a new family"),
  );
  // Notes are DERIVED from the resolved design, not typed by hand: the earlier
  // hand-written ones disagreed with the actual minor % 4 index (0.7 lands on
  // "vertical", not "horizontal"), which is exactly the kind of label that rots
  // silently in a demo.
  const rows: [string, string][] = [
    ["0.7.0", "baseline"],
    ["0.7.1", "patch: hue drifts 3.5deg, lightness +0.6 — same mark, nudged"],
    ["0.7.2", "patch again: the drift keeps moving the same way"],
    ["0.8.0", "minor: the gradient direction changes"],
    ["0.9.0", "minor again: another direction"],
    ["1.0.0", "major: the hue family changes — a different mark"],
  ];
  for (const [v, note] of rows) for (const l of block(v, note)) console.log(l);
}

function allDemo(): void {
  console.log();
  console.log(bold("  every family (major)"));
  for (const f of FAMILIES) {
    const idx = FAMILIES.indexOf(f);
    for (const l of block(`${idx}.0.0`, `${f.name} — ramp ${f.ramp.fromHue}deg -> ${f.ramp.toHue}deg`)) console.log(l);
  }
  console.log();
  console.log(bold("  every direction (minor), all in the first family"));
  for (const dir of DIRECTIONS) {
    const idx = DIRECTIONS.indexOf(dir);
    for (const l of block(`0.${idx}.0`, `${dir.name} — weights x=${dir.wx} y=${dir.wy}`)) console.log(l);
  }
}

if (explicit.length) {
  for (const v of explicit) for (const l of block(v, "")) console.log(l);
} else if (all) {
  allDemo();
} else {
  scaleDemo();
  console.log(dim("  --all for every family and direction · --plain for shape only"));
  console.log();
}
