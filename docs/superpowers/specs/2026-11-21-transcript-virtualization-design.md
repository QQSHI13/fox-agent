# Transcript virtualization design

Date: 2026-11-21
Status: proposed architecture

## Problem

The TUI renders only a small transcript window, but resume and refresh still materialize the whole stored conversation before layout runs.

The current path is:

1. `projectView(sessionId)` builds and caches full `ViewNode` objects, including message content.
2. `loadItems()` in `src/tui/app.ts` maps every visible node into `Item` objects.
3. `callMaps()` walks every assistant row so tool heads can be labeled.
4. `computeFrame()` asks for a row count for every item at one or two widths.
5. Only then does layout render the visible window.

Windowed painting removed the paint cost of distant rows. It did not remove the hydration, joining, retention, or counting cost of the full transcript.

A resumed session with large tool outputs therefore pays memory and startup cost proportional to the whole history, even when only the tail is visible.

## Goals

1. Make TUI memory proportional to transcript structure plus the visible/live content, not total stored content bytes.
2. Make resume and refresh avoid full-content item materialization.
3. Preserve exact scrolling, hit-testing, selection, context operations, expansion, streaming, session switching, fork, prune, share, ACP, and gateway behavior.
4. Keep the append-only storage invariant and the existing context view semantics.
5. Keep `layout.ts` as the geometry of record.
6. Allow staged implementation with behavioral parity after each stage.

## Non-goals

1. No storage rewrite.
2. No change to the provider event contract.
3. No fuzzy or approximate scrollbar as the permanent design.
4. No plugin API change.
5. No replacement of the terminal renderer in this refactor.

## Current architecture boundaries

### Storage

`src/store/db.ts` stores messages append-only in per-session SQLite databases. Messages are immutable once written. Context edits are append-only ops in a separate table.

Important query shapes:

- `allMessages()` returns full rows.
- `allMessagesLite()` returns seq, role, content, `tool_calls`, and `tool_call_id`.
- `messagesAfter()` returns full rows after a seq.
- `getMessage()` returns one full row.

### Context projection

`src/context/view.ts` maintains a cached `ViewNode[]` per session. A `ViewNode` currently carries the full `MessageRow`, the post-op view content, deletion state, summary state, and replace metadata.

This projection serves two different needs:

1. Model-facing rendering and tools need full content and parsed tool calls.
2. TUI display needs visibility, ordering, role, expansion state, and enough information to fetch content on demand.

Those needs are coupled today, which keeps full message bodies resident.

### View model

`src/view/model.ts` maps one `MessageRow` to one or two display `Item` objects. Tool rows become a head and body. The caller supplies stable keys, expansion state, and the retained-body cap.

### TUI layout

`src/tui/layout.ts` computes exact frame geometry from a full `items` array. Pass one counts every item at the active width, and sometimes again at the scrollbar width. Pass two renders only the rows around the viewport.

The expensive part is not pass two. It is the combination of full item hydration plus per-item counting.

## Chosen approach

Split the display transcript from the model transcript.

### 1. Transcript index

Add a display-facing transcript index, owned outside the TUI frame loop. The index stores metadata only:

- storage seq
- role
- item slot structure
- tool call id for tool rows
- assistant call ids needed for orphan and pairing visibility
- error presence for failed tool heads
- content length, not content
- hidden, deleted, orphan, summary, and replace state
- view version information needed to invalidate cached counts

The index is built from a new metadata query, not from `allMessages()`. A suitable store query selects seq, role, `tool_calls`, `tool_call_id`, error presence, and `LENGTH(content)` without selecting content.

Assistant `tool_calls` are still parsed while building the index because tool visibility and pairing depend on call ids. The parsed result stored in the index is call metadata, not full message bodies.

### 2. TranscriptSource

Introduce a source abstraction consumed by layout:

```ts
interface TranscriptSource {
  length: number;
  keyAt(index: number): number;
  kindAt(index: number): string;
  toolResultAt(index: number): boolean;
  countAt(index: number, width: number): number;
  renderAt(index: number, width: number): Row[];
  itemByKey(key: number): Item | undefined;
}
```

`computeFrame()` counts through `length`, `keyAt`, `kindAt`, and `countAt`. It renders through `renderAt`. It never receives a fully materialized `items` array.

The current array-backed items become an adapter during migration. Layout behavior must be identical before and after the source abstraction.

### 3. Lazy materialization

`renderAt(index, width)` materializes only the requested item. It fetches the backing message row by seq, builds the same `Item` shape through `nodeToItems()`, and returns the same edge-stripped rows that `itemRows()` returns today.

Materialized rows are cached only for a bounded set of active widths and recently used items. The cache is a performance layer, not the source of truth.

Tool head labels and raw argument details are loaded only when needed by the visible item. A tool head outside the materialized window does not need its argument summary.

### 4. Exact count cache

`countAt(index, width)` computes exact row counts and stores them separately from rows.

The first implementation uses a bounded in-memory count store keyed by:

- item key
- width
- item render signature

A count is invalid when expansion, hidden state, replace state, content identity, body cap, or width changes.

This preserves exact scrollbar geometry without retaining rendered rows for the whole transcript.

