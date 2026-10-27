import { describe, expect, test } from "bun:test";
import { applyEdits } from "../src/tools/patch.ts";

const SRC = `function add(a, b) {
  return a + b;
}

function sub(a, b) {
  return a - b;
}
`;

describe("applyEdits", () => {
  test("exact single replacement", () => {
    const r = applyEdits(SRC, [{ oldString: "return a + b;", newString: "return a + b + 0;" }]);
    expect(r.content).toContain("+ 0;");
    expect(r.applied).toBe(1);
    expect(r.fuzzy).toBe(0);
  });

  test("missing oldString errors with hint", () => {
    expect(() => applyEdits(SRC, [{ oldString: "nope", newString: "x" }])).toThrow(/not found/);
  });

  test("ambiguous match errors unless replaceAll", () => {
    expect(() => applyEdits(SRC, [{ oldString: "a, b", newString: "x, y" }])).toThrow(/matches 2 times/);
    const r = applyEdits(SRC, [{ oldString: "a, b", newString: "x, y", replaceAll: true }]);
    expect(r.applied).toBe(2);
    expect(r.content).not.toContain("a, b");
  });

  test("whitespace-tolerant fuzzy fallback when inner indentation differs", () => {
    const code = "if (x) {\n    doThing();\n}";
    const r = applyEdits(code, [
      { oldString: "if (x) {\n  doThing();\n}", newString: "if (x) {\n  doThing();\n  done = true;\n}" },
    ]);
    // exact substring misses (4-space vs 2-space), fuzzy matches once
    expect(r.fuzzy).toBe(1);
    expect(r.content).toContain("doThing();");
    expect(r.content).toContain("done = true;");
  });

  test("fuzzy fallback keeps the target line's indentation when oldString is dedented", () => {
    // The common fuzzy case: the model strips the indentation of oldString. The
    // match consumes the file's leading whitespace, and the old reindent helper
    // only re-indented lines 2..n, so the FIRST replacement line landed at
    // column 0 and produced code that no longer parsed.
    const code = "function f() {\n  const a = 1;\n  return a;\n}\n";
    const r = applyEdits(code, [{ oldString: "const a = 1;\nreturn a;", newString: "const a = 2;\nreturn a * 2;" }]);
    expect(r.fuzzy).toBe(1);
    expect(r.content).toBe("function f() {\n  const a = 2;\n  return a * 2;\n}\n");
  });

  test("fuzzy fallback restores a deeper first-line indent", () => {
    const code = "class A {\n  m() {\n    const a = 1;\n  }\n}\n";
    // trailing whitespace makes the exact match miss (fuzzy tolerates it), so
    // this really goes through the fuzzy path while the body still matches
    const r = applyEdits(code, [{ oldString: "const a = 1;   ", newString: "const a = 2;" }]);
    expect(r.fuzzy).toBe(1);
    expect(r.content).toContain("    const a = 2;");
  });

  test("fuzzy fallback is anchored to a line start, not the tail of a token", () => {
    const code = "  xfoo\n  y = 2\n";
    // "foo\ny = 2" only occurs inside "xfoo"; matching there rewrote "x" away
    expect(() => applyEdits(code, [{ oldString: "foo\ny = 2", newString: "BAR" }])).toThrow(/not found/);
  });

  test("multi-edit batch applies in order", () => {
    const r = applyEdits(SRC, [
      { oldString: "add", newString: "plus" },
      { oldString: "sub", newString: "minus" },
    ]);
    expect(r.content).toContain("plus(a, b)");
    expect(r.content).toContain("minus(a, b)");
    expect(r.applied).toBe(2);
  });

  test("oldString == newString rejected", () => {
    expect(() => applyEdits(SRC, [{ oldString: "add", newString: "add" }])).toThrow(/equals/);
  });
});

