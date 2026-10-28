// raw-mode terminal control: alt screen, synchronized output, resize events
import { dlopen, FFIType, ptr } from "bun:ffi";
import { ownTerminal, type TerminalOwnership } from "./own.ts";

export interface Term {
  write(s: string): void;
  flush(): void;
  size(): { width: number; height: number };
  /**
   * Output that OTHER writers put on fd 1/2 since the last call — the TUI owns
   * the descriptors, so anything not drawn by this Term lands in the capture
   * file instead of on the screen (see own.ts). Empty when ownership could not
   * be taken and the JS-property patches are doing the work instead.
   */
  drainCaptured(): string;
  /** Where that captured output is accumulating, or null without ownership. */
  capturePath(): string | null;
  onResize(cb: (w: number, h: number) => void): void;
  onKey(cb: (data: Uint8Array) => void): void;
  /** tap raw stdin alongside onKey (OSC 52 read replies); returns an off fn */
  onDataRaw(cb: (chunk: Uint8Array) => void): () => void;
  /** move the real terminal cursor (1-based internals hidden) and ensure visible */
  setCursor(x: number, y: number): void;
  /** hide the hardware cursor (call before repaint bursts) */
  hideCursor(): void;
  /**
   * OSC 9;4 taskbar/terminal progress: state 0 remove, 1 normal, 2 error,
   * 3 indeterminate; `pct` 0-100 when the state is 1, omitted otherwise.
   * Terminals that do not know the sequence ignore it — no capability probe
   * needed.
   */
  progress(state: 0 | 1 | 2 | 3, pct?: number): void;
  /** OSC 9 desktop notification (works over SSH, no helper installed) */
  notify(msg: string): void;
  /**
   * OSC 7: report the working directory as a file:// URL so the terminal can
   * spawn new tabs/windows in the same directory (iTerm2, WezTerm, GNOME
   * Terminal). Ignored by terminals that do not know the sequence.
   */
  setCwd(dir: string): void;
  /**
   * OSC 0/2: set the window/tab title. Suggested header formats:
   *   idle:    `fox — <session label>`
   *   running: `▶ fox — <session label> — <tool or 'working'>`
   *   failed:  `✗ fox — <session label>`
   * Keep it one line, no control characters (sanitized like notify).
   */
  setTitle(title: string): void;
  begin(): void;
  end(): void;
}

// winsize = { u16 rows, u16 cols, u16 xpixel, u16 ypixel }
const TIOCGWINSZ_LINUX = 0x5413;
const TIOCGWINSZ_DARWIN = 0x40087468;

let ioctlSym: ((fd: number, req: number, arg: any) => number) | null = null;
function loadIoctl() {
  if (ioctlSym) return ioctlSym;
  try {
    const path = process.platform === "darwin" ? "libSystem.dylib" : "libc.so.6";
    const lib = dlopen(path, { ioctl: { args: [FFIType.i32, FFIType.u64, FFIType.ptr], returns: FFIType.i32 } });
    ioctlSym = lib.symbols.ioctl as any;
  } catch {
    ioctlSym = null;
  }
  return ioctlSym;
}

function ttySize(ownerFd?: number): { width: number; height: number } | null {
  const req = process.platform === "darwin" ? TIOCGWINSZ_DARWIN : TIOCGWINSZ_LINUX;
  // ownerFd FIRST: once the TUI owns the terminal, fd 1 is a capture file and
  // ioctl on it answers for a regular file, not the tty.
  const fds = ownerFd !== undefined ? [ownerFd, 0] : [1, 0, 2];
  for (const fd of fds) {
    const ioctl = loadIoctl();
    if (ioctl) {
      try {
        const buf = new Uint8Array(8);
        if (ioctl(fd, req, ptr(buf)) === 0) {
          const rows = buf[0] | (buf[1] << 8);
          const cols = buf[2] | (buf[3] << 8);
          if (cols > 0 && rows > 0) return { width: cols, height: rows };
        }
      } catch {}
    }
  }
  // node-style API fallback (same answer every iteration — kept after the fd
  // loop, so ioctl on any fd gets first refusal)
  try {
    const ws = (process.stdout as any).getWindowSize?.();
    if (ws && ws[0] > 0) return { width: ws[0], height: ws[1] };
  } catch {}
  if (process.stdout.columns && process.stdout.rows)
    return { width: process.stdout.columns, height: process.stdout.rows };
  return null;
}

