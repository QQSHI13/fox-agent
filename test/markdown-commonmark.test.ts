import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderMarkdown } from "../src/tui/markdown.ts";
import type { Seg } from "../src/tui/wrap.ts";

const FIX = join(import.meta.dir, "fixtures", "markdown");

const flat = (rows: Seg[][]) => rows.map((r) => r.map((s) => s.t ?? "").join("")).join("\n");

/** Concatenated styled text of a single-rendered first row. */
const text = (md: string) => renderMarkdown(md)[0].map((s) => s.t).join("");

/** The seg whose text is exactly `t` in the first row. */
const seg = (md: string, t: string): Seg | undefined =>
  renderMarkdown(md)[0].find((s) => s.t === t);

/** Every seg whose text is exactly `t` in the first row. */
const segs = (md: string, t: string): Seg[] =>
  renderMarkdown(md)[0].filter((s) => s.t === t);

describe("CommonMark flanking — underscore runs must not emphasize inside a word", () => {
  const cases = [
    "MAX_BG_TASKS_PER_SESSION",
    "foo_bar_baz",
    "a__b__c",
    "__foo__bar",
    "foo_bar_",
    "_foo_bar",
    "_пристаням_стремятся",
  ];

  test("each case renders as one literal seg with no styling", () => {
    for (const src of cases) {
      const row = renderMarkdown(src)[0];
      expect(row).toEqual([{ t: src }]);
      expect(row.some((s) => s.bold || s.italic || s.strike)).toBe(false);
    }
  });
});

describe("CommonMark flanking — asterisk runs still emphasize intraword", () => {
  test("a*b*c emphasizes only b", () => {
    expect(seg("a*b*c", "b")?.italic).toBe(true);
    expect(text("a*b*c")).toBe("abc");
  });

  test("foo*bar*baz emphasizes bar", () => {
    expect(seg("foo*bar*baz", "bar")?.italic).toBe(true);
    expect(text("foo*bar*baz")).toBe("foobarbaz");
  });

  test("foo**bar**baz strongly emphasizes bar mid-word", () => {
    expect(seg("foo**bar**baz", "bar")?.bold).toBe(true);
    expect(text("foo**bar**baz")).toBe("foobarbaz");
  });
});

describe("standard emphasis forms", () => {
  test("*italic* styles the content", () => {
    const s = seg("*italic*", "italic");
    expect(s?.italic).toBe(true);
    expect(s?.bold).toBeUndefined();
  });

  test("_italic_ styles the content", () => {
    const s = seg("_italic_", "italic");
    expect(s?.italic).toBe(true);
  });

  test("**bold** styles the content", () => {
    const s = seg("**bold**", "bold");
    expect(s?.bold).toBe(true);
    expect(s?.italic).toBeUndefined();
  });

  test("__bold__ styles the content", () => {
    const s = seg("__bold__", "bold");
    expect(s?.bold).toBe(true);
  });

  test("***both*** applies bold and italic", () => {
    const s = seg("***both***", "both");
    expect(s?.bold).toBe(true);
    expect(s?.italic).toBe(true);
  });

  test("___both___ applies bold and italic", () => {
    const s = seg("___both___", "both");
    expect(s?.bold).toBe(true);
    expect(s?.italic).toBe(true);
  });

  test("underscore at a punctuation boundary still opens", () => {
    expect(seg("(_x_)", "x")?.italic).toBe(true);
    expect(seg("end _word_ start", "word")?.italic).toBe(true);
  });
});

describe("emphasis content may span inert inner underscore runs", () => {
  test("_foo_bar_baz_ -> italic across the inner runs (spec example)", () => {
    const s = seg("_foo_bar_baz_", "foo_bar_baz");
    expect(s?.italic).toBe(true);
    expect(text("_foo_bar_baz_")).toBe("foo_bar_baz");
  });
});

describe("nesting strong containing italic", () => {
  test("**foo *bar* baz** — bar is bold AND italic, surrounds are bold", () => {
    const inner = seg("**foo *bar* baz**", "bar");
    expect(inner?.bold).toBe(true);
    expect(inner?.italic).toBe(true);
    expect(seg("**foo *bar* baz**", "foo ")?.bold).toBe(true);
    expect(seg("**foo *bar* baz**", " baz")?.bold).toBe(true);
    expect(text("**foo *bar* baz**")).toBe("foo bar baz");
  });
});

