/**
 * Repro harness for the "transcript goes black after a big change" report.
 *
 * Drives the REAL pipeline — VirtualTranscript, overlaySources, computeFrame
 * with the host countCache — through the scenarios that precede a black frame:
 * a huge tool result landing (collapsed and expanded), a ctx replace that
 * shrinks a big node, and the scrollbar width flip. The invariant checked on
 * EVERY frame: when total content exceeds the viewport, the painted window
 * must cover the viewport (rows.length - winOffset >= vh). A frame that
 * violates it paints nothing and the transcript reads black.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Row } from "../src/tui/layout.ts";
import type { Item } from "../src/view/model.ts";
import type { VirtualTranscriptDeps } from "../src/tui/transcript.ts";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "fox-blank-"));
  process.env.FOX_AGENT_HOME = join(dir, ".fox");
  process.env.FOX_AGENT_CONFIG = join(dir, ".fox", "config.toml");
});

afterEach(async () => {
  try {
    const { dropDisplayCache } = await import("../src/context/display.ts");
    dropDisplayCache();
  } catch {}
  rmSync(dir, { recursive: true, force: true });
});

const W = 100;
const H = 30;

/** A minimal but faithful itemRows: wrap at width, chip on the first row. */
function makeRenderers() {
  const { wrapText } = require("../src/tui/wrap.ts") as typeof import("../src/tui/wrap.ts");
  const { itemEdgeSpan, chipGutter } = require("../src/tui/layout.ts") as typeof import("../src/tui/layout.ts");
  const buildRows = (item: Item, width: number): { rows: Row[]; span: [number, number]; visible: Row[] } => {
    const seq = item.seq !== undefined && !item.markerCont ? item.seq : undefined;
    const firstReserve = seq !== undefined ? chipGutter(seq) - 1 : 0;
    const rows: Row[] = [];
    const text = item.text ?? "";
    const lines = text.split("\n");
    for (const line of lines) {
      const wrapped = wrapText(line, width, firstReserve && rows.length === 0 ? { firstReserve } : undefined);
      for (const w of wrapped) rows.push({ segs: [{ t: w }] });
    }
    if (!rows.length) rows.push({ segs: [] });
    const span = itemEdgeSpan(rows);
    return { rows, span, visible: rows.slice(span[0], span[1]) };
  };
  const countRows = (item: Item, width: number): number => {
    const [a, b] = buildRows(item, width).span;
    return b - a;
  };
  return { buildRows, countRows };
}

interface Rig {
  frame: (stick: boolean) => import("../src/tui/layout.ts").Frame;
  setScroll: (n: number) => void;
  setStream: (t: string | null) => void;
  bump: () => void;
  transcript: import("../src/tui/transcript.ts").VirtualTranscript;
  overlay: Item[];
  countRev: () => number;
}

async function makeRig(id: string): Promise<Rig> {
  const db = await import("../src/store/db.ts");
  const { VirtualTranscript, arrayItemSource, concatSources, overlaySources } = await import("../src/tui/transcript.ts");
  const { computeFrame } = await import("../src/tui/layout.ts");
  const { projectDisplay } = await import("../src/context/display.ts");
  const { buildRows, countRows } = makeRenderers();

  let countRev = 0;
  const countCache = new Map<number, import("../src/tui/layout.ts").CountEntry>();
  const transcript = new VirtualTranscript(
    {
      key: (seq, slot) => seq * 4 + slot,
      expanded: () => false,
      keptChars: 4_000,
      summarize: (name, args) => `${name}${args}`,
      row: (seq) => db.getMessage(id, seq),
      buildRows,
      countRows,
    },
    () => projectDisplay(id),
  );
  const overlay: Item[] = [];
  let scrollTop = 0;
  let streamText: string | null = null;

  const frame = (stick: boolean) => {
    const chrome: Item[] = [];
    const settled = concatSources([arrayItemSource(chrome, (it, w) => buildRows(it, w).visible, countRows), transcript]);
    const source = overlaySources(settled, [arrayItemSource(overlay, (it, w) => buildRows(it, w).visible, countRows)]);
    const fr = computeFrame({
      W,
      H,
      scrollTop,
      stick,
      scrollbar: true,
      source,
      streamText,
      renderStream: (text, w) => buildRows({ k: -4, kind: "md", text } as Item, w).visible,
      countStream: (text, w) => countRows({ k: -4, kind: "md", text } as Item, w),
      inputRows: 1,
      caretRow: 0,
      INPUT_MAX_ROWS: 6,
      pendingCount: 0,
      countCache: { version: () => countRev, at: countCache },
    });
    scrollTop = fr.scrollTop;
    return fr;
  };

  return {
    frame,
    setScroll: (n) => {
      scrollTop = n;
    },
    setStream: (t) => {
      streamText = t;
    },
    bump: () => {
      countRev++;
    },
    transcript,
    overlay,
    countRev: () => countRev,
  };
}

