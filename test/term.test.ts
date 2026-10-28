/**
 * `openTerm()` owns two pieces of process-global state — raw mode and a stdin
 * `data` listener — and `end()` must hand both back.
 *
 * The bug this pins: `onKey` resumed stdin and attached a listener, which makes
 * it a *referenced* libuv handle, and nothing detached it. So after the TUI tore
 * down its screen the event loop still had a live handle: `await startTui()` had
 * returned and `shutdownTools` had finished, yet the process sat in `epoll_wait`
 * forever. Ctrl+C looked like it needed two presses — the first closed the UI,
 * the second was the tty's SIGINT killing the leftover husk.
 *
 * Tested at this level rather than by spawning a real TUI because `bun test` has
 * no TTY, and a pty-based exit check is contaminated: ctrl+C through a pty
 * delivers SIGINT, so the process dies by signal whether or not the leak is
 * fixed (measured — the sabotaged build still exited 130). Listener symmetry is
 * the thing that actually differs.
 */
import { afterEach, describe, expect, test } from "bun:test";

/** Swap in no-op tty methods so openTerm can run without a real terminal. */
function stubStdin() {
  const s = process.stdin as unknown as Record<string, unknown>;
  const saved: Record<string, unknown> = {};
  const calls = { resume: 0, pause: 0, unref: 0, rawMode: [] as boolean[] };
  for (const k of ["setRawMode", "resume", "pause", "unref", "isRaw"]) saved[k] = s[k];
  s.setRawMode = (v: boolean) => {
    calls.rawMode.push(v);
    return process.stdin;
  };
  s.resume = () => {
    calls.resume++;
    return process.stdin;
  };
  s.pause = () => {
    calls.pause++;
    return process.stdin;
  };
  s.unref = () => {
    calls.unref++;
  };
  s.isRaw = false;
  // openTerm writes real escape sequences; keep them out of the test output
  const savedWrite = Bun.stdout.writer;
  (Bun.stdout as unknown as Record<string, unknown>).writer = () => ({
    write: () => 0,
    flush: () => 0,
    end: () => {},
  });
  return {
    calls,
    restore() {
      (Bun.stdout as unknown as Record<string, unknown>).writer = savedWrite;
      for (const [k, v] of Object.entries(saved)) {
        if (v === undefined) delete s[k];
        else s[k] = v;
      }
    },
  };
}

let stub: ReturnType<typeof stubStdin> | null = null;
afterEach(() => {
  stub?.restore();
  stub = null;
  process.stdin.removeAllListeners("data");
});

describe("term: end() releases stdin so the process can exit", () => {
  test("the data listener attached by onKey is detached by end", async () => {
    const { openTerm } = await import("../src/tui/term.ts");
    stub = stubStdin();
    const before = process.stdin.listenerCount("data");

    const term = openTerm();
    term.onKey(() => {});
    expect(process.stdin.listenerCount("data")).toBe(before + 1);

    term.end();
    // the leak: this stayed at before+1, keeping the event loop referenced
    expect(process.stdin.listenerCount("data")).toBe(before);
  });

  test("end pauses and unrefs stdin", async () => {
    const { openTerm } = await import("../src/tui/term.ts");
    stub = stubStdin();
    const term = openTerm();
    term.onKey(() => {});
    expect(stub.calls.resume).toBeGreaterThan(0); // attaching a listener also resumes
    expect(stub.calls.pause).toBe(0);
    term.end();
    // pause alone is not enough for an already-referenced handle; both are needed
    expect(stub.calls.pause).toBe(1);
    expect(stub.calls.unref).toBe(1);
  });

  test("end restores the raw mode it found, not a hardcoded value", async () => {
    const { openTerm } = await import("../src/tui/term.ts");
    stub = stubStdin();
    const term = openTerm();
    term.onKey(() => {});
    term.end();
    // raw on for the TUI, back to the pre-TUI setting on the way out
    expect(stub.calls.rawMode).toEqual([true, false]);
  });

  test("end is safe to call without onKey, and twice", async () => {
    const { openTerm } = await import("../src/tui/term.ts");
    stub = stubStdin();
    const before = process.stdin.listenerCount("data");
    const term = openTerm();
    // gracefulExit runs on paths where the TUI never started reading keys
    expect(() => term.end()).not.toThrow();
    term.onKey(() => {});
    term.end();
    expect(() => term.end()).not.toThrow();
    expect(process.stdin.listenerCount("data")).toBe(before);
  });
});