describe("inline spans — code, strike, image, link", () => {
  test("a code span tints the content", () => {
    const s = seg("`code span`", "code span");
    expect(s?.fg).toBeDefined();
    expect(text("`code span`")).toBe("code span");
  });

  test("~~strike~~ applies strike", () => {
    const s = seg("~~struck~~", "struck");
    expect(s?.strike).toBe(true);
    expect(text("~~struck~~")).toBe("struck");
  });

  test("an image renders a dim placeholder linking to the target", () => {
    const row = renderMarkdown("![alt text](https://example.com/pic.png)")[0];
    const s = row.find((x) => x.t === "[image: alt text]");
    expect(s).toBeDefined();
    expect(s?.href).toBe("https://example.com/pic.png");
    expect(s?.fg).toBeDefined();
  });

  test("a link carries the href on the label segs", () => {
    const s = seg("[link label](https://example.com)", "link label");
    expect(s?.href).toBe("https://example.com");
    expect(s?.fg).toBeDefined();
    expect(text("[link label](https://example.com)")).toBe("link label");
  });

  test("a link label keeps nested bold and the href", () => {
    const md = "[bold link with **strong** inside](https://x.com)";
    expect(seg(md, "strong")?.bold).toBe(true);
    expect(seg(md, "strong")?.href).toBe("https://x.com");
    expect(text(md)).toBe("bold link with strong inside");
  });
});

describe("block constructs from the fixture", () => {
  const blocks = readFileSync(join(FIX, "blocks.md"), "utf8");
  const rows = renderMarkdown(blocks);
  const lines = rows.map((r) => r.map((s) => s.t).join(""));

  test("a level-2 heading renders bold with the heading tint", () => {
    const row = rows.find((r) => r.some((s) => s.t.includes("A heading two levels deep")));
    expect(row).toBeDefined();
    expect(row!.every((s) => s.bold)).toBe(true);
    expect(row!.every((s) => s.fg !== undefined)).toBe(true);
  });

  test("unordered list items use the accent bullet", () => {
    const a = lines.findIndex((l) => l.startsWith("• a bullet item"));
    expect(a).toBeGreaterThanOrEqual(0);
    expect(rows[a][0].t).toBe("• ");
    expect(rows[a][0].fg).toBeDefined();
  });

  test("ordered list items keep the number marker", () => {
    const i = lines.findIndex((l) => l.startsWith("1. first ordered"));
    expect(i).toBeGreaterThanOrEqual(0);
    expect(rows[i][0].t).toBe("1. ");
  });

  test("a blockquote renders italic dim", () => {
    const row = rows.find((r) => r.some((s) => s.t.includes("a blockquote line")));
    expect(row).toBeDefined();
    expect(row!.every((s) => s.italic)).toBe(true);
    expect(row!.every((s) => s.fg !== undefined)).toBe(true);
  });

  test("a thematic break renders a dim rule", () => {
    const row = rows.find((r) => r.length === 1 && r[0].t.startsWith("─"));
    expect(row).toBeDefined();
  });

  test("a fenced code block renders each body line with a code gutter", () => {
    const i = lines.findIndex((l) => l.includes("fenced code body"));
    expect(i).toBeGreaterThanOrEqual(0);
    expect(rows[i][0].t.startsWith("│")).toBe(true);
    expect(rows[i][0].fg).toBeDefined();
  });

  test("task lists render status markers with the right content styling", () => {
    const done = lines.findIndex((l) => l.includes("a done task"));
    expect(rows[done][0].t).toBe("[x] ");
    expect(rows[done].slice(1).some((s) => s.fg !== undefined)).toBe(true);

    const open = lines.findIndex((l) => l.includes("an open task"));
    expect(rows[open][0].t).toBe("[.] ");

    const prog = lines.findIndex((l) => l.includes("an in-progress task"));
    expect(rows[prog][0].t).toBe("[~] ");
    expect(rows[prog].slice(1).some((s) => s.bold)).toBe(true);
  });
});

describe("fixture-driven emphasis corpus", () => {
  const src = readFileSync(join(FIX, "emphasis.md"), "utf8");

  test("intraword underscore lines survive the whole-document render verbatim", () => {
    const rows = renderMarkdown(src);
    const lines = rows.map((r) => r.map((s) => s.t).join(""));
    expect(lines).toContain("MAX_BG_TASKS_PER_SESSION");
    expect(lines).toContain("foo_bar_baz");
    expect(lines).toContain("a__b__c");
    expect(lines).toContain("__foo__bar");
    expect(lines).toContain("foo_bar_");
    expect(lines).toContain("_foo_bar");
    expect(lines).toContain("_пристаням_стремятся");
  });

  test("intraword asterisk lines emphasize the inner word", () => {
    const rows = renderMarkdown(src);
    const a = rows.find((r) => r.map((s) => s.t).join("") === "abc");
    expect(a).toBeDefined();
    expect(a!.some((s) => s.italic)).toBe(true);
  });

  test("standard forms style their content", () => {
    const rows = renderMarkdown(src);
    const styled = (t: string, flags: { bold?: boolean; italic?: boolean }) =>
      rows.some((r) => r.some((s) => s.t === t && s.bold === flags.bold && s.italic === flags.italic));
    expect(styled("italic", { italic: true })).toBe(true);
    expect(styled("bold", { bold: true })).toBe(true);
    expect(styled("both bold and italic", { bold: true, italic: true })).toBe(true);
    expect(styled("foo_bar_baz", { italic: true })).toBe(true);
  });
});
