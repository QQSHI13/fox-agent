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

// The highlighter library ships no C++ grammar (its languages/ dir has c, java,
// rs and nothing for cpp), so src/tui/langs/cpp.ts provides one. Before that,
// a ```cpp fence had no grammar to resolve and rendered flat — while ```c lit up,
// which made the gap look like a bug in the fence rather than a missing grammar.
describe("cpp fences highlight", () => {
  const fence = async (lang: string, text: string) => {
    let block: ReturnType<typeof highlightBlockRich> = null;
    for (let i = 0; i < 50 && block === null; i++) {
      block = highlightBlockRich(lang, text);
      if (block === null) await new Promise((r) => setTimeout(r, 20));
    }
    return block;
  };
  const colored = (block: ReturnType<typeof highlightBlockRich>) =>
    (block ?? []).flatMap((l) => l ?? []).filter((s) => s.fg && s.t.trim()).map((s) => s.t.trim());

  test("every fence id a model uses for C++ resolves to a grammar", async () => {
    // a blank "cpp" is enough to prove resolution; null means no grammar
    for (const id of ["cpp", "c++", "cxx", "hpp", "hxx", "cc", "h"]) {
      expect(await fence(id, "int x = 0;"), `no grammar for fence '${id}'`).not.toBeNull();
    }
  }, 20_000);

  test("C++-only keywords are colored — the reason mapping cpp onto C was not enough", async () => {
    // none of these words exist in C, so the C grammar leaves them bare
    const block = await fence("cpp", "class Foo final {\n  virtual ~Foo() noexcept = default;\n};");
    expect(block).not.toBeNull();
    const got = colored(block);
    for (const kw of ["class", "final", "virtual", "noexcept", "default"]) {
      expect(got, `'${kw}' should be a keyword`).toContain(kw);
    }
  }, 20_000);

  test("a raw string keeps its quotes and parens; a comment keeps its own text", async () => {
    const raw = 'auto s = R"tag(has "quotes" and ) not-close)tag";';
    const block = await fence("cpp", raw);
    const segs = (block?.[0] ?? []).filter((s) => s.t.trim());
    // the whole literal is ONE string span, not fragments split at the quotes
    const strSeg = segs.find((s) => s.t.includes('R"tag('));
    expect(strSeg, "raw string should be tokenized as a string").toBeTruthy();
    expect(strSeg!.t).toContain('not-close)tag"');

    const cmt = await fence("cpp", '// has "quotes" and * stars\nint y;');
    const cSegs = (cmt?.[0] ?? []).filter((s) => s.t.trim());
    const cmtSeg = cSegs.find((s) => s.t.includes("stars"));
    expect(cmtSeg, "a line comment should be one comment span").toBeTruthy();
  }, 20_000);

  test("a preprocessor include colors the directive and the path differently", async () => {
    const block = await fence("cpp", "#include <vector>");
    const segs = (block?.[0] ?? []).filter((s) => s.t.trim());
    const dir = segs.find((s) => s.t.includes("#include"));
    const path = segs.find((s) => s.t.includes("<vector>"));
    expect(dir, "the directive").toBeTruthy();
    expect(path, "the headed path").toBeTruthy();
    expect(dir!.fg).not.toBe(path!.fg); // "keyword" vs "string", not one color
  }, 20_000);
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
