import { describe, expect, test } from "bun:test";
import { chipGutter, contentOrigin, contentOriginForChip, contentWidth } from "../src/tui/layout.ts";

// The [N] marker's gutter used to be re-derived in five places (the wrap width
// in itemRows, the wrap width in streamRows, the paint loop's content offset,
// the selection restyle, and the click-to-column mapping). Each drifted from the
// others, which is how reserving the chip but not its gap column overflowed a
// row by one and made a selected marked row look displaced, and how a flat
// `x - 1` click mapping put the selection chipWidth columns off. These tests
// pin the three views to ONE definition, so a future edit cannot move one
// without the others.
describe("marker gutter: one geometry, three consumers", () => {
  test("content width and content origin account for the chip AND its gap column", () => {
    const W = 80;
    for (const seq of [1, 9, 10, 100, 1000]) {
      const gutter = chipGutter(seq);
      // the gutter is the chip plus one uncolored column
      expect(gutter).toBe(`[${seq}]`.length + 1);
      // content starts after the gutter, and the width is what remains
      expect(contentOrigin(seq)).toBe(gutter);
      expect(contentWidth(W, seq)).toBe(W - gutter);
      // the invariant that was violated: origin + width must never exceed the row
      expect(contentOrigin(seq) + contentWidth(W, seq)).toBeLessThanOrEqual(W);
    }
  });

  test("an unmarked row is untouched — no gutter, full width", () => {
    expect(chipGutter(undefined)).toBe(0);
    expect(contentOrigin(undefined)).toBe(1);
    expect(contentWidth(80, undefined)).toBe(80);
    expect(contentOrigin(undefined) + contentWidth(80, undefined)).toBe(81);
  });

  test("the two contentOrigin spellings agree (seq-based and chip-width-based)", () => {
    // paint() holds the marker's chip WIDTH, hit-tests hold the seq. They must
    // resolve to the same column, or clicking and painting disagree.
    for (const seq of [1, 9, 10, 100, 1000]) {
      const chipW = `[${seq}]`.length;
      expect(contentOriginForChip(chipW)).toBe(contentOrigin(seq));
    }
    // an unmarked row has no chip and starts at the margin
    expect(contentOriginForChip(0)).toBe(contentOrigin(undefined));
  });

  test("a very narrow terminal still leaves a usable wrap column", () => {
    // the floor: no negative or zero width, however big the chip
    expect(contentWidth(4, 1000)).toBeGreaterThanOrEqual(8);
    expect(contentWidth(0, 1)).toBeGreaterThanOrEqual(8);
  });

  // A tool BODY carries its head's seq (they are one message) but paints no
  // chip, so it must reserve no gutter. The app decides this with a rowSeq()
  // predicate rather than reading seq directly — these tests pin the geometry
  // the predicate implies, so 'the line after the marker is also clickable' and
  // 'selection on the second line of a tool call is displaced' cannot return.
  test("a marker continuation reserves NO gutter (a tool body paints no chip)", () => {
    const W = 80;
    const HEAD_SEQ = 12;
    // the head: chip, so gutter applies
    expect(contentWidth(W, HEAD_SEQ)).toBe(W - chipGutter(HEAD_SEQ));
    // the body: same message, no chip — identical to an unmarked row
    expect(contentWidth(W, undefined)).toBe(W);
    expect(contentOrigin(undefined)).toBe(1);
    // and therefore the body's selection starts at the plain margin, not
    // chipWidth columns in — the displacement this fixes
    expect(contentOrigin(undefined)).toBeLessThan(contentOrigin(HEAD_SEQ));
  });
});
import { computeFrame, itemEdgeSpan, scrollbarGeom, scrollbarScrollTop, viewportHeight, type FrameInput, type Row } from "../src/tui/layout.ts";
import { renderMarkdown } from "../src/tui/markdown.ts";
import { wrapSegs } from "../src/tui/wrap.ts";

const base: FrameInput = {
  W: 100, H: 30, scrollTop: 0, stick: true, scrollbar: true,
  items: [], streamText: null,
  renderItem: (it: any, w: number) => [{ segs: [{ t: `x`.repeat(Math.min(20, w)) }] }],
  countItem: (it: any, _w: number) => 1,
  renderStream: (text: string, w: number) => text.split("\n").map((l: string) => ({ segs: [{ t: l.slice(0, w) }] })),
  countStream: (text: string) => text.split("\n").length,
  inputRows: 1, caretRow: 0, INPUT_MAX_ROWS: 8, pendingCount: 0,
};

