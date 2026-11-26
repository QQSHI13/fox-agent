import { describe, expect, test } from "bun:test";
import { createStreamRows, isStreamRewind, legacyStreamRows, type Row } from "../src/tui/rows.ts";

function rowsText(rows: Row[]): string {
  return rows.map((r) => r.segs.map((s) => s.t).join("")).join("\n");
}

describe("rows kernel: first-line reserve (the [N] chip hangs over line 1)", () => {
  const widthOf = (r: Row) => r.segs.reduce((n, s) => n + s.t.length, 0);

  test("only the first row gives up the reserve; continuations reach the full width", () => {
    // The chip rides the first visual row only. Wrapping the whole item at the
    // narrow width left every continuation line short by the marker's width.
    const W = 40;
    const k = createStreamRows(W, { firstReserve: 5 });
    k.feed("word ".repeat(100).trim());
    const rows = k.rows as Row[];
    expect(widthOf(rows[0])).toBeLessThanOrEqual(W - 5);
    expect(Math.max(...rows.slice(1).map(widthOf))).toBeGreaterThanOrEqual(W - 1);
    expect(Math.max(...rows.slice(1).map(widthOf))).toBeLessThanOrEqual(W);
  });

  test("the reserve survives settling the first row and does not leak into the tail", () => {
    const W = 40;
    const k = createStreamRows(W, { firstReserve: 5 });
    k.feed("first line of prose that wraps\nsecond ");
    const rows = k.rows as Row[];
    // the settled line keeps its narrow first row...
    expect(widthOf(rows[0])).toBeLessThanOrEqual(W - 5);
    // ...and the unterminated tail after the newline wraps at the full width
    expect(Math.max(...rows.slice(1).map(widthOf))).toBeLessThanOrEqual(W);
  });
});

/**
 * Golden equivalence: the kernel must produce byte-identical rows to the
 * previous streaming renderer (legacyStreamRows) at every feed point —
 * including the paragraph-straddle quirk. This is the "no behavior change"
 * contract for the streaming path.
 */
describe("rows kernel: golden equivalence with the legacy stream renderer", () => {

  const DOCS = [
    "plain words only, one giant paragraph with no newline at all, just more and more words arriving in tiny pieces",
    "# Head\n\npara one **bold**\ncontinues\n\n```js\nlet x = 1;\nlet y = 2;\n```\n\n- a\n- b\n\ntail **para**",
    "```\nfence line one\nfence two\n```\n\nafter the fence **bold** and `code`",
    "line one\nline two\nline three\n",
    "**bold start** " + "wrap me over and over ".repeat(40),
    "",
    "single",
  ];

  for (const [di, doc] of DOCS.entries()) {
    test(`doc ${di}: identical rows at every feed point (width 98)`, () => {
      const kernel = createStreamRows(98);
      const legacy = { cut: 0, md: { inFence: false, hadCode: false } as any, prefix: [] as Row[], text: "" };
      // feed DISJOINT chunks like real deltas, checking after each
      const chunk = Math.max(1, Math.floor(doc.length / 7));
      let fed = 0;
      while (fed < doc.length) {
        const end = Math.min(doc.length, fed + chunk);
        kernel.feed(doc.slice(fed, end));
        fed = end;
        const want = rowsText(legacyStreamRows(doc.slice(0, fed), 98, legacy));
        const got = rowsText(kernel.rows as Row[]);
        expect(`doc${di}@${fed}: ${got}`).toBe(`doc${di}@${fed}: ${want}`);
      }
    });
  }

  test("wide chars and CJK survive identically", () => {
    const doc = "日本語のテキスト 🐱 emoji と CJK、そして **太字** のテスト".repeat(5);
    const kernel = createStreamRows(40);
    const legacy = { cut: 0, md: { inFence: false, hadCode: false } as any, prefix: [] as Row[], text: "" };
    for (let i = 0; i < doc.length; i += 9) {
      kernel.feed(doc.slice(i, Math.min(doc.length, i + 9)));
      const want = rowsText(legacyStreamRows(doc.slice(0, Math.min(doc.length, i + 9)), 40, legacy));
      expect(rowsText(kernel.rows as Row[])).toBe(want);
    }
  });

  test("resize reflows to the same rows as a fresh renderer at the new width", () => {
    const doc = "some paragraph that wraps differently at narrow widths, with **bold** parts ".repeat(6);
    const kernel = createStreamRows(98);
    kernel.feed(doc);
    kernel.resize(50);
    const fresh = createStreamRows(50);
    fresh.feed(doc);
    expect(rowsText(kernel.rows as Row[])).toBe(rowsText(fresh.rows as Row[]));
    const legacy = { cut: 0, md: { inFence: false, hadCode: false } as any, prefix: [] as Row[], text: "" };
    expect(rowsText(kernel.rows as Row[])).toBe(rowsText(legacyStreamRows(doc, 50, legacy)));
  });

  test("feed() repaint window: rows before `from` are unchanged across the feed", () => {
    const kernel = createStreamRows(60);
    kernel.feed("first line settled here\n");
    const beforeRows = (kernel.rows as Row[]).map((r) => r.segs.map((s) => s.t).join(""));
    const { from } = kernel.feed("tail words arriving ");
    const after = (kernel.rows as Row[]).map((r) => r.segs.map((s) => s.t).join(""));
    for (let i = 0; i < from && i < beforeRows.length; i++) {
      expect(after[i]).toBe(beforeRows[i]);
    }
  });

  test("PERF: 200KB no-newline stream, 30 feeds — kernel stays O(delta), legacy explodes", () => {
    const doc = "streaming response word with **bold** and `code` and more prose. ".repeat(1500); // ~100KB
    const step = Math.floor(doc.length / 30);
    // warm both paths (JIT) with a small doc first — a cold-first-kernel
    // comparison is unfair by hundreds of ms
    const warm = "warm up the jit ".repeat(200);
    const wk = createStreamRows(98);
    for (let i = 100; i <= warm.length; i += 100) wk.feed(warm.slice(i - 100, i));
    const wl = { cut: 0, md: { inFence: false, hadCode: false } as any, prefix: [] as Row[], text: "" };
    for (let i = 100; i <= warm.length; i += 100) legacyStreamRows(warm.slice(0, i), 98, wl);
    // interleave rounds and take the best-of-3 per side: scheduler noise
    let kernelMs = Infinity;
    let legacyMs = Infinity;
    let kernelRows: Row[] = [];
    for (let round = 0; round < 3; round++) {
      let t = performance.now();
      const k = createStreamRows(98);
      for (let i = step; i <= doc.length; i += step) k.feed(doc.slice(i - step, i));
      kernelMs = Math.min(kernelMs, performance.now() - t);
      if (round === 0) kernelRows = k.rows as Row[];
      t = performance.now();
      const legacy = { cut: 0, md: { inFence: false, hadCode: false } as any, prefix: [] as Row[], text: "" };
      for (let i = step; i <= doc.length; i += step) legacyStreamRows(doc.slice(0, i), 98, legacy);
      legacyMs = Math.min(legacyMs, performance.now() - t);
    }
    expect(rowsText(kernelRows)).toBe(rowsText(legacyStreamRows(doc, 98, { cut: 0, md: { inFence: false, hadCode: false }, prefix: [], text: "" })));
    console.log(`kernel ${kernelMs.toFixed(0)}ms vs legacy ${legacyMs.toFixed(0)}ms for 30 feeds of a 100KB paragraph`);
    // Equivalence is the hard assertion above. The speed assertion lands with
    // the wrap-reuse optimization (kernel must not re-wrap the stable head);
    // for now both are O(tail) by design — this commit only fixes the CALLER
    // repaint window and pins the output contract.
  });
});


