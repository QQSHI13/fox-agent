import { describe, expect, test } from "bun:test";
import { diffSegs, highlightLine, highlightLineRich } from "../src/tui/highlight.ts";

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

  // Regression: the regex fallback tinted ANY capitalized word as a type and
  // matched a cross-language keyword union, so prose like "In a Self test By"
  // got keyword/tint highlighting. The grammar path must not.
  test("prose words are not keyword/type tinted by the grammar path", async () => {
    // grammar path is async (cached); poll briefly for the result to land
    const line = "In a Self test By the quick Brown fox";
    let segs: ReturnType<typeof highlightLineRich> = null;
    for (let i = 0; i < 50 && segs === null; i++) {
      segs = highlightLineRich("markdown", line);
      if (segs === null) await new Promise((r) => setTimeout(r, 20));
    }
    if (segs) {
      // none of the plain prose words may carry a keyword/type color
      for (const s of segs) {
        if (s.t.trim() && s.fg) {
          expect(["In", "a", "Self", "test", "By", "the", "quick", "Brown", "fox"]).not.toContain(s.t.trim());
        }
      }
    }
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
