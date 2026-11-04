import { beforeEach, describe, expect, test } from "bun:test";
import { batch, computed, effect, flushNow, setScheduler, signal, untrack } from "../src/tui/reactive.ts";

// Every test drives flushing explicitly: no scheduler is installed, and these
// bail out of the microtask fallback by calling flushNow() themselves. That
// keeps the suite synchronous and deterministic instead of racing a timer.
beforeEach(() => {
  setScheduler(null);
  flushNow();
});

describe("signal", () => {
  test("read and write round-trip", () => {
    const s = signal(1, { label: "s" });
    expect(s()).toBe(1);
    s(2);
    expect(s()).toBe(2);
  });

  test("an equal write does not notify", () => {
    const s = signal(1);
    let runs = 0;
    effect(() => {
      s();
      runs++;
    });
    expect(runs).toBe(1);
    s(1); // same value
    flushNow();
    expect(runs).toBe(1); // no run: Object.is stopped it
    s(2);
    flushNow();
    expect(runs).toBe(2);
  });

  test("undefined round-trips through a signal typed undefined", () => {
    // the read/write arity split must not swallow a real `undefined` argument
    const s = signal<string | undefined>("x");
    s(undefined);
    expect(s()).toBeUndefined();
    s("y");
    expect(s()).toBe("y");
  });

  test("peek reads without subscribing", () => {
    const s = signal(1);
    let runs = 0;
    effect(() => {
      s.peek();
      runs++;
    });
    s(2);
    flushNow();
    expect(runs).toBe(1);
  });

  test("a write nobody reads arms no flush", () => {
    // the scheduler must not fire for state the UI does not display
    let scheduled = 0;
    setScheduler(() => scheduled++);
    const s = signal(0);
    s(1);
    expect(scheduled).toBe(0);
  });
});

describe("computed", () => {
  test("derives lazily and memoizes until a dependency moves", () => {
    const a = signal(2);
    let computes = 0;
    const c = computed(() => {
      computes++;
      return a() * 10;
    });
    expect(computes).toBe(0); // nothing read it yet
    expect(c()).toBe(20);
    expect(c()).toBe(20);
    expect(computes).toBe(1); // memoized
    a(3);
    expect(c()).toBe(30);
    expect(computes).toBe(2);
  });

  test("a chain propagates to an effect exactly once per flush", () => {
    const a = signal(1);
    const b = computed(() => a() + 1);
    const c = computed(() => b() * 2);
    let runs = 0;
    let seen = 0;
    effect(() => {
      seen = c();
      runs++;
    });
    expect(runs).toBe(1);
    expect(seen).toBe(4);

    batch(() => {
      a(2);
      a(3);
      a(4);
    });
    flushNow();
    expect(runs).toBe(2); // one recompute for three writes
    expect(seen).toBe(10);
  });

  test("a dependency the computed stops reading no longer invalidates it", () => {
    // the classic leak: not dropping old edges means a value it never reads
    // again keeps marking it dirty forever
    const which = signal<"a" | "b">("a");
    const a = signal(1);
    const b = signal(2);
    let computes = 0;
    const c = computed(() => {
      computes++;
      return which() === "a" ? a() : b();
    });
    expect(c()).toBe(1);
    const before = computes;
    b(99); // not currently read
    expect(c()).toBe(1); // still the memoized value
    expect(computes).toBe(before); // and no recompute
    which("b");
    expect(c()).toBe(99);
  });
});

describe("effect", () => {
  test("re-subscribes to exactly what it read last run", () => {
    const flag = signal(false);
    const a = signal("a");
    const b = signal("b");
    let runs = 0;
    effect(() => {
      flag() ? b() : a();
      runs++;
    });
    expect(runs).toBe(1);
    a("a2");
    flushNow();
    expect(runs).toBe(2);
    flag(true);
    flushNow();
    expect(runs).toBe(3);
    a("a3"); // no longer read
    flushNow();
    expect(runs).toBe(3);
    b("b2");
    flushNow();
    expect(runs).toBe(4);
  });

  test("runs synchronously once, so a region stamps before the first flush", () => {
    const s = signal(0);
    let ran = false;
    effect(() => {
      s();
      ran = true;
    });
    expect(ran).toBe(true);
  });

  test("dispose stops future runs and unsubscribes", () => {
    const s = signal(0);
    let runs = 0;
    const d = effect(() => {
      s();
      runs++;
    });
    d.dispose();
    s(1);
    flushNow();
    expect(runs).toBe(1);
  });

  test("a burst of writes coalesces into one run", () => {
    const s = signal(0);
    let runs = 0;
    effect(() => {
      s();
      runs++;
    });
    for (let i = 1; i <= 20; i++) s(i);
    flushNow();
    expect(runs).toBe(2); // the initial run + one coalesced
  });
});

describe("cycle safety", () => {
  test("an effect that writes a signal it reads is bounded, not infinite", () => {
    // This is the exact failure the reactive rewrite exists to prevent, so it
    // must not be reintroducible through the new machinery: a self-triggering
    // effect has to be cut off rather than spin the frame loop forever.
    const s = signal(0);
    let runs = 0;
    const errs: string[] = [];
    const origError = console.error;
    console.error = (m: string) => void errs.push(String(m));
    try {
      effect(() => {
        runs++;
        s(s() + 1); // reads and writes the same signal
      });
      flushNow();
    } finally {
      console.error = origError;
    }
    // bounded by MAX_RUNS_PER_FLUSH, not unbounded
    expect(runs).toBeLessThan(50);
    expect(runs).toBeGreaterThan(1);
    expect(errs.some((e) => e.includes("writes a signal it reads"))).toBe(true);
  });

  test("nested flushNow does not re-enter the drain", () => {
    const s = signal(0);
    let runs = 0;
    effect(() => {
      s();
      runs++;
      flushNow(); // must be a no-op inside a flush
    });
    s(1);
    flushNow();
    expect(runs).toBe(2);
  });
});

describe("untrack", () => {
  test("reads inside untrack do not subscribe", () => {
    const s = signal(0);
    let runs = 0;
    effect(() => {
      untrack(() => s());
      runs++;
    });
    s(1);
    flushNow();
    expect(runs).toBe(1);
  });
});
