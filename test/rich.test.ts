import { describe, expect, test } from "bun:test";
import { diffFenceLine, jsonSegs, statusSegs, pathSegs, wordDiff, ansiSegs } from "../src/tui/highlight.ts";
import { renderMarkdown, setRichMarkdown, type MdState } from "../src/tui/markdown.ts";
import { Screen } from "../src/tui/screen.ts";

/** parse text as the TUI's incremental stream cache does */
function splitParse(text: string, cutAt: number) {
  const st: MdState = { inFence: false, hadCode: false };
  const a = renderMarkdown(text.slice(0, cutAt - 1), st);
  const b = renderMarkdown(text.slice(cutAt), { ...st });
  return [...a, ...b];
}

const flat = (rows: { t?: string }[][]) => rows.map((r) => r.map((s) => s.t ?? "").join("")).join("\n");

describe("markdown inline: strikethrough, links, images", () => {
  test("~~strike~~ renders struck text without the tildes", () => {
    const rows = renderMarkdown("before ~~gone~~ after");
    expect(flat(rows)).toBe("before gone after");
    const struck = rows[0].find((s) => s.t === "gone");
    expect(struck?.strike).toBe(true);
  });

  test("a link shows only its label; the URL rides in href", () => {
    const rows = renderMarkdown("see [the docs](https://example.com/x) now");
    expect(flat(rows)).toBe("see the docs now");
    const link = rows[0].find((s) => s.t === "the docs");
    expect(link?.href).toBe("https://example.com/x");
    expect(link?.fg).toBeDefined();
  });

  test("an image becomes a placeholder that hyperlinks to the target", () => {
    const rows = renderMarkdown("![logo](https://example.com/logo.png)");
    expect(flat(rows)).toBe("[image: logo]");
    expect(rows[0][0].href).toBe("https://example.com/logo.png");
  });

  test("inline features compose with bold and code", () => {
    const rows = renderMarkdown("**bold ~~struck~~** and `code` [l](u)");
    expect(flat(rows)).toBe("bold struck and code l");
    expect(rows[0].some((s) => s.bold && s.strike && s.t === "struck")).toBe(true);
    expect(rows[0].find((s) => s.t === "code")?.fg).toBeDefined();
    expect(rows[0].find((s) => s.t === "l")?.href).toBe("u");
  });

  test("incremental parse is unchanged by the new inline rules", () => {
    const doc = "a ~~b~~ [c](https://d.e) ![f](https://g.h)\n\n```ts\nconst x = 1;\n```\n\ntail ~~z~~";
    const whole = flat(renderMarkdown(doc));
    let at = -1;
    while ((at = doc.indexOf("\n", at + 1)) >= 0) {
      expect(flat(splitParse(doc, at + 1))).toBe(whole);
    }
  });
});

describe("rich fences: diff and json routing", () => {
  test("a ```diff fence colors markers and keeps non-marker lines plain", () => {
    setRichMarkdown(true);
    try {
      const rows = renderMarkdown("```diff\n- old\n+ new\n ctx\n```");
      const text = rows.map((r) => r.map((s) => s.t).join(""));
      expect(text).toEqual(["│ - old", "│ + new", "│  ctx"]);
      expect(rows[0][1].fg).toBeDefined(); // deletion tinted
      expect(rows[1][1].fg).toBeDefined(); // addition tinted
      // context stays plain CODE_FG (same hex as the gutter), i.e. unstyled
      // relative to a flat fence — not accent/ok/error
      expect(rows[2][1].fg).toBe(rows[2][0].fg);
    } finally {
      setRichMarkdown(false);
    }
  });

  test("a ```json fence tints keys, strings and numbers", () => {
    setRichMarkdown(true);
    try {
      const rows = renderMarkdown('```json\n{"name": "fox", "n": 42}\n```');
      expect(flat(rows)).toBe('│ {"name": "fox", "n": 42}');
      const line = rows[0].slice(1);
      const key = line.find((s) => s.t === '"name"');
      const str = line.find((s) => s.t === '"fox"');
      const num = line.find((s) => s.t === "42");
      expect(key?.fg).toBeDefined();
      expect(str?.fg).toBeDefined();
      expect(num?.fg).toBeDefined();
      expect(key?.fg).not.toBe(str?.fg); // key vs value differ
    } finally {
      setRichMarkdown(false);
    }
  });

  test("rich off: fences stay flat, split-parse still matches", () => {
    setRichMarkdown(false);
    const doc = "```diff\n- old\n+ new\n```\nafter";
    const whole = flat(renderMarkdown(doc));
    let at = -1;
    while ((at = doc.indexOf("\n", at + 1)) >= 0) {
      expect(flat(splitParse(doc, at + 1))).toBe(whole);
    }
  });
});

