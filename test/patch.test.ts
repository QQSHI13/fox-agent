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
