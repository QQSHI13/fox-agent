import { describe, expect, test } from "bun:test";
import { renderMarkdown, wrapCodeAware, codeGutterRow, type MdState } from "../src/tui/markdown.ts";
import { charWidth } from "../src/tui/screen.ts";

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

describe("tables", () => {
  test("a GFM table renders as a bordered box with a header rule", () => {
    const rows = renderMarkdown("| name | ctx |\n| --- | --- |\n| foo | 128k |\n| longer | 256k |");
    const text = rows.map((r) => r.map((s) => s.t).join(""));
    expect(text[0]).toBe("│ name   │ ctx  │");
    expect(text[1]).toBe("├────────┼──────┤");
    expect(text[2]).toBe("│ foo    │ 128k │");
    expect(text[3]).toBe("│ longer │ 256k │");
    expect(rows[0].every((s) => s.bold || !s.t.trim() || s.t.includes("│"))).toBe(true); // header is bold
  });

  test("separator colons align columns left, center and right", () => {
    const rows = renderMarkdown("| a | b | c |\n| :--- | :---: | ---: |\n| x | y | z |");
    const text = rows.map((r) => r.map((s) => s.t).join(""));
    expect(text[2]).toBe("│ x │ y │ z │");
    const wide = renderMarkdown("| a | b | c |\n| :--- | :---: | ---: |\n| xx | yy | zz |");
    expect(wide.map((r) => r.map((s) => s.t).join(""))[2]).toBe("│ xx │ yy │ zz │");
    const padded = renderMarkdown("| aa | bb | cc |\n| ---: | :---: | :--- |\n| x | y | z |");
    expect(padded.map((r) => r.map((s) => s.t).join(""))[2]).toBe("│  x │ y  │ z  │");
  });

  test("a table following a paragraph line is not swallowed into it", () => {
    const rows = renderMarkdown("intro\n| a |\n| --- |\n| b |");
    const text = rows.map((r) => r.map((s) => s.t).join(""));
    expect(text).toEqual(["intro", "│ a │", "├───┤", "│ b │"]);
  });

  test("outer pipes are optional — models emit `a | b` / `--- | ---` constantly", () => {
    const rows = renderMarkdown("a | b\n--- | ---\n1 | 2");
    const text = rows.map((r) => r.map((s) => s.t).join(""));
    expect(text[0]).toBe("│ a │ b │");
    expect(text[1]).toBe("├───┼───┤");
    expect(text[2]).toBe("│ 1 │ 2 │");
    // two-dash separators too (`-- | --`), another common model spelling
    const short = renderMarkdown("Name | Qty\n-- | --\nfoo | 3");
    expect(short.map((r) => r.map((s) => s.t).join(""))[0]).toBe("│ Name │ Qty │");
  });

  test("every composed row fits the caller's width — no shredded gutters", () => {
    // A cell used to be wrapped with plain `wrapSegs(cell, colW + 1)`, which
    // soft-wraps one column short EXCEPT when a trailing space lands exactly on
    // the boundary: then the line filled to colW + 1, the cell padding computed
    // max(0, -1) = 0, and the composed row was one cell over the table's own
    // width. The caller re-wraps the whole table at `width`, so that single
    // over-wide row got shredded and its trailing `│` vanished — the reported
    // "tables sometimes have missing pipes".
    const src = [
      "| Real question | Was it in my prep? |",
      "|---|---|",
      "| Q1 T/F x4, 5 marks each | ✅ Format predicted exactly. 3 of 4 themes overlapped: (2) conv params vs input size, (3) freezing, (4) Hessian ⇒ descent |",
    ].join("\n");
    const width = (row: { t?: string }[]) =>
      row.reduce((n, s) => n + [...(s.t ?? "")].reduce((m, ch) => m + charWidth(ch.codePointAt(0)!), 0), 0);

    for (let W = 60; W <= 160; W++) {
      const rows = renderMarkdown(src, undefined, W);
      const widths = rows.map(width);
      // one box width across the whole table, and it must fit the caller's width
      expect(new Set(widths).size).toBe(1);
      expect(widths[0]).toBeLessThanOrEqual(W);
      // every physical row is a closed box
      for (const r of rows) {
        const t = r.map((s) => s.t ?? "").join("");
        expect(t.startsWith("│") || t.startsWith("├")).toBe(true);
        expect(t.endsWith("│") || t.endsWith("┤")).toBe(true);
      }
    }
  });

  test("prose that merely contains a pipe stays prose", () => {
    // the separator line is what promotes a table; a lone pipe sentence has none
    const rows = renderMarkdown("use docker | kubectl for this");
    const text = rows.map((r) => r.map((s) => s.t).join(""));
    expect(text).toEqual(["use docker | kubectl for this"]);
  });
});