describe("rich tool-output tinting", () => {
  test("diffFenceLine: markers tint, context is null", () => {
    expect(diffFenceLine("+added")?.[0].fg).toBeDefined();
    expect(diffFenceLine("-gone")?.[0].fg).toBeDefined();
    expect(diffFenceLine("@@ -1 +1 @@")?.[0].fg).toBeDefined();
    expect(diffFenceLine("plain")).toBeNull();
  });

  test("jsonSegs: keys, strings, numbers, literals", () => {
    const segs = jsonSegs('{"k": "v", "n": 7, "b": true}');
    const byText = Object.fromEntries(segs.filter((s) => s.fg).map((s) => [s.t, s.fg]));
    expect(byText['"k"']).toBeDefined();
    expect(byText['"v"']).toBeDefined();
    expect(byText["7"]).toBeDefined();
    expect(byText["true"]).toBeDefined();
    expect(byText['"k"']).not.toBe(byText['"v"']);
  });

  test("statusSegs: PASS/FAIL/WARN get their own colors, other words stay plain", () => {
    const segs = statusSegs("tests 12 PASS 3 FAIL")!;
    expect(segs).not.toBeNull();
    const byText = Object.fromEntries(segs.filter((s) => s.fg).map((s) => [s.t, s.fg]));
    expect(byText["PASS"]).toBeDefined();
    expect(byText["FAIL"]).toBeDefined();
    expect(byText["PASS"]).not.toBe(byText["FAIL"]);
    expect(statusSegs("nothing notable here")).toBeNull();
  });

  test("pathSegs: src/foo.ts accent, :42 dim, non-paths null", () => {
    const segs = pathSegs("see src/tui/app.ts:42 for details")!;
    expect(segs).not.toBeNull();
    expect(segs[1].t).toBe("src/tui/app.ts");
    expect(segs[1].fg).toBeDefined();
    expect(segs[2]?.t).toBe(":42");
    expect(flat([segs])).toBe("see src/tui/app.ts:42 for details");
    expect(pathSegs("version 2.3 beta")).toBeNull();
    expect(pathSegs("just words")).toBeNull();
  });

  test("wordDiff: only changed words tint, shared words stay plain", () => {
    const { del, add } = wordDiff("the quick brown fox", "the quick red fox");
    const addText = add.map((s) => s.t).join("");
    const delText = del.map((s) => s.t).join("");
    expect(addText).toBe("the quick red fox");
    expect(delText).toBe("the quick brown fox");
    const addRed = add.find((s) => s.t.includes("red"));
    const addQuick = add.find((s) => s.t.includes("quick"));
    expect(addRed?.fg).toBeDefined();
    expect(addQuick?.fg).toBeUndefined();
  });

  test("ansiSegs: SGR codes become themed segs, text survives untouched", () => {
    const segs = ansiSegs("plain \x1b[31mred\x1b[0m back");
    expect(flat([segs])).toBe("plain red back");
    const red = segs.find((s) => s.t === "red");
    expect(red?.fg).toBeDefined();
    expect(segs.find((s) => s.t === "plain")?.fg).toBeUndefined();
  });

  test("ansiSegs: 256-palette and truecolor codes translate", () => {
    const segs = ansiSegs("\x1b[38;5;9mbright red\x1b[0m | \x1b[38;2;0;200;0mgreen\x1b[0m");
    expect(flat([segs])).toBe("bright red | green");
    expect(segs.find((s) => s.t === "bright red")?.fg).toBeDefined();
    expect(segs.find((s) => s.t === "green")?.fg).toBe("#00c800");
  });

  test("ansiSegs: bold toggles, unrelated escapes are dropped", () => {
    const segs = ansiSegs("\x1b[1mbold\x1b[0m \x1b[4Aclipped");
    expect(segs.find((s) => s.t === "bold")?.bold).toBe(true);
    expect(flat([segs])).toContain("clipped"); // text kept, cursor-move dropped
  });
});

describe("Screen: strike and OSC 8 hrefs", () => {
  class FakeTerm {
    buf = "";
    write(s: string) {
      this.buf += s;
    }
    flush() {}
  }

  test("a struck style emits SGR 9 and does not leak past its run", () => {
    const scr = new Screen(new FakeTerm() as any);
    scr.resize(20, 1);
    scr.text(0, 0, "ab", scr.sgr({ fg: "#ffffff", strike: true }));
    scr.text(2, 0, "cd", scr.sgr({ fg: "#ffffff" }));
    scr.flush();
    expect(scr.dumpGrid()).toBe("abcd" + "\x01".repeat(16));
    const buf = (scr as any).term.buf as string;
    expect(buf).toContain("\x1b[9m");
    expect(buf).toContain("ab\x1b[0m"); // reset between the runs
  });

  test("an href seg emits an OSC 8 open before and close after the text", () => {
    const scr = new Screen(new FakeTerm() as any);
    scr.resize(24, 1);
    scr.text(0, 0, "ab", scr.sgr({ fg: "#ffffff", href: "https://example.com" }));
    scr.text(2, 0, "cd", scr.sgr({ fg: "#ffffff" }));
    scr.flush();
    const buf = (scr as any).term.buf as string;
    expect(buf).toContain("\x1b]8;;https://example.com\x1b\\");
    expect(buf).toContain("ab\x1b]8;;\x1b\\"); // closed before the next run paints
  });

  test("a link at end of row is still closed", () => {
    const scr = new Screen(new FakeTerm() as any);
    scr.resize(10, 1);
    scr.text(0, 0, "ab", scr.sgr({ href: "https://x.y" }));
    scr.flush();
    const buf = (scr as any).term.buf as string;
    expect(buf).toContain("\x1b]8;;https://x.y\x1b\\");
    expect(buf.indexOf("\x1b]8;;https://x.y\x1b\\")).toBeLessThan(buf.lastIndexOf("\x1b]8;;\x1b\\"));
  });
});
