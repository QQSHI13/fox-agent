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
 * Colour is opt-in by the caller: `plain` art is the same shape with no escape
 * sequences at all, which is what a piped log or a monochrome terminal gets.
 */

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

/** Join the glyphs into one grid, cropping to the ink and padding to even rows. */
function grid(): string[] {
  const height = GLYPHS[0].length;
  const rows: string[] = [];
  for (let y = 0; y < height; y++) {
    rows.push(GLYPHS.map((g) => g[y]).join(".".repeat(TRACKING)));
  }
  // crop horizontally to the ink so the mark has no dead columns
  let left = Infinity;
  let right = -1;
  for (const row of rows) {
    for (let x = 0; x < row.length; x++) {
      if (row[x] === "#") {
        if (x < left) left = x;
        if (x > right) right = x;
      }
    }
  }
  const cropped = rows.map((r) => r.slice(left, right + 1));
  // half blocks need an even pixel-row count
  if (cropped.length % 2) cropped.push(".".repeat(cropped[0].length));
  return cropped;
}

type Rgb = [number, number, number];

/** The sweep: amber (#FFC24A) to ember (#A8330C), x-heavy with a small y term. */
const SWEEP_FROM: Rgb = [0xff, 0xc2, 0x4a];
const SWEEP_TO: Rgb = [0xa8, 0x33, 0x0c];
const X_WEIGHT = 0.8;
const Y_WEIGHT = 0.2;

function sweep(x: number, y: number, w: number, h: number): Rgb {
  const t = Math.min(1, Math.max(0, (x / Math.max(1, w - 1)) * X_WEIGHT + (y / Math.max(1, h - 1)) * Y_WEIGHT));
  return [
    Math.round(SWEEP_FROM[0] + (SWEEP_TO[0] - SWEEP_FROM[0]) * t),
    Math.round(SWEEP_FROM[1] + (SWEEP_TO[1] - SWEEP_FROM[1]) * t),
    Math.round(SWEEP_FROM[2] + (SWEEP_TO[2] - SWEEP_FROM[2]) * t),
  ];
}

/** An xterm-256 palette index for one color, for terminals without truecolor. */
function to256([r, g, b]: Rgb): number {
  // 6x6x6 color cube, steps of 51, indices 16..231
  const q = (v: number) => Math.round(((v / 255) * 5));
  return 16 + 36 * q(r) + 6 * q(g) + q(b);
}

export type MarkColor = "truecolor" | "256" | "none";

/** Pick a color depth from the environment. Terminals lie, so this is a guess. */
export function markColor(env: NodeJS.ProcessEnv = process.env): MarkColor {
  if (env.NO_COLOR !== undefined && env.NO_COLOR !== "") return "none";
  const ct = (env.COLORTERM ?? "").toLowerCase();
  if (ct.includes("truecolor") || ct.includes("24bit")) return "truecolor";
  const term = (env.TERM ?? "").toLowerCase();
  if (term.includes("256")) return "256";
  return "truecolor"; // most modern terminals, including Windows Terminal
}

/**
 * The mark as an array of lines.
 *
 * `indent` is applied as real spaces, so the caller can place it inside a
 * padded block without the escape sequences fighting the layout.
 */
export function foxMark(opts: { color?: MarkColor; indent?: number } = {}): string[] {
  const color = opts.color ?? markColor();
  const indent = " ".repeat(opts.indent ?? 0);
  const rows = grid();
  const h = rows.length;
  const w = rows[0].length;
  const out: string[] = [];

  for (let y = 0; y < h; y += 2) {
    let line = indent;
    for (let x = 0; x < w; x++) {
      const top = rows[y][x] === "#";
      const bottom = rows[y + 1][x] === "#";
      if (!top && !bottom) {
        line += " ";
        continue;
      }
      // a cell is one glyph; `▀` paints the top pixel, `▄` the bottom, `█` both
      const ch = top && bottom ? "█" : top ? "▀" : "▄";
      if (color === "none") {
        line += ch;
        continue;
      }
      // the gradient is per-cell: the top pixel's color for `▀`, the bottom's
      // for `▄`. For `█` either reads the same because the column is narrow.
      const rgb = sweep(x, top ? y : y + 1, w, h);
      line +=
        color === "256"
          ? `\x1b[38;5;${to256(rgb)}m${ch}\x1b[0m`
          : `\x1b[38;2;${rgb[0]};${rgb[1]};${rgb[2]}m${ch}\x1b[0m`;
    }
    out.push(line.replace(/\s+$/, ""));
  }
  return out;
}

/** Width in columns of the widest line, ignoring escape sequences. */
export function foxMarkWidth(color: MarkColor = "none"): number {
  return foxMark({ color, indent: 0 })[0].length;
}

/** How many terminal rows the mark occupies. */
export function foxMarkHeight(): number {
  return grid().length / 2;
}
