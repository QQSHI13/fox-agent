// stdin byte-stream decoder: CSI keys, ctrl combos, bracketed paste, SGR mouse
export type Key =
  | { type: "char"; ch: string }
  | { type: "named"; name: string; ctrl?: boolean; meta?: boolean }
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
    const name = CSI.get(seq) ?? CSI.get(m[2]);
    if (name) emit({ type: "named", name });
    return true;
  }

  return { feed };
}
