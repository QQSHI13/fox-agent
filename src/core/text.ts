/**
 * Cutting text to a length budget without splitting a character in half.
 *
 * JavaScript string length counts UTF-16 code units, so an emoji or a rare CJK
 * character (anything outside the BMP) is TWO units. A plain `slice` can land
 * between them and leave a lone surrogate, which renders as U+FFFD and — worse —
 * is PERSISTED that way: SQLite stores the replacement character, so the model
 * later reads a corrupted character in its own transcript and `ctx restore`
 * cannot bring the original back.
 *
 * Every place that trims output to fit a budget goes through here.
 */

const isHigh = (u: number): boolean => u >= 0xd800 && u <= 0xdbff;
const isLow = (u: number): boolean => u >= 0xdc00 && u <= 0xdfff;

/** First `n` code units, backing off one when the cut would split a pair. */
export function cutHead(s: string, n: number): string {
  if (n >= s.length) return s;
  if (n <= 0) return "";
  return s.slice(0, isHigh(s.charCodeAt(n - 1)) ? n - 1 : n);
}

/** Last `n` code units, advancing one when the cut would split a pair. */
export function cutTail(s: string, n: number): string {
  if (n >= s.length) return s;
  if (n <= 0) return "";
  const start = s.length - n;
  return s.slice(isLow(s.charCodeAt(start)) ? start + 1 : start);
}
