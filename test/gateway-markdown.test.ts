// The gateway UI's markdown renderer (plugins/gateway/md.js).
//
// It is a classic script, not a module, so it is loaded here the same way the
// browser loads it - by evaluating the file - rather than by importing a copy
// of the logic that could drift from what ships.
//
// Two kinds of case matter and both are here:
//   - CommonMark behaviour a transcript depends on (headings, fenced code,
//     lists, tables, emphasis flanking rules that must NOT fire)
//   - hostile input: a model can echo anything it read, so raw HTML, a
//     javascript: URL or an unterminated fence must render inert
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const src = readFileSync(join(import.meta.dir, "..", "plugins", "gateway", "md.js"), "utf8");
const sandbox: { FoxMD?: { render(s: string): string; escape(s: unknown): string } } = {};
// `new Function` scopes the file to this sandbox instead of the test process.
new Function("globalThis", src)(sandbox);
const md = (s: string) => sandbox.FoxMD!.render(s);

describe("blocks", () => {
  test("headings 1-6", () => {
    expect(md("# one")).toBe("<h1>one</h1>");
    expect(md("### three")).toBe("<h3>three</h3>");
    expect(md("###### six")).toBe("<h6>six</h6>");
    expect(md("####### seven")).toContain("<p>");
  });

  test("paragraphs split on a blank line", () => {
    expect(md("a\n\nb")).toBe("<p>a</p>\n<p>b</p>");
  });

  test("a single newline inside a paragraph is not a break", () => {
    expect(md("a\nb")).toBe("<p>a\nb</p>");
  });

  test("two trailing spaces are a hard break", () => {
    expect(md("a  \nb")).toBe("<p>a<br>\nb</p>");
  });

  test("horizontal rules", () => {
    for (const r of ["---", "***", "___", "- - -"]) expect(md(r)).toBe("<hr>");
  });

  test("fenced code keeps its body verbatim and its language", () => {
    const out = md("```ts\nconst a = 1 < 2 && 3 > 2;\n```");
    expect(out).toContain('data-lang="ts"');
    expect(out).toContain("const a = 1 &lt; 2 &amp;&amp; 3 &gt; 2;");
    expect(out).not.toContain("<strong>");
  });

  test("markdown inside a fence is literal", () => {
    expect(md("```\n**not bold**\n```")).toContain("**not bold**");
  });

  test("an UNTERMINATED fence still renders as code (streaming mid-block)", () => {
    const out = md("```js\nconst x = 1");
    expect(out).toContain("<pre");
    expect(out).toContain("const x = 1");
    expect(out).not.toContain("<p>");
  });

  test("tilde fences and longer fences work, and a shorter one does not close", () => {
    expect(md("~~~\nx\n~~~")).toContain("<pre");
    expect(md("````\na\n```\nb\n````")).toContain("```\nb");
  });

  test("blockquote, including nesting", () => {
    expect(md("> hi")).toBe("<blockquote>\n<p>hi</p>\n</blockquote>");
    expect(md("> > deep")).toContain("<blockquote>");
  });

  test("unordered, ordered, and nested lists", () => {
    expect(md("- a\n- b")).toBe("<ul>\n<li>a</li>\n<li>b</li>\n</ul>");
    expect(md("1. a\n2. b")).toBe("<ol>\n<li>a</li>\n<li>b</li>\n</ol>");
    const nested = md("- a\n  - b\n- c");
    expect(nested).toContain("<ul>");
    expect(nested.match(/<ul>/g)!.length).toBe(2);
    expect(nested).toContain("<li>c</li>");
  });

  test("a list item can hold a paragraph and a nested list", () => {
    const out = md("- first\n\n  continued\n- second");
    expect(out).toContain("continued");
    expect(out).toContain("<li>second</li>");
  });

  test("task list items render checkboxes", () => {
    const out = md("- [ ] todo\n- [x] done");
    expect(out).toContain('<input type="checkbox" disabled aria-label="todo">');
    expect(out).toContain('checked aria-label="done"');
    expect(out).not.toContain("[ ]");
  });

  test("tables, with alignment and escaped pipes", () => {
    const out = md("| a | b |\n|:--|--:|\n| 1 | 2 |");
    expect(out).toContain("<th");
    expect(out).toContain("text-align:left");
    expect(out).toContain("text-align:right");
    expect(out).toContain("<td");
    expect(md("| a |\n| - |\n| `x|y` |")).toContain("x|y");
  });

  test("a table needs its separator row; without one it is a paragraph", () => {
    expect(md("a | b\nc | d")).toBe("<p>a | b\nc | d</p>");
  });

  test("empty and whitespace-only input render empty", () => {
    expect(md("")).toBe("");
    expect(md("   \n\n  ")).toBe("");
    expect(md(null as unknown as string)).toBe("");
  });

  test("CRLF is normalised", () => {
    expect(md("a\r\n\r\nb")).toBe("<p>a</p>\n<p>b</p>");
  });
});

