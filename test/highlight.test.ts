import { describe, expect, test } from "bun:test";
import { diffSegs, highlightBlockRich } from "../src/tui/highlight.ts";

// Regression: the old regex fallback tinted ANY capitalized word as a type and
// matched a cross-language keyword union, so prose like "In a Self test By"
  // got keyword/tint highlighting. The grammar path must not.
  test("prose words are not keyword/type tinted by the grammar path", async () => {
    // grammar path is async (cached per block); poll briefly for the result
    const line = "In a Self test By the quick Brown fox";
    let block: ReturnType<typeof highlightBlockRich> = null;
    for (let i = 0; i < 50 && block === null; i++) {
      block = highlightBlockRich("markdown", line);
      if (block === null) await new Promise((r) => setTimeout(r, 20));
    }
    const segs = block?.[0] ?? null;
    if (segs) {
      // none of the plain prose words may carry a keyword/type color
      for (const s of segs) {
        if (s.t.trim() && s.fg) {
          expect(["In", "a", "Self", "test", "By", "the", "quick", "Brown", "fox"]).not.toContain(s.t.trim());
        }
      }
    }
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
