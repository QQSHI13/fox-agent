// raw-mode terminal control: alt screen, synchronized output, resize events
import { dlopen, FFIType, ptr } from "bun:ffi";

export interface Term {
  write(s: string): void;
  flush(): void;
  size(): { width: number; height: number };
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

function ttySize(): { width: number; height: number } | null {
  const req = process.platform === "darwin" ? TIOCGWINSZ_DARWIN : TIOCGWINSZ_LINUX;
  for (const fd of [1, 0, 2]) {
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
    // node-style API fallback
    try {
      const ws = (process.stdout as any).getWindowSize?.();
      if (ws && ws[0] > 0) return { width: ws[0], height: ws[1] };
    } catch {}
    if (process.stdout.columns && process.stdout.rows)
      return { width: process.stdout.columns, height: process.stdout.rows };
  }
  return null;
}

/**
 * Reconcile independent size reports: if sources disagree (zoom, WSL relay
 * quirks), trust the SMALLER — laying out too wide causes terminal-side
 * wrapping that shreds the absolute-positioned grid; too narrow is benign.
 */
function safeSize(): { width: number; height: number } | null {
  const primary = ttySize();
  const altCols = (process.stdout as any).columns ?? 0;
  const altRows = (process.stdout as any).rows ?? 0;
  if (!primary) return altCols ? { width: altCols, height: altRows } : null;
  if (altCols > 0 && altCols < primary.width) return { width: altCols, height: Math.min(primary.height, altRows || primary.height) };
  return primary;
}

export function openTerm(): Term {
  const out = Bun.stdout.writer({ highWaterMark: 1 << 16 });
  const stdin = process.stdin;
  const wasRaw = stdin.isRaw ?? false;
  /** the live `data` listener, kept so `end()` can detach it (see end()) */
  let onData: ((chunk: Uint8Array) => void) | null = null;

  let cached = safeSize() ?? { width: 80, height: 24 };

  return {
    write(s: string) {
      out.write(s);
    },
    flush() {
      try {
        out.flush();
      } catch {}
    },
    size() {
      const fresh = safeSize();
      if (fresh) cached = fresh;
      return cached;
    },
    setCursor(x: number, y: number) {
      // position + DECTCEM show; called every frame after content flush so
      // the native blinking caret IS the input caret (no fake block glyph).
      // BUFFERED on purpose: flushing here splits one frame into several
      // writes, and on slow PTYs (WSL2!) the hardware cursor visibly marches
      // through the grid diff before landing — the "cursor flies" bug. The
      // caller flushes once at end of frame.
      out.write(`\x1b[${Math.min(999, Math.max(1, y + 1))};${Math.min(999, Math.max(1, x + 1))}H\x1b[?25h`);
    },
    hideCursor() {
      out.write("\x1b[?25l");
    },
    progress(state, pct) {
      // OSC 9;4 (ConEmu / Windows Terminal / WezTerm / kitty): tab + taskbar
      // progress. Buffered like setCursor — the frame loop flushes once.
      const p = state === 1 && typeof pct === "number" ? `;${Math.max(0, Math.min(100, Math.round(pct)))}` : ";0";
      out.write(`\x1b]9;4;${state}${p}\x07`);
    },
    notify(msg) {
      // OSC 9: a growl-style toast from the terminal itself. Strip control
      // characters — the payload is inside an escape sequence, and a stray
      // ESC/ BEL from model output would truncate or corrupt it.
      const clean = msg.replace(/[\x00-\x1f\x07\x7f]/g, " ").slice(0, 200);
      out.write(`\x1b]9;${clean}\x07`);
    },
    setCwd(dir) {
      // OSC 7 — file:// URL, hostname empty ("file://hostname/path" with no
      // host is the form terminals accept; they fill in their own view)
      try {
        out.write(`\x1b]7;file://${encodeURI(dir)}\x07`);
      } catch {}
    },
    setTitle(title) {
      // OSC 0 sets icon+window title (universally supported); same sanitize
      // rule as notify — control chars would truncate the sequence
      const clean = title.replace(/[\x00-\x1f\x07\x7f]/g, " ").slice(0, 120);
      out.write(`\x1b]0;${clean}\x07`);
    },
    onResize(cb) {
      const handler = () => {
        const s = safeSize();
        if (s) {
          cached = s;
          cb(s.width, s.height);
        }
      };
      (process.stdout as any).on?.("resize", handler);
      setInterval(handler, 1000).unref?.();
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
      out.write("\x1b[?1049h\x1b[2J\x1b[H\x1b[?25l\x1b[?2004h\x1b[?1000h\x1b[?1002h\x1b[?1006h\x1b[?7l");
    },
    end() {
      // \x1b[0m FIRST: the last frame may have left a colored SGR active (the
      // status bar's background, an error's red), and without a reset the shell
      // prompt and everything the user types next inherits it — the "exit left
      // the terminal red" bug. Reset before leaving the alt screen so even the
      // restore sequence itself is unstyled.
      out.write("\x1b[0m\x1b[?7h\x1b[?1006l\x1b[?1002l\x1b[?1000l\x1b[?2004l\x1b[?25h\x1b[?1049l\x1b[0m");
      try {
        stdin.setRawMode(wasRaw);
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
      out.flush();
    },
  };
}
