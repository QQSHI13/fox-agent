/**
 * The fox-agent mark, as terminal art.
 *
 * `FOX` in three 6x7 block glyphs, painted with a single sweep from amber to
 * ember. Rendered with Unicode half blocks (`▀` `▄` `█`), which pack TWO
 * vertical pixels into one cell — so a 20x8 mark occupies 20 columns by 4 rows
 * instead of 8. That is the whole reason it can sit on a welcome screen without
 * eating it.
 *
 * One character per pixel, no padding. A terminal cell is about twice as tall as
 * it is wide and a half block splits that in two, so pixels come out square.
 * Padding each cell would make the letters 2:1 wide.
 *
 * Colours are emitted as `Seg`s with hex `fg`, NOT as pre-baked escape
 * sequences: the TUI paints through `screen.ts`, which writes `38;2;` for a hex
 * fg unconditionally. Emitting our own escapes would bypass that path, break
 * the line cache's idea of a row's width, and disagree with the rest of the
 * screen about colour depth.
 */
import type { Seg } from "./wrap.ts";

/** 6x7 glyphs. `#` is ink, `.` is background. */
const GLYPHS: string[][] = [
  [
    "######",
    "##....",
    "##....",
    "#####.",
    "##....",
    "##....",
    "##....",
  ],
  [
    ".####.",
    "##..##",
    "##..##",
    "##..##",
    "##..##",
    "##..##",
    ".####.",
  ],
  [
    "##..##",
    "##..##",
    ".####.",
    "..##..",
    ".####.",
    "##..##",
    "##..##",
  ],
];

const TRACKING = 1;

/** Join the glyphs into one grid, crop to the ink, and pad to an even row count. */
function grid(): string[] {
  const height = GLYPHS[0].length;
  const rows: string[] = [];
  for (let y = 0; y < height; y++) {
    rows.push(GLYPHS.map((g) => g[y]).join(".".repeat(TRACKING)));
  }
  let left = Infinity;
  let right = -1;
  for (const row of rows) {
    for (let x = 0; x < row.length; x++) {
      if (row[x] !== "#") continue;
      if (x < left) left = x;
      if (x > right) right = x;
    }
  }
  const cropped = rows.map((r) => r.slice(left, right + 1));
  if (cropped.length % 2) cropped.push(".".repeat(cropped[0].length));
  return cropped;
}

/** The sweep: amber (#FFC24A) to ember (#A8330C), x-heavy with a small y term. */
const FROM = { r: 0xff, g: 0xc2, b: 0x4a };
const TO = { r: 0xa8, g: 0x33, b: 0x0c };
const X_WEIGHT = 0.8;
const Y_WEIGHT = 0.2;

function sweepHex(x: number, y: number, w: number, h: number): string {
  const raw = (x / Math.max(1, w - 1)) * X_WEIGHT + (y / Math.max(1, h - 1)) * Y_WEIGHT;
  const t = Math.min(1, Math.max(0, raw));
  const mix = (a: number, b: number) => Math.round(a + (b - a) * t).toString(16).padStart(2, "0");
  return `#${mix(FROM.r, TO.r)}${mix(FROM.g, TO.g)}${mix(FROM.b, TO.b)}`;
}

/** Grid dimensions, for callers that need to reserve space. */
export const MARK_COLS = (() => {
  const g = grid();
  return g[0].length;
})();

export const MARK_ROWS = (() => {
  return grid().length / 2;
})();

/**
 * The mark as rows of `Seg`s, one `Seg` per run of equal colour.
 *
 * Runs, not one Seg per character: a 20-column row would otherwise be 20 Segs,
 * and every one of them costs a style flush at paint time. Adjacent cells of the
 * same colour are joined, and a blank is its own run so the row's width stays
 * honest.
 */
export function foxMarkSegs(indent = 0): Seg[][] {
  const rows = grid();
  const h = rows.length;
  const w = rows[0].length;
  const out: Seg[][] = [];

  for (let y = 0; y < h; y += 2) {
    const segs: Seg[] = [];
    let cur: { t: string; fg?: string } | null = null;
    if (indent > 0) segs.push({ t: " ".repeat(indent) });

    for (let x = 0; x < w; x++) {
      const top = rows[y][x] === "#";
      const bottom = rows[y + 1][x] === "#";
      if (!top && !bottom) {
        // transparent cell: flush the run, keep the column
        if (cur) {
          segs.push(cur);
          cur = null;
        }
        segs.push({ t: " " });
        continue;
      }
      // `▀` paints the top pixel, `▄` the bottom, `█` both. Either half's colour
      // reads as the cell's, because a cell is one column wide and the sweep
      // moves far more horizontally than across two rows.
      const ch = top && bottom ? "█" : top ? "▀" : "▄";
      const fg = sweepHex(x, top ? y : y + 1, w, h);
      if (cur && cur.fg === fg) cur.t += ch;
      else {
        if (cur) segs.push(cur);
        cur = { t: ch, fg };
      }
    }
    if (cur) segs.push(cur);
    out.push(segs);
  }
  return out;
}

/**
 * The mark as printable ANSI lines, for OUTSIDE the TUI.
 *
 * The TUI paints `Seg`s through screen.ts, which owns colour depth. Before the
 * alt screen goes up (and after it comes back down) there is no screen.ts — just
 * a plain stream — so this emits truecolor escapes directly. That is not a depth
 * guess: screen.ts writes `38;2;` for every hex fg unconditionally, so a terminal
 * that cannot render these could not render the TUI either.
 */
export function foxMarkAnsi(indent = 0): string[] {
  return foxMarkSegs(indent).map((segs) =>
    segs
      .map((s) => {
        if (!s.fg || !s.fg.startsWith("#")) return s.t;
        const r = parseInt(s.fg.slice(1, 3), 16);
        const g = parseInt(s.fg.slice(3, 5), 16);
        const b = parseInt(s.fg.slice(5, 7), 16);
        return `\x1b[38;2;${r};${g};${b}m${s.t}\x1b[0m`;
      })
      .join(""),
  );
}

/** The mark as plain text — no colour at all, for a piped log or a snapshot. */
export function foxMarkText(): string[] {
  const rows = grid();
  const out: string[] = [];
  for (let y = 0; y < rows.length; y += 2) {
    let line = "";
    for (let x = 0; x < rows[0].length; x++) {
      const top = rows[y][x] === "#";
      const bottom = rows[y + 1][x] === "#";
      line += top && bottom ? "█" : top ? "▀" : bottom ? "▄" : " ";
    }
    out.push(line.replace(/\s+$/, ""));
  }
  return out;
}
