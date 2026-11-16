# TUI Polish and Performance Baseline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a useful long-session scroll-position indicator to the TUI, then establish a repeatable layout performance baseline and optimize the frame-assembly hot path with before/after evidence.

**Architecture:** Task 1 is a small TUI UX change built on the existing push-based frame geometry: a pure layout formatter plus a value-computed status dependency. Task 2 adds a standalone layout microbenchmark, captures the current frame cost, then replaces the linear window search in frame assembly with cached item geometry plus binary search while preserving the same `Frame` contract.

**Tech Stack:** Bun, TypeScript, existing TUI layout/compositor, existing Python benchmark harness for process-level numbers.

**Spec:** No separate spec. This plan implements the user-approved TUI polish and performance baseline direction from the current session.

## Global Constraints

- Preserve the push-based TUI invariant: regions repaint through declared signal reads, and the frame loop does not decide what to redraw.
- Do not reintroduce an O(history) transcript render on streaming paths.
- Keep `computeFrame` pure and layout-owned; app.ts injects rendering callbacks.
- Do not commit machine-generated benchmark output under `bench/`; scripts print reproducible numbers, and summary evidence stays in review notes.
- Use TDD for behavior changes. Performance numbers come from scripts, not flaky test assertions.
- Use `bun run typecheck`, never `tsc`.
- Focused TUI gate: `bun run check:tui`.
- Full gate before push: `bun run typecheck`, `bun test`, `bun run build`, `git diff --check`.
- Never touch the pre-existing dirty `src/context/render.ts` or the untracked `install` / `msfinstall` files.
- No new runtime dependencies.
- No `any` in new code unless the boundary genuinely requires it. Existing test `any` fixtures may stay local to their tests.

---

### Task 1: Long-session scroll-position indicator

**Files:**
- Modify: `src/tui/layout.ts`
- Modify: `src/tui/app.ts`
- Test: `test/layout.test.ts`
- Docs: `docs/tui/index.md`

**Interfaces:**
- Consumes: existing `Frame.total`, `Frame.scrollTop`, and `Frame.vh`.
- Produces: `scrollPositionLabel(total: number, scrollTop: number, vh: number): string | null` exported from `src/tui/layout.ts`.
  - Returns `null` when the transcript fits or is already at the live bottom.
  - Returns `"top"` at the first row.
  - Otherwise returns `"scrolled N%"`, clamped to `0..100`.

- [ ] **Step 1: Write failing layout tests**

Add tests for `scrollPositionLabel`:

1. `total <= vh` returns `null`.
2. `scrollTop` at `total - vh` returns `null` because the view is live-bottom.
3. `scrollTop <= 0` with a real scroll range returns `"top"`.
4. A middle position returns `"scrolled 50%"` for the exact midpoint.
5. Out-of-range low/high values clamp instead of throwing or exceeding `0..100`.

- [ ] **Step 2: Run the failing test**

Run:

```bash
bun test test/layout.test.ts
```

Expected: compile failure or assertion failure because `scrollPositionLabel` does not exist.

- [ ] **Step 3: Implement the pure formatter**

Add `scrollPositionLabel` to `src/tui/layout.ts` beside `scrollbarGeom`. Keep it pure and ASCII. Use the live-bottom rule `scrollTop >= total - vh`, not only equality, so near-bottom frames do not flicker.

- [ ] **Step 4: Verify the formatter tests**

Run:

```bash
bun test test/layout.test.ts
bun run typecheck
```

Expected: all pass.

- [ ] **Step 5: Wire the status bar through a value computed**

In `src/tui/app.ts`:

- Add a computed, near the existing `splitV`, that reads `paintedV()`, reads the current frame, and returns `scrollPositionLabel(fr.total, fr.scrollTop, fr.vh)`.
- Add that computed read to the `status` region dependency list.
- In `paintStatus`, append the returned label to the left state with a dim style when present, only if it fits the available width. Do not change the configured right-side `statusBar` segments and do not add a new config key.

The computed's value equality is what prevents a streamed token from repainting the status bar when the rounded position label did not change.

- [ ] **Step 6: Update TUI docs**

In `docs/tui/index.md`, document that the left status state shows `top` or `scrolled N%` whenever the transcript is scrolled away from the live bottom.

- [ ] **Step 7: Run focused gates and commit**

Run:

```bash
bun test test/layout.test.ts
bun run check:tui
```

Commit explicit paths with message:

```bash
git add src/tui/layout.ts src/tui/app.ts test/layout.test.ts docs/tui/index.md
git commit -m "tui: show scroll position away from live bottom"
```

---

### Task 2: Layout performance baseline and frame assembly optimization

