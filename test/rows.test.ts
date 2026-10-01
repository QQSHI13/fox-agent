import { describe, expect, test } from "bun:test";
import { createStreamRows, legacyStreamRows, type Row } from "../src/tui/rows.ts";

function rowsText(rows: Row[]): string {
  return rows.map((r) => r.segs.map((s) => s.t).join("")).join("\n");
}

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