/**
 * Reconcile independent size reports: if sources disagree (zoom, WSL relay
 * quirks), trust the SMALLER — laying out too wide causes terminal-side
 * wrapping that shreds the absolute-positioned grid; too narrow is benign.
 *
 * The cross-check ONLY applies before ownership. `process.stdout.columns` is a
 * snapshot Bun takes when it first constructs its stdout sink — any earlier
 * console.log, any library touching process.stdout, freezes it at the boot
 * size. Once `ownTerminal()` has pointed fd 1 at the capture file, the snapshot
 * can never change again, so "trust the smaller" pinned the layout permanently:
 * shrinking the window repainted, growing it did nothing (the exact "fox does
 * not resize" bug — and it was intermittent, because a run where nothing had
 * touched process.stdout saw `columns === undefined` and skipped the check).
 *
 * Exported for the regression test in test/term.test.ts: the rule is pure, and
 * reproducing it against a real tty needs a pty.
 */
export function reconcileSize(
  primary: { width: number; height: number } | null,
  altCols: number,
  altRows: number,
  owned: boolean,
): { width: number; height: number } | null {
  if (!primary) return altCols ? { width: altCols, height: altRows } : null;
  // the owner's ioctl is the one honest answer; the JS cache is stale by design
  if (owned) return primary;
  if (altCols > 0 && altCols < primary.width) return { width: altCols, height: Math.min(primary.height, altRows || primary.height) };
  return primary;
}

function safeSize(ownerFd?: number): { width: number; height: number } | null {
  const altCols = (process.stdout as any).columns ?? 0;
  const altRows = (process.stdout as any).rows ?? 0;
  return reconcileSize(ttySize(ownerFd), altCols, altRows, ownerFd !== undefined);
}

