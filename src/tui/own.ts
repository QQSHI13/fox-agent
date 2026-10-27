/**
 * The TUI's sole owner of the terminal.
 *
 * ## The rule
 *
 * While the TUI is up, exactly one component writes to the terminal: this
 * object. Everything else in the process — and every child it spawns — writes
 * to fd 1 or fd 2 and lands in a capture file instead.
 *
 * ## Why it has to be the descriptor, not the function
 *
 * The obvious defence is to replace the write functions:
 * `process.stdout.write`, `console.error`, `Bun.stderr.write`. That only
 * intercepts function CALLS made through THIS process's JavaScript objects.
 * It cannot see:
 *
 *   - a child spawned with `stderr: "inherit"` (it got the fd, not our JS);
 *   - a native library (FFI, a bundled `.node`) writing to fd 2 directly;
 *   - a dependency that captured `process.stderr` before the patch, or that
 *     writes via `Bun.stderr.writer()` / `FileSink`.
 *
 * Each of those painted straight over the grid, and the damage was permanent:
 * the alternate screen has no scrollback, and `Screen.flush()` compares each
 * row against `prevHash`, finds the buffer "already correct", and writes
 * nothing. That is the black, textless input dock.
 *
 * So the ownership is taken at the descriptor level:
 *
 *   1. `dup(1)` first — that private handle is the ONLY way to the terminal;
 *   2. `dup2(capture, 1)` and `dup2(capture, 2)` — fd 1 and fd 2 now point at
 *      a file, so every writer above (and every child that inherits them)
 *      writes there;
 *   3. frames go out through `write()`, which writes to the private handle.
 *
 * A child cannot recover the terminal from this: it inherits fd 1/2, which are
 * a file. Only a caller holding the private number can reach the screen, and
 * that number never leaves this module.
 *
 * ## Captured text is kept, not discarded
 *
 * Whatever was trying to reach the screen is still useful — a plugin's stack
 * trace, an MCP child's complaint, a library warning. `drain()` hands it to the
 * caller, which shows it (bounded) in the exit panel.
 *
 * ## Degradation
 *
 * No libc (Windows), or `dup` failing: `ownTerminal()` returns null and the
 * caller falls back to writing through `Bun.stdout.writer()` with the
 * JS-property patches as its only defence. Hardening that can fail must not
 * become a failure path — the TUI still runs.
 */
