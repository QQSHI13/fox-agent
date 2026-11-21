/**
 * The virtual transcript: settled history renders from the display projection's
 * metadata, materializing one row's items only when layout asks for them.
 *
 * These tests drive it with real stored rows (so the assistant -> tool join is
 * the production one) and a deliberately tiny rows builder: count and render
 * must agree for every slot, and expansion must invalidate materialized rows
 * without materializing the rest of the history.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Row } from "../src/tui/layout.ts";
import type { Item } from "../src/view/model.ts";
import type { DisplayNode } from "../src/context/display.ts";
import type { MessageRow } from "../src/store/db.ts";
import type { VirtualTranscriptDeps } from "../src/tui/transcript.ts";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "fox-transcript-"));
  process.env.FOX_AGENT_HOME = join(dir, ".fox");
  process.env.FOX_AGENT_CONFIG = join(join(dir, ".fox"), "config.toml");
});

afterEach(async () => {
  try {
    const { dropDisplayCache } = await import("../src/context/display.ts");
    dropDisplayCache();
  } catch {}
  rmSync(dir, { recursive: true, force: true });
});

interface Seeded {
  id: string;
}

/** user, assistant holding one call, and a long tool result: 4 visible slots. */
async function seed(): Promise<Seeded> {
  const db = await import("../src/store/db.ts");
  const s = db.createSession(dir, "m1");
  db.appendMessage(s.id, { role: "user", content: "a question", tokens: 5 });
  db.appendMessage(s.id, {
    role: "assistant",
    content: "",
    tokens: 5,
    tool_calls: JSON.stringify([{ id: "call_1", name: "exec", arguments: '{"cmd":"ls"}' }]),
  });
  db.appendMessage(s.id, {
    role: "tool",
    tool_call_id: "call_1",
    content: Array.from({ length: 12 }, (_, i) => `result line ${i}`).join("\n"),
    tokens: 5,
  });
  return { id: s.id };
}

async function makeDeps(id: string) {
  const db = await import("../src/store/db.ts");
  const { itemEdgeSpan } = await import("../src/tui/layout.ts");
  const deps = {
    key: (seq: number, slot: 0 | 1 | 2) => seq * 4 + slot,
    expanded: (_seq: number) => false,
    keptChars: 4_000,
    summarize: (name: string, args: string) => `${name}${args}`,
    row: (seq: number) => db.getMessage(id, seq),
    // tiny stand-in for the TUI's renderer: one row per source line, plus a
    // detail row for an expanded tool head (the real head reveals its input).
    buildRows: (item: { kind: string; text: string; expanded?: boolean }, width: number) => {
      const rows = item.text.split("\n").map((line) => ({ segs: [{ t: line.slice(0, width) }] }));
      if (item.kind === "toolhead" && item.expanded) rows.push({ segs: [{ t: "(input)" }] });
      const span = itemEdgeSpan(rows);
      return { rows, span, visible: rows.slice(span[0], span[1]) };
    },
    countRows: (item: { kind: string; text: string; expanded?: boolean }, width: number) => {
      const [a, b] = deps.buildRows(item, width).span;
      return b - a;
    },
  };
  return deps;
}