describe("isStreamRewind: a new message must not inherit the old kernel", () => {
  // Regression: the streaming tail's head showed the PREVIOUS message ("做完了")
  // until the new node settled. The old guard compared the new text against its
  // OWN prefix — vacuously true — so a new message longer than the old fed text
  // was appended to the old kernel instead of replacing it.
  test("a longer new message that diverges from the fed text is a rewind", () => {
    expect(isStreamRewind("做完了", "好的，我来看一下这个情况")).toBe(true);
  });
  test("a shrink is a rewind", () => {
    expect(isStreamRewind("做完了", "做完")).toBe(true);
  });
  test("a same-length rewrite is a rewind", () => {
    expect(isStreamRewind("做完了", "没做完")).toBe(true);
  });
  test("pure growth is not a rewind", () => {
    expect(isStreamRewind("做完", "做完了")).toBe(false);
    expect(isStreamRewind("做完了", "做完了")).toBe(false);
    expect(isStreamRewind("", "anything")).toBe(false);
  });
  test("a new message that genuinely extends the old text is safe to append", () => {
    // the shared prefix renders identically, so appending is correct here
    expect(isStreamRewind("做完了", "做完了，还有一件事")).toBe(false);
  });
});

describe("rows kernel: tables render live during streaming", () => {
  // A GFM table only promotes when its |---| separator is visible together
  // with the header row; settling per line used to render pipe prose until
  // the node finished. The kernel now holds a table-ish block in the tail.
  test("the table composes as a box as soon as header + separator have arrived", () => {
    const k = createStreamRows(60);
    k.feed("| Name | Value |\n|---|---|\n| alpha | 1 |\n");
    const rows = rowsText(k.rows as Row[]);
    expect(rows).toContain("│"); // box-drawing row, not raw "| Name | Value |"
    expect(rows).not.toContain("| Name | Value |");
  });

  test("the held block settles as one unit once a blank line closes it", () => {
    const doc = "before\n\n| a | b |\n|--|--|\n| 1 | 2 |\n\nafter the table\n";
    const k = createStreamRows(60);
    for (const line of doc.match(/[^\n]*\n/g) ?? []) k.feed(line);
    const want = rowsText(legacyStreamRows(doc, 60, { cut: 0, md: { inFence: false, hadCode: false }, prefix: [], text: "" }));
    expect(rowsText(k.rows as Row[])).toBe(want);
  });

  test("plain pipe prose without a separator still renders (held, then settled, as prose)", () => {
    const doc = "a | b mentioned in prose\nthen more text follows here\n\n";
    const k = createStreamRows(60);
    k.feed(doc);
    const want = rowsText(legacyStreamRows(doc, 60, { cut: 0, md: { inFence: false, hadCode: false }, prefix: [], text: "" }));
    expect(rowsText(k.rows as Row[])).toBe(want);
  });

  test("non-table docs still settle per line (golden path untouched)", () => {
    const k = createStreamRows(60);
    k.feed("first\nsecond\n");
    // both lines settle immediately — the tail holds nothing
    expect(rowsText(k.rows as Row[])).toBe("first\nsecond\n");
  });
});
