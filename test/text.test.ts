import { describe, expect, test } from "bun:test";
import { cutHead, cutTail } from "../src/core/text.ts";

const lone = (t: string) => /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(t);

describe("cutting text to a length budget", () => {
  // A cut between the two halves of an emoji is stored as U+FFFD and never
  // comes back — the model reads a corrupted character in its own transcript.
  test("a head cut never splits a character in half", () => {
    const s = "a" + "😀".repeat(20);
    for (let n = 1; n <= s.length; n++) expect(lone(cutHead(s, n))).toBe(false);
    // the same cut as a plain slice IS broken, so the test would fail without it
    expect(lone(s.slice(0, 2))).toBe(true);
  });

  test("a tail cut never splits a character in half", () => {
    const s = "😀".repeat(20) + "a";
    for (let n = 1; n <= s.length; n++) expect(lone(cutTail(s, n))).toBe(false);
    // a plain tail slice at an odd offset lands on the low half, so this
    // assertion is what proves the helper is not a no-op
    expect(lone(s.slice(s.length - 40))).toBe(true);
  });

  test("short text and zero/large budgets pass through whole", () => {
    const s = "héllo 😀";
    expect(cutHead(s, 999)).toBe(s);
    expect(cutTail(s, 999)).toBe(s);
    expect(cutHead(s, 0)).toBe("");
    expect(cutTail(s, 0)).toBe("");
  });

  test("ASCII is cut at exactly the requested length", () => {
    expect(cutHead("abcdef", 3)).toBe("abc");
    expect(cutTail("abcdef", 3)).toBe("def");
  });
});
