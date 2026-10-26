/**
 * Capture file descriptor 2 at the OS level for the TUI's lifetime.
 *
 * ## Why this exists
 *
 * The TUI's stray-output quarantine (`src/tui/app.ts`) replaces JS properties:
 * `process.stderr.write`, `console.error`, `Bun.stderr.write`. That is a filter
 * on *function calls made through this process's JS objects* — and everything
 * that is not such a call goes straight to the terminal:
 *
 *   - a child spawned with `stderr: "inherit"` writes to the fd itself;
 *   - a native library (FFI, a bundled `.node`) writes to fd 2;
 *   - a dependency holding its own `FileSink`/`process.stderr` reference from
 *     before the patch, or writing via `Bun.stderr.writer()`.
 *
 * When any of those lands on the grid it is unrecoverable by ordinary means:
 * the alternate screen has no scrollback, and `Screen.flush()` compares each
 * row against `prevHash`, finds the buffer "already correct", and writes
 * nothing — so the scribble persists until something forces a full repaint.
 * That is the black, textless input dock.
 *
 * ## What this does
 *
 * `dup(2)` to keep the real terminal, then `dup2(tempfile, 2)`. Now fd 2 IS a
 * file. Every one of the channels above writes there instead of to the screen,
 * because they all ultimately write to fd 2 — including a child that inherited
 * it. The TUI's own painting is unaffected: it goes to fd 1 via
 * `Bun.stdout.writer()` (see `term.ts`).
 *
 * The captured text is drained on a timer into the debug log, so diagnostics
 * survive without the pixels.
 *
 * ## When it cannot work
 *
 * Non-Unix, or a libc that will not dlopen: `quietStderr()` returns null and
 * the caller keeps the JS-property patches as the only defence. It is a
 * best-effort hardening layer, never a failure path.
 */
import { dlopen, FFIType } from "bun:ffi";
import { closeSync, openSync, readSync, statSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface QuietStderr {
  /** Text written to fd 2 since the previous call. Never throws. */
  drain(): string;
  /** Put the real fd 2 back and return whatever is left. Idempotent. */
  restore(): string;
  /** where the captured bytes live, for a "full text at …" message */
  readonly path: string;
}

interface Libc {
  dup(fd: number): number;
  dup2(from: number, to: number): number;
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
    });
    cachedLib = {
      dup: (fd) => lib.symbols.dup(fd) as number,
      dup2: (from, to) => lib.symbols.dup2(from, to) as number,
    };
  } catch {
    cachedLib = null;
  }
  return cachedLib;
}

/** True when this platform can redirect the fd (the unit tests assert on it). */
export function canQuietStderr(): boolean {
  return libc() !== null;
}

/**
 * Redirect fd 2 into a temp file. Returns null when the platform or libc
 * cannot do it — the caller then relies on the JS patches alone.
 */
export function quietStderr(): QuietStderr | null {
  const l = libc();
  if (!l) return null;

  const path = join(tmpdir(), `fox-stderr-${process.pid}-${Date.now().toString(36)}.log`);
  let tmpFd: number;
  try {
    tmpFd = openSync(path, "w+");
  } catch {
    return null;
  }

  // dup BEFORE dup2: `saved` is a private handle on the real terminal
  const saved = l.dup(2);
  if (saved < 0) {
    try {
      closeSync(tmpFd);
      unlinkSync(path);
    } catch {}
    return null;
  }
  if (l.dup2(tmpFd, 2) < 0) {
    try {
      closeSync(saved);
      closeSync(tmpFd);
      unlinkSync(path);
    } catch {}
    return null;
  }

  let offset = 0;
  let restored = false;

  /** Read from `offset` up to the current end; advance past what was read. */
  const readNew = (): string => {
    let size = 0;
    try {
      size = statSync(path).size;
    } catch {
      return "";
    }
    if (size <= offset) return "";
    const buf = new Uint8Array(size - offset);
    let n = 0;
    try {
      n = readSync(tmpFd, buf, 0, buf.length, offset);
    } catch {
      return "";
    }
    if (n <= 0) return "";
    offset += n;
    return new TextDecoder().decode(buf.subarray(0, n));
  };

  return {
    path,
    drain: readNew,
    restore(): string {
      if (restored) return "";
      restored = true;
      // read BEFORE putting the terminal back, so nothing is lost in between
      const tail = readNew();
      try {
        l.dup2(saved, 2);
      } catch {}
      try {
        closeSync(saved);
      } catch {}
      try {
        closeSync(tmpFd);
      } catch {}
      try {
        unlinkSync(path);
      } catch {}
      return tail;
    },
  };
}