describe("virtual transcript source", () => {
  test("source renders only requested rows and counts match rendered rows", async () => {
    const { projectDisplay } = await import("../src/context/display.ts");
    const { VirtualTranscript } = await import("../src/tui/transcript.ts");
    const { id } = await seed();
    const deps = await makeDeps(id);
    const src = new VirtualTranscript(deps, () => projectDisplay(id));
    expect(src.length).toBe(4); // user, assistant call holder, tool head, tool body
    const w = 40;
    let count = 0;
    for (let i = 0; i < src.length; i++) count += src.countAt(i, w);
    let rendered = 0;
    for (let i = 0; i < src.length; i++) rendered += src.renderAt(i, w).length;
    expect(rendered).toBe(count);
    expect(src.itemByKey(src.itemAt(2).k)?.kind).toBe("toolhead");
    expect(src.indexOfKey(src.itemAt(3).k)).toBe(3);
    expect(src.kindAt(0)).toBe("user");
    expect(src.kindAt(1)).toBe("md"); // the assistant slot materializes as markdown
    expect(src.kindAt(2)).toBe("toolhead");
    expect(src.kindAt(3)).toBe("toolbody");
    // kindAt must name the same item kind itemAt materializes, not the slot label.
    for (let i = 0; i < src.length; i++) expect(src.kindAt(i)).toBe(src.itemAt(i).kind);
  });

  test("expansion invalidates only the touched seq", async () => {
    const { projectDisplay } = await import("../src/context/display.ts");
    const { VirtualTranscript } = await import("../src/tui/transcript.ts");
    const { id } = await seed();
    const deps = await makeDeps(id);
    const w = 40;
    const calls: string[] = [];
    const countingDeps = {
      ...deps,
      countRows: (it: { k: number; kind: string; text: string; expanded?: boolean }, width: number) => {
        calls.push(`${it.k}:${width}`);
        return deps.countRows(it, width);
      },
    };
    const counted = new VirtualTranscript(countingDeps, () => projectDisplay(id));
    for (let i = 0; i < counted.length; i++) counted.countAt(i, w);
    calls.length = 0;
    for (let i = 0; i < counted.length; i++) counted.countAt(i, w);
    expect(calls).toEqual([]);
    const before = counted.countAt(2, w);
    const toolSeq = projectDisplay(id).find((n) => n.role === "tool")!.seq;
    counted.touchSeq(toolSeq);
    expect(counted.countAt(2, w)).toBe(before);
    expect(calls.length).toBeGreaterThan(0);
    counted.setAllExpanded(true);
    expect(counted.countAt(2, w)).toBeGreaterThan(1);
  });

  test("a cold count pass does not retain counted-only items", async () => {
    const { projectDisplay } = await import("../src/context/display.ts");
    const { VirtualTranscript } = await import("../src/tui/transcript.ts");
    const { id } = await seed();
    const deps = await makeDeps(id);
    const builds: number[] = [];
    const counts: number[] = [];
    const spiedDeps = {
      ...deps,
      buildRows: (item: { k: number; kind: string; text: string; expanded?: boolean }, width: number) => {
        builds.push(item.k);
        return deps.buildRows(item, width);
      },
      countRows: (item: { k: number; kind: string; text: string; expanded?: boolean }, width: number) => {
        counts.push(item.k);
        return deps.countRows(item, width);
      },
    };
    const src = new VirtualTranscript(spiedDeps, () => projectDisplay(id));
    const w = 40;
    for (let i = 0; i < src.length; i++) src.countAt(i, w);
    expect(counts).toHaveLength(4);
    expect(builds).toHaveLength(0);

    // If countAt retained the item, paint would reuse it and buildRows would not
    // run. Rebuilding here proves a count-only slot does not hold settled content.
    builds.length = 0;
    expect(src.renderAt(0, w).length).toBeGreaterThan(0);
    expect(builds).toEqual([deps.key(1, 0)]);
  });

  test("a count miss rebuilds an item under the current kept-char cap and expansion", async () => {
    const { itemEdgeSpan } = await import("../src/tui/layout.ts");
    const { VirtualTranscript } = await import("../src/tui/transcript.ts");
    const content = ["line1", "line2", "line3", "line4", "line5"].join("\n");
    const nodes: DisplayNode[] = [
      { seq: 1, role: "assistant", tool_call_id: null, callIds: ["c1"], contentLen: 0, failed: false, deleted: false },
      { seq: 2, role: "tool", tool_call_id: "c1", callIds: [], contentLen: content.length, failed: false, deleted: false },
    ];
    const rows: MessageRow[] = [
      { id: "m1", seq: 1, session_id: "s", parent_id: null, role: "assistant", content: "", tool_calls: JSON.stringify([{ id: "c1", name: "exec", arguments: "{}" }]), tool_call_id: null, media: null, tokens: 1, error: null, created_at: 0 },
      { id: "m2", seq: 2, session_id: "s", parent_id: null, role: "tool", content, tool_calls: null, tool_call_id: "c1", media: null, tokens: 1, error: null, created_at: 0 },
    ];
    let expanded = true;
    const w = 40;
    const deps: VirtualTranscriptDeps = {
      key: (seq, slot) => seq * 4 + slot,
      expanded: () => expanded,
      keptChars: 2,
      summarize: (name, args) => `${name}${args}`,
      row: (seq) => rows.find((r) => r.seq === seq) ?? null,
      buildRows: (it, width) => {
        // a collapsed tool body is one one-lined row; expanded shows its lines
        const built =
          it.kind === "toolbody" && !it.expanded
            ? [{ segs: [{ t: "↳ output" }] }]
            : it.text.split("\n").map((line) => ({ segs: [{ t: line.slice(0, width) }] }));
        const span = itemEdgeSpan(built);
        return { rows: built, span, visible: built.slice(span[0], span[1]) };
      },
      countRows: (it, width) => {
        const [a, b] = deps.buildRows(it, width).span;
        return b - a;
      },
    };
    const src = new VirtualTranscript(deps, () => nodes);

    // cap 2 -> 8 kept chars: the drop notice plus the two lines it keeps.
    expect(src.countAt(2, w)).toBe(3);
    expect(src.renderAt(2, w).length).toBe(3);

    // Regression: the cap moved but no setter ran, so the count signature misses
    // while the materialized body still holds the old truncation. Counting that
    // copy would file 3 under the new signature; a later forgetItem would then
    // re-materialize 5 rows and count/paint would disagree.
    deps.keptChars = 1_000;
    expect(src.countAt(2, w)).toBe(5);
    expect(src.renderAt(2, w).length).toBe(5);

    // Same hazard on expansion: only the host's lookup moved, not the slot.
    expanded = false;
    expect(src.countAt(2, w)).toBe(1);
    expect(src.renderAt(2, w).length).toBe(1);
  });

  // Regression: toggleExpand() backfills a truncated tool body from the stored
  // row, then calls syncExpandedItem(). Dropping the materialized item here made
  // the next itemAt() rebuild from nodeToItems(), which re-applies the kept-char
  // cap — so a body past the cap never actually showed its stored original.
  test("an expanded settled tool body keeps the host's backfilled text", async () => {
    const { itemEdgeSpan } = await import("../src/tui/layout.ts");
    const { VirtualTranscript } = await import("../src/tui/transcript.ts");
    const content = ["line1", "line2", "line3", "line4", "line5"].join("\n");
    const nodes: DisplayNode[] = [
      { seq: 1, role: "assistant", tool_call_id: null, callIds: ["c1"], contentLen: 0, failed: false, deleted: false },
      { seq: 2, role: "tool", tool_call_id: "c1", callIds: [], contentLen: content.length, failed: false, deleted: false },
    ];
    const rows: MessageRow[] = [
      { id: "m1", seq: 1, session_id: "s", parent_id: null, role: "assistant", content: "", tool_calls: JSON.stringify([{ id: "c1", name: "exec", arguments: "{}" }]), tool_call_id: null, media: null, tokens: 1, error: null, created_at: 0 },
      { id: "m2", seq: 2, session_id: "s", parent_id: null, role: "tool", content, tool_calls: null, tool_call_id: "c1", media: null, tokens: 1, error: null, created_at: 0 },
    ];
    const w = 40;
    const counted: Array<{ it: { k: number; text: string; expanded?: boolean }; width: number }> = [];
    const deps: VirtualTranscriptDeps = {
      key: (seq, slot) => seq * 4 + slot,
      expanded: () => false,
      keptChars: 2,
      summarize: (name, args) => `${name}${args}`,
      row: (seq) => rows.find((r) => r.seq === seq) ?? null,
      buildRows: (it, width) => {
        const built =
          it.kind === "toolbody" && !it.expanded
            ? [{ segs: [{ t: "↳ output" }] }]
            : it.text.split("\n").map((line) => ({ segs: [{ t: line.slice(0, width) }] }));
        const span = itemEdgeSpan(built);
        return { rows: built, span, visible: built.slice(span[0], span[1]) };
      },
      countRows: (it, width) => {
        counted.push({ it, width });
        const [a, b] = deps.buildRows(it, width).span;
        return b - a;
      },
    };
    const src = new VirtualTranscript(deps, () => nodes);

    const body = src.itemAt(2);
    expect(body.kind).toBe("toolbody");
    expect(body.text).not.toBe(content); // keepTail cut the stored body
    expect(body.expanded).toBeFalsy();
    expect(src.countAt(2, w)).toBe(1); // a collapsed body is one row

    // What toggleExpand does: backfill the stored original, then mirror it.
    body.text = content;
    body.expanded = true;
    src.syncExpandedItem(body.k, true);

    expect(src.itemAt(2)).toBe(body);
    expect(src.itemAt(2).text).toBe(content);
    expect(src.itemAt(2).expanded).toBe(true);
    const rowsNow = src.countAt(2, w);
    // The count must have run against the SAME retained object after the
    // backfill, not a freshly re-materialized (re-truncated) copy.
    expect(counted.at(-1)?.it).toBe(body);
    expect(counted.at(-1)?.it.text).toBe(content);
    expect(rowsNow).toBe(content.split("\n").length);
    expect(src.renderAt(2, w)).toHaveLength(rowsNow);
  });

  test("a manual toggle after ctrl+t survives touchSeq and refresh", async () => {
    const { projectDisplay } = await import("../src/context/display.ts");
    const { VirtualTranscript } = await import("../src/tui/transcript.ts");
    const { id } = await seed();
    const deps = await makeDeps(id);
    const src = new VirtualTranscript(deps, () => projectDisplay(id));

    // ctrl+t: unfold everything, then manually collapse the tool head and body.
    src.setAllExpanded(true);
    const head = src.itemAt(2);
    const body = src.itemAt(3);
    const seq = head.seq ?? 3;
    expect(head.expanded).toBe(true);
    expect(body.expanded).toBe(true);
    head.expanded = false;
    src.syncExpandedItem(head.k, false);
    body.expanded = false;
    src.syncExpandedItem(body.k, false);

    // A ctx op touching that seq drops the materialized items. The manual
    // collapse must not be overwritten by the older ctrl+t override.
    src.touchSeq(seq);
    src.refresh();
    expect(src.itemAt(2).expanded).toBeFalsy();
    expect(src.itemAt(3).expanded).toBeFalsy();

    // And the reverse: fold all, manually unfold both, then touch and refresh.
    src.setAllExpanded(false);
    const foldedHead = src.itemAt(2);
    const foldedBody = src.itemAt(3);
    foldedHead.expanded = true;
    src.syncExpandedItem(foldedHead.k, true);
    foldedBody.expanded = true;
    src.syncExpandedItem(foldedBody.k, true);
    src.touchSeq(seq);
    src.refresh();
    expect(src.itemAt(2).expanded).toBe(true);
    expect(src.itemAt(3).expanded).toBe(true);
  });

  // Regression: setAllExpanded() used to drop every expandable slot's
  // materialized item, even slots already in the requested state. A backfilled
  // long tool body was therefore re-materialized and re-truncated when ctrl+t
  // changed a different slot.
  test("ctrl+t keeps an unchanged backfilled tool body materialized", async () => {
    const { itemEdgeSpan } = await import("../src/tui/layout.ts");
    const { VirtualTranscript } = await import("../src/tui/transcript.ts");
    const content = ["line1", "line2", "line3", "line4", "line5"].join("\n");
    const nodes: DisplayNode[] = [
      { seq: 1, role: "assistant", tool_call_id: null, callIds: ["c1"], contentLen: 0, failed: false, deleted: false },
      { seq: 2, role: "tool", tool_call_id: "c1", callIds: [], contentLen: content.length, failed: false, deleted: false },
    ];
    const rows: MessageRow[] = [
      { id: "m1", seq: 1, session_id: "s", parent_id: null, role: "assistant", content: "", tool_calls: JSON.stringify([{ id: "c1", name: "exec", arguments: "{}" }]), tool_call_id: null, media: null, tokens: 1, error: null, created_at: 0 },
      { id: "m2", seq: 2, session_id: "s", parent_id: null, role: "tool", content, tool_calls: null, tool_call_id: "c1", media: null, tokens: 1, error: null, created_at: 0 },
    ];
    const deps: VirtualTranscriptDeps = {
      key: (seq, slot) => seq * 4 + slot,
      expanded: () => false,
      keptChars: 2,
      summarize: (name, args) => `${name}${args}`,
      row: (seq) => rows.find((r) => r.seq === seq) ?? null,
      buildRows: (it, width) => {
        const built =
          it.kind === "toolbody" && !it.expanded
            ? [{ segs: [{ t: "↳ output" }] }]
            : it.text.split("\n").map((line) => ({ segs: [{ t: line.slice(0, width) }] }));
        const span = itemEdgeSpan(built);
        return { rows: built, span, visible: built.slice(span[0], span[1]) };
      },
      countRows: (it, width) => {
        const [a, b] = deps.buildRows(it, width).span;
        return b - a;
      },
    };
    const src = new VirtualTranscript(deps, () => nodes);

    // Manual expand: backfill the stored body past the kept-char cap, then sync.
    const body = src.itemAt(2);
    body.text = content;
    body.expanded = true;
    src.syncExpandedItem(body.k, true);

    // Only the tool head is still folded, so ctrl+t changes just that slot.
    expect(src.setAllExpanded(true)).toBe(1);
    expect(src.itemAt(2)).toBe(body);
    expect(src.itemAt(2).text).toBe(content);
    expect(src.itemAt(2).expanded).toBe(true);
  });

  test("refresh reports changed settled keys so the host can invalidate rows", async () => {
    const { VirtualTranscript } = await import("../src/tui/transcript.ts");
    const node: DisplayNode = { seq: 1, role: "user", tool_call_id: null, callIds: [], contentLen: 3, failed: false, deleted: false };
    const nodes = [node];
    const row: MessageRow = {
      id: "m1",
      seq: 1,
      session_id: "s",
      parent_id: null,
      role: "user",
      content: "hi",
      tool_calls: null,
      tool_call_id: null,
      media: null,
      tokens: 1,
      error: null,
      created_at: 0,
    };
    const oneRow: Row[] = [{ segs: [{ t: "hi" }] }];
    const deps: VirtualTranscriptDeps = {
      key: (seq, slot) => seq * 4 + slot,
      expanded: () => false,
      keptChars: 100,
      summarize: (name, args) => `${name}${args}`,
      row: () => row,
      buildRows: () => ({ rows: oneRow, span: [0, 1], visible: oneRow }),
      countRows: () => 1,
    };
    const src = new VirtualTranscript(deps, () => nodes);
    src.itemAt(0);
    expect(src.takeInvalidatedKeys()).toEqual([]);
    // same array identity, changed metadata: the slot signature moves
    node.contentLen = 4;
    src.refresh();
    expect(src.takeInvalidatedKeys()).toEqual([4]); // seq 1 * 4 + slot 0
    expect(src.takeInvalidatedKeys()).toEqual([]); // drained once
  });
});

