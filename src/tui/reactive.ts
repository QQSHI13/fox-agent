/**
 * A small synchronous reactive core: `signal`, `computed`, `effect`.
 *
 * ## Why this exists
 *
 * The TUI used one blunt signal — `markDirty()` — with 61 call sites. Every
 * caller meant "something changed" and could not say what, so all five regions
 * re-stamped unconditionally. That is tolerable only because each plane is
 * idempotent and the pushes coalesce; it is also why a single streamed token
 * cost five region repaints.
 *
 * Then, to stop the worst of it, the code grew exceptions that re-encode the
 * dependency graph as data by hand: `LAYOUT_FIELDS` is a set of geometry field
 * names that must not notify, maintained beside a `Geometry` record that mixes
 * "who owns what" with "who depends on what". Add a field and it is a content
 * field by default unless someone remembers to edit the set — the same
 * silent-forgetting failure `markDirty` had.
 *
 * Here the dependency IS the read: an effect that reads a signal is subscribed
 * to it, automatically, with nothing to keep in sync. Both the exception list
 * and the notification fan-out stop existing.
 *
 * ## Why a synchronous-only tracker is enough
 *
 * Tracking runs from a read to the currently-executing subscriber. Across an
 * `await`, "currently executing" belongs to a different task, and a tracker that
 * spanned it would attribute one function's reads to another. Everywhere this is
 * used the derive is synchronous — `const fr = derive(); stamp(fr);` — and only
 * the *scheduling* around that block is async. So tracking never has to survive
 * a suspension, and this module does not try: `untrack()` is there for reads
 * that must deliberately not subscribe.
 */

// ---------------------------------------------------------------------------
// dependency graph
// ---------------------------------------------------------------------------

/** Minimal shape both signals and computeds expose to the tracker. */
interface Dep {
  subs: Set<Sub>;
}

/** A reactive node that can be invalidated. */
interface Sub {
  deps: Set<Dep>;
  /** dependency changed: mark dirty and propagate to this node's own readers */
  invalidate(): void;
  disposed?: boolean;
}

/** The subscriber currently executing, or null outside a tracked read. */
let active: Sub | null = null;

/** Reads made during `fn` do not subscribe the caller. */
export function untrack<T>(fn: () => T): T {
  const prev = active;
  active = null;
  try {
    return fn();
  } finally {
    active = prev;
  }
}

function track(dep: Dep): void {
  if (!active) return;
  dep.subs.add(active);
  active.deps.add(dep);
}

/** Re-subscribe `node`: clear its old edges, then run `fn` with it as the tracker. */
function retrack(node: Sub, fn: () => void): void {
  for (const d of node.deps) d.subs.delete(node);
  node.deps.clear();
  const prev = active;
  active = node;
  try {
    fn();
  } finally {
    active = prev;
  }
}

// ---------------------------------------------------------------------------
// scheduling
// ---------------------------------------------------------------------------

/**
 * Effects needing a run, in insertion order.
 *
 * Coalescing is the whole point: a burst of twenty writes inside one turn step
 * must produce ONE repaint, not twenty. The set dedupes within a flush; the
 * scheduler hook decides when the flush happens (the TUI arms its frame on the
 * next tick). Tests pass no scheduler and call `flushNow()` themselves, which
 * keeps them synchronous and deterministic.
 */
const queued = new Set<EffectNode>();
const live = new Set<EffectNode>();
let scheduled = false;
let scheduler: (() => void) | null = null;
/** Depth of `batch()`. While > 0, flushes are deferred to the end of the batch. */
let batchDepth = 0;
/** Depth of `flushNow()`. While > 0, new work is drained by the running loop. */
let flushDepth = 0;

/**
 * How the host turns "work is pending" into "work ran".
 *
 * The TUI passes its paint scheduler, so a flood of writes inside one event
 * handler collapses into the existing frame-slot logic.
 */
export function setScheduler(fn: (() => void) | null): void {
  scheduler = fn;
}