import { dlopen, FFIType } from "bun:ffi";
import { closeSync, openSync, readSync, statSync, unlinkSync, writeSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface TerminalOwnership {
  /** Write to the REAL terminal. Buffered — pair with `flush()`. */
  write(s: string): void;
  /** Push everything `write()` buffered to the terminal in one syscall. */
  flush(): void;
  /** Text other writers put on fd 1/2 since the last call. Never throws. */
  drain(): string;
  /** Restore the real descriptors; returns text captured since the last drain. */
  restore(): string;
  /** Where captured output is being accumulated (for a "full text at …" note) */
  readonly capturePath: string;
  /**
   * The private descriptor that still points at the terminal. Callers use it
   * for `ioctl(TIOCGWINSZ)` — fd 1 is a file now, so sizing must ask this one.
   */
  readonly ownerFd: number;
}

interface Libc {
  dup(fd: number): number;
  dup2(from: number, to: number): number;
  isatty(fd: number): number;
}

let cachedLib: Libc | null | undefined;

function libc(): Libc | null {
  if (cachedLib !== undefined) return cachedLib;
  if (process.platform === "win32") {
    cachedLib = null;
    return null;
  }
  try {
    const name = process.platform === "darwin" ? "libSystem.dylib" : "libc.so.6";
    const lib = dlopen(name, {
      dup: { args: [FFIType.i32], returns: FFIType.i32 },
      dup2: { args: [FFIType.i32, FFIType.i32], returns: FFIType.i32 },
      isatty: { args: [FFIType.i32], returns: FFIType.i32 },
    });
    cachedLib = {
      dup: (fd) => lib.symbols.dup(fd) as number,
      dup2: (from, to) => lib.symbols.dup2(from, to) as number,
      isatty: (fd) => lib.symbols.isatty(fd) as number,
    };
  } catch {
    cachedLib = null;
  }
  return cachedLib;
}

/** True when this platform can take ownership (the unit tests assert on it). */
export function canOwnTerminal(): boolean {
  return libc() !== null;
}

/**
 * Take ownership of fd 1 and fd 2. Returns null when the platform or libc
 * cannot do it — the caller then keeps its JS-property patches as the only
 * defence.
 */
export function ownTerminal(): TerminalOwnership | null {
  const l = libc();
  if (!l) return null;

  // No TTY on stdout ⇒ there is no terminal to own. This matters in two real
  // cases: `bun test` (which drives openTerm with stubbed sinks) and any future
  // non-interactive caller. Redirecting fds that are a pipe or a file would
  // quietly swallow output that is SUPPOSED to go there.
  //
  // `isatty(1)`, NOT `process.stdout.isTTY`: reading that JS property makes Bun
  // CONSTRUCT its stdout sink, which caches the descriptor it was given. Every
  // later `process.stdout.write` then goes to the cached handle instead of fd 1,
  // straight past the redirect below — measured: the capture file stayed at 0
  // bytes while the text reached the terminal. Asking libc touches no JS object,
  // so there is nothing to initialize.
  try {
    if (l.isatty(1) !== 1) return null;
  } catch {
    return null;
  }


  const capturePath = join(tmpdir(), `fox-capture-${process.pid}-${Date.now().toString(36)}.log`);
  let capFd: number;
  try {
    capFd = openSync(capturePath, "w+");
  } catch {
    return null;
  }

  // dup BEFORE dup2: these are the last remaining handles on the real terminal.
  // TWO of them, one per descriptor we are about to overwrite: fd 1 carries the
  // frames, fd 2 carries everything printed AFTER the TUI comes down (the resume
  // hint, the captured-output panel). Restoring only fd 1 left fd 2 pointing at
  // the capture file this function then unlinks, so all of that was written into
  // a deleted file and the user never saw it.
  const ownerFd = l.dup(1);
  if (ownerFd < 0) {
    try {
      closeSync(capFd);
      unlinkSync(capturePath);
    } catch {}
    return null;
  }
  const ownerFd2 = l.dup(2);
  if (ownerFd2 < 0) {
    // without both, take neither: a half-restored terminal is worse than none
    try {
      closeSync(ownerFd);
      closeSync(capFd);
      unlinkSync(capturePath);
    } catch {}
    return null;
  }

  // fd 1 and fd 2 both point at the capture file. They share one open file
  // description, so their writes interleave in real order — which is what makes
  // the captured text readable rather than two interleaved streams.
  if (l.dup2(capFd, 1) < 0 || l.dup2(capFd, 2) < 0) {
    l.dup2(ownerFd, 1);
    l.dup2(ownerFd2, 2);
    try {
      closeSync(ownerFd);
      closeSync(ownerFd2);
      closeSync(capFd);
      unlinkSync(capturePath);
    } catch {}
    return null;
  }

  let pending = "";
  let offset = 0;
  let restored = false;

  /** Read from `offset` to the current end; advance past what was read. */
  const readNew = (): string => {
    let size = 0;
    try {
      size = statSync(capturePath).size;
    } catch {
      return "";
    }
    if (size <= offset) return "";
    const buf = new Uint8Array(size - offset);
    let n = 0;
    try {
      n = readSync(capFd, buf, 0, buf.length, offset);
    } catch {
      return "";
    }
    if (n <= 0) return "";
    offset += n;
    return new TextDecoder().decode(buf.subarray(0, n));
  };

  return {
    capturePath,
    ownerFd,
    write(s: string) {
      pending += s;
    },
    flush() {
      if (!pending) return;
      const chunk = pending;
      pending = "";
      try {
        // one syscall per frame, not one per control sequence
        writeSync(ownerFd, chunk);
      } catch {
        /* the terminal went away: nothing useful to do, never throw into a frame */
      }
    },
    drain: readNew,
    restore(): string {
      if (restored) return "";
      restored = true;
      // flush the last frame BEFORE the descriptor goes back, so no part of the
      // teardown sequence can land in the capture file
      this.flush();
      const tail = readNew();
      // BOTH descriptors: everything printed after the TUI comes down — the
      // resume hint, the captured-output panel, a plugin's parting message —
      // goes through stderr, and restoring only fd 1 sent all of it into the
      // capture file unlinked two lines below.
      try {
        l.dup2(ownerFd, 1);
        l.dup2(ownerFd2, 2);
      } catch {}
      try {
        closeSync(ownerFd);
        closeSync(ownerFd2);
      } catch {}
      try {
        closeSync(capFd);
      } catch {}
      try {
        unlinkSync(capturePath);
      } catch {}
      return tail;
    },
  };
}
