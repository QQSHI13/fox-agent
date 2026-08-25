/**
 * Input-buffer editing: how far one keypress moves through a line of text.
 *
 * Split out of `app.ts` for the same reason as `select.ts` — it is the part of
 * editing that can be wrong in a way tests can catch. The subtlety is that the
 * buffer holds one entry per *code point*, but a user sees *graphemes*: "👍🏽" is
 * an emoji plus a skin-tone modifier, "é" may be `e` + a combining accent, and a
 * flag is two regional indicators. Deleting one code point per keypress left the
 * rest of the cluster on screen, often rendering as an unchanged glyph — so
 * backspace looked like it had done nothing and had to be pressed again. That is
 * the "backspace doesn't work, I need to long press backspace" report.
 */

/** One entry of the input buffer. `lit` marks a char produced by a \-escape. */
export interface Ch {
  c: string;
  lit: boolean;
}

const segmenter =
  typeof Intl !== "undefined" && "Segmenter" in Intl ? new Intl.Segmenter("en", { granularity: "grapheme" }) : null;

/** Grapheme count. `Intl.Segmenter` where available (Bun has it), else code points. */
export function countGraphemes(s: string): number {
  if (!segmenter) return [...s].length;
  let n = 0;
  for (const _ of segmenter.segment(s)) n++;
  return n;
}

/**
 * How many buffer entries make up the single glyph ending at `end`.
 *
 * Segments the whole run up to `end` and takes its last cluster, rather than
 * growing a span leftwards one code point at a time. The incremental version
 * looked simpler but was wrong: it asks whether a *substring* is one cluster,
 * and a substring starting mid-cluster does not read the same as the whole. A
 * ZWJ family emoji ("👩‍👩‍👦") broke on that — a leading `U+200D` is its own
 * cluster, so the walk stopped early and left half the family on screen.
 */
export function graphemeBack(buf: Ch[], end: number): number {
  if (end <= 0) return 0;
  // literal chars (from \-escapes) are individually meaningful, never merged
  if (buf[end - 1].lit) return 1;
  // clusters never span a literal, so only look back as far as the last one
  let lo = 0;
  for (let i = end - 1; i >= 0; i--) {
    if (buf[i].lit) {
      lo = i + 1;
      break;
    }
  }
  const text = buf
    .slice(lo, end)
    .map((c) => c.c)
    .join("");
  const last = lastGrapheme(text);
  // count code points, since that is what a buffer entry holds
  return Math.max(1, [...last].length);
}

/** The final grapheme cluster of `s` (empty string for empty input). */
function lastGrapheme(s: string): string {
  if (!s) return "";
  if (!segmenter) return [...s].at(-1) ?? "";
  let out = "";
  for (const g of segmenter.segment(s)) out = g.segment;
  return out;
}

/** Mirror of `graphemeBack` for forward-delete: entries in the cluster at `start`. */
export function graphemeForward(buf: Ch[], start: number): number {
  if (start >= buf.length) return 0;
  if (buf[start].lit) return 1;
  let hi = buf.length;
  for (let i = start; i < buf.length; i++) {
    if (buf[i].lit) {
      hi = i;
      break;
    }
  }
  const text = buf
    .slice(start, hi)
    .map((c) => c.c)
    .join("");
  if (!text) return 1;
  const first = segmenter ? (segmenter.segment(text)[Symbol.iterator]().next().value?.segment ?? text) : ([...text][0] ?? text);
  return Math.max(1, [...first].length);
}
