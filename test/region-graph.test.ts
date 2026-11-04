/**
 * The TUI's region dependency graph, as a testable model.
 *
 * `app.ts` builds five effects (transcript, dock, floats, overlay, status) over
 * a set of version signals. That graph is the thing that makes the UI scale, and
 * it is easy to break silently: a missing read in a region's `deps()` means that
 * region never repaints, and an extra read means it repaints on every keystroke
 * and reintroduces the O(session) cost.
 *
 * The app itself needs a tty, so this file mirrors the graph exactly as
 * `app.ts` builds it and asserts the properties that matter:
 *
 *   - typing must not re-derive the transcript (the scaling fix)
 *   - a streamed token must re-derive it exactly once per flush
 *   - a resize must reach every region
 *   - a move of the layout split must reach only the regions that read it
 *
 * If `app.ts`'s deps change, this file has to change with it — which is the
 * point: the graph becomes reviewable in a diff instead of implicit.
 */
import { beforeEach, describe, expect, test } from "bun:test";
import { computed, effect, flushNow, setScheduler, signal, type Disposable } from "../src/tui/reactive.ts";

interface Harness {
  runs: Record<string, number>;
  bump: Record<string, () => void>;
  setSplit: (v: string) => void;
  dispose: () => void;
}

/**
 * Build the same graph app.ts builds. `frameCost` runs inside the transcript
 * effect to stand in for computeFrame's O(session) work; the tests count RUNS,
 * not time, because runs are what scale.
 */
function buildGraph(): Harness {
  const itemsV = signal(0), streamV = signal(0), scrollV = signal(0), bufV = signal(0);
  const sizeV = signal({ w: 120, h: 40 }, { equals: (a, b) => a.w === b.w && a.h === b.h });
  const scrollbarV = signal(true), themeV = signal("default");
  const highlightV = signal(0), statsV = signal(0), cmdOutV = signal(0);
  const hintSelV = signal(0), overlayV = signal(0), promptV = signal(0);
  const paintedV = signal("");
  const splitV = computed(() => {
    paintedV();
    return paintedV().split(":").slice(0, 3).join(":");
  }, { label: "split" });

  // The dock's wrapped row count — cheap, and the ONLY dock state the
  // transcript depends on.
  //
  // Modelled on REAL wrapping: the row count is a function of the text LENGTH
  // and the width, so typing inside an existing line leaves it unchanged. An
  // earlier version of this stand-in grew with every keystroke, which made the
  // test fail — correctly, because a dock that really changed height every
  // character WOULD have to resize the transcript. The model has to behave like
  // the thing it stands in for, or it tests the wrong property.
  const textLength = signal(0);
  const inputRowsV = computed(() => {
    textLength();
    sizeV();
    promptV();
    return Math.max(1, Math.ceil(textLength() / sizeV().w));
  }, { label: "inputRows" });

  const runs: Record<string, number> = { transcript: 0, dock: 0, floats: 0, overlay: 0, status: 0 };
  const disposers: Disposable[] = [];
  const region = (label: string, deps: () => void, paint: () => void) =>
    disposers.push(effect(() => { deps(); paint(); }, { label }));

  region("transcript", () => {
    itemsV(); streamV(); scrollV(); sizeV(); scrollbarV();
    themeV(); highlightV(); promptV(); cmdOutV(); inputRowsV();
  }, () => { runs.transcript++; });
  region("dock", () => { bufV(); promptV(); splitV(); sizeV(); themeV(); }, () => { runs.dock++; });
  region("floats", () => { promptV(); cmdOutV(); hintSelV(); bufV(); splitV(); sizeV(); themeV(); }, () => { runs.floats++; });
  region("overlay", () => { overlayV(); splitV(); sizeV(); themeV(); }, () => { runs.overlay++; });
  region("status", () => { statsV(); busyVish(); flashVish(); sizeV(); themeV(); }, () => { runs.status++; });

  function busyVish() { return statsV(); }
  function flashVish() { return statsV(); }

  return {
    runs,
    bump: {
      items: () => itemsV(itemsV.peek() + 1),
      stream: () => streamV(streamV.peek() + 1),
      scroll: () => scrollV(scrollV.peek() + 1),
      buf: () => { bufV(bufV.peek() + 1); textLength(textLength.peek() + 1); },
      size: () => sizeV({ w: sizeV.peek().w + 1, h: sizeV.peek().h }),
      theme: () => themeV(themeV.peek() === "default" ? "other" : "default"),
      stats: () => statsV(statsV.peek() + 1),
      cmdOut: () => cmdOutV(cmdOutV.peek() + 1),
      overlay: () => overlayV(overlayV.peek() + 1),
      prompt: () => promptV(promptV.peek() + 1),
    },
    setSplit: (v: string) => paintedV(v),
    dispose: () => disposers.forEach((d) => d.dispose()),
  };
}