describe("task lists", () => {
  test("[x] renders a settled check with receded content", () => {
    const rows = renderMarkdown("- [x] fix the login bug");
    expect(rows.length).toBe(1);
    expect(rows[0][0].t).toBe("[x] ");
    expect(rows[0][0].fg).toBeDefined();
    const body = rows[0].slice(1).map((s) => s.t).join("");
    expect(body).toBe("fix the login bug");
    // done items recede: dimmed content
    expect(rows[0].some((s) => s.fg !== undefined && s.t === "fix the login bug")).toBe(true);
  });

  test("[~] renders an in-flight marker with bold content", () => {
    const rows = renderMarkdown("- [~] migrating the store");
    expect(rows[0][0].t).toBe("[~] ");
    const body = rows[0].slice(1);
    expect(body.some((s) => s.bold && s.t.includes("migrating the store"))).toBe(true);
  });

  test("[ ] renders an open box with plain content", () => {
    const rows = renderMarkdown("- [ ] write tests first");
    expect(rows[0][0].t).toBe("[.] ");
    expect(rows[0].slice(1).map((s) => s.t).join("")).toBe("write tests first");
    expect(rows[0].slice(1).some((s) => s.bold)).toBe(false);
  });

  test("indentation is preserved and content keeps inline styling", () => {
    const rows = renderMarkdown("- [ ] plain\n  - [x] **bold nested** `code`");
    const text = rows.map((r) => r.map((s) => s.t).join(""));
    expect(text[1]).toBe("  [x] bold nested code");
    const nested = rows[1];
    expect(nested.some((s) => s.bold)).toBe(true);
    expect(nested.some((s) => s.fg !== undefined && s.t === "code")).toBe(true);
  });

  test("uppercase [X] counts as done", () => {
    const rows = renderMarkdown("- [X] capitalized");
    expect(rows[0][0].t).toBe("[x] ");
  });

  test("plain list items are unaffected", () => {
    const rows = renderMarkdown("- [not a status] weird\n- normal");
    const text = rows.map((r) => r.map((s) => s.t).join(""));
    // "[not a status]" is not a single-char task marker — stays literal text
    expect(text[0]).toContain("[not a status]");
    expect(text[1]).toContain("• normal");
  });
});

describe("inline formatting", () => {
  test("***bold italic*** applies both bold and italic", () => {
    const rows = renderMarkdown("this is ***bold italic*** text");
    const target = rows[0].find((s) => s.t === "bold italic");
    expect(target?.bold).toBe(true);
    expect(target?.italic).toBe(true);
  });

  test("a link label keeps its inline formatting", () => {
    const rows = renderMarkdown("a [link with **bold** inside](https://x.com) here");
    const boldSeg = rows[0].find((s) => s.t === "bold");
    expect(boldSeg?.bold).toBe(true);
    expect(boldSeg?.href).toBe("https://x.com");
  });

  test("a footnote reference and definition render", () => {
    const rows = renderMarkdown("text[^1] here\n\n[^1]: the note body");
    const refRow = rows[0];
    expect(refRow.some((s) => s.t === "[1]" && s.italic)).toBe(true);
    // definition line renders as a receded dim entry
    const defRow = rows.find((r) => r.some((s) => s.t.includes("the note body")));
    expect(defRow?.some((s) => s.t === "  [1] ")).toBe(true);
  });
});

describe("code fence wrapping", () => {
  test("a long code line keeps its gutter on every wrapped row", () => {
    // a code line far wider than the wrap width, with no spaces so it hits the
    // oversized-word continuation branch
    const longCode = "x".repeat(60);
    const rows = renderMarkdown("```\n" + longCode + "\n```");
    const codeRow = rows.find((r) => codeGutterRow(r));
    expect(codeRow).toBeDefined();
    const wrapped = wrapCodeAware(codeRow!, 20);
    expect(wrapped.length).toBeGreaterThan(1);
    // every continuation row re-stamps the gutter, so no bare-text row
    for (const r of wrapped) {
      expect(r[0].t.startsWith("│")).toBe(true);
    }
  });

  test("a non-code row passes through wrapCodeAware unchanged", () => {
    const rows = renderMarkdown("just some prose text here");
    const wrapped = wrapCodeAware(rows[0], 10);
    expect(wrapped.length).toBeGreaterThan(1);
    expect(wrapped[1][0].t.startsWith("│")).toBe(false);
  });
});
