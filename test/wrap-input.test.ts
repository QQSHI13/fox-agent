import { describe, expect, test } from "bun:test";
import { buildInputLayout, caretPos, rowBufRange } from "../src/tui/wrap.ts";
import { wrapText } from "../src/tui/wrap.ts";

// The editor's wrap parameters — the dock's rows are the lossless, full-width
// mode of the one kernel every TUI surface uses.
const wrapByWidth = (s: string, cols: number) =>
  wrapText(s, cols, { lossless: true, exactWidth: true, keepLeadSpaces: true });
import { charWidth } from "../src/tui/screen.ts";

const width = (s: string) => [...s].reduce((a, c) => a + charWidth(c.codePointAt(0)!), 0);

/**
 * The invariant the caret must satisfy, checked over every cursor position of
 * a text: the caret lands on a row of ITS OWN logical line, and its column is
 * inside [0, rowW] — never negative (painted left of the text) and never past
 * the row's painted width. A caret at a wrap boundary belongs to the row that
 * ENDS there, so `colW === rowW` is legal; `colW === rowW + 1` is the consumed
 * break space and must have snapped back to the previous row.
 */
function check(text: string, maxCols: number) {
  const layout = buildInputLayout(text, maxCols);
  const chars = [...text];
  let li = 0;
  for (let cur = 0; cur <= chars.length; cur++) {
    const p = caretPos(layout, cur, text);
    const row = layout.rows[p.visRow];
    expect(row).toBeDefined();
    // the caret's logical line, recomputed independently of caretPos
    const expectLine = chars.slice(0, cur).filter((c) => c === "\n").length;
    expect(li).toBe(expectLine);
    expect(row.logical).toBe(expectLine);
    expect(p.colW).toBeGreaterThanOrEqual(0);
    expect(p.colW).toBeLessThanOrEqual(Math.max(row.rowW, 0));
    // startCol is a column in the LOGICAL LINE, not on screen: every visual
    // row is painted from its own left edge, so only colW is a screen
    // coordinate. (startCol + colW may legitimately exceed maxCols.)
    if (chars[cur] === "\n") li++;
  }
}