describe("term: OSC 9;4 progress + OSC 9 notification", () => {
  test("progress emits the ConEmu sequence, notify strips control chars", async () => {
    const { openTerm } = await import("../src/tui/term.ts");
    stub = stubStdin();
    const written: string[] = [];
    const savedWriter = Bun.stdout.writer;
    (Bun.stdout as unknown as Record<string, unknown>).writer = () => ({
      write: (s: string) => (written.push(s), 0),
      flush: () => 0,
      end: () => {},
    });
    try {
      const term = openTerm();
      term.progress(3);
      term.progress(1, 42);
      term.progress(1, 999); // clamped
      term.progress(0);
      term.notify("done\x1b[0m in 12s");
      term.end();
    } finally {
      (Bun.stdout as unknown as Record<string, unknown>).writer = savedWriter;
    }
    const all = written.join("");
    expect(all).toContain("\x1b]9;4;3;0\x07");
    expect(all).toContain("\x1b]9;4;1;42\x07");
    expect(all).toContain("\x1b]9;4;1;100\x07"); // 999 clamped to 100
    expect(all).toContain("\x1b]9;4;0;0\x07");
    // the ESC and BEL inside the message must not survive into the payload
    expect(all).toContain("\x1b]9;done [0m in 12s\x07");
  });

  test("setCwd emits OSC 7 file URL, setTitle emits OSC 0 sanitized", async () => {
    const { openTerm } = await import("../src/tui/term.ts");
    stub = stubStdin();
    const written: string[] = [];
    const savedWriter = Bun.stdout.writer;
    (Bun.stdout as unknown as Record<string, unknown>).writer = () => ({
      write: (s: string) => (written.push(s), 0),
      flush: () => 0,
      end: () => {},
    });
    try {
      const term = openTerm();
      term.setCwd("/home/qq/my dir");
      term.setTitle("fox — s1\x1b[0m▶");
      term.end();
    } finally {
      (Bun.stdout as unknown as Record<string, unknown>).writer = savedWriter;
    }
    const all = written.join("");
    // OSC 7: file:// URL, space percent-encoded
    expect(all).toContain("\x1b]7;file:///home/qq/my%20dir\x07");
    // OSC 0: ESC becomes a space (same sanitize rule as notify), text intact
    expect(all).toContain("\x1b]0;fox — s1 [0m▶\x07");
  });
});

/**
 * The bug: `safeSize()` reconciled ioctl against `process.stdout.columns` and
 * trusted the smaller. `columns` is a snapshot Bun takes when it first builds
 * its stdout sink — any earlier console.log or library touch freezes it at the
 * boot size — and after `ownTerminal()` swaps fd 1 for the capture file it can
 * never update again. So a grown window kept the old, smaller width: shrinking
 * repainted, growing did nothing. It was intermittent because a run where
 * nothing had touched process.stdout saw `columns === undefined` and skipped the
 * check entirely.
 *
 * Tested at the pure-function level: reproducing it against a real tty needs a
 * pty, and the rule itself is where the bug lived.
 */
describe("term: size reconciliation must not trust Bun's frozen stdout cache", () => {
  test("once the fd is owned, the ioctl answer wins even if stdout.columns disagrees", async () => {
    const { reconcileSize } = await import("../src/tui/term.ts");
    // booted at 80x24, user dragged the window to 120x40
    expect(reconcileSize({ width: 120, height: 40 }, 80, 24, true)).toEqual({ width: 120, height: 40 });
    // the old rule returned 80x24 here — the "fox will not grow" bug
    expect(reconcileSize({ width: 120, height: 40 }, 80, 24, false)).toEqual({ width: 80, height: 24 });
  });

  test("an owned fd reports the true size even when the cache says undefined", async () => {
    const { reconcileSize } = await import("../src/tui/term.ts");
    expect(reconcileSize({ width: 100, height: 30 }, 0, 0, true)).toEqual({ width: 100, height: 30 });
  });

  test("without ownership the conservative smaller-wins rule still holds", async () => {
    const { reconcileSize } = await import("../src/tui/term.ts");
    // no ioctl answer at all: fall back to the JS view
    expect(reconcileSize(null, 90, 25, false)).toEqual({ width: 90, height: 25 });
    expect(reconcileSize(null, 0, 0, false)).toBeNull();
    // ioctl wider than the JS view (zoom / WSL relay): trust the smaller, and
    // clamp the height to the JS view too rather than mixing the two
    expect(reconcileSize({ width: 120, height: 40 }, 100, 30, false)).toEqual({ width: 100, height: 30 });
    // JS view wider than ioctl: ioctl wins (never lay out wider than the tty)
    expect(reconcileSize({ width: 100, height: 30 }, 120, 40, false)).toEqual({ width: 100, height: 30 });
  });
});

/**
 * A resize that moves only one dimension has to report too: dragging a window
 * border vertically changes rows and leaves cols alone. Deduping on width alone
 * (or reporting only what the deduped source said) swallowed exactly that case.
 */
describe("term: onResize reports single-dimension changes", () => {
  test("height-only and width-only changes each fire exactly once", async () => {
    const { openTerm } = await import("../src/tui/term.ts");
    stub = stubStdin();
    // no tty under bun test, so drive the size source directly: with no owned
    // fd the report reads process.stdout.columns/rows
    const s = process.stdout as unknown as Record<string, unknown>;
    const saved = { columns: s.columns, rows: s.rows };
    const seen: string[] = [];
    try {
      s.columns = 80;
      s.rows = 24;
      const term = openTerm();
      term.onResize((w, h) => seen.push(`${w}x${h}`));
      expect(seen).toEqual(["80x24"]); // the initial report, not a change
      s.rows = 40; // height only
      await Bun.sleep(400); // the poll interval is 250ms
      expect(seen).toEqual(["80x24", "80x40"]);
      s.columns = 120; // width only
      await Bun.sleep(400);
      expect(seen).toEqual(["80x24", "80x40", "120x40"]);
      await Bun.sleep(400); // unchanged: no duplicate report
      expect(seen).toEqual(["80x24", "80x40", "120x40"]);
      term.end();
    } finally {
      if (saved.columns === undefined) delete s.columns;
      else s.columns = saved.columns;
      if (saved.rows === undefined) delete s.rows;
      else s.rows = saved.rows;
    }
  });
});
