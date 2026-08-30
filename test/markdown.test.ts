import { describe, expect, test } from "bun:test";
import { renderMarkdown, type MdState } from "../src/tui/markdown.ts";

/** Parse text as the TUI's incremental stream cache does: settled prefix once, tail with carried state. */
function splitParse(text: string, cutAt: number) {
  const st: MdState = { inFence: false, hadCode: false };
  // the prefix is rendered without its trailing newline, exactly as the TUI's
  // stream cache does — the newline itself is the cut boundary, not content
  const a = renderMarkdown(text.slice(0, cutAt - 1), st);
  const b = renderMarkdown(text.slice(cutAt), { ...st });
  return [...a, ...b];
}

const flat = (rows: { t?: string }[][]) => rows.map((r) => r.map((s) => s.t ?? "").join("")).join("\n");

describe("markdown incremental parse", () => {
  const doc = [
    "# Title",
    "",
    "Some **bold** and `code` text",
    "",
    "```ts",
    "const x = 1;",
    "// two lines",
    "```",
    "",
    "- one",
    "- two",
    "",
    "> quoted",
    "",
    "tail paragraph",
  ].join("\n");

  test("splitting at any newline boundary renders identically to a whole parse", () => {
    const whole = flat(renderMarkdown(doc));
    let at = -1;
    while ((at = doc.indexOf("\n", at + 1)) >= 0) {
      expect(flat(splitParse(doc, at + 1))).toBe(whole);
    }
  });

  test("a fence split mid-body keeps later lines literal", () => {
    const cut = doc.indexOf("const x");
    const rows = splitParse(doc, cut);
    expect(flat(rows)).toBe(flat(renderMarkdown(doc)));
    // and the cut landed inside the fence
    expect(flat(rows)).toContain("│ // two lines");
  });

  test("an unterminated fence streams line by line without a spurious placeholder", () => {
    const open = doc.slice(0, doc.indexOf("```") ); // everything before the fence
    const withOpen = open + "```ts\n";
    const oneLine = withOpen + "const x = 1;\n";
    // prefix through the opener, tail is the code line
    const rows = splitParse(oneLine, withOpen.length);
    expect(flat(rows)).toBe(flat(renderMarkdown(oneLine)));
    expect(flat(rows)).not.toContain("│\n"); // no empty-fence placeholder
  });

  test("state survives an empty fence exactly once", () => {
    const text = "before\n\n```\n```\nafter";
    const whole = flat(renderMarkdown(text));
    expect(whole).toContain("│"); // empty fence placeholder
    // cuts are positions just after each newline: before|""|```|```|after
    for (const cut of [7, 8, 12, 16]) {
      expect(flat(splitParse(text, cut))).toBe(whole);
    }
  });
});