function schedule(): void {
  // already draining: the running flush's own while-loop picks the work up
  if (flushDepth > 0) return;
  if (scheduled) return;
  scheduled = true;
  if (batchDepth > 0) return; // the batch's own end will flush
  if (scheduler) scheduler();
  else queueMicrotask(flushNow);
}

/**
 * Run every pending effect now.
 *
 * Bounded on purpose. An effect that writes a signal it reads is a cycle, and a
 * cycle here is exactly the permanent spin this rewrite exists to stamp out — so
 * it must not be reintroducible. The counter is per effect per flush:
 * legitimate cascades (A writes, B reacts, B writes, C reacts) are short, while
 * one effect re-entering repeatedly means a self-trigger.
 */
export function flushNow(): void {
  if (flushDepth > 0) return; // a nested call would re-enter the drain
  flushDepth++;
  try {
    let guard = 0;
    while (queued.size) {
      if (++guard > 10_000) {
        queued.clear();
        report("flush exceeded 10000 effect runs — a cycle is writing a signal it reads");
        break;
      }
      const e = queued.values().next().value as EffectNode;
      queued.delete(e);
      if (e.disposed) continue;
      if (++e.runsThisFlush > MAX_RUNS_PER_FLUSH) {
        // Drop it for THIS flush instead of spinning. It may run again in a
        // later flush, which is the legitimate case (a value that genuinely
        // changes once per frame).
        const label = e.label ? ` (${e.label})` : "";
        report(`effect re-entered ${e.runsThisFlush}x in one flush${label} — it writes a signal it reads`);
        continue;
      }
      e.run();
    }
  } finally {
    flushDepth--;
    scheduled = false;
    for (const e of live) e.runsThisFlush = 0;
  }
}

const MAX_RUNS_PER_FLUSH = 20;

/** Cycles are reported once per message, never thrown: a stuck repaint must not kill the TUI. */
const reported = new Set<string>();
function report(msg: string): void {
  if (reported.has(msg)) return;
  reported.add(msg);
  console.error(`fox-agent: reactive: ${msg}`);
}

/** Group writes so the effects they invalidate run once at the end. */
export function batch<T>(fn: () => T): T {
  batchDepth++;
  try {
    return fn();
  } finally {
    batchDepth--;
    if (batchDepth === 0 && queued.size) {
      scheduled = false;
      schedule();
    }
  }
}

// ---------------------------------------------------------------------------
// signal
// ---------------------------------------------------------------------------

export interface Signal<T> {
  /** Read, subscribing the current subscriber. */
  (): T;
  /** Write. A no-op when `equals` says the value is unchanged. */
  (v: T): T;
  /** Read without subscribing, and without notifying. */
  peek(): T;
}

export interface SignalOptions<T> {
  /** human name, used only in cycle reports */
  label?: string;
  /** default `Object.is`; `() => false` forces every write to notify */
  equals?: (a: T, b: T) => boolean;
}

export function signal<T>(initial: T, opts: SignalOptions<T> = {}): Signal<T> {
  const eq = opts.equals ?? Object.is;
  let value = initial;
  const dep: Dep = { subs: new Set() };

  const read = (): T => {
    track(dep);
    return value;
  };

  function call(...args: [] | [T]): T {
    if (args.length === 0) return read();
    const next = args[0];
    if (!eq(value, next)) {
      value = next;
      // snapshot: a subscriber may add or drop edges while reacting
      for (const s of [...dep.subs]) s.invalidate();
      // NO schedule() here. `invalidate` on an EFFECT is what arms a flush; a
      // computed only propagates. A write nobody reads therefore does not arm a
      // repaint, which is what keeps state the UI does not display free.
    }
    return value;
  }

  const sig = call as Signal<T>;
  // `peek` must not track; it is the escape hatch for a write that needs the
  // previous value without subscribing the writer to its own signal.
  (sig as { peek: () => T }).peek = () => value;
  return sig;
}

// ---------------------------------------------------------------------------
// computed
// ---------------------------------------------------------------------------