describe("transcript source composition", () => {
  const mk = (k: number, text: string): Item => ({ k, kind: "info", text });
  const rowsFor = (it: Item, width: number): Row[] => [{ segs: [{ t: `${it.text}/${width}` }] }];
  const countFor = (_it: Item, _width: number): number => 1;

  test("overlaySources composes base + surviving overlays, base keys win", async () => {
    const { arrayItemSource, concatSources, overlaySources } = await import("../src/tui/transcript.ts");
    const base = concatSources([arrayItemSource([mk(1, "a"), mk(2, "b"), mk(3, "c")], rowsFor, countFor)]);
    // key 3 shadows a base key: the overlay copy must be omitted, not shifted in
    const overlay = arrayItemSource([mk(3, "shadow"), mk(9, "live")], rowsFor, countFor);
    const src = overlaySources(base, [overlay]);

    expect(src.length).toBe(4); // 3 base + the one surviving overlay item
    expect(src.itemAt(0).k).toBe(1);
    expect(src.itemAt(2).k).toBe(3); // base wins over the shadow
    expect(src.itemAt(3).k).toBe(9);
    expect(src.renderAt(3, 10)[0].segs[0].t).toBe("live/10");
    expect(src.rowsAt(1, 10)[0].segs[0].t).toBe("b/10");
    expect(src.countAt(2, 10)).toBe(1);
    expect(src.kindAt(0)).toBe("info");
    expect(src.kindAt(3)).toBe("info");
    expect(src.indexOfKey(2)).toBe(1);
    expect(src.indexOfKey(3)).toBe(2); // base index, not the shadowed overlay
    expect(src.indexOfKey(9)).toBe(3);
    expect(src.itemByKey(3)?.text).toBe("c");
    expect(src.itemByKey(9)?.text).toBe("live");
    expect(src.itemByKey(77)).toBeUndefined();
    expect(src.indexOfKey(77)).toBe(-1);
  });

  test("concatSources routes every read across source boundaries", async () => {
    const { arrayItemSource, concatSources } = await import("../src/tui/transcript.ts");
    const a = arrayItemSource([mk(1, "a"), mk(2, "b")], rowsFor, countFor);
    const b = arrayItemSource([mk(3, "c"), mk(4, "d")], rowsFor, countFor);
    const src = concatSources([a, b]);

    expect(src.length).toBe(4);
    expect(src.itemAt(1).k).toBe(2);
    expect(src.itemAt(2).k).toBe(3);
    expect(src.renderAt(2, 5)[0].segs[0].t).toBe("c/5");
    expect(src.rowsAt(3, 6)[0].segs[0].t).toBe("d/6");
    expect(src.countAt(0, 5)).toBe(1);
    expect(src.kindAt(1)).toBe("info");
    expect(src.kindAt(2)).toBe("info");
    expect(src.indexOfKey(4)).toBe(3);
    expect(src.itemByKey(3)?.text).toBe("c");
    expect(src.indexOfKey(99)).toBe(-1);
    expect(src.itemByKey(99)).toBeUndefined();
  });

  test("overlaySources with no overlays is the base, and missing keys are safe", async () => {
    const { arrayItemSource, overlaySources } = await import("../src/tui/transcript.ts");
    const base = arrayItemSource([mk(1, "a")], rowsFor, countFor);
    const src = overlaySources(base, []);
    expect(src.length).toBe(1);
    expect(src.itemAt(0).k).toBe(1);
    expect(src.indexOfKey(1)).toBe(0);
    expect(src.indexOfKey(2)).toBe(-1);
    expect(src.itemByKey(2)).toBeUndefined();
  });
});