describe("applyEdits: CRLF files", () => {
  const CRLF = "function f() {\r\n    const a = 1;\r\n    const b = 2;\r\n}\r\n";
  const LF = CRLF.replace(/\r\n/g, "\n");
  const mixed = (s: string) => /\r\n/.test(s) && /(?<!\r)\n/.test(s);

  // The bug: both the exact path and the whitespace-tolerant path built their
  // needle/pattern from a \n-joined string, so a \r\n file matched NEITHER and
  // every multi-line edit failed with "oldString not found" — a message that
  // blames the caller's text instead of the line endings.
  test("multi-line needle written with LF matches a CRLF file", () => {
    const r = applyEdits(CRLF, [{ oldString: "    const a = 1;\n    const b = 2;", newString: "    const a = 10;\n    const b = 20;" }]);
    expect(r.applied).toBe(1);
    expect(r.content).toBe("function f() {\r\n    const a = 10;\r\n    const b = 20;\r\n}\r\n");
  });

  test("the whitespace-tolerant fallback works on a CRLF file", () => {
    const r = applyEdits(CRLF, [{ oldString: "const a = 1;\nconst b = 2;", newString: "const a = 10;\nconst b = 20;" }]);
    expect(r.fuzzy).toBe(1);
    expect(r.content).toContain("    const a = 10;\r\n");
    expect(mixed(r.content)).toBe(false);
  });

  test("a CRLF needle matches an LF file", () => {
    const r = applyEdits(LF, [{ oldString: "    const a = 1;\r\n    const b = 2;", newString: "    const a = 10;\r\n    const b = 20;" }]);
    expect(r.content).toBe("function f() {\n    const a = 10;\n    const b = 20;\n}\n");
  });

  test("a CRLF file is never left with mixed line endings", () => {
    // the replacement is written with LF and the file uses CRLF: the edited
    // lines must follow the file, not the caller
    const r = applyEdits(CRLF, [{ oldString: "    const a = 1;", newString: "    const a = 1;\n    const c = 3;" }]);
    expect(mixed(r.content)).toBe(false);
    expect(r.content).toBe("function f() {\r\n    const a = 1;\r\n    const c = 3;\r\n    const b = 2;\r\n}\r\n");
  });

  test("single-line edits keep their behavior, LF and CRLF", () => {
    expect(applyEdits(LF, [{ oldString: "    const a = 1;", newString: "    const a = 7;" }]).content).toBe(
      "function f() {\n    const a = 7;\n    const b = 2;\n}\n",
    );
    expect(applyEdits(CRLF, [{ oldString: "    const a = 1;", newString: "    const a = 7;", replaceAll: true }]).content).toBe(
      "function f() {\r\n    const a = 7;\r\n    const b = 2;\r\n}\r\n",
    );
  });


  test("CRLF matches where an equivalent LF file matches, and only there", () => {
    // The failure mode to avoid is asymmetry: a needle must not be found in a
    // CRLF file where the same needle in an LF file is not found (that is how
    // "tolerate \r" turns into editing a different location than intended).
    // Exact substring matching is not line-anchored in either spelling — only
    // the fuzzy fallback is — so both must agree.
    const op = (raw: string) => applyEdits(raw, [{ oldString: "foo\nbar", newString: "Z" }]);
    const lf = op("xfoo\nbar\n");
    const crlf = op("xfoo\r\nbar\r\n");
    expect(lf.applied).toBe(1);
    expect(crlf.applied).toBe(1);
    expect(crlf.content).toBe("xZ\r\n");
    // and where neither contains the needle, both refuse
    expect(() => op("nothing\nhere\n")).toThrow(/not found/);
    expect(() => op("nothing\r\nhere\r\n")).toThrow(/not found/);
  });

  test("the fuzzy fallback stays anchored to a line start on CRLF files", () => {
    // the fuzzy pattern's `^` is what stops "foo" rewriting the tail of "xfoo";
    // tolerating \r must not weaken it (here indentation also differs, so the
    // exact path misses and the anchored fallback is the one that decides)
    expect(() => applyEdits("xfoo\r\n  bar\r\n", [{ oldString: "foo\nbar", newString: "Z" }])).toThrow(/not found/);
  });
});