beforeEach(() => {
  setScheduler(null);
  flushNow();
});

describe("region dependency graph", () => {
  test("every region paints once at boot", () => {
    const g = buildGraph();
    expect(g.runs).toEqual({ transcript: 1, dock: 1, floats: 1, overlay: 1, status: 1 });
    g.dispose();
  });

  test("TYPING that does not change the wrapped row count never re-derives the transcript", () => {
    // The whole reason for this rewrite: a keystroke must not run the
    // O(session) frame derive. 50 characters typed into a line that still
    // occupies ONE row must cost ZERO transcript runs.
    //
    // The count matters: typing past the wrap boundary moves the dock by a row
    // and the transcript viewport genuinely shrinks, so that case SHOULD
    // re-derive (asserted separately below). The scaling property is about the
    // ordinary keystroke, which is most of them.
    const g = buildGraph();
    const before = g.runs.transcript;
    for (let i = 0; i < 50; i++) g.bump.buf(); // 50 chars, width 120 -> still 1 row
    flushNow();
    expect(g.runs.transcript).toBe(before); // 0 re-derives
    expect(g.runs.dock).toBe(2); // the dock repainted (coalesced to one extra run)
    g.dispose();
  });

  test("typing PAST the wrap boundary does re-derive, because the dock really grew", () => {
    // The complement, so the previous test cannot be satisfied by a broken
    // dependency that never fires at all.
    const g = buildGraph();
    const before = g.runs.transcript;
    for (let i = 0; i < 130; i++) g.bump.buf(); // 130 chars at width 120 -> 2 rows
    flushNow();
    expect(g.runs.transcript).toBeGreaterThan(before);
    g.dispose();
  });

  test("a streamed token re-derives the transcript exactly once per flush", () => {
    const g = buildGraph();
    const before = g.runs.transcript;
    for (let i = 0; i < 50; i++) g.bump.stream();
    flushNow();
    expect(g.runs.transcript).toBe(before + 1); // coalesced, not 50
    g.dispose();
  });

  test("a resize reaches every region", () => {
    const g = buildGraph();
    const before = { ...g.runs };
    g.bump.size();
    flushNow();
    for (const k of ["transcript", "dock", "floats", "overlay", "status"] as const) {
      expect(g.runs[k]).toBeGreaterThan(before[k]);
    }
    g.dispose();
  });

  test("a layout-split move reaches the dock, floats and overlay — but not the status bar", () => {
    // This is what `LAYOUT_FIELDS` used to encode by hand. The status bar does
    // not read the split, so a split change must not repaint it.
    const g = buildGraph();
    const before = { ...g.runs };
    g.setSplit("10:3:0:different");
    flushNow();
    expect(g.runs.dock).toBeGreaterThan(before.dock);
    expect(g.runs.floats).toBeGreaterThan(before.floats);
    expect(g.runs.overlay).toBeGreaterThan(before.overlay);
    expect(g.runs.status).toBe(before.status);
    g.dispose();
  });

  test("a scroll repaints the transcript and nothing else", () => {
    const g = buildGraph();
    const before = { ...g.runs };
    g.bump.scroll();
    flushNow();
    expect(g.runs.transcript).toBe(before.transcript + 1);
    expect(g.runs.dock).toBe(before.dock);
    expect(g.runs.status).toBe(before.status);
    g.dispose();
  });

  test("dispose stops every region", () => {
    const g = buildGraph();
    g.dispose();
    const before = { ...g.runs };
    g.bump.items();
    g.bump.buf();
    g.bump.size();
    flushNow();
    expect(g.runs).toEqual(before);
  });
});
