import { describe, expect, test } from "bun:test";
import { computeFrame, scrollbarGeom, scrollbarScrollTop, viewportHeight, type FrameInput } from "/home/qq/.openclaw/workspace/projects/fox-agent/src/tui/layout.ts";

const base: FrameInput = {
  W: 100, H: 30, scrollTop: 0, stick: true, scrollbar: true,
  items: [], streamText: null,
  renderItem: (it: any, w) => [{ segs: [{ t: `x`.repeat(Math.min(20, w)) }] }],
  renderStream: (text, w) => text.split("\n").map((l) => ({ segs: [{ t: l.slice(0, w) }] })),
  inputRows: 1, caretRow: 0, INPUT_MAX_ROWS: 8, pendingCount: 0,
};

describe("computeFrame", () => {
  test("content fits: no scrollbar, full width", () => {
    const fr = computeFrame({ ...base, items: [1,2,3].map((k) => ({ kind: "md", k })) });
    expect(fr.sbShowing).toBe(false);
    expect(fr.contentWidth).toBe(100);
    // 3 content rows + one blank between each pair; blanks own -1 so the
    // owner array stays aligned to rows (hit-test rows never desync)
    expect(fr.rowCount).toBe(5);
    expect(fr.owner.length).toBe(fr.rows.length);
    expect(fr.owner).toEqual([1, -1, 2, -1, 3]);
  });

  test("overflow: rebuilds at W-2 and shows the scrollbar", () => {
    const items = Array.from({ length: 100 }, (_, k) => ({ kind: "md", k }));
    const fr = computeFrame({ ...base, items });
    expect(fr.sbShowing).toBe(true);
    expect(fr.contentWidth).toBe(98);
    expect(fr.rowCount).toBe(100 + 99); // one blank between each pair
    expect(fr.stick).toBe(true);
    expect(fr.scrollTop).toBe(199 - fr.vh);
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
    expect(fr.rowCount).toBe(6);
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
