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
