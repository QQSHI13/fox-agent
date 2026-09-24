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
