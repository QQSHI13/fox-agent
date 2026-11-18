#!/usr/bin/env bun
/**
 * Layout hot-path microbenchmark.
 *
 * This is a developer tool, not a CI gate: timings vary by machine. It builds a
 * long synthetic transcript, warms the production count cache, then reports the
 * median cost of cache-hit frames while streaming, scrolled to the middle, and
 * stuck to the bottom.
 *
 * Usage: bun scripts/perf/layout.ts [iterations]
 */

import { computeFrame, type CountCache, type CountEntry, type FrameInput, type Row } from "../../src/tui/layout.ts";

const ITEMS = 20_000;
const ITERATIONS = Math.max(10, Number(process.argv[2] ?? 40) || 40);
const WARMUP = 5;

interface PerfItem {
  kind: string;
  k: number;
}

const items: PerfItem[] = Array.from({ length: ITEMS }, (_, k) => ({ kind: k % 5 === 0 ? "user" : "md", k }));
const body: Row[] = [{ segs: [{ t: "first" }] }, { segs: [{ t: "second" }] }];

function input(countCache: CountCache, overrides: Partial<FrameInput> = {}): FrameInput {
  return {
    W: 120,
    H: 40,
    scrollTop: 0,
    stick: true,
    scrollbar: true,
    items,
    streamText: null,
    renderItem: () => body,
    countItem: () => body.length,
    renderStream: (text: string, w: number) =>
      text.split("\n").map((line) => ({ segs: [{ t: line.slice(0, w) }] })),
    countStream: (text: string) => text.split("\n").length,
    inputRows: 1,
    caretRow: 0,
    INPUT_MAX_ROWS: 8,
    pendingCount: 0,
    countCache,
    ...overrides,
  };
}

function median(samples: number[]): number {
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

function measure(label: string, fn: (i: number) => void): { label: string; medianMs: number } {
  for (let i = 0; i < WARMUP; i++) fn(i);
  const samples: number[] = [];
  for (let i = 0; i < ITERATIONS; i++) {
    const t0 = performance.now();
    fn(i);
    samples.push(performance.now() - t0);
  }
  return { label, medianMs: median(samples) };
}

const coldCache = new Map<number, CountEntry>();
const cold = measure("initial_cold_count", () => {
  coldCache.clear();
  computeFrame(input({ version: () => 0, at: coldCache }));
});

let bumpRev = 0;
const bumpCache = new Map<number, CountEntry>();
computeFrame(input({ version: () => bumpRev, at: bumpCache }));
const recount = measure("version_bump_recount", () => {
  bumpRev++;
  computeFrame(input({ version: () => bumpRev, at: bumpCache }));
});

const cache = new Map<number, CountEntry>();
const countCache: CountCache = { version: () => 0, at: cache };
const warm = input(countCache);
computeFrame(warm);
const middleScroll = Math.floor(computeFrame(warm).total / 2);

const streaming = measure("cache_hit_stream", (i) => {
  computeFrame(input(countCache, { streamText: `${"stream ".repeat(80)}${i}` }));
});

const middle = measure("cache_hit_middle_scroll", () => {
  computeFrame(input(countCache, { scrollTop: middleScroll, stick: false }));
});

const bottom = measure("cache_hit_bottom_stick", () => {
  computeFrame(input(countCache, { scrollTop: Number.MAX_SAFE_INTEGER, stick: true }));
});

console.log(`items=${ITEMS} iterations=${ITERATIONS}`);
for (const r of [cold, recount, streaming, middle, bottom]) {
  console.log(`${r.label} median_ms=${r.medianMs.toFixed(3)}`);
}