**Files:**
- Modify: `src/tui/layout.ts`
- Test: `test/layout.test.ts`
- Create: `scripts/perf/layout.ts`
- Optional evidence: existing `scripts/bench/bench.py` with `--only fox-agent --quick --out <scratch-dir>` before/after the final build.

**Interfaces:**
- Consumes: existing `FrameInput.countCache`, `computeFrame`, and `assemble` internals.
- Produces:
  - `scripts/perf/layout.ts`, a standalone benchmark printing median milliseconds for cold count, cache-hit count, scrolled assembly, and streamed-token frames at 20,000 items.
  - Internal cached per-item geometry for pass 1: row count, body start, body end, and separator-blank row.
  - `assemble` locates the visible item range by binary search over cached geometry instead of walking every item.

- [ ] **Step 1: Write the failing assembly boundary test**

Add a `computeFrame` test with two 10-row items and a window beginning exactly where the first item ends. Count and render both items through a spy. Assert that an item ending at the window start is not rendered and that the frame rows still match the full-row truth at that scroll position.

This fails on the current inclusive boundary check, which calls `renderItem` for the item even when its slice is empty.

- [ ] **Step 2: Run the failing test**

Run:

```bash
bun test test/layout.test.ts
```

Expected: the new boundary test fails because `renderItem` is called for the item ending at the window start.

- [ ] **Step 3: Add the standalone layout benchmark**

Create `scripts/perf/layout.ts`:

- Build 20,000 synthetic `FrameInput` items with deterministic two-row bodies.
- Use a real `countCache` so cache-hit frames reflect production streaming.
- Measure median milliseconds over at least 30 iterations for:
  1. cold count at the current width,
  2. cache-hit frame while streaming,
  3. cache-hit frame at a middle scroll position,
  4. cache-hit frame stuck at the bottom.
- Print a compact table plus JSON-ish key/value lines suitable for copy/paste into review notes.
- Keep it dependency-free and outside the test gate so timing noise never fails CI.

Run:

```bash
bun scripts/perf/layout.ts
```

Record the before numbers.

- [ ] **Step 4: Implement cached geometry and binary-search assembly**

In `src/tui/layout.ts`:

- Extend the pass-1 result and `CountEntry` to carry, per item:
  - `counts`,
  - `bodyStart`,
  - `bodyEnd`,
  - `blankAt` (`-1` when absent).
- Build those arrays while counting rows. Cache them with the same version as the counts.
- In `assemble`, locate the first body that can intersect `[from, to)` and stop after the last body that can intersect it. Use binary search over `bodyEnd` and `bodyStart`.
- Iterate only that item range. Push separator blanks and body slices using the cached absolute rows.
- Keep the streaming tail behavior identical, with its start at the cached item total.
- Preserve the exact `Frame`, `rows`, and `owner` contracts; existing layout tests are the behavioral gate.

- [ ] **Step 5: Run behavior tests and benchmark after**

Run:

```bash
bun test test/layout.test.ts
bun scripts/perf/layout.ts
```

Expected: all behavior tests pass, the new boundary test passes, and the cache-hit middle-scroll and bottom-scroll medians improve or remain neutral. Cold count may grow slightly from geometry construction; report honestly.

- [ ] **Step 6: Run focused TUI and typecheck gates**

Run:

```bash
bun run check:tui
bun run typecheck
```

Expected: all pass.

- [ ] **Step 7: Commit the performance work**

Commit explicit paths with message:

```bash
git add src/tui/layout.ts test/layout.test.ts scripts/perf/layout.ts
git commit -m "tui: index transcript windows without walking history"
```

---

### Task 3: Integrated gates and process-level check

**Files:**
- No planned source edits unless integration exposes a regression.

- [ ] **Step 1: Run full gates**

Run:

```bash
bun run typecheck
bun test
bun run build
git diff --check
```

Expected: typecheck clean, full suite passes, build succeeds, whitespace clean, only pre-existing `src/context/render.ts` dirty and the untracked user files remain untouched.

- [ ] **Step 2: Run the fox-only process benchmark**

Run the existing harness into scratch output, never into committed `bench/`:

```bash
python3 scripts/bench/bench.py --only fox-agent --quick --out /home/qq/.jcode/scratch/fox-perf-after
```

Record first byte, idle PSS, bundle size, and `--version` numbers as process-level evidence. The layout microbenchmark remains the primary evidence for the Task 2 hot-path change.

- [ ] **Step 3: Review the integrated diff**

Verify:

- The status indicator is reactive by value, not a frame-loop scan.
- No TUI push-based architecture invariant was weakened.
- The layout optimization still renders only the window and keeps count/render agreement.
- No benchmark output files were committed.
- No changes to `src/context/render.ts`, `install`, or `msfinstall`.

- [ ] **Step 4: Push**

Commit any integration fix explicitly if needed, then push `HEAD` to `origin`.
