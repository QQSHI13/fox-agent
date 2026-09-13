/**
 * The tool head's "what actually ran" summaries.
 *
 * `argsSummary` is the one-liner on the head; `argsFull` is what the expanded
 * view shows. The expanded view is the only place a tool call's payload
 * (write's new text, edit's old/new strings) is visible at all, so it must
 * include those fields, not just the path — that was the reported "tool call
 * content doesn't display" bug. Pure string functions, testable directly.
 */
import { describe, expect, test } from "bun:test";
import { argsSummary, argsFull } from "../src/tui/app.ts";

describe("argsSummary", () => {
  test("the meaningful field, flattened", () => {
    expect(argsSummary(JSON.stringify({ cmd: "bun test\n   foo.ts" }))).toBe(" bun test foo.ts");
    expect(argsSummary(JSON.stringify({ path: "/w/x.ts" }))).toBe(" /w/x.ts");
  });

  test("empty args are empty — nothing to show", () => {
    expect(argsSummary("")).toBe("");
    expect(argsSummary("{}")).toBe("");
  });

  test("unrecognized fields fall back to compacted JSON", () => {
    expect(argsSummary(JSON.stringify({ todos: [1, 2] }))).toBe(' {"todos":[1,2]}');
  });
});

describe("argsFull", () => {
  test("a single-field call is the whole field", () => {
    expect(argsFull(JSON.stringify({ cmd: "echo hi" }))).toBe("echo hi");
  });

  test("a content-bearing call shows the payload after the target", () => {
    const full = argsFull(JSON.stringify({ path: "/w/x.ts", content: "hello\nworld" }));
    expect(full).toContain("/w/x.ts");
    expect(full).toContain("content: hello world");
  });

  test("edit's old/new strings are both named", () => {
    const full = argsFull(JSON.stringify({ path: "/w/x.ts", old_string: "a", new_string: "b" }));
    expect(full).toContain("old_string: a");
    expect(full).toContain("new_string: b");
  });

  test("non-string fields survive as JSON", () => {
    const full = argsFull(JSON.stringify({ cmd: "x", ids: [3, 5] }));
    expect(full).toContain("ids: [3,5]");
  });

  test("empty args are empty", () => {
    expect(argsFull("")).toBe("");
    expect(argsFull("{}")).toBe("");
  });
});