A later phase may persist counts in SQLite if first-load count time remains measurable. Persistence is not required for the memory win.

### 5. Live overlay

Live streaming items, running tool pairs, child progress rows, and ephemeral notices remain live overlays on top of the settled index.

They are materialized because they are actively changing. On settle, the display index learns the stored row and the live overlay is replaced at the same transcript position, preserving current behavior.

### 6. Model projection separation

The provider and context tools keep the full-content projection they need, but it becomes an explicit model-facing projection rather than the TUI’s display cache.

Rules:

1. TUI display code must not call the full-content projection for settled history.
2. Model-facing code may use full rows because provider requests, context tools, fork, prune, share, and ACP need content.
3. Full-content projections are scoped to active use and bounded, rather than retained as a general multi-session display cache.
4. The existing append-only projection semantics stay unchanged.

The exact lifetime policy is an implementation detail, but the design goal is that idle TUI memory is dominated by the metadata index and visible rows, not by full historical bodies retained for display.

## Data flow

### Resume

1. Open the session.
2. Build or refresh the metadata index from SQLite.
3. Build the live overlay from current in-flight state.
4. Paint the tail using exact counts.
5. Materialize only rows needed by the current window.

### Scroll

1. Layout uses the count geometry to locate the target window.
2. `renderAt()` materializes the intersecting items.
3. Counts remain cached; rows outside the window may be evicted.

### Refresh after settle

1. Append new metadata to the index.
2. Apply new view ops to the index.
3. Invalidate only affected count signatures.
4. Reconcile live overlays by reference as today.

### Context operations

1. `ctx` and `/undo` continue to append ops to storage.
2. The display index applies those ops to metadata.
3. Touched seqs invalidate their counts and materialized rows.
4. The provider-facing projection continues to see the same op semantics.

## Error handling

1. A missing display row is a cache miss, not data loss. Materialization falls back to `getMessage()`.
2. A malformed tool call list degrades to the existing behavior: labels may be lost, but the session remains renderable.
3. A mismatched index version triggers an index rebuild from SQLite.
4. Storage remains the source of truth. The display index is disposable.
5. No code path may synthesize message content to cover an index failure.

## Invariants

1. Message storage remains append-only.
2. The context view remains a projection over storage, not a copy that mutates stored rows.
3. Seq-derived item keys remain stable across rebuilds.
4. Layout remains the only geometry of record.
5. Count and paint must agree for every item.
6. A frame must not require materializing the whole transcript.
7. Scrolling, selection, expansion, context ops, and hit-testing must agree with the painted frame.
8. Read-only viewers and plugin regions must not gain a side channel around the event contract.

## Testing strategy

### Equivalence tests

1. Randomized transcript fixture with users, assistants, thinking rows, tools, failed tools, replacements, deletes, restores, hidden orphans, and summaries.
2. Compare old array-backed layout and new source-backed layout for:
   - total rows
   - scroll window
   - owner keys
   - row content
   - scrollbar geometry
3. Compare display index visibility and orphan state against `projectView()` for the same fixtures.

### Regression tests

1. Resume with a synthetic large session.
2. Scroll to top, middle, and bottom.
3. Select and copy visible text.
4. Expand and collapse tool outputs.
5. Run `ctx` delete, replace, and restore operations.
6. Switch sessions and return.
7. Stream a turn while scrolled away from the tail.
8. Fork, prune, share, and ACP history selection.

### Performance tests

1. Resume time for a synthetic long session.
2. RSS after resume and after scrolling.
3. Refresh cost after a settled tool result.
4. Cache-hit scroll cost.
5. Count-store memory for two widths.

The benchmark suite must run before implementation and after each stage.

## Rollout

### Phase 0: characterization

Add large-session resume, memory, refresh, and count benchmarks. Record current behavior.

### Phase 1: source abstraction

Add `TranscriptSource` and an array-backed adapter. Keep current behavior and tests green.

### Phase 2: metadata index and lazy materialization

Implement the display index and lazy `renderAt()`. Replace TUI settled-history hydration. Keep full model projection behavior unchanged.

### Phase 3: count store and cache bounds

Separate exact counts from rendered rows. Bound count and row caches. Verify exact layout equivalence.

### Phase 4: model projection lifetime

Separate display and model projection lifetimes so idle TUI memory no longer retains full historical bodies for display.

### Phase 5: optional count persistence

Persist exact counts only if Phase 2 and Phase 3 measurements show that first-load counting remains a real bottleneck.

## Risks

1. **Exact count correctness.** Counts and paint must never diverge. The count signature must cover every input that affects row count.
2. **Live reconciliation.** Live items and settled index items must swap without reordering or duplicate markers.
3. **Selection and hit-testing.** These must continue to use the painted frame and materialized owner lookup.
4. **Context op drift.** The metadata index must apply the same op semantics as the model projection.
5. **Over-eager materialization.** Debugging and copy paths must not accidentally hydrate the full transcript.

## Decision

Proceed with a staged transcript virtualization built around a metadata-only display index and a layout-facing `TranscriptSource`. Do not rewrite storage. Do not make the scrollbar approximate. Keep model-facing full-content behavior explicit and bounded.
