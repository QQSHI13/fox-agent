/**
 * The tool head's "what actually ran" summaries.
 *
 * `argsSummary` is the one-liner on the head; `argsJson` is what the expanded
 * view shows — the model's actual call, pretty-printed verbatim (not a
 * reconstruction: auditing "what did it send" wants ground truth). Pure string
 * functions, testable directly.
 */
import { describe, expect, test } from "bun:test";
import { argsSummary, argsJson } from "../src/tui/app.ts";

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

describe("argsJson", () => {
  test("pretty-printed verbatim: keys, nesting, order preserved", () => {
    const call = { path: "/w/x.ts", content: "hello\nworld", opts: { recursive: true } };
    expect(argsJson(JSON.stringify(call))).toBe(JSON.stringify(call, null, 2));
  });

  test("key order preserved (no re-sorting)", () => {
    const raw = '{"z":1,"a":2}';
    expect(argsJson(raw)).toBe('{\n  "z": 1,\n  "a": 2\n}');
  });

  test("multi-line payloads survive intact", () => {
    const out = argsJson(JSON.stringify({ path: "/w/x.ts", content: "line1\nline2" }));
    expect(out).toContain('"content": "line1\\nline2"');
  });

  test("capped at 8000 chars", () => {
    const big = JSON.stringify({ content: "x".repeat(20_000) });
    expect(argsJson(big).length).toBeLessThanOrEqual(8000);
  });

  test("unparseable args degrade to the raw string", () => {
    expect(argsJson("not json {")).toBe("not json {");
  });

  test("empty args render as {}", () => {
    expect(argsJson("")).toBe("{}");
    expect(argsJson("{}")).toBe("{}");
  });
});
