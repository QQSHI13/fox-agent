/**
 * Transcript selection: cell/offset mapping, range math, extraction, and the
 * press/drag/release arbitration.
 *
 * All of it is pure, so the interesting cases — wide characters, backwards
 * drags, multi-line spans, a drag that must not toggle the item under it — are
 * testable without a terminal. What is NOT covered here is the paint path and
 * the clipboard shell-outs; `test/screen.test.ts` pins the highlight, and
 * `test/keys.test.ts` pins the decoder that produces these events.
 */
import { describe, expect, test } from "bun:test";
import {
  DRAG_SLOP,
  extractSelection,
  gestureFor,
  orderSel,
  rowCells,
  selRangeForRow,
  wordRangeAt,
  type PressState,
} from "../src/tui/select.ts";
import type { Seg } from "../src/tui/wrap.ts";

const row = (...texts: string[]): Seg[] => texts.map((t) => ({ t }));

describe("rowCells: screen columns are not string indices", () => {
  test("ASCII maps one cell per character", () => {
    const c = rowCells(row("abc"));
    expect(c.text).toBe("abc");
    expect(c.start).toEqual([0, 1, 2]);
    expect(c.end).toEqual([1, 2, 3]);
  });

  test("a wide character owns two columns pointing at one character", () => {
    // The defect this prevents: slicing by column index would cut "日本" in
    // half and produce a broken string, or drop the second character entirely.
    const c = rowCells(row("日本"));
    expect(c.start.length).toBe(4); // two chars, four cells
    expect(c.start).toEqual([0, 0, 1, 1]);
    expect(c.end).toEqual([1, 1, 2, 2]);
    // selecting only the first cell still yields the whole character
    expect(c.text.slice(c.start[0], c.end[0])).toBe("日");
    // and cell 1 (its continuation) yields the same, not an empty string
    expect(c.text.slice(c.start[1], c.end[1])).toBe("日");
  });

  test("segments are concatenated into one coordinate space", () => {
    const c = rowCells(row("ab", "cd"));
    expect(c.text).toBe("abcd");
    expect(c.start).toEqual([0, 1, 2, 3]);
  });

  test("zero-width marks ride along with the character they modify", () => {
    // a combining accent occupies no column, so it must not shift every later
    // cell's mapping by one
    const c = rowCells(row("éx"));
    expect(c.start.length).toBe(2); // "é" and "x"
    expect(c.text.slice(c.start[0], c.end[0])).toBe("é"); // mark included
    expect(c.text.slice(c.start[1], c.end[1])).toBe("x");
  });
});

describe("orderSel + selRangeForRow", () => {
  test("a backwards drag selects the same span as a forwards one", () => {
    const a = { row: 5, col: 8 };
    const b = { row: 2, col: 3 };
    expect(orderSel(a, b)).toEqual([b, a]);
    expect(orderSel(b, a)).toEqual([b, a]);
  });

  test("a right-to-left drag on one row still orders by column", () => {
    expect(orderSel({ row: 1, col: 9 }, { row: 1, col: 2 })).toEqual([{ row: 1, col: 2 }, { row: 1, col: 9 }]);
  });

  test("rows outside the selection get no range", () => {
    const cells = rowCells(row("hello world"));
    const a = { row: 2, col: 0 };
    const b = { row: 4, col: 3 };
    expect(selRangeForRow(1, a, b, cells)).toBeNull();
    expect(selRangeForRow(5, a, b, cells)).toBeNull();
  });

  test("middle rows of a multi-row selection are covered end to end", () => {
    const cells = rowCells(row("hello world"));
    expect(selRangeForRow(3, { row: 2, col: 4 }, { row: 4, col: 1 }, cells)).toEqual({ from: 0, to: 10 });
  });

  test("a range is clamped to what the row actually paints", () => {
    // dragging off the right edge of a short row must not select past its text
    const cells = rowCells(row("hi"));
    expect(selRangeForRow(1, { row: 1, col: 0 }, { row: 1, col: 400 }, cells)).toEqual({ from: 0, to: 1 });
  });

  test("an empty row inside a selection yields no range", () => {
    expect(selRangeForRow(2, { row: 1, col: 0 }, { row: 3, col: 0 }, rowCells([]))).toBeNull();
  });
});

