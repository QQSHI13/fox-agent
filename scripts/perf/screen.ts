#!/usr/bin/env bun
/**
 * Screen paint/flush microbenchmark.
 *
 * This is a developer tool, not a CI gate: timings vary by machine. It drives a
 * realistic frame through the production PushCompositor — a transcript plane
 * that restamps a handful of rows, a dock and a status region that clear and
 * repaint every frame — and reports the median cost of clear + composite +
 * flush. `frame_bytes` is the terminal payload per frame; it must not grow when
 * the paint path gets cheaper.
 *
 * Usage: bun scripts/perf/screen.ts [iterations]
 */

import { PushCompositor } from "../../src/tui/screen.ts";
import type { Term } from "../../src/tui/term.ts";

const W = 120;
const H = 40;
const ITERATIONS = Math.max(10, Number(process.argv[2] ?? 800) || 200);
const WARMUP = 20;

/** Minimal headless terminal: counts the bytes flush() would hand to a tty. */
class NullTerm {
  bytes = 0;
  write(s: string) {
    this.bytes += s.length;
  }
  flush() {}
}

function median(samples: number[]): number {
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

/** Best observed batch: the least noisy estimate on a busy machine. */
function min(samples: number[]): number {
  return Math.min(...samples);
}

const term = new NullTerm();
const comp = new PushCompositor(term as unknown as Term);
comp.resize(W, H);

const plain = comp.sgr({ fg: "#c0caf5" });
const dim = comp.sgr({ fg: "#565f89" });
const tool = comp.sgr({ fg: "#a9b1d6", bg: "#1f2335" });
const statusBg = comp.sgr({ fg: "#c0caf5", bg: "#1a1b26" });

const transcript = comp.createPlane("transcript", 0);
const dock = comp.createPlane("dock", 20);
const status = comp.createPlane("status", 40);

/** Transcript rows: prose-like lines with a couple of styled runs each. */
const rows = Array.from({ length: H - 6 }, (_, y) => {
  const text = `line ${y} · ${"transcript content ".repeat(6)}`;
  const st = y % 4 === 0 ? tool : y % 2 === 0 ? dim : plain;
  return { text, st };
});

function paintTranscript(scroll: number, tick: number): void {
  // A streaming update touches a window of rows, not the whole transcript.
  for (let y = 0; y < 6; y++) {
    transcript.clearRows(y, y + 1);
    const row = rows[(scroll + y) % rows.length]!;
    transcript.fillRow(y, 0, W, row.st);
    transcript.text(0, y, row.text, row.st);
  }
  transcript.fillRow(6, 0, W, plain);
  transcript.text(0, 6, `tick ${tick}`, plain);
  // A selection highlight over the first transcript row: the memo path.
  transcript.restyle(0, 0, W, "#364a82");
}

function paintDock(tick: number): void {
  dock.clearRows(0, H);
  dock.fillRow(H - 5, 0, W, tool);
  dock.text(2, H - 5, `❯ draft ${tick}`, tool);
  dock.fillRow(H - 4, 0, W, plain);
  dock.text(2, H - 4, `mode normal · ${tick} tokens`, dim);
}

function paintStatus(tick: number): void {
  status.clearRows(0, H);
  status.fillRow(H - 1, 0, W, statusBg);
  status.text(1, H - 1, `working ${".".repeat(tick % 4)}`, statusBg);
}

function frame(tick: number): void {
  paintTranscript(tick % 5, tick);
  paintDock(tick);
  paintStatus(tick);
  comp.composite();
  comp.flush();
}

for (let i = 0; i < WARMUP; i++) frame(i);
term.bytes = 0;

// Batches amortise the timer and let process.cpuUsage() report CPU rather than
// wall time, which is what the paint path actually spends on a loaded machine.
const BATCH = 25;
const samples: number[] = [];
const cpuSamples: number[] = [];
for (let i = 0; i < ITERATIONS; i += BATCH) {
  const c0 = process.cpuUsage();
  const t0 = performance.now();
  for (let j = 0; j < BATCH; j++) frame(i + j + WARMUP);
  const cpu = process.cpuUsage(c0);
  const ms = performance.now() - t0;
  samples.push(ms / BATCH);
  cpuSamples.push((cpu.user + cpu.system) / 1000 / BATCH);
}

console.log(`W=${W} H=${H} iterations=${ITERATIONS}`);
console.log(`paint_frame median_ms=${median(samples).toFixed(3)}`);
console.log(`paint_frame min_ms=${min(samples).toFixed(3)}`);
console.log(`paint_frame median_cpu_ms=${median(cpuSamples).toFixed(3)}`);
console.log(`frame_bytes=${Math.round(term.bytes / ITERATIONS)}`);
