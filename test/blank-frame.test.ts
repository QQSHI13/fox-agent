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

  return {
    frame,
    setScroll: (n) => {
      scrollTop = n;
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