describe("extractSelection", () => {
  const rows = [row("first line"), row("second line"), row(""), row("fourth line")];

  test("a single-row selection is inclusive of both endpoints", () => {
    // dragging over "irst" must yield "irst" — an exclusive end would drop the
    // last character the user watched highlight
    expect(extractSelection(rows, { row: 0, col: 1 }, { row: 0, col: 4 })).toBe("irst");
  });

  test("a multi-row selection takes the tail, the whole middle, then the head", () => {
    expect(extractSelection(rows, { row: 0, col: 6 }, { row: 1, col: 5 })).toBe("line\nsecond");
  });

  test("a blank row inside the span survives as a blank line", () => {
    // paragraph breaks are content; collapsing them changes the pasted text
    expect(extractSelection(rows, { row: 1, col: 0 }, { row: 3, col: 5 })).toBe("second line\n\nfourth");
  });

  test("a backwards drag yields the same text", () => {
    const fwd = extractSelection(rows, { row: 0, col: 6 }, { row: 1, col: 5 });
    const back = extractSelection(rows, { row: 1, col: 5 }, { row: 0, col: 6 });
    expect(back).toBe(fwd);
  });

  test("wide characters come back whole", () => {
    const wide = [row("日本語です")];
    // cells 0..3 cover exactly the first two characters
    expect(extractSelection(wide, { row: 0, col: 0 }, { row: 0, col: 3 })).toBe("日本");
    // landing on a continuation cell still yields the whole character
    expect(extractSelection(wide, { row: 0, col: 0 }, { row: 0, col: 2 })).toBe("日本");
  });

  test("trailing whitespace is dropped per line", () => {
    // wrapping pads rows with spaces; a paste full of invisible trailing
    // whitespace is worse than useless
    const padded = [row("text   "), row("more      ")];
    expect(extractSelection(padded, { row: 0, col: 0 }, { row: 1, col: 40 })).toBe("text\nmore");
  });

  test("blank rows at the edges of the drag are trimmed away", () => {
    const withGaps = [row(""), row("body"), row("")];
    expect(extractSelection(withGaps, { row: 0, col: 0 }, { row: 2, col: 5 })).toBe("body");
  });

  test("press and release on one cell selects exactly that cell", () => {
    // app.ts treats this as a click rather than a drag, so it never reaches the
    // clipboard — but the range math must still be sane if it does
    expect(extractSelection(rows, { row: 1, col: 3 }, { row: 1, col: 3 })).toBe("o");
    expect(extractSelection([row("")], { row: 0, col: 0 }, { row: 0, col: 0 })).toBe("");
  });

  test("a selection past the end of the transcript does not throw", () => {
    expect(extractSelection(rows, { row: 2, col: 0 }, { row: 99, col: 0 })).toBe("fourth line");
  });
});

/**
 * The reported bug, stated as rules: "you can't drag within thinking box as it
 * collapses on first touch, not loosen touch, and doesn't support select."
 *
 * `gestureFor` is the whole arbitration, and `app.ts` reaches `toggleExpand`
 * only via a `click` verdict — so "never toggles on press" and "a drag never
 * toggles" are exactly the two assertions below, not something that has to be
 * confirmed by watching a terminal.
 */
