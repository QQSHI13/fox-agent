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
    expect(calls.length).toBe(counted.length);
    counted.setAllExpanded(true);
    expect(counted.countAt(2, w)).toBeGreaterThan(1);
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
});
