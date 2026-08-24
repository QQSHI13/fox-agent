// stdin byte-stream decoder: CSI keys, ctrl combos, bracketed paste, SGR mouse
export type Key =
  | { type: "char"; ch: string }
  | { type: "named"; name: string; ctrl?: boolean; meta?: boolean; shift?: boolean }
  | { type: "click"; x: number; y: number }
  | { type: "paste"; text: string };

const CSI = new Map<string, string>([
  ["A", "up"],
  ["B", "down"],
  ["C", "right"],
  ["D", "left"],
  ["H", "home"],
  ["F", "end"],
  ["Z", "shifttab"],
  ["1~", "home"],
  ["2~", "insert"],
  ["3~", "delete"],
  ["4~", "end"],
  ["5~", "pageup"],
  ["6~", "pagedown"],
]);

/**
 * xterm encodes modifiers as a second CSI parameter, 1 + a bitmask:
 * shift=1, alt=2, ctrl=4. So ctrl+right is ESC [ 1 ; 5 C and alt+shift+up
 * is ESC [ 1 ; 4 A. Without decoding this, ctrl+left arrives looking exactly
 * like a bare left.
 */
function modsOf(param: string | undefined): { ctrl?: boolean; meta?: boolean; shift?: boolean } {
  const n = Number(param);
  if (!Number.isFinite(n) || n < 2) return {};
  const bits = n - 1;
  const out: { ctrl?: boolean; meta?: boolean; shift?: boolean } = {};
  if (bits & 1) out.shift = true;
  if (bits & 2) out.meta = true;
  if (bits & 4) out.ctrl = true;
  return out;
}

export function createDecoder(emit: (k: Key) => void) {
  let buf = "";
  let lastArrival = Date.now();

  function feed(chunk: Uint8Array) {
    lastArrival = Date.now();
    buf += new TextDecoder().decode(chunk);
    let guard = 0;
    while (buf.length && guard++ < 8192) {
      if (!consume()) break;
    }
    if (guard >= 8192) buf = "";
  }

  function moreComing(): boolean {
    return Date.now() - lastArrival < 12;
  }

  function emitChar(c: string) {
    const code = c.codePointAt(0)!;
    if (code === 13 || code === 10) return void emit({ type: "named", name: "return" });
    if (code === 127 || code === 8) return void emit({ type: "named", name: "backspace" });
    if (code === 9) return void emit({ type: "named", name: "tab" });
    if (code < 27) {
      const names: Record<number, string> = { 3: "c", 4: "d", 14: "t", 22: "v" };
      const n = names[code];
      if (n) return void emit({ type: "named", name: n, ctrl: true });
      return void emit({ type: "named", name: `ctrl-${String.fromCharCode(96 + code)}`, ctrl: true });
    }
    if (code >= 32) emit({ type: "char", ch: c });
  }

  function consume(): boolean {
    const pStart = buf.indexOf("\x1b[200~");
    if (pStart === 0) {
      const pEnd = buf.indexOf("\x1b[201~", 5);
      if (pEnd < 0) return false;
      if (pEnd > 5) emit({ type: "paste", text: buf.slice(6, pEnd).replace(/\r\n?/g, "\n") });
      buf = buf.slice(pEnd + 6);
      return true;
    }

    const b0 = buf[0];
    if (b0 !== "\x1b") {
      emitChar(b0);
      buf = buf.slice(1);
      return true;
    }

    // SGR mouse: ESC [ < btn ; x ; y (M=press/motion | m=release), 1-based coords
    const mm = /^\x1b\[<(\d+);(\d+);(\d+)([Mm])/.exec(buf);
    if (mm) {
      const btn = Number(mm[1]);
      const x = Number(mm[2]) - 1;
      const y = Number(mm[3]) - 1;
      buf = buf.slice(mm[0].length);
      if (mm[4] === "M") {
        if (btn === 64) emit({ type: "named", name: "wheelup" });
        else if (btn === 65) emit({ type: "named", name: "wheeldown" });
        else if (btn === 0) emit({ type: "click", x, y });
      }
      return true;
    }

    if (buf.length === 1) {
      if (!moreComing()) {
        emit({ type: "named", name: "escape" });
        buf = "";
        return true;
      }
      return false;
    }
    if (buf[1] !== "[") {
      // ESC followed by a plain char: alt+key or bare escape
      if (buf[1] === "O") {
        const n = CSI.get(buf[2]);
        if (n && buf.length >= 3) {
          emit({ type: "named", name: n });
          buf = buf.slice(3);
          return true;
        }
      }
      emit({ type: "named", name: "escape" });
      buf = buf.slice(1);
      return true;
    }

    const m = /^\x1b\[([0-9;?<>=]*)([A-Za-z~])/.exec(buf);
    if (!m) {
      if (!moreComing()) {
        emit({ type: "named", name: "escape" });
        buf = "";
        return true;
      }
      return false;
    }
    const seq = m[1] + m[2];
    buf = buf.slice(m[0].length);
    // params are "1;5" for modified arrows/home/end, "3;5" for modified ~-keys
    const params = m[1].split(";");
    const mods = modsOf(params[1]);
    // for a modified key the lookup key is the final char (arrows) or
    // "<n>~" (tilde keys); the raw seq only matches when unmodified
    const tilde = m[2] === "~" ? `${params[0]}~` : undefined;
    const name = CSI.get(seq) ?? (tilde ? CSI.get(tilde) : undefined) ?? CSI.get(m[2]);
    if (name) emit({ type: "named", name, ...mods });
    return true;
  }

  return { feed };
}
