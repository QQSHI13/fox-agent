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
