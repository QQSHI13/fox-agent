import { describe, expect, test } from "bun:test";
import { scrollbarGeom, scrollbarScrollTop } from "../src/tui/screen.ts";

describe("scrollbarGeom", () => {
  test("hidden when content fits", () => {
    expect(scrollbarGeom(10, 30, 0)).toEqual({ showing: false, ty: 0, th: 30 });
    expect(scrollbarGeom(30, 30, 0)).toEqual({ showing: false, ty: 0, th: 30 });
  });

  test("hidden when the viewport is degenerate", () => {
    expect(scrollbarGeom(100, 3, 0).showing).toBe(false);
  });

  test("shown when content overflows; thumb height fills the viewport proportionally", () => {
    const g = scrollbarGeom(300, 30, 0);
    expect(g.showing).toBe(true);
    // floor(30*30/300) = 3
    expect(g.th).toBe(3);
    expect(g.ty).toBe(0);
  });

  test("thumb height never below one row", () => {
    // 100_000 rows in 30: floor(900/100000) = 0 -> clamped to 1
    const g = scrollbarGeom(100_000, 30, 0);
    expect(g.th).toBe(1);
  });

  test("thumb travels to the bottom as scrollTop reaches max", () => {
    const rows = 200, vh = 20;
    const top = scrollbarGeom(rows, vh, 0);
    const bottom = scrollbarGeom(rows, vh, rows - vh);
    expect(top.ty).toBe(0);
    expect(bottom.ty).toBe(vh - bottom.th);
  });

  test("scrollTop out of range is clamped, not NaN/negative", () => {
    const g = scrollbarGeom(200, 20, 999);
    expect(g.ty).toBeLessThanOrEqual(20 - g.th);
    const n = scrollbarGeom(200, 20, -50);
    expect(n.ty).toBe(0);
  });
});

describe("scrollbarScrollTop", () => {
  test("inverse of the paint mapping: press at thumb top scrolls proportionally", () => {
    const rows = 200, vh = 20;
    // pressing the last viewport row lands at (or near) max scroll
    const max = scrollbarScrollTop(rows, vh, vh - 1);
    expect(max).toBe(rows - vh);
    // pressing the first row is the top
    expect(scrollbarScrollTop(rows, vh, 0)).toBe(0);
  });

  test("y clamped into the viewport", () => {
    expect(scrollbarScrollTop(200, 20, -5)).toBe(0);
    expect(scrollbarScrollTop(200, 20, 99)).toBe(180);
  });

  test("zero when the scrollbar is not shown", () => {
    expect(scrollbarScrollTop(10, 30, 5)).toBe(0);
  });

  test("round trip: geom(scrollTop).ty center maps back near the same offset", () => {
    const rows = 150, vh = 25;
    // the scrub maps the PRESS ROW across the full viewport (y/(vh-1)), while
    // the thumb travels only vh - th rows — so a thumb-center press lands
    // within (th/2 rows of travel) * (rows-vh)/(vh-th) of the original offset.
    // The strip is a line you drag, not a precision slider; bounded drift is
    // the design.
    const th = scrollbarGeom(rows, vh, 0).th;
    const slop = Math.ceil((th / 2 + 1) * ((rows - vh) / (vh - th)));
    for (const st of [0, 25, 60, rows - vh]) {
      const g = scrollbarGeom(rows, vh, st);
      const y = g.ty + Math.floor(g.th / 2); // middle of the thumb
      const back = scrollbarScrollTop(rows, vh, y);
      expect(Math.abs(back - st)).toBeLessThanOrEqual(slop);
    }
  });
});