describe("input wrap + caret mapping", () => {
  test("caret at a wrap boundary stays on the row that ends there (the -1 column bug)", () => {
    // "aaaaaaaaaa bb" at 10: row 0 is "aaaaaaaaaa" (startCol 0, rowW 10); the
    // single space does not fit at the end of row 0, so it carries over and
    // row 1 is " bb" (startCol 10, rowW 3). The old code dropped that space
    // AND the old fallback took the line's LAST row for cursor 10, returning
    // colW = 10 - 11 = -1 — a caret painted left of the prompt arrow.
    const text = "aaaaaaaaaa bb";
    const layout = buildInputLayout(text, 10);
    expect(layout.rows.map((r) => [r.text, r.startCol, r.rowW])).toEqual([
      ["aaaaaaaaaa", 0, 10],
      [" bb", 10, 3],
    ]);
    // Cursor 10 sits just BEFORE the space that wrapped onto row 1, so it maps
    // to row 1 column 0 (the space's own cell). Painting it at row 0 column 10
    // would put it one cell past the box interior (x = 3 + maxCols), outside
    // the input area. The old code produced colW = -1 for this caret.
    expect(caretPos(layout, 10, text)).toEqual({ visRow: 1, colW: 0 });
    expect(caretPos(layout, 11, text)).toEqual({ visRow: 1, colW: 1 }); // just past the space
    expect(caretPos(layout, 12, text)).toEqual({ visRow: 1, colW: 2 }); // the "b"
    expect(caretPos(layout, 14, text)).toEqual({ visRow: 1, colW: 3 }); // past EOL clamps to the end
  });

  test("a caret at the end of a row that fills the width stays inside the box", () => {
    // No space to carry: the row is exactly maxCols wide. The caret at its end
    // must not paint at x = 3 + maxCols (outside the box).
    const text = "x".repeat(10);
    const layout = buildInputLayout(text, 10);
    const p = caretPos(layout, 10, text);
    expect(layout.rows[p.visRow].startCol + p.colW).toBe(10);
    // and with a following word, the caret before the break space maps into the
    // next row (never a negative column)
    const t2 = "x".repeat(10) + " yy";
    const l2 = buildInputLayout(t2, 10);
    for (let c = 0; c <= t2.length; c++) {
      const q = caretPos(l2, c, t2);
      expect(q.colW).toBeGreaterThanOrEqual(0);
      expect(q.colW).toBeLessThanOrEqual(Math.max(l2.rows[q.visRow].rowW, 0));
    }
  });

  test("caret at end of a logical line does not jump to another line", () => {
    const text = "first\nsecond";
    const layout = buildInputLayout(text, 40);
    expect(caretPos(layout, 5, text)).toEqual({ visRow: 0, colW: 5 }); // end of "first"
    expect(caretPos(layout, 6, text)).toEqual({ visRow: 1, colW: 0 }); // start of "second"
    expect(caretPos(layout, 12, text)).toEqual({ visRow: 1, colW: 6 });
  });

  test("leading spaces round-trip through the wrap", () => {
    const text = "    indented";
    const layout = buildInputLayout(text, 40);
    expect(layout.rows[0].text).toBe("    indented");
    expect(caretPos(layout, 4, text)).toEqual({ visRow: 0, colW: 4 });
  });

  test("an oversized word hard-splits, and its rows stay contiguous", () => {
    const text = "x".repeat(23);
    const layout = buildInputLayout(text, 10);
    expect(layout.rows.map((r) => r.text)).toEqual(["x".repeat(10), "x".repeat(10), "xxx"]);
    check(text, 10);
  });

  test("the wrap round-trips: no character is ever dropped", () => {
    // The old space branch painted only the spaces that fit and DISCARDED the
    // rest, so the painted text stopped matching the buffer — every dropped
    // space shifted the caret a column left of what was typed, permanently.
    for (const text of ["a   b", "a          b", "x     y     z", "    lead", "trail    "]) {
      for (const cols of [8, 9, 10, 12, 20]) {
        const layout = buildInputLayout(text, cols);
        const painted = layout.rows.map((r) => r.text).join("");
        if (text.includes("\n")) continue;
        expect(painted).toBe(text);
      }
    }
    expect(wrapByWidth("a          b", 10)).toEqual(["a         ", " b"]);
  });

  test("rows of a line are contiguous (next.startCol === startCol + rowW)", () => {
    const text = "alpha   be gamma d   epsilon zeta eta theta";
    for (const cols of [8, 11, 20, 33]) {
      const layout = buildInputLayout(text, cols);
      for (let i = 1; i < layout.rows.length; i++) {
        const prev = layout.rows[i - 1];
        const row = layout.rows[i];
        if (row.logical !== prev.logical) continue;
        expect(row.startCol).toBe(prev.startCol + prev.rowW);
      }
    }
  });

  test("rowBufRange covers exactly the painted text of each row", () => {
    const text = "hello world again";
    const layout = buildInputLayout(text, 12);
    for (let v = 0; v < layout.rows.length; v++) {
      const [s, e] = rowBufRange(layout, v, text);
      expect(text.slice(s, e)).toBe(layout.rows[v].text);
    }
    expect(rowBufRange(layout, 0, text)).toEqual([0, 12]); // includes the break space it ends on
    expect(rowBufRange(layout, 1, text)).toEqual([12, 17]);
  });

  test("invariant holds across a fuzz of word boundaries, spaces and CJK", () => {
    const alphabet = ["a", "b", "xy", " ", "  ", "中", "日本語", "😀", "\n"];
    let seed = 1234567;
    const rnd = (n: number) => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed % n;
    };
    for (let iter = 0; iter < 600; iter++) {
      let text = "";
      const parts = 1 + rnd(8);
      for (let i = 0; i < parts; i++) text += alphabet[rnd(alphabet.length)];
      const maxCols = 8 + rnd(24);
      check(text, maxCols);
    }
  });

  test("invariant holds for every prefix of a long line", () => {
    const words = ["alpha", "be", "gamma", "d", "epsilon", "zeta", "eta", "theta"];
    let text = "";
    for (let i = 0; i < 40; i++) text += words[i % words.length] + (i % 3 === 0 ? "   " : " ");
    for (let n = 0; n <= text.length; n++) {
      for (const cols of [8, 11, 20, 33]) {
        const layout = buildInputLayout(text.slice(0, n), cols);
        const p = caretPos(layout, n, text.slice(0, n));
        const row = layout.rows[p.visRow];
        expect(row).toBeDefined();
        expect(p.colW).toBeGreaterThanOrEqual(0);
        expect(p.colW).toBeLessThanOrEqual(Math.max(row.rowW, 0));
      }
    }
  });

  test("wrapByWidth never paints more than maxCols", () => {
    for (let iter = 0; iter < 200; iter++) {
      const text = "word ".repeat(iter % 17) + "x".repeat(iter % 23);
      const cols = 8 + (iter % 20);
      for (const line of wrapByWidth(text, cols)) expect(width(line)).toBeLessThanOrEqual(cols);
    }
  });
});