describe("gestureFor: press decides nothing, drag never clicks", () => {
  const press = (x: number, y: number): PressState => ({ x, y, moved: false });

  test("button-down alone is never a click", () => {
    // the regression: the box collapsed the instant the button went down
    expect(gestureFor("down", null, 10, 4)).toEqual({ kind: "none" });
    expect(gestureFor("down", press(10, 4), 10, 4)).toEqual({ kind: "none" });
  });

  test("release without movement is the click", () => {
    expect(gestureFor("up", press(10, 4), 10, 4)).toEqual({ kind: "click" });
  });

  test("a release one cell away is still a click, not a drag", () => {
    // trackpads and shaky hands move a cell; that must not eat the click
    expect(gestureFor("up", press(10, 4), 11, 4)).toEqual({ kind: "click" });
  });

  test("a release past the slop is a copy and never a click", () => {
    // this is the "drag across the thinking box" case: it must not toggle
    expect(gestureFor("up", press(10, 4), 14, 4)).toEqual({ kind: "copy" });
    expect(gestureFor("up", press(10, 4), 10, 7)).toEqual({ kind: "copy" });
  });

  test("a gesture that already moved stays a drag even if it returns home", () => {
    // dragging out and back must not resurrect the click and toggle the item
    expect(gestureFor("up", { x: 10, y: 4, moved: true }, 10, 4)).toEqual({ kind: "copy" });
  });

  test("motion under the slop does not start selecting", () => {
    expect(gestureFor("drag", press(10, 4), 10, 4)).toEqual({ kind: "none" });
    expect(gestureFor("drag", press(10, 4), 11, 4)).toEqual({ kind: "none" });
  });

  test("motion past the slop extends the selection", () => {
    expect(gestureFor("drag", press(10, 4), 12, 4)).toEqual({ kind: "extend" });
    expect(gestureFor("drag", press(10, 4), 10, 6)).toEqual({ kind: "extend" });
  });

  test("motion or release with no press belongs to nobody", () => {
    // a release whose press landed before fox-agent took the mouse, or in another pane
    expect(gestureFor("drag", null, 5, 5)).toEqual({ kind: "none" });
    expect(gestureFor("up", null, 5, 5)).toEqual({ kind: "none" });
  });

  test("the slop is measured as a distance, not per axis", () => {
    // one cell right AND one cell down is two cells of travel: intent
    expect(gestureFor("up", press(10, 4), 11, 5)).toEqual({ kind: "copy" });
    expect(DRAG_SLOP).toBe(2);
  });
});

describe("wordRangeAt: double-click word selection", () => {
  const cells = (s: string) => rowCells(row(s));

  test("a click inside a word selects the whole word", () => {
    expect(wordRangeAt(cells("foo bar baz"), 5)).toEqual({ from: 4, to: 6 });
    expect(wordRangeAt(cells("foo bar baz"), 4)).toEqual({ from: 4, to: 6 });
    expect(wordRangeAt(cells("foo bar baz"), 6)).toEqual({ from: 4, to: 6 });
  });

  test("word edges stop at whitespace", () => {
    expect(wordRangeAt(cells("foo bar baz"), 0)).toEqual({ from: 0, to: 2 });
    expect(wordRangeAt(cells("foo bar baz"), 10)).toEqual({ from: 8, to: 10 });
  });

  test("whitespace belongs to no word", () => {
    expect(wordRangeAt(cells("foo bar"), 3)).toBeNull();
  });

  test("punctuation is its own class, so a click on '/' selects just it", () => {
    // "open src/app.ts now": segments are words, separators are one-cell runs
    expect(wordRangeAt(cells("open src/app.ts now"), 6)).toEqual({ from: 5, to: 7 }); // src
    expect(wordRangeAt(cells("open src/app.ts now"), 8)).toEqual({ from: 8, to: 8 }); // /
    expect(wordRangeAt(cells("a  b"), 1)).toBeNull();
  });

  test("wide characters keep cell columns, not string indices", () => {
    const c = cells("ab 日本語 cd"); // 日本語 occupies columns 3..8
    expect(wordRangeAt(c, 4)).toEqual({ from: 3, to: 8 });
    expect(wordRangeAt(c, 10)).toEqual({ from: 10, to: 11 }); // cd
    // CJK is letters, the same class as ASCII — no separator, one word
    expect(wordRangeAt(cells("ab日本語cd"), 3)).toEqual({ from: 0, to: 9 });
  });

  test("out-of-range columns select nothing", () => {
    expect(wordRangeAt(cells("abc"), 3)).toBeNull();
    expect(wordRangeAt(cells("abc"), -1)).toBeNull();
    expect(wordRangeAt(cells(""), 0)).toBeNull();
  });
});