export function openTerm(): Term {
  /**
   * Take the terminal before anything else runs. From here on fd 1 and fd 2 are
   * a capture file: every other writer in this process, every child it spawns,
   * and every native library is structurally unable to reach the screen — only
   * `owner.write()`/`owner.flush()` can, through a private descriptor no child
   * inherits. See own.ts for why the JS-property patches alone are not enough.
   *
   * Null on a platform without libc: the caller keeps `Bun.stdout.writer()`
   * and relies on the patches. Hardening that can fail must not fail the TUI.
   */
  const owner: TerminalOwnership | null = ownTerminal();
  const out = owner ? null : Bun.stdout.writer({ highWaterMark: 1 << 16 });
  const ownerFd = owner?.ownerFd;
  const stdin = process.stdin;
  const wasRaw = stdin.isRaw ?? false;
  /** the live `data` listener, kept so `end()` can detach it (see end()) */
  let onData: ((chunk: Uint8Array) => void) | null = null;

  let cached = safeSize(ownerFd) ?? { width: 80, height: 24 };
  /** the resize poll interval, cleared in end() — an uncleared handle kept the
   *  event loop alive after the TUI was gone */
  let resizeTimer: ReturnType<typeof setInterval> | null = null;
  /** the SIGWINCH handler, detached in end() for the same reason */
  let onWinch: (() => void) | null = null;

  /** the single write path: the owner's private fd, or the fallback sink */
  const emit = (s: string) => {
    if (owner) owner.write(s);
    else out!.write(s);
  };

  /**
   * Captured output not yet handed to the caller. Filled by the final
   * `owner.restore()` drain in `end()`, so nothing written between the last
   * timer drain and the descriptor swap is lost.
   */
  let leftover = "";

  return {
    write(s: string) {
      emit(s);
    },
    flush() {
      try {
        if (owner) owner.flush();
        else out!.flush();
      } catch {}
    },
    drainCaptured(): string {
      if (leftover) {
        const l = leftover;
        leftover = "";
        return l;
      }
      return owner ? owner.drain() : "";
    },
    capturePath(): string | null {
      return owner?.capturePath ?? null;
    },
    size() {
      const fresh = safeSize(ownerFd);
      if (fresh) cached = fresh;
      return cached;
    },
    setCursor(x: number, y: number) {
      // position + DECTCEM show; called every frame after content flush so
      // the native blinking caret IS the input caret (no fake block glyph).
      // BUFFERED on purpose: flushing here splits one frame into several
      // writes, and on slow PTYs (WSL2!) the hardware cursor visibly marches
      // through the grid diff before landing — the "cursor flies" bug.
      // The caller flushes once at end of frame.
      emit(`\x1b[${Math.min(999, Math.max(1, y + 1))};${Math.min(999, Math.max(1, x + 1))}H\x1b[?25h`);
    },
    hideCursor() {
      emit("\x1b[?25l");
    },
    progress(state, pct) {
      // OSC 9;4 (ConEmu / Windows Terminal / WezTerm / kitty): tab + taskbar
      // progress. Buffered like setCursor — the frame loop flushes once.
      const p = state === 1 && typeof pct === "number" ? `;${Math.max(0, Math.min(100, Math.round(pct)))}` : ";0";
      emit(`\x1b]9;4;${state}${p}\x07`);
    },
    notify(msg) {
      // OSC 9: a growl-style toast from the terminal itself. Strip control
      // characters — the payload is inside an escape sequence, and a stray
      // ESC/ BEL from model output would truncate or corrupt it.
      const clean = msg.replace(/[\x00-\x1f\x07\x7f]/g, " ").slice(0, 200);
      emit(`\x1b]9;${clean}\x07`);
    },
    setCwd(dir) {
      // OSC 7 — file:// URL, hostname empty ("file://hostname/path" with no
      // host is the form terminals accept; they fill in their own view)
      try {
        emit(`\x1b]7;file://${encodeURI(dir)}\x07`);
      } catch {}
    },
    setTitle(title) {
      // OSC 0 sets icon+window title (universally supported); same sanitize
      // rule as notify — control chars would truncate the sequence
      const clean = title.replace(/[\x00-\x1f\x07\x7f]/g, " ").slice(0, 120);
      emit(`\x1b]0;${clean}\x07`);
    },
    onResize(cb) {
      /**
       * One report path for all three sources, deduped on the size itself.
       *
       * A resize can change EITHER dimension alone (dragging a window border
       * vertically moves only rows), so the key is the full `WxH` — a
       * width-only comparison would swallow every height change, and the
       * height-only drag is exactly the case that looked dead.
       */
      let last = "";
      const report = () => {
        const s = safeSize(ownerFd);
        if (!s) return;
        const key = `${s.width}x${s.height}`;
        if (key === last) return;
        last = key;
        cached = s;
        cb(s.width, s.height);
      };
      /**
       * `resize` on process.stdout only fires while Bun's own sink still owns
       * fd 1. After `ownTerminal()` puts a capture file there, Bun never sees a
       * WINCH again and that event stops arriving entirely — which is why the
       * poll is the load-bearing trigger. SIGWINCH makes it immediate instead of
       * up to a tick late; kept quiet on failure, since a platform that cannot
       * take the signal still has the timer.
       */
      try {
        process.on("SIGWINCH", report);
        onWinch = report;
      } catch {}
      (process.stdout as any).on?.("resize", report);
      // 250ms, not 1000: this is the reflow trigger once fd 1 is a file, and a
      // quarter second is below the threshold where a resize reads as "stuck".
      resizeTimer = setInterval(report, 250);
      resizeTimer.unref?.();
      report();
    },
    onKey(cb) {
      stdin.setRawMode(true);
      stdin.resume();
      onData = (chunk: Uint8Array) => cb(chunk);
      stdin.on("data", onData);
    },
    /**
     * Tap raw stdin bytes alongside onKey (OSC 52 read replies arrive here —
     * they are not keystrokes, and intercepting them in the key parser would
     * smear binary clipboard content through the escape-sequence state machine).
     * Returns an off function. No-op-safe when called before onKey.
     */
    onDataRaw(cb: (chunk: Uint8Array) => void): () => void {
      const handler = (chunk: Uint8Array) => cb(chunk);
      stdin.on("data", handler);
      return () => {
        stdin.off("data", handler);
      };
    },
    begin() {
      // alt screen, hide cursor, bracketed paste, mouse press + BUTTON-MOTION
      // (?1002h: motion reported only while a button is held) + SGR encoding,
      // and NO autowrap: the renderer owns an exact grid — a row that
      // overflows must clip, not wrap (wrapping shreds absolute positioning).
      //
      // ?1002h rather than ?1003h (any-motion): fox-agent needs drags, not a mouse
      // position event for every pixel of idle movement, which would wake the
      // frame loop constantly for nothing.
      emit("\x1b[?1049h\x1b[2J\x1b[H\x1b[?25l\x1b[?2004h\x1b[?1000h\x1b[?1002h\x1b[?1006h\x1b[?7l");
    },
    end() {
      // \x1b[0m FIRST: the last frame may have left a colored SGR active (the
      // status bar's background, an error's red), and without a reset the shell
      // prompt and everything the user types next inherits it — the "exit left
      // the terminal red" bug. Reset before leaving the alt screen so even the
      // restore sequence itself is unstyled.
      emit("\x1b[0m\x1b[?7h\x1b[?1006l\x1b[?1002l\x1b[?1000l\x1b[?2004l\x1b[?25h\x1b[?1049l\x1b[0m");
      try {
        stdin.setRawMode(wasRaw);
      } catch {}
      try {
        if (resizeTimer) clearInterval(resizeTimer);
        resizeTimer = null;
      } catch {}
      try {
        if (onWinch) process.off("SIGWINCH", onWinch);
        onWinch = null;
      } catch {}
      /**
       * Release stdin, or the process outlives the TUI.
       *
       * `onKey` resumes stdin and attaches a `data` listener, which makes it a
       * *referenced* event-loop handle. Restoring raw mode does not undo that,
       * so after the TUI tore down its screen the loop still had a live handle
       * and the process sat in `epoll_wait` forever — the caller's `await
       * startTui()` had returned, `shutdownTools` had finished, and fox-agent still
       * would not exit. Ctrl+C looked like it took two presses: the first
       * closed the UI, the second was the tty's SIGINT killing the husk.
       *
       * Verified with an isolated probe: a resumed stdin with a listener never
       * reaches process exit; pausing and unref'ing it exits with RC=0.
       */
      try {
        if (onData) stdin.off("data", onData);
        onData = null;
        stdin.pause();
        (stdin as unknown as { unref?: () => void }).unref?.();
      } catch {}
      /** flushed to the REAL terminal, not the capture file: the teardown
       *  sequence above must be seen by the terminal it is tearing down */
      this.flush();
      /**
       * Hand the descriptors back. This MUST happen here and not in the exit
       * panel: everything still to be printed for the user (the resume hint,
       * the captured-output panel) writes via the ORIGINAL `process.stderr`,
       * which points at fd 2 — still the capture file until this restores it.
       *
       * Whatever was captured but never drained comes back for the caller to
       * log; `drainCaptured()` keeps serving it after the restore.
       */
      if (owner) {
        leftover = owner.restore();
      }
    },
  };
}
