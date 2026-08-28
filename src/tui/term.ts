// raw-mode terminal control: alt screen, synchronized output, resize events
import { dlopen, FFIType, ptr } from "bun:ffi";

export interface Term {
  write(s: string): void;
  flush(): void;
  size(): { width: number; height: number };
  onResize(cb: (w: number, h: number) => void): void;
  onKey(cb: (data: Uint8Array) => void): void;
  /** move the real terminal cursor (1-based internals hidden) and ensure visible */
  setCursor(x: number, y: number): void;
  /** hide the hardware cursor (call before repaint bursts) */
  hideCursor(): void;
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
      // the native blinking caret IS the input caret (no fake block glyph)
      out.write(`\x1b[${Math.min(999, Math.max(1, y + 1))};${Math.min(999, Math.max(1, x + 1))}H\x1b[?25h`);
      try {
        out.flush();
      } catch {}
    },
    hideCursor() {
      out.write("\x1b[?25l");
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
      out.write("\x1b[?7h\x1b[?1006l\x1b[?1002l\x1b[?1000l\x1b[?2004l\x1b[?25h\x1b[?1049l");
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