/** Assert the frame's window covers the viewport whenever content overflows. */
function expectCovered(fr: import("../src/tui/layout.ts").Frame, label: string): void {
  const covered = fr.rows.length - fr.winOffset;
  if (fr.total >= fr.vh) {
    expect(covered, `${label}: window covers viewport (total=${fr.total} vh=${fr.vh} scrollTop=${fr.scrollTop} winOffset=${fr.winOffset} rows=${fr.rows.length})`).toBeGreaterThanOrEqual(fr.vh);
  }
}

async function seedLong(db: typeof import("../src/store/db.ts"), id: string, n: number): Promise<void> {
  for (let i = 0; i < n; i++) {
    db.appendMessage(id, { role: "user", content: `question ${i} with a bit of text to wrap`, tokens: 5 });
    db.appendMessage(id, { role: "assistant", content: `answer ${i} `.repeat(20), tokens: 5 });
  }
}

describe("blank transcript repro", () => {
  test("a huge tool result landing while stuck to the bottom never blanks the window", async () => {
    const db = await import("../src/store/db.ts");
    const s = db.createSession(dir, "m1");
    await seedLong(db, s.id, 40);
    const rig = await makeRig(s.id);

    // settle frames first
    rig.transcript.refresh();
    rig.bump();
    expectCovered(rig.frame(true), "initial");

    // the big tool result lands: assistant call + tool row with 8000 lines
    db.appendMessage(s.id, {
      role: "assistant",
      content: "",
      tokens: 5,
      tool_calls: JSON.stringify([{ id: "call_big", name: "exec", arguments: '{"cmd":"yes"}' }]),
    });
    db.appendMessage(s.id, {
      role: "tool",
      tool_call_id: "call_big",
      content: Array.from({ length: 8000 }, (_, i) => `output line ${i} with some content`).join("\n"),
      tokens: 5,
    });
    rig.transcript.refresh();
    for (const k of rig.transcript.takeInvalidatedKeys()) void k;
    rig.bump();

    // frames as the layout would produce them across the landing
    for (let f = 0; f < 3; f++) expectCovered(rig.frame(true), `big result frame ${f}`);
  });

  test("a ctx replace shrinking a big node to nothing never blanks the window", async () => {
    const db = await import("../src/store/db.ts");
    const s = db.createSession(dir, "m1");
    await seedLong(db, s.id, 40);
    // one huge assistant message in the middle
    const big = db.appendMessage(s.id, { role: "assistant", content: Array.from({ length: 4000 }, (_, i) => `big line ${i}`).join("\n"), tokens: 5 });
    const bigSeq = big.seq;
    await seedLong(db, s.id, 5);
    const rig = await makeRig(s.id);
    rig.transcript.refresh();
    rig.bump();
    expectCovered(rig.frame(true), "initial");

    // replace the big node with a one-liner (a compaction-style op, the
    // append-only store never rewrites: the projection replaces)
    db.appendOps(s.id, [{ kind: "replace" as const, id: bigSeq, content: "short now", version: 1 }]);
    rig.transcript.refresh();
    for (const k of rig.transcript.takeInvalidatedKeys()) rig.bump();
    rig.bump();

    for (let f = 0; f < 3; f++) expectCovered(rig.frame(true), `after replace frame ${f}`);
  });

  test("expanding then collapsing a huge tool body keeps the window covered", async () => {
    const db = await import("../src/store/db.ts");
    const s = db.createSession(dir, "m1");
    await seedLong(db, s.id, 20);
    db.appendMessage(s.id, {
      role: "assistant",
      content: "",
      tokens: 5,
      tool_calls: JSON.stringify([{ id: "call_x", name: "exec", arguments: '{"cmd":"yes"}' }]),
    });
    const toolRow = db.appendMessage(s.id, {
      role: "tool",
      tool_call_id: "call_x",
      content: Array.from({ length: 5000 }, (_, i) => `row ${i}`).join("\n"),
      tokens: 5,
    });
    const toolSeq = toolRow.seq;

    const { VirtualTranscript, arrayItemSource, concatSources, overlaySources } = await import("../src/tui/transcript.ts");
    const { computeFrame } = await import("../src/tui/layout.ts");
    const { projectDisplay } = await import("../src/context/display.ts");
    const { buildRows, countRows } = makeRenderers();
    let countRev = 0;
    const countCache = new Map<number, import("../src/tui/layout.ts").CountEntry>();
    let expanded = false;
    const transcript = new VirtualTranscript(
      {
        key: (seq, slot) => seq * 4 + slot,
        expanded: (seq) => expanded && seq === toolSeq,
        keptChars: 4_000,
        summarize: (name, args) => `${name}${args}`,
        row: (seq) => db.getMessage(s.id, seq),
        buildRows,
        countRows,
      },
      () => projectDisplay(s.id),
    );
    const overlay: Item[] = [];
    let scrollTop = 0;
    const frame = (stick: boolean) => {
      const settled = concatSources([arrayItemSource([], (it, w) => buildRows(it, w).visible, countRows), transcript]);
      const source = overlaySources(settled, [arrayItemSource(overlay, (it, w) => buildRows(it, w).visible, countRows)]);
      const fr = computeFrame({
        W,
        H,
        scrollTop,
        stick,
        scrollbar: true,
        source,
        streamText: null,
        renderStream: () => [],
        countStream: () => 0,
        inputRows: 1,
        caretRow: 0,
        INPUT_MAX_ROWS: 6,
        pendingCount: 0,
        countCache: { version: () => countRev, at: countCache },
      });
      scrollTop = fr.scrollTop;
      return fr;
    };

    transcript.refresh();
    countRev++;
    expectCovered(frame(true), "collapsed");

    // expand the huge body: ctrl+t path — setAllExpanded invalidates counts
    expanded = true;
    transcript.setAllExpanded(true);
    countRev++;
    for (let f = 0; f < 3; f++) expectCovered(frame(true), `expanded frame ${f}`);

    // collapse again
    expanded = false;
    transcript.setAllExpanded(false);
    countRev++;
    for (let f = 0; f < 3; f++) expectCovered(frame(true), `recollapsed frame ${f}`);
  });

  test("count and render agree per slot across expansion (the tear invariant)", async () => {
    // Root-cause regression for "top renders, bottom is blank": the count pass
    // (countAt) and the render pass (renderAt) must return the SAME row count
    // for every slot, or assemble builds a window shorter than the viewport and
    // the bottom paints blank. Assert that invariant directly on the real
    // VirtualTranscript, before and after an internal expansion change, using a
    // FRESH builder for both (the split that used to tear when render went
    // through a separately-invalidated cache).
    const db = await import("../src/store/db.ts");
    const s = db.createSession(dir, "m1");
    await seedLong(db, s.id, 6);
    db.appendMessage(s.id, {
      role: "assistant",
      content: "",
      tokens: 5,
      tool_calls: JSON.stringify([{ id: "call_y", name: "exec", arguments: '{"cmd":"yes"}' }]),
    });
    const toolRow = db.appendMessage(s.id, {
      role: "tool",
      tool_call_id: "call_y",
      content: Array.from({ length: 300 }, (_, i) => `line ${i} with some words`).join("\n"),
      tokens: 5,
    });
    const toolSeq = toolRow.seq;

    const { VirtualTranscript } = await import("../src/tui/transcript.ts");
    const { projectDisplay } = await import("../src/context/display.ts");
    const { buildRows, countRows } = makeRenderers();
    let expanded = false;
    const transcript = new VirtualTranscript(
      {
        key: (seq, slot) => seq * 4 + slot,
        expanded: (seq) => expanded && seq === toolSeq,
        keptChars: 4_000,
        summarize: (name, args) => `${name}${args}`,
        row: (seq) => db.getMessage(s.id, seq),
        buildRows,
        countRows,
      },
      () => projectDisplay(s.id),
    );

    const assertAgree = (label: string) => {
      transcript.refresh();
      for (let pass = 0; pass < 2; pass++) {
        for (let i = 0; i < transcript.length; i++) {
          const c = transcript.countAt(i, W);
          const r = transcript.renderAt(i, W).length;
          expect(r, `${label} pass ${pass} slot ${i}: render rows == count rows`).toBe(c);
        }
      }
    };

    assertAgree("collapsed");
    expanded = true;
    transcript.setAllExpanded(true);
    assertAgree("expanded");
    expanded = false;
    transcript.setAllExpanded(false);
    assertAgree("re-collapsed");
  });

  test("a poisoned count cache produces the impossible frame the self-heal detects", async () => {
    // The self-heal in pushTranscriptFrame keys on: total > vh while the built
    // window covers less than the viewport. This test poisons the cache the
    // way a missed invalidation would (geometry counted while a node was
    // huge, reused after it shrank) and asserts the predicate fires — and
    // that a full invalidation (what the heal does) produces a covering frame.
    const db = await import("../src/store/db.ts");
    const s = db.createSession(dir, "m1");
    await seedLong(db, s.id, 10);
    const big = db.appendMessage(s.id, { role: "assistant", content: Array.from({ length: 3000 }, (_, i) => `huge ${i}`).join("\n"), tokens: 5 });
    await seedLong(db, s.id, 3);

    const { VirtualTranscript, arrayItemSource, concatSources, overlaySources } = await import("../src/tui/transcript.ts");
    const { computeFrame } = await import("../src/tui/layout.ts");
    const { projectDisplay } = await import("../src/context/display.ts");
    const { buildRows, countRows } = makeRenderers();
    let countRev = 0;
    const countCache = new Map<number, import("../src/tui/layout.ts").CountEntry>();
    const transcript = new VirtualTranscript(
      {
        key: (seq, slot) => seq * 4 + slot,
        expanded: () => true, // the huge body is expanded: thousands of rows
        keptChars: 4_000,
        summarize: (name, args) => `${name}${args}`,
        row: (seq) => db.getMessage(s.id, seq),
        buildRows,
        countRows,
      },
      () => projectDisplay(s.id),
    );
    const overlay: Item[] = [];
    let scrollTop = 0;
    const frame = (stick: boolean) => {
      const settled = concatSources([arrayItemSource([], (it, w) => buildRows(it, w).visible, countRows), transcript]);
      const source = overlaySources(settled, [arrayItemSource(overlay, (it, w) => buildRows(it, w).visible, countRows)]);
      const fr = computeFrame({
        W,
        H,
        scrollTop,
        stick,
        scrollbar: true,
        source,
        streamText: null,
        renderStream: () => [],
        countStream: () => 0,
        inputRows: 1,
        caretRow: 0,
        INPUT_MAX_ROWS: 6,
        pendingCount: 0,
        countCache: { version: () => countRev, at: countCache },
      });
      scrollTop = fr.scrollTop;
      return fr;
    };

    transcript.refresh();
    countRev++;
    const warm = frame(true); // geometry cached: the node is HUGE
    expectCovered(warm, "warm");

    // the node is DELETED (a ctx delete / compaction — the "big change" that
    // shrinks the rendered transcript), but NOTHING invalidates the layout
    // memo (the missed-bump scenario)
    db.appendOps(s.id, [{ kind: "delete" as const, ids: [big.seq] }]);
    transcript.refresh(); // the virtual source drops the slot...
    const poisoned = frame(true); // ...but layout's pass-1 memo does not
    const impossible = poisoned.total > poisoned.vh && poisoned.rows.length - poisoned.winOffset < poisoned.vh;
    expect(impossible, `poisoned frame is detectable (total=${poisoned.total} vh=${poisoned.vh} covered=${poisoned.rows.length - poisoned.winOffset})`).toBe(true);

    // the heal: drop the count caches and bump the version
    countCache.clear();
    countRev++;
    expectCovered(frame(true), "healed");
  });
});

