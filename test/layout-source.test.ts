// Parity between the array-backed FrameInput and the TranscriptSource-backed
// one. The source is what a lazy virtual transcript (Task 4) implements, so the
// two paths must produce byte-identical geometry or the refactor changes the
// screen.
import { expect, test } from "bun:test";
import { arrayTranscriptSource, computeFrame, itemEdgeSpan, type FrameInput, type Row, type TranscriptSource } from "../src/tui/layout.ts";

interface It { kind: string; k: number; text: string }

const base = {
  W: 30,
  H: 12,
  scrollTop: 7,
  stick: false,
  scrollbar: true,
  streamText: null,
  renderStream: () => [],
  countStream: () => 0,
  inputRows: 1,
  caretRow: 0,
  INPUT_MAX_ROWS: 4,
  pendingCount: 0,
};

test("source-backed and array-backed frames are identical", () => {
  const items: It[] = Array.from({ length: 40 }, (_, i) => ({ kind: i % 3 === 0 ? "toolhead" : "md", k: i + 1, text: `item ${i}` }));
  const rowsFor = (it: It, w: number): Row[] => {
    const n = (it.k % 5) + 1;
    return Array.from({ length: n }, (_, r) => ({ segs: [{ t: `${it.text}/${w}/${r}` }] }));
  };
  const count = (it: It, w: number) => {
    const [a, b] = itemEdgeSpan(rowsFor(it, w));
    return b - a;
  };
  const legacy: FrameInput = { ...base, items, renderItem: rowsFor, countItem: count };
  const source = arrayTranscriptSource(items, rowsFor, count);
  const virtual: FrameInput = { ...base, source };
  const a = computeFrame(legacy);
  const b = computeFrame(virtual);
  expect(b.total).toBe(a.total);
  expect(b.owner).toEqual(a.owner);
  expect(b.winOffset).toBe(a.winOffset);
  expect(b.rows.map((r) => r.segs.map((s) => s.t).join(""))).toEqual(a.rows.map((r) => r.segs.map((s) => s.t).join("")));
  expect(b.sb).toEqual(a.sb);
});

test("arrayTranscriptSource agrees with the array it wraps", () => {
  const items: It[] = Array.from({ length: 6 }, (_, i) => ({ kind: "md", k: i * 2 + 1, text: `item ${i}` }));
  const rowsFor = (it: It, w: number): Row[] => [{ segs: [{ t: `${it.text}/${w}` }] }];
  const count = (it: It, w: number) => rowsFor(it, w).length;
  const src = arrayTranscriptSource(items, rowsFor, count);
  expect(src.length).toBe(items.length);
  for (let i = 0; i < items.length; i++) {
    expect(src.itemAt(i)).toBe(items[i]);
    expect(src.renderAt(i, 30)).toEqual(rowsFor(items[i], 30));
    expect(src.rowsAt(i, 30)).toEqual(rowsFor(items[i], 30));
    expect(src.countAt(i, 30)).toBe(count(items[i], 30));
    expect(src.kindAt(i)).toBe(items[i].kind);
    expect(src.indexOfKey(items[i].k)).toBe(i);
    expect(src.itemByKey(items[i].k)).toBe(items[i]);
  }
  expect(src.indexOfKey(-99)).toBe(-1);
  expect(src.itemByKey(-99)).toBeUndefined();
});

// Regression: the count pass used to call itemAt() for every index to read
// `kind`, which materialized every settled body just to count rows. That defeats
// VirtualTranscript.countAt()'s transient non-retention. Counting must read
// kinds through kindAt() and materialize only the window paint actually renders.
test("count pass reads kinds without materializing every item", () => {
  const items: It[] = Array.from({ length: 40 }, (_, i) => ({ kind: i % 3 === 0 ? "toolhead" : "md", k: i + 1, text: `item ${i}` }));
  const rowsFor = (it: It, w: number): Row[] => [{ segs: [{ t: `${it.text}/${w}` }] }];
  const count = (it: It, w: number) => rowsFor(it, w).length;
  const inner = arrayTranscriptSource(items, rowsFor, count);
  const seen = new Set<number>();
  let kindReads = 0;
  const spy: TranscriptSource<It> = {
    ...inner,
    get length() {
      return inner.length;
    },
    itemAt: (index) => {
      seen.add(index);
      return inner.itemAt(index);
    },
    kindAt: (index) => {
      kindReads++;
      return inner.kindAt(index);
    },
  };
  const frame = computeFrame({ ...base, scrollbar: false, source: spy });

  expect(frame.total).toBeGreaterThan(0);
  expect(kindReads).toBe(items.length);
  // Every item was counted, but only the rendered window was materialized.
  expect(seen.size).toBeGreaterThan(0);
  expect(seen.size).toBeLessThan(items.length);
});