describe("computeFrame", () => {
  test("content fits: no scrollbar, full width", () => {
    const fr = computeFrame({ ...base, items: [1,2,3].map((k) => ({ kind: "md", k })) });
    expect(fr.sbShowing).toBe(false);
    expect(fr.contentWidth).toBe(100);
    // 3 content rows + one blank between each pair; blanks own -1 so the
    // owner array stays aligned to rows (hit-test rows never desync)
    expect(fr.total).toBe(5);
    expect(fr.owner.length).toBe(fr.rows.length);
    expect(fr.owner).toEqual([1, -1, 2, -1, 3]);
  });

  test("overflow: rebuilds at W-2 and shows the scrollbar", () => {
    const items = Array.from({ length: 100 }, (_, k) => ({ kind: "md", k }));
    const fr = computeFrame({ ...base, items });
    expect(fr.sbShowing).toBe(true);
    expect(fr.contentWidth).toBe(98);
    expect(fr.total).toBe(100 + 99); // one blank between each pair
    expect(fr.stick).toBe(true);
    expect(fr.scrollTop).toBe(199 - fr.vh);
    // window: only ~3 viewports of rows built, not 199
    expect(fr.rowCount).toBeLessThan(199);
  });

  test("disabled scrollbar never reserves a column", () => {
    const items = Array.from({ length: 100 }, (_, k) => ({ kind: "md", k }));
    const fr = computeFrame({ ...base, items, scrollbar: false });
    expect(fr.sbShowing).toBe(false);
    expect(fr.contentWidth).toBe(100);
  });

  test("spacing: blank between items, toolhead->toolbody glued", () => {
    const items = [
      { kind: "md", k: 1 },
      { kind: "toolhead", k: 2, toolResult: false },
      { kind: "toolbody", k: 3, toolResult: true },
      { kind: "md", k: 4 },
    ];
    const fr = computeFrame({ ...base, items });
    // rows: md / blank / head / body / blank / md — head->body glued (no blank)
    // rows: md / blank / head / body / blank / md — head->body glued (no blank)
    expect(fr.total).toBe(6);
    expect(fr.owner).toEqual([1, -1, 2, 3, -1, 4]);
  });

  test("queue rows shrink the viewport and lift the dock", () => {
    const a = viewportHeight({ H: 30, inputRows: 1, INPUT_MAX_ROWS: 8, pendingCount: 0 });
    const b = viewportHeight({ H: 30, inputRows: 1, INPUT_MAX_ROWS: 8, pendingCount: 3 });
    expect(b).toBe(a - 3);
    const fr = computeFrame({ ...base, pendingCount: 3 });
    expect(fr.queueH).toBe(3);
  });

  test("at-bottom implies stick regardless of input stick", () => {
    const items = Array.from({ length: 100 }, (_, k) => ({ kind: "md", k }));
    const fr = computeFrame({ ...base, items, stick: false, scrollTop: 99999 });
    expect(fr.stick).toBe(true);
    // scrolled up: stick passes through
    const fr2 = computeFrame({ ...base, items, stick: false, scrollTop: 5 });
    expect(fr2.stick).toBe(false);
    expect(fr2.scrollTop).toBe(5);
  });

  test("count and render agree: total is the rows actually painted, and the end is reachable", () => {
    // md items whose text ends in a newline render a trailing blank row —
    // exactly the shape that used to be counted stripped and painted whole,
    // which shorted `total` by a row per message and left the tail unreachable
    const mdRows = (text: string, w: number): Row[] =>
      renderMarkdown(text).flatMap((m) => wrapSegs(m, w).map((segs) => ({ segs })));
    const both = (it: any, w: number) => {
      const rows = mdRows(it.text, w);
      const [a, b] = itemEdgeSpan(rows);
      return rows.slice(a, b);
    };
    const items = Array.from({ length: 100 }, (_, k) => ({ kind: "md", k, text: `message ${k}\n` }));
    // what paint would lay down if every item were built whole: bodies + one
    // blank between each pair
    const trueRows = items.reduce((a, it) => a + both(it, 78).length, 0) + (items.length - 1);

    const fr = computeFrame({
      ...base,
      W: 80,
      H: 30,
      items,
      renderItem: both,
      countItem: (it: any, w: number) => both(it, w).length,
    });

    expect(fr.total).toBe(trueRows);
    expect(fr.total).toBeGreaterThan(fr.vh); // a real scroll range, not a trivial case
    // at the bottom the last content row must be reachable — this is the line
    // the old mismatch broke, by exactly one row per newline-terminated message
    expect(fr.scrollTop).toBe(trueRows - fr.vh);
    // and the window built for that offset still fills the viewport
    expect(fr.rowCount - fr.winOffset).toBe(fr.vh);
  });

  test("itemEdgeSpan trims an item's own edge blanks, keeps interior ones", () => {
    const row = (t: string): Row => ({ segs: t === "" ? [] : [{ t }] });
    expect(itemEdgeSpan([row("a"), row(""), row("b")])).toEqual([0, 3]); // interior blank stays
    expect(itemEdgeSpan([row(""), row("a"), row("")])).toEqual([1, 2]); // both edges go
    expect(itemEdgeSpan([row(""), row("")])).toEqual([2, 2]); // all-blank: nothing survives
    expect(itemEdgeSpan([])).toEqual([0, 0]);
  });

  test("a row carrying a [N] chip is NOT blank (the missing-marker bug)", () => {
    // An assistant node that carries tool calls has no text of its own — the
    // reply IS the calls. It rendered as one zero-segment row, and the span
    // trimmed it away, so its [N] chip never painted and the transcript jumped
    // [2] think -> [4] tool with [3] missing. The chip is the node's address
    // (what you click to view or revert it), so it keeps the row alive.
    const chip = { label: "[3]", bg: "blue", fg: "white", w: 3 };
    expect(itemEdgeSpan([{ segs: [], marker: chip }])).toEqual([0, 1]); // kept
    expect(itemEdgeSpan([{ segs: [] }])).toEqual([1, 1]); // a blank without a chip still trims
    // a chip row bracketed by blanks keeps only itself
    expect(itemEdgeSpan([{ segs: [] }, { segs: [], marker: chip }, { segs: [] }])).toEqual([1, 2]);
  });

  test("the window holds the transcript's real rows, at every scroll position", () => {
    // Geometry alone cannot catch a skipped-item accounting bug: `total` and
    // `scrollTop` stay honest while the rows inside the window drift, which
    // read as "the scrollbar says the bottom, the screen shows something else".
    // So compare the painted window against the rows built whole.
    const mdRows = (text: string, w: number): Row[] =>
      renderMarkdown(text).flatMap((m) => wrapSegs(m, w).map((segs) => ({ segs })));
    const strip = (it: any, w: number) => {
      const rows = mdRows(it.text, w);
      const [a, b] = itemEdgeSpan(rows);
      return rows.slice(a, b);
    };
    const items = Array.from({ length: 100 }, (_, k) => ({ kind: "md", k, text: `message ${k} body\n` }));
    const truth: Row[] = [];
    items.forEach((it, i) => {
      if (i) truth.push({ segs: [] }); // assemble's separator blank
      truth.push(...strip(it, 78));
    });

    const inp: FrameInput = {
      ...base,
      W: 80,
      H: 30,
      items,
      renderItem: strip,
      countItem: (it: any, w: number) => strip(it, w).length,
    };
    const vh = viewportHeight(inp);
    const at = (scrollTop: number, stick: boolean) => {
      const fr = computeFrame({ ...inp, scrollTop, stick });
      return fr.rows.slice(fr.winOffset, fr.winOffset + fr.vh).map((r) => r.segs.map((s) => s.t).join(""));
    };
    const want = (from: number) => truth.slice(from, from + vh).map((r) => r.segs.map((s) => s.t).join(""));

    const max = truth.length - vh;
    for (const scrollTop of [0, Math.floor(max / 2), max]) {
      expect(at(scrollTop, scrollTop === max)).toEqual(want(scrollTop));
    }
    // the reason this test exists: the bottom of the transcript is the last
    // content row, not `message 75` of 100
    expect(at(max, true).at(-1)).toContain("message 99");
  });
});

describe("scrollbarGeom / scrollbarScrollTop", () => {
  test("hidden when fits, thumb>=1 row", () => {
    expect(scrollbarGeom(10, 30, 0).showing).toBe(false);
    expect(scrollbarGeom(100000, 30, 0).th).toBe(1);
  });
  test("inverse maps press rows to offsets within range", () => {
    expect(scrollbarScrollTop(200, 20, 19)).toBe(180);
    expect(scrollbarScrollTop(200, 20, 0)).toBe(0);
  });
});