describe("scroll-up on-demand loading", () => {
  test("scrolling up renders content, not blank space", async () => {
    const db = await import("../src/store/db.ts");
    const s = db.createSession(dir, "m1");
    await seedLong(db, s.id, 100);
    const rig = await makeRig(s.id);

    // settle at the bottom first (the count pass caches the geometry)
    rig.transcript.refresh();
    rig.bump();
    const bottom = rig.frame(true);
    expectCovered(bottom, "bottom");

    // scroll to the very top: the window must render the FIRST items' text
    rig.setScroll(0);
    const top = rig.frame(false);
    const text = top.rows.map((r) => r.segs.map((x) => x.t).join("")).join("\n");
    expect(text.length, "top window has visible text").toBeGreaterThan(0);
    expect(text).toContain("question 0");

    // scroll to the middle
    rig.setScroll(Math.floor(top.total / 2));
    const mid = rig.frame(false);
    const midText = mid.rows.map((r) => r.segs.map((x) => x.t).join("")).join("\n");
    expect(midText.length, "middle window has visible text").toBeGreaterThan(0);
  });

  test("scrolling up right after new items land (geometry from a stale countRev)", async () => {
    const db = await import("../src/store/db.ts");
    const s = db.createSession(dir, "m1");
    await seedLong(db, s.id, 40);
    const rig = await makeRig(s.id);
    rig.transcript.refresh();
    rig.bump();
    rig.frame(true);

    // new items land; the app bumps countRev via touch — simulate WITHOUT the
    // bump first (the stale-geometry case), then with it
    await seedLong(db, s.id, 5);
    rig.transcript.refresh();
    // no bump: geometry is stale. The frame must still not blank the viewport.
    rig.setScroll(0);
    const fr = rig.frame(false);
    const text = fr.rows.map((r) => r.segs.map((x) => x.t).join("")).join("\n");
    expect(text.length, "stale-geometry top window still has text").toBeGreaterThan(0);
  });

  test("scrolled up while a turn streams at the bottom: the viewport keeps rendering", async () => {
    const db = await import("../src/store/db.ts");
    const s = db.createSession(dir, "m1");
    await seedLong(db, s.id, 60);
    const rig = await makeRig(s.id);
    rig.transcript.refresh();
    rig.bump();
    rig.frame(true);

    // user scrolls up into the history and stays there (stick=false)
    const anchor = Math.floor(rig.frame(true).total / 3);
    rig.setScroll(anchor);

    // a turn streams at the bottom: text grows token by token, a tool pair
    // lands in the overlay, text resumes. Every frame must still render real
    // content in the viewport at the user's scroll position.
    let stream = "";
    for (let step = 0; step < 80; step++) {
      stream += `streaming token ${step} with enough words to wrap across the width `;
      rig.setStream(stream);
      // streamV bumps on every delta; countRev does NOT (the tail is uncached)
      const fr = rig.frame(false);
      expectCovered(fr, `stream step ${step}`);
      const text = fr.rows.slice(fr.winOffset, fr.winOffset + fr.vh).map((r) => r.segs.map((x) => x.t).join("")).join("").trim();
      expect(text.length, `stream step ${step}: viewport has content`).toBeGreaterThan(0);

      if (step % 20 === 19) {
        // a tool pair settles into the overlay and the stream clears
        rig.setStream(null);
        stream = "";
        rig.overlay.push({ k: 1000 + step, kind: "toolhead", text: `» exec step ${step}` } as Item);
        rig.overlay.push({ k: 2000 + step, kind: "toolbody", text: `output ${step} `.repeat(40) } as Item);
        rig.bump(); // bumpItems: countRev++ + itemsV++
        const fr2 = rig.frame(false);
        expectCovered(fr2, `tool step ${step}`);
        const t2 = fr2.rows.slice(fr2.winOffset, fr2.winOffset + fr2.vh).map((r) => r.segs.map((x) => x.t).join("")).join("").trim();
        expect(t2.length, `tool step ${step}: viewport has content`).toBeGreaterThan(0);
      }
    }
  });

  test("scrolled up across the scrollbar-width flip: no blank frame", async () => {
    const db = await import("../src/store/db.ts");
    const s = db.createSession(dir, "m1");
    // seed JUST under the scrollbar threshold, then grow past it mid-turn
    await seedLong(db, s.id, 8);
    const rig = await makeRig(s.id);
    rig.transcript.refresh();
    rig.bump();
    rig.frame(true);

    // grow the tail one token at a time; the scrollbar appears mid-stream and
    // the wrap width flips W -> W-2. The viewport must never blank.
    let stream = "";
    for (let step = 0; step < 120; step++) {
      stream += `tok${step} `;
      rig.setStream(stream);
      const fr = rig.frame(true); // stuck to the bottom, following the tail
      expectCovered(fr, `flip step ${step}`);
      const text = fr.rows.slice(fr.winOffset, fr.winOffset + fr.vh).map((r) => r.segs.map((x) => x.t).join("")).join("").trim();
      expect(text.length, `flip step ${step}: viewport has content (sb=${fr.sbShowing} w=${fr.contentWidth})`).toBeGreaterThan(0);
    }
  });
});