describe("inline", () => {
  test("bold, italic, strike, code", () => {
    expect(md("**b**")).toBe("<p><strong>b</strong></p>");
    expect(md("*i*")).toBe("<p><em>i</em></p>");
    expect(md("~~s~~")).toBe("<p><del>s</del></p>");
    expect(md("`c`")).toBe("<p><code>c</code></p>");
  });

  test("underscore emphasis does not fire inside a word (CommonMark flanking)", () => {
    for (const s of ["MAX_BG_TASKS_PER_SESSION", "foo_bar_baz", "a__b__c", "snake_case_name_here"]) {
      const out = md(s);
      expect(out).not.toContain("<em>");
      expect(out).not.toContain("<strong>");
      expect(out).toContain(s);
    }
    expect(md("_em_")).toContain("<em>em</em>");
    expect(md("__strong__")).toContain("<strong>strong</strong>");
  });

  test("inline code is not re-parsed for emphasis or links", () => {
    expect(md("`**x**`")).toBe("<p><code>**x**</code></p>");
    expect(md("`[a](b)`")).toBe("<p><code>[a](b)</code></p>");
    expect(md("``a ` b``")).toContain("<code>a ` b</code>");
  });

  test("links get rel/target, and titles survive", () => {
    const out = md("[x](https://e.com)");
    expect(out).toContain('href="https://e.com"');
    expect(out).toContain('rel="noopener noreferrer nofollow"');
    expect(md('[x](https://e.com "t")')).toContain('title="t"');
  });

  test("autolinks", () => {
    expect(md("<https://e.com/a>")).toContain('<a href="https://e.com/a"');
  });

  test("mailto is allowed, a bare anchor is allowed", () => {
    expect(md("[m](mailto:a@b.c)")).toContain("href=\"mailto:a@b.c\"");
    expect(md("[s](#sec)")).toContain('href="#sec"');
  });
});

describe("hostile input", () => {
  test("raw HTML is escaped, never emitted", () => {
    const out = md("<script>alert(1)</script>");
    expect(out).not.toContain("<script>");
    expect(out).toContain("&lt;script&gt;");
  });

  test("an img with an event handler stays inert", () => {
    const out = md('<img src=x onerror="alert(1)">');
    expect(out).not.toContain("<img");
    expect(out).toContain("&lt;img");
  });

  test("javascript: and data: links are unwrapped to plain text", () => {
    for (const url of ["javascript:alert(1)", "JaVaScRiPt:alert(1)", "data:text/html,<script>", "vbscript:x"]) {
      const out = md(`[click](${url})`);
      expect(out).not.toContain("href=");
      expect(out).toContain("click");
    }
  });

  test("a quote in a link title cannot break out of the attribute", () => {
    const out = md('[x](https://e.com "t")');
    expect(out).toContain('title="t"');
    // an escape attempt inside the title stays inside the escaped attribute
    const evil = md('[x](https://e.com "a\">onmouseover=\"alert(1)")');
    expect(evil).not.toContain('onmouseover=\"');
  });

  test("attribute values in a table/link are escaped", () => {
    expect(md('| <b> |\n| - |\n| x |')).not.toContain("<b>");
  });

  test("every prefix of a document renders (streaming safety)", () => {
    const doc = [
      "# Title",
      "",
      "Some **bold** and `code` and a [link](https://e.com).",
      "",
      "```js",
      "const a = `template ${x}`;",
      "```",
      "",
      "| h | i |",
      "| - | - |",
      "| 1 | 2 |",
      "",
      "- one",
      "  - two",
      "",
      "> quoted",
      "",
      "---",
      "",
      "trailing *emphasis*",
    ].join("\n");
    for (let i = 0; i <= doc.length; i++) {
      const slice = doc.slice(0, i);
      expect(() => md(slice)).not.toThrow();
      // and it must never emit an unescaped script tag
      expect(md(slice)).not.toContain("<script>");
    }
  });

  test("a pathological input returns quickly (no catastrophic backtracking)", () => {
    const nasty = "*".repeat(4000) + "_".repeat(2000) + "[".repeat(2000);
    const t0 = performance.now();
    md(nasty);
    expect(performance.now() - t0).toBeLessThan(2000);
  });
});

describe("the file itself", () => {
  test("has no CDN, no import, and no eval of its own", () => {
    expect(src).not.toContain("cdn.");
    expect(src).not.toContain("https://unpkg");
    expect(src).not.toMatch(/^\s*import\s/m);
    expect(src).not.toContain("document.write");
  });
});
