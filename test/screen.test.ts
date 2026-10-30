import { describe, expect, test } from "bun:test";

// Fake term capturing writes so we can assert on escape output.
class FakeTerm {
  buf = "";
  write(s: string) {
    this.buf += s;
  }
  flush() {}
}

describe("Screen.flush sparse-cell correctness", () => {
  test("styled cell after a gap is positioned explicitly, not at pen position", async () => {
    const { Screen } = await import("../src/tui/screen.ts");
    const term = new FakeTerm();
    const scr = new Screen(term as any);
    scr.resize(20, 3);

    const base = scr.sgr({ fg: "#ffffff" });
    const thumb = scr.sgr({ bg: "#6e7681" });

    // row 0: text at cols 1..5, gap cols 6..17, thumb space at col 18
    scr.text(1, 0, "hello", base);
    scr.fillRow(0, 18, 19, thumb);
    scr.flush();

    // the thumb cell must be preceded by an explicit CUP to col 19 (1-based)
    expect(term.buf).toContain("\x1b[1;19H");
    // and it must appear AFTER the text run, not immediately after "hello"
    const afterText = term.buf.split("hello")[1] ?? "";
    expect(afterText).toContain("\x1b[1;19H");

    // row with ONLY a styled gap cell (empty transcript row + thumb)
    term.buf = "";
    scr.clear();
    scr.fillRow(1, 18, 19, thumb);
    scr.flush();
    // first real write on that line must be preceded by positioning to col 19
    const row1 = term.buf.split("\x1b[2;1H")[1] ?? "";
    expect(row1.indexOf("\x1b[2;19H")).toBeGreaterThanOrEqual(0);
  });

  test("contiguous rows emit no extra repositioning", async () => {
    const { Screen } = await import("../src/tui/screen.ts");
    const term = new FakeTerm();
    const scr = new Screen(term as any);
    scr.resize(10, 2);
    const base = scr.sgr({ fg: "#ffffff" });
    scr.text(0, 0, "abcdefghi", base); // 9 of 10 cols -> K emitted, no gaps
    scr.flush();
    // exactly one CUP for the row (the initial one) — no mid-row resyncs
    expect(term.buf.match(/\x1b\[1;\d+H/g)).toHaveLength(1);
  });

  test("gap before a trailing styled cell is erased, not left stale", async () => {
    const { Screen } = await import("../src/tui/screen.ts");
    const term = new FakeTerm();
    const scr = new Screen(term as any);
    scr.resize(20, 2);
    const base = scr.sgr({ fg: "#ffffff" });
    const thumb = scr.sgr({ bg: "#6e7681" });

    // frame 1: long text fills cols 1..15, thumb at col 18
    scr.text(1, 0, "abcdefghijklmnop", base);
    scr.fillRow(0, 18, 19, thumb);
    scr.flush();

    // frame 2: content shrinks to a short heading; same thumb.
    // The K must fire right after the heading (clearing the old long text in
    // the gap), NOT after the thumb where it erases nothing.
    scr.clear();
    scr.text(1, 0, "hi", base);
    scr.fillRow(0, 18, 19, thumb);
    term.buf = "";
    scr.flush();
    const row = term.buf.split("\x1b[1;1H")[1] ?? "";
    const kPos = row.indexOf("\x1b[K");
    const cupThumb = row.indexOf("\x1b[1;19H");
    expect(kPos).toBeGreaterThan(-1);
    expect(cupThumb).toBeGreaterThan(kPos); // gap cleared BEFORE jumping to thumb
  });

  test("a gap erase never paints the previous run's background to end-of-line", async () => {
    // `\x1b[K` is an ERASE, and terminals implement background-color-erase: the
    // cleared cells take whatever background is active. Erasing the gap while a
    // selection highlight was the active run flooded the rest of the line with
    // it — a multi-line selection lit every earlier row to the right edge, and a
    // line that WRAPPED to full width looked fine (no gap => no erase). So the
    // erase must be preceded by a reset.
    const { Screen } = await import("../src/tui/screen.ts");
    const term = new FakeTerm();
    const scr = new Screen(term as any);
    scr.resize(20, 1);
    const sel = scr.sgr({ bg: "#364a82" });
    const plain = scr.sgr({});

    // a short, highlighted run, then a gap, then one plain cell (the scrollbar)
    scr.text(0, 0, "short", sel);
    scr.text(19, 0, "x", plain);
    scr.flush();

    const row = term.buf.split("\x1b[1;1H")[1] ?? "";
    const kPos = row.indexOf("\x1b[K");
    expect(kPos).toBeGreaterThan(-1); // the gap IS erased
    // ...and the highlight is not the active background when it happens
    const beforeK = row.slice(0, kPos);
    const lastSgr = beforeK.match(/\x1b\[[0-9;]*m/g)?.at(-1) ?? "";
    expect(lastSgr).toBe("\x1b[0m");
  });
});

describe("Screen.restyle: selection highlight over painted cells", () => {
  test("adds a background while keeping each cell's own foreground", async () => {
    const { Screen } = await import("../src/tui/screen.ts");
    const term = new FakeTerm();
    const scr = new Screen(term as any);
    scr.resize(20, 1);

    // two differently-coloured runs — a flat style index over the range would
    // flatten both to one colour, which is what fillRow would have done
    scr.text(0, 0, "red", scr.sgr({ fg: "#ff0000" }));
    scr.text(3, 0, "blue", scr.sgr({ fg: "#0000ff" }));
    scr.restyle(0, 0, 7, "#364a82");
    scr.flush();

    expect(scr.dumpGrid()).toContain("redblue"); // text intact, not blanked
    expect(term.buf).toContain("\x1b[38;2;255;0;0m"); // red survives
    expect(term.buf).toContain("\x1b[38;2;0;0;255m"); // and so does blue
    expect(term.buf).toContain("\x1b[48;2;54;74;130m"); // highlight applied
    // both runs carry the highlight, so it is not just the first cell
    expect(term.buf.match(/\x1b\[48;2;54;74;130m/g)).toHaveLength(2);
  });

  test("fills empty cells inside the range so the highlight has no holes", async () => {
    const { Screen } = await import("../src/tui/screen.ts");
    const term = new FakeTerm();
    const scr = new Screen(term as any);
    scr.resize(10, 1);
    scr.text(0, 0, "ab", scr.sgr({ fg: "#ffffff" }));
    scr.restyle(0, 0, 5, "#364a82");
    scr.flush();
    // cells 2..4 were never painted; a selection that stopped at "b" would
    // look ragged, so they become highlighted spaces
    expect(scr.dumpGrid()).toBe("ab␣␣␣" + "\x01".repeat(5));
  });

  test("restyling off-screen rows is a no-op, not a crash", async () => {
    const { Screen } = await import("../src/tui/screen.ts");
    const term = new FakeTerm();
    const scr = new Screen(term as any);
    scr.resize(10, 2);
    scr.restyle(-1, 0, 5, "#364a82");
    scr.restyle(99, 0, 5, "#364a82");
    scr.restyle(0, -5, 500, "#364a82"); // clamped to the row's width
    expect(scr.dumpGrid().split("\n")[0]).toBe("␣".repeat(10));
  });
});

describe("Screen compositing: text over fills, and SGR transitions", () => {
  test("text over a fillRow keeps the fill's background in the grid", async () => {
    const { Screen } = await import("../src/tui/screen.ts");
    const term = new FakeTerm();
    const scr = new Screen(term as any);
    scr.resize(10, 1);
    const fill = scr.sgr({ bg: "#1f2335" });
    const dim = scr.sgr({ fg: "#565f89" }); // no bg — must inherit the fill
    scr.fillRow(0, 0, 10, fill);
    scr.text(1, 0, "hi", dim);
    scr.flush();
    // the 'h' must be emitted with BOTH the fill bg and the dim fg
    const cell = term.buf.split("hi")[0];
    expect(cell).toContain("48;2;31;35;53"); // #1f2335 as bg
  });

  test("a styled run followed by default-bg cells RESETS, never leaks the bg", async () => {
    const { Screen } = await import("../src/tui/screen.ts");
    const term = new FakeTerm();
    const scr = new Screen(term as any);
    scr.resize(12, 1);
    const sel = scr.sgr({ bg: "#364a82" });
    scr.text(0, 0, "ab", sel);
    scr.text(2, 0, "cdef", scr.sgr({}));
    scr.flush();
    // between "ab" and "cdef" there must be a reset — this was the selection
    // highlight leaking to end-of-line
    expect(term.buf).toContain("ab\x1b[0m");
  });

  test("clear() drops styles too: a later frame cannot inherit a stale fill", async () => {
    const { Screen } = await import("../src/tui/screen.ts");
    const term = new FakeTerm();
    const scr = new Screen(term as any);
    scr.resize(10, 1);
    const fill = scr.sgr({ bg: "#1f2335" });
    const dim = scr.sgr({ fg: "#565f89" });
    scr.fillRow(0, 0, 10, fill);
    scr.flush();
    term.buf = "";
    scr.clear(); // no fillRow this frame
    scr.text(1, 0, "hi", dim);
    scr.flush();
    expect(term.buf).not.toContain("48;2;31;35;53");
  });
});

describe("Screen.flush: sparse row with trailing styled cell (scrollbar)", () => {
  test("trailing \\x1b[K does not erase the scrollbar cell", async () => {
    const { Screen } = await import("../src/tui/screen.ts");
    const term = new FakeTerm();
    const scr = new Screen(term as any);
    scr.resize(20, 1);
    const base = scr.sgr({ fg: "#ffffff" });
    const track = scr.sgr({ bg: "#2e3350" });
    // text cols 1..5, scrollbar cell col 19, gap 6..18 undefined
    scr.text(1, 0, "hello", base);
    scr.fillRow(0, 19, 20, track);
    term.buf = "";
    scr.flush();
    // the row must END with the track cell write — no trailing \x1b[K after
    // it (the gap K before the CUP is correct: it clears stale cells, and the
    // track is drawn AFTER it). The old code emitted a trailing K AFTER the
    // track, erasing what it had just drawn.
    const tail = term.buf.slice(term.buf.lastIndexOf("hello") + 5);
    expect(tail).toContain("\x1b[1;20H");     // explicit CUP to the track column
    expect(tail).toContain("48;2;46;51;80m"); // the track cell's background
    expect(tail.endsWith("\x1b[K")).toBe(false); // and NO trailing erase after it
  });

  test("stale tail IS erased when undefined cells follow the last write", async () => {
    const { Screen } = await import("../src/tui/screen.ts");
    const term = new FakeTerm();
    const scr = new Screen(term as any);
    scr.resize(20, 1);
    const base = scr.sgr({ fg: "#ffffff" });
    // frame 1: long text
    scr.text(0, 0, "abcdefghijklmnop", base);
    scr.flush();
    // frame 2: short text only — trailing K must clear the stale tail
    scr.clear();
    scr.text(0, 0, "hi", base);
    term.buf = "";
    scr.flush();
    expect(term.buf).toContain("\x1b[K");
  });
});

describe("planes", () => {
  test("higher z overwrites lower; transparent cells show through", async () => {
    const { Screen } = await import("../src/tui/screen.ts");
    const scr = new Screen({ write: () => {} } as any);
    scr.resize(20, 3);
    const base = scr.sgr({ fg: "#ffffff" });
    const basePlane = scr.createPlane("base", 0);
    const top = scr.createPlane("floats", 10);
    basePlane.text(0, 0, "underneath", base);
    top.text(0, 0, "TOP", base); // only 3 of the 10 cells covered
    scr.composite();
    const row = (scr as any).chars as (string | undefined)[];
    expect(row.slice(0, 3).join("")).toBe("TOP");
    expect(row.slice(3, 10).join("")).toBe("erneath"); // transparent cells: base shows
  });

  test("composite order is by z, not creation order", async () => {
    const { Screen } = await import("../src/tui/screen.ts");
    const scr = new Screen({ write: () => {} } as any);
    scr.resize(10, 1);
    const base = scr.sgr({});
    const lateButLow = scr.createPlane("late", 0);   // created second...
    const earlyButHigh = scr.createPlane("early", 5); // ...but lower z... wait, reversed on purpose
    earlyButLowText(lateButLow, earlyButHigh, scr);
    scr.composite();
    expect(((scr as any).chars as string[]).join("")).toBe("HIGH");
    function earlyButLowText(low: any, high: any, scr: any) {
      const st = scr.sgr({});
      low.text(0, 0, "LOW", st);
      high.text(0, 0, "HIGH", st);
    }
  });

  test("createPlane is idempotent by name; dropPlane removes", async () => {
    const { Screen } = await import("../src/tui/screen.ts");
    const scr = new Screen({ write: () => {} } as any);
    scr.resize(10, 1);
    const a = scr.createPlane("x", 0);
    const b = scr.createPlane("x", 99);
    expect(a).toBe(b);
    expect(b.z).toBe(0); // original z survives
    scr.dropPlane("x");
    expect(scr.hasPlane("x")).toBe(false);
  });

  test("clip rect contains a plugin plane's writes", async () => {
    const { Screen } = await import("../src/tui/screen.ts");
    const scr = new Screen({ write: () => {} } as any);
    scr.resize(20, 5);
    const st = scr.sgr({});
    const rogue = scr.createPlane("plugin", 50);
    rogue.clip = [5, 1, 15, 3];
    // tries to paint EVERYWHERE
    for (let y = 0; y < 5; y++) rogue.fillRow(y, 0, 20, st);
    rogue.text(0, 1, "aaaaaaaaaaaaaaaaaaaa", st);
    scr.composite();
    const chars = (scr as any).chars as (string | undefined)[];
    const W = 20;
    for (let y = 0; y < 5; y++) {
      for (let x = 0; x < W; x++) {
        const inside = y >= 1 && y < 3 && x >= 5 && x < 15;
        if (!inside) expect(chars[y * W + x]).toBeUndefined();
        else expect(chars[y * W + x]).toBeDefined();
      }
    }
  });

  test("resize reallocates planes (stale content dropped, not shifted)", async () => {
    const { Screen } = await import("../src/tui/screen.ts");
    const scr = new Screen({ write: () => {} } as any);
    scr.resize(10, 2);
    const st = scr.sgr({});
    const p = scr.createPlane("p", 0);
    p.text(0, 0, "hello", st);
    scr.resize(10, 2); // same dims, but resize must still reset prevHash
    expect((p.chars as (string | undefined)[]).every((c) => c === undefined)).toBe(true);
  });
});

describe("damage tracking: composite rebuilds only touched rows", () => {
  /** A term that records every write, so "did anything reach the screen" is observable. */
  class Rec {
    buf = "";
    write(s: string) {
      this.buf += s;
    }
    flush() {}
  }

  test("a spinner tick writes only its own row, not the whole screen", async () => {
    // The point of the whole change: a frame whose only change is one row must
    // not cost screen-area work. Before this, every frame cleared all cells,
    // copied every plane and hashed every row.
    const { Screen } = await import("../src/tui/screen.ts");
    const term = new Rec();
    const scr = new Screen(term as any);
    scr.resize(40, 10);
    const st = scr.sgr({});
    const status = scr.createPlane("status", 40);

    status.fillRow(9, 0, 40, st);
    scr.composite();
    scr.flush();
    term.buf = "";

    // change ONLY the status row
    status.fillRow(9, 0, 40, st);
    status.text(0, 9, "tick", st);
    scr.composite();
    scr.flush();

    // every emitted CUP must address row 10 (1-based), i.e. no other row was
    // emitted at all
    const cups = [...term.buf.matchAll(/\x1b\[(\d+);1H/g)].map((m) => Number(m[1]));
    expect(cups).toEqual([10]);
  });

  test("composite must NOT consume the dirty rows — flush needs them", async () => {
    // Regression caught by measurement, not by the suite: composite() cleared
    // the dirty bits, so flush() found nothing and wrote ZERO bytes while the
    // grid was correct. Every existing test passed because they call flush()
    // without composite() in between. This pins the actual contract.
    const { Screen } = await import("../src/tui/screen.ts");
    const term = new Rec();
    const scr = new Screen(term as any);
    scr.resize(20, 3);
    const st = scr.sgr({});
    const p = scr.createPlane("p", 0);
    p.text(0, 0, "hello", st);

    scr.composite();
    scr.flush();
    expect(term.buf.length).toBeGreaterThan(0); // reached the terminal at all
    expect(term.buf).toContain("hello");
  });

  test("a frame with nothing dirty emits nothing", async () => {
    const { Screen } = await import("../src/tui/screen.ts");
    const term = new Rec();
    const scr = new Screen(term as any);
    scr.resize(20, 3);
    const st = scr.sgr({});
    const p = scr.createPlane("p", 0);
    p.text(0, 0, "hi", st);
    scr.composite();
    scr.flush();
    term.buf = "";

    // nothing written this frame
    scr.composite();
    scr.flush();
    expect(term.buf).toBe("");
  });

  test("dropping a plane clears its content off the screen", async () => {
    // The failure mode a single shared grid introduces: the plane is gone, but
    // the grid still holds its last frame. Only rows marked dirty are rebuilt,
    // so dropPlane must invalidate. Otherwise a removed panel never disappears.
    const { Screen } = await import("../src/tui/screen.ts");
    const scr = new Screen({ write: () => {} } as any);
    scr.resize(20, 3);
    const st = scr.sgr({});
    const p = scr.createPlane("gone", 50);
    p.fillRow(1, 0, 20, st);
    p.text(0, 1, "BOO", st);
    scr.composite();
    const chars = (scr as any).chars as (string | undefined)[];
    expect(chars[20]).toBe("B"); // it is on the grid

    scr.dropPlane("gone");
    scr.composite();
    expect(chars[20]).toBeUndefined(); // and now it is not
  });

  test("rows below a plane's own writes are untouched, so a small plane does not repaint the screen", async () => {
    const { Screen } = await import("../src/tui/screen.ts");
    const scr = new Screen({ write: () => {} } as any);
    scr.resize(20, 20);
    const st = scr.sgr({});
    const base = scr.createPlane("base", 0);
    for (let y = 0; y < 20; y++) base.fillRow(y, 0, 20, st);
    scr.composite();

    // record the grid, then touch one row only
    const before = (scr as any).chars.slice() as (string | undefined)[];
    base.fillRow(5, 0, 20, st);
    base.text(0, 5, "X", st);
    scr.composite();
    const after = (scr as any).chars as (string | undefined)[];
    expect(after[5 * 20]).toBe("X"); // the touched row changed
    // and every other row is byte-identical (not re-derived differently)
    for (let y = 0; y < 20; y++) {
      if (y === 5) continue;
      expect(after.slice(y * 20, y * 20 + 20)).toEqual(before.slice(y * 20, y * 20 + 20) as never);
    }
  });

  test("a full repaint still looks identical to the old rebuild-everything path", async () => {
    // The fast path kicks in when most rows are dirty; its output must not
    // differ from the row-by-row one, or the optimisation changes pixels.
    const { Screen } = await import("../src/tui/screen.ts");
    const scr = new Screen({ write: () => {} } as any);
    scr.resize(12, 8);
    const st = scr.sgr({});
    const low = scr.createPlane("low", 0);
    const high = scr.createPlane("high", 10);
    low.fillRow(0, 0, 12, st);
    low.text(0, 0, "underneath", st);
    high.text(0, 0, "TOP", st); // covers 3 cells, rest transparent
    scr.markAllDirty();
    scr.composite();
    expect(((scr as any).chars as string[]).slice(0, 10).join("")).toBe("TOPerneath");
    // a row no plane covers is empty, not stale
    expect(((scr as any).chars as (string | undefined)[]).slice(5 * 12, 6 * 12).every((c) => c === undefined)).toBe(true);
  });
});
