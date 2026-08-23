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

export function openTerm(): Term {
  const out = Bun.stdout.writer({ highWaterMark: 1 << 16 });
  const stdin = process.stdin;
  const wasRaw = stdin.isRaw ?? false;

  let cached = ttySize() ?? { width: 80, height: 24 };

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
      const fresh = ttySize();
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
        const s = ttySize();
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
      stdin.on("data", (chunk: Uint8Array) => cb(chunk));
    },
    begin() {
      // alt screen, hide cursor, bracketed paste, mouse press + SGR encoding
      out.write("\x1b[?1049h\x1b[2J\x1b[H\x1b[?25l\x1b[?2004h\x1b[?1000h\x1b[?1006h");
    },
    end() {
      out.write("\x1b[?1006l\x1b[?1000l\x1b[?2004l\x1b[?25h\x1b[?1049l");
      try {
        stdin.setRawMode(wasRaw);
      } catch {}
      out.flush();
    },
  };
}
