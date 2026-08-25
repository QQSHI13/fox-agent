/**
 * Input editing: one keypress deletes one glyph.
 *
 * Pure, so the cases that actually broke — emoji with modifiers, combining
 * accents, flags — are testable without a terminal. The report these pin is
 * "backspace doesn't work sometimes, I need to long press backspace to get it
 * work": a glyph made of several code points lost one per press, and the
 * intermediate states often looked identical on screen, so the key appeared dead.
 */
import { describe, expect, test } from "bun:test";
import { countGraphemes, graphemeBack, graphemeForward, type Ch } from "../src/tui/edit.ts";

/** build a buffer the way `insertText` does: one entry per code point */
const bufOf = (s: string, lit = false): Ch[] => [...s].map((c) => ({ c, lit }));

/** delete one glyph backwards from the end, returning what is left */
const bs = (s: string): string => {
  const b = bufOf(s);
  const n = graphemeBack(b, b.length);
  return b
    .slice(0, b.length - n)
    .map((c) => c.c)
    .join("");
};

describe("graphemeBack: one press erases one visible glyph", () => {
  test("ascii deletes one character", () => {
    expect(bs("abc")).toBe("ab");
  });

  test("an emoji with a skin-tone modifier goes in one press", () => {
    // two code points, one glyph — the old code left the bare 👍 behind
    expect(bufOf("👍🏽")).toHaveLength(2);
    expect(bs("x👍🏽")).toBe("x");
  });

  test("a combining accent goes with its base character", () => {
    // "e" + U+0301. Deleting only the accent redraws a glyph that looks nearly
    // identical, which is exactly what "backspace did nothing" looked like.
    const nfd = "é";
    expect(bufOf(nfd)).toHaveLength(2);
    expect(bs("caf" + nfd)).toBe("caf");
  });

  test("a flag is one glyph, not two regional indicators", () => {
    expect(bufOf("🇨🇳")).toHaveLength(2);
    expect(bs("go 🇨🇳")).toBe("go ");
  });

  test("a ZWJ family emoji goes in one press", () => {
    // the worst case: several code points joined by U+200D
    const family = "👩‍👩‍👦";
    expect(bufOf(family).length).toBeGreaterThan(3);
    expect(bs("a" + family)).toBe("a");
  });

  test("CJK and plain emoji are single code points already", () => {
    expect(bs("日本")).toBe("日");
    expect(bs("hi😀")).toBe("hi");
  });

  test("an empty buffer deletes nothing rather than throwing", () => {
    expect(graphemeBack([], 0)).toBe(0);
    expect(graphemeBack(bufOf("abc"), 0)).toBe(0);
  });

  test("consecutive emoji delete one at a time", () => {
    // clusters must not run together and swallow the whole line
    expect(bs("😀😀😀")).toBe("😀😀");
  });

  test("a literal char from a \\-escape is never merged into a cluster", () => {
    // \n entered as an escape is its own entry and must delete alone, even when
    // adjacent code points would otherwise cluster
    const b: Ch[] = [{ c: "a", lit: false }, { c: "\n", lit: true }];
    expect(graphemeBack(b, 2)).toBe(1);
  });

  test("deleting mid-buffer respects the cluster at the cursor", () => {
    const b = bufOf("a👍🏽b");
    // cursor sits just after the emoji cluster (entries 1..2)
    expect(graphemeBack(b, 3)).toBe(2);
  });
});

describe("graphemeForward: the delete key mirrors backspace", () => {
  test("forward-delete removes a whole cluster", () => {
    const b = bufOf("👍🏽x");
    expect(graphemeForward(b, 0)).toBe(2);
  });

  test("forward-delete at the end removes nothing", () => {
    const b = bufOf("ab");
    expect(graphemeForward(b, 2)).toBe(0);
    expect(graphemeForward([], 0)).toBe(0);
  });

  test("forward-delete of ascii takes one entry", () => {
    expect(graphemeForward(bufOf("abc"), 1)).toBe(1);
  });
});

describe("countGraphemes", () => {
  test("counts what the user sees, not code points", () => {
    expect(countGraphemes("👍🏽")).toBe(1);
    expect(countGraphemes("é")).toBe(1);
    expect(countGraphemes("🇨🇳")).toBe(1);
    expect(countGraphemes("ab")).toBe(2);
    expect(countGraphemes("")).toBe(0);
  });
});
