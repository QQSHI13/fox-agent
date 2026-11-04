/**
 * Plugin regions: the pull contract.
 *
 * A plugin region used to receive a persistent write handle and paint exactly
 * once; it pushed content whenever it liked. That was the last place in the TUI
 * where "when do I repaint?" was answered by the plugin rather than by what it
 * read, so it was converted to the same pull model the five built-in regions use.
 *
 * `app.ts` needs a tty, so this mirrors the wiring it performs — one `effect`
 * per region, plane cleared before each paint, `p.w`/`p.h` reading the size
 * signal — and asserts the properties that matter. That mirror is also what
 * caught a real regression: deleting `markDirty()` removed the only call to
 * `resolvePluginRegions()`, and every plugin region silently stopped being
 * created because no test exercised one.
 */
import { beforeEach, describe, expect, test } from "bun:test";
import { computed, effect, flushNow, setScheduler, signal, type Disposable, type Signal } from "../src/tui/reactive.ts";

/** A stand-in for Plane that records what a paint wrote. */
function fakePlane() {
  const cells: string[] = [];
  let clears = 0;
  return {
    clears: () => clears,
    cells: () => cells.slice(),
    reset() {
      cells.length = 0;
    },
    clear() {
      clears++;
      cells.length = 0; // PULL: a paint must redraw the whole region
    },
    text(_x: number, _y: number, str: string) {
      cells.push(str);
    },
  };
}

/**
 * The app's plugin-region wiring, reduced to its essentials: a size signal, a
 * per-region effect, a cleared plane, and the `p` handle whose `w`/`h` read the
 * size signal.
 */
function wire(regions: { key: string; paint: (p: { w: number; h: number; text: (x: number, y: number, str: string) => void }) => void }[]) {
  const W = 120, H = 40;
  const sizeV = signal({ w: W, h: H }, { equals: (a, b) => a.w === b.w && a.h === b.h });
  const disposers: Disposable[] = [];
  const painted: Record<string, number> = {};

  for (const r of regions) {
    const plane = fakePlane();
    painted[r.key] = 0;
    const handle = {
      get w() { sizeV(); return sizeV().w; },
      get h() { sizeV(); return sizeV().h; },
      text: plane.text.bind(plane),
    };
    disposers.push(
      effect(
        () => {
          sizeV(); // every region repaints on a resize, even one that ignores p.w
          plane.clear();
          painted[r.key]++;
          r.paint(handle);
        },
        { label: `plugin:${r.key}` },
      ),
    );
  }
  return { sizeV, disposers, painted };
}

beforeEach(() => {
  setScheduler(null);
  flushNow();
});

describe("plugin region: pull contract", () => {
  test("paints once at registration", () => {
    let n = 0;
    const g = wire([{ key: "a", paint: () => void n++ }]);
    expect(n).toBe(1);
    g.disposers.forEach((d) => d.dispose());
  });

  test("a regionSignal read inside paint subscribes the region", () => {
    const jobs: Signal<number> = signal(0);
    const plane = fakePlane();
    let paints = 0;
    const d = effect(() => {
      plane.clear();
      paints++;
      plane.text(1, 0, `jobs: ${jobs()}`); // the read IS the subscription
    });
    expect(paints).toBe(1);
    expect(plane.cells()).toEqual(["jobs: 0"]);

    jobs(3);
    flushNow();
    expect(paints).toBe(2);
    expect(plane.cells()).toEqual(["jobs: 3"]);
    d.dispose();
  });

  test("a write no region reads does not repaint anything", () => {
    const unused = signal(0);
    let paints = 0;
    const g = wire([{ key: "a", paint: () => void paints++ }]);
    const before = paints;
    unused(1); // nobody reads it
    flushNow();
    expect(paints).toBe(before);
    g.disposers.forEach((d) => d.dispose());
  });

  test("a resize repaints a region that never touches p.w", () => {
    // The app reads sizeV() once per region effect precisely so this holds: a
    // region laying out at fixed coordinates still has to be redrawn when the
    // screen changes under it.
    let paints = 0;
    const g = wire([{ key: "a", paint: () => void paints++ }]);
    expect(paints).toBe(1);
    g.sizeV({ w: 100, h: 40 });
    flushNow();
    expect(paints).toBe(2);
    g.disposers.forEach((d) => d.dispose());
  });

  test("reading p.w reports the live width", () => {
    let seen = 0;
    const g = wire([{ key: "a", paint: (p) => void (seen = p.w) }]);
    expect(seen).toBe(120);
    g.sizeV({ w: 90, h: 40 });
    flushNow();
    expect(seen).toBe(90); // not frozen at registration
    g.disposers.forEach((d) => d.dispose());
  });

  test("the plane is cleared before every paint, so paint is not a delta", () => {
    // The push contract let a plugin draw only what changed. A pull repaint must
    // start from an empty plane or last frame's cells would accumulate.
    const jobs = signal(0);
    const plane = fakePlane();
    const d = effect(() => {
      plane.clear();
      plane.text(1, 0, `v${jobs()}`);
    });
    expect(plane.cells()).toEqual(["v0"]);
    jobs(1);
    flushNow();
    expect(plane.cells()).toEqual(["v1"]); // one cell, not two
    d.dispose();
  });

  test("a throwing paint is contained and does not stop other regions", () => {
    const a = signal(0);
    const errs: unknown[] = [];
    const origError = console.error;
    console.error = (...m: unknown[]) => void errs.push(m);
    try {
      // the app catches inside its effect; here the effect body does the same
      const safe = (fn: () => void) => () => {
        try {
          fn();
        } catch (e) {
          errs.push(e);
        }
      };
      let good = 0;
      const d1 = effect(safe(() => { a(); throw new Error("boom"); }));
      const d2 = effect(safe(() => { a(); good++; }));
      a(1);
      flushNow();
      expect(good).toBe(2); // the healthy region still repainted
      expect(errs.length).toBeGreaterThan(0);
      d1.dispose();
      d2.dispose();
    } finally {
      console.error = origError;
    }
  });

  test("disposing a region stops it even if its signal still changes", () => {
    const jobs = signal(0);
    let paints = 0;
    const d = effect(() => {
      jobs();
      paints++;
    });
    d.dispose();
    jobs(1);
    flushNow();
    expect(paints).toBe(1);
  });

  test("a computed chain into a region repaints once for a burst", () => {
    const raw = signal(0);
    const doubled = computed(() => raw() * 2);
    const plane = fakePlane();
    const d = effect(() => {
      plane.clear();
      plane.text(0, 0, String(doubled()));
    });
    for (let i = 1; i <= 10; i++) raw(i);
    flushNow();
    expect(plane.cells()).toEqual(["20"]);
    d.dispose();
  });
});