export interface Computed<T> {
  /** Read, computing on demand and subscribing the current subscriber. */
  (): T;
  /** Read without subscribing. */
  peek(): T;
}

/**
 * A lazily recomputed derived value.
 *
 * Pull-based: writing a dependency only marks this dirty, so a value nobody
 * reads costs nothing. That matters here — the transcript frame is the most
 * expensive derive in the program, and it must not be recomputed by a write no
 * paint ever looks at.
 */
export function computed<T>(fn: () => T, opts: { label?: string; equals?: (a: T, b: T) => boolean } = {}): Computed<T> {
  const eq = opts.equals ?? Object.is;
  let value: T;
  let dirty = true;
  const dep: Dep = { subs: new Set() };

  const node: Sub = {
    deps: new Set(),
    invalidate() {
      if (dirty) return; // already stale; readers will recompute once anyway
      dirty = true;
      // A computed nobody is displaying costs nothing: stay lazy and let the
      // next reader recompute.
      //
      // A computed that DOES have subscribers must be settled NOW, because the
      // next question is "did the value actually change?" and only a recompute
      // can answer it. Notifying subscribers first and recomputing later (the
      // obvious push model) woke every dependent on every upstream write, even
      // when the derived value was identical — measured: a dock row count that
      // stayed at 1 across 500 keystrokes still re-derived the O(session)
      // transcript frame 500 times. That is the whole bug this rewrite exists
      // to remove, so it cannot be allowed to survive inside the rewrite.
      if (dep.subs.size === 0) return;
      recompute(); // notifies only if the value really moved
    },
  };

  const recompute = (): void => {
    const prev = value;
    retrack(node, () => void (value = fn()));
    dirty = false;
    if (eq(prev, value)) return; // same answer, no work: readers keep their cache
    // VALUE equality, not identity: a derived value that recomputes to the same
    // content must not invalidate its readers. Without this, a keystroke that
    // leaves the dock's row count unchanged would still invalidate the
    // transcript frame — and that frame is the O(session) derive this whole
    // exercise is about.
    //
    // Skip `active`: it is the reader that triggered this recompute, and it is
    // about to return with the FRESH value. Notifying it would re-queue an
    // effect that has already seen the new state, which showed up as a chain
    // running twice for one write.
    for (const s of [...dep.subs]) if (s !== active) s.invalidate();
  };

  const read = (): T => {
    // subscribe the OUTER reader first: `retrack` swaps `active` to this node,
    // so a track after it would attach to the wrong subscriber
    track(dep);
    if (dirty) recompute();
    return value;
  };

  const c = read as Computed<T>;
  (c as { peek: () => T }).peek = () => {
    if (dirty) recompute();
    return value;
  };
  void opts.label;
  return c;
}

// ---------------------------------------------------------------------------
// effect
// ---------------------------------------------------------------------------

export interface EffectNode extends Sub {
  disposed: boolean;
  /** runs so far in the current flush — the cycle guard's counter */
  runsThisFlush: number;
  label?: string;
  run(): void;
}

export interface Disposable {
  dispose(): void;
}

/**
 * Run `fn` now, and again whenever a signal it read changes.
 *
 * The run is tracked, so the dependency set is whatever `fn` actually read on
 * its last run — re-derived each time, never declared. `dispose()` unsubscribes
 * so a removed region cannot be resurrected by a later write.
 */
export function effect(fn: () => void, opts: { label?: string } = {}): Disposable {
  const node: EffectNode = {
    deps: new Set(),
    disposed: false,
    runsThisFlush: 0,
    label: opts.label,
    invalidate() {
      if (node.disposed) return;
      queued.add(node);
      schedule();
    },
    run() {
      if (node.disposed) return;
      retrack(node, fn);
    },
  };
  live.add(node);
  // synchronous first run: a region must stamp before the first frame flushes
  node.run();
  return {
    dispose() {
      node.disposed = true;
      for (const d of node.deps) d.subs.delete(node);
      node.deps.clear();
      queued.delete(node);
      live.delete(node);
    },
  };
}
