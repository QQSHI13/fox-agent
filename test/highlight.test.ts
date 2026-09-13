import { describe, expect, test } from "bun:test";
import { diffSegs, highlightLine } from "../src/tui/highlight.ts";

describe("highlightLine", () => {
  test("keywords, strings, comments and numbers get their own segments", () => {
    const segs = highlightLine('const x = "hi" + 42 // done', "ts");
    const byText = Object.fromEntries(segs.filter((s) => s.fg).map((s) => [s.t, s.fg]));
    expect(byText["const"]).toBeDefined();
    expect(byText['"hi"']).toBeDefined();
    expect(byText["42"]).toBeDefined();
    expect(byText["// done"]).toBeDefined();
  });

  test("comment style follows the language family", () => {
    expect(highlightLine("x = 1 # py comment", "py").some((s) => (s.fg ?? "") !== "" && s.t.includes("#"))).toBe(true);
    // # is not a comment in js — it must stay plain
    expect(highlightLine("# not a comment", "js").every((s) => !s.fg)).toBe(true);
  });

  test("an empty line comes back as one plain segment", () => {
    expect(highlightLine("", "ts")).toEqual([{ t: "" }]);
  });
});

describe("diffSegs", () => {
  test("unified and git markers color, plain lines stay null", () => {
    expect(diffSegs("+added")?.[0].fg).toBeDefined();
    expect(diffSegs("-removed")?.[0].fg).toBeDefined();
    expect(diffSegs("@@ -1,3 +1,4 @@")?.[0].fg).toBeDefined();
    expect(diffSegs("plain output line")).toBeNull();
    // +++ / --- headers are hunk-colored, not add/del
    expect(diffSegs("+++ b/src/x.ts")?.[0].fg).toBeDefined();
  });
});
