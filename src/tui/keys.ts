// stdin byte-stream decoder: CSI keys, ctrl combos, bracketed paste, SGR mouse
export type Key =
  | { type: "char"; ch: string }
  | { type: "named"; name: string; ctrl?: boolean; meta?: boolean; shift?: boolean }
  /**
   * Left button, as three distinct events rather than one.
   *
   * The decoder used to collapse all of this into a single `click` on *press*
   * and silently drop the release, which made a drag indistinguishable from a
   * tap: the thinking box collapsed the instant the button went down, and there
   * was no motion stream to select text with. `down`/`drag`/`up` is the minimum
   * that lets a consumer tell "clicked here" from "dragged from here to there".
   */
  | { type: "mouse"; action: "down" | "drag" | "up"; x: number; y: number }
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

/**
 * ECMA-48 byte classes for an escape sequence: `CSI P... I... F`.
 *
 * The decoder used to accept only `[0-9;?<>=]*` for parameters and `[A-Za-z~]`
 * as the final byte, which is most of what a keyboard sends but not all of what
 * a *terminal* sends. `ESC [ ?1000;1$y` (a DECRQM mode report) has a `$`
 * intermediate and matched nothing — see `skipUnparsed`.
 */
const isParam = (c: string) => c >= "\x30" && c <= "\x3f"; // 0-9 : ; < = > ?
const isIntermediate = (c: string) => c >= "\x20" && c <= "\x2f"; // space ! " # $ % & ' ( ) * + , - . /
const isFinal = (c: string) => c >= "\x40" && c <= "\x7e"; // @ A-Z [ \ ] ^ _ ` a-z { | } ~

/**
 * How long an unterminated bracketed paste may stay quiet before we stop
 * believing in it. Generous, because a multi-megabyte paste arrives in many
 * chunks over a slow pty — but bounded, because the alternative is a decoder
 * that never emits another key.
 */
const PASTE_GRACE_MS = 400;

export function createDecoder(emit: (k: Key) => void) {
  let buf = "";
  let lastArrival = Date.now();
  let flushTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * Re-drive the decoder shortly after a burst ends.
   *
   * `moreComing()` makes an incomplete escape sequence wait for the rest of its
   * bytes, which is right — but nothing was ever scheduled to look again, so
   * "wait" meant "wait until the user presses another key". A lone `Esc` emitted
   * nothing until the *next* keystroke (measured), which is why esc-to-interrupt
   * felt unreliable, and an unterminated report sat in front of real input.
   */
  function scheduleFlush(delay = 15) {
    if (flushTimer) return;
    flushTimer = setTimeout(() => {
      flushTimer = null;
      if (!buf.length) return;
      drain();
    }, delay);
    flushTimer.unref?.();
  }

  function drain() {
    let guard = 0;
    while (buf.length && guard++ < 8192) {
      if (!consume()) break;
    }
    // A buffer this deep is a decoder that has lost sync, not real typing.
    if (guard >= 8192) buf = "";
    if (buf.length) scheduleFlush();
  }

  function feed(chunk: Uint8Array) {
    lastArrival = Date.now();
    buf += new TextDecoder().decode(chunk);
    drain();
  }

  function moreComing(): boolean {
    return Date.now() - lastArrival < 12;
  }

  /**
   * Give up on an escape sequence we cannot parse — dropping ONLY its own bytes.
   *
   * The bug this exists to prevent: `consume()` returning false leaves the
   * unparsed prefix at the head of the buffer, and `feed` breaks its loop on
   * false, so every keystroke arriving afterwards queues up behind it and is
   * never emitted. One unrecognized terminal reply (measured: `ESC [ ?1000;1$y`,
   * a DECRQM mode report, whose `$` intermediate the old CSI pattern did not
   * cover) killed the keyboard for the whole session. Wiping the entire buffer
   * instead is no better — it eats whatever the user already typed, which is the
   * "backspace only works if I hold it down" symptom.
   *
   * So consume exactly the malformed sequence — ESC, `[`, and any bytes that are
   * structurally part of a CSI (parameters, then intermediates, then one final
   * byte) — and let real keystrokes behind it through. A dropped escape sequence
   * is invisible; a dropped keystroke is not.
   */
  function skipUnparsed(): boolean {
    if (moreComing()) return false; // the rest of it may still be arriving
    let i = buf[1] === "[" || buf[1] === "]" || buf[1] === "P" ? 2 : 1;
    while (i < buf.length && isParam(buf[i])) i++;
    while (i < buf.length && isIntermediate(buf[i])) i++;
    if (i < buf.length && isFinal(buf[i])) i++;
    buf = buf.slice(Math.max(1, i));
    return true;
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

  /**
   * Consume a string-type escape (OSC / DCS / APC / SOS / PM) and emit nothing.
   *
   * These carry no key information, but terminals send them unsolicited — an OSC
   * color reply, a DCS version string. Without this, `ESC ] 11;rgb:1/2/3 BEL`
   * decoded as `escape` followed by the literal characters `]11;rgb:1/2/3` being
   * typed into the input box (measured). They end at BEL or ST (`ESC \`).
   */
  function consumeString(): boolean {
    const bel = buf.indexOf("\x07", 2);
    const st = buf.indexOf("\x1b\\", 2);
    if (st >= 0 && (bel < 0 || st < bel)) {
      buf = buf.slice(st + 2);
      return true;
    }
    if (bel >= 0) {
      buf = buf.slice(bel + 1);
      return true;
    }
    // terminator not here yet; wait unless the burst is over
    if (moreComing()) return false;
    return skipUnparsed();
  }

  function consume(): boolean {
    const pStart = buf.indexOf("\x1b[200~");
    if (pStart === 0) {
      const pEnd = buf.indexOf("\x1b[201~", 5);
      if (pEnd < 0) {
        // A paste can legitimately span many chunks, so wait — but not forever.
        // A start marker whose terminator never arrives (a truncated paste, a
        // terminal that dropped it) would otherwise strand every later keystroke.
        // Waiting on quiet rather than on a byte count: a large paste is slow to
        // arrive but never goes quiet mid-transfer.
        if (Date.now() - lastArrival < PASTE_GRACE_MS) {
          scheduleFlush(PASTE_GRACE_MS);
          return false;
        }
        // Drop only the start marker and re-read the rest as ordinary input, so
        // the text that did arrive is kept instead of silently discarded.
        buf = buf.slice(6);
        return true;
      }
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
      // With ?1002h the terminal also reports motion while a button is held, as
      // the button code + 32 (bit 5 = "this is a drag"). Wheel is 64/65 and is
      // not a button at all, so it is matched first.
      if (btn === 64) emit({ type: "named", name: "wheelup" });
      else if (btn === 65) emit({ type: "named", name: "wheeldown" });
      else if (mm[4] === "m") emit({ type: "mouse", action: "up", x, y });
      else if (btn === 32) emit({ type: "mouse", action: "drag", x, y });
      else if (btn === 0) emit({ type: "mouse", action: "down", x, y });
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
    // string-type escapes carry no keys and must not reach emitChar
    if (buf[1] === "]" || buf[1] === "P" || buf[1] === "_" || buf[1] === "X" || buf[1] === "^") {
      return consumeString();
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
      // Either still arriving, or a sequence this decoder has no meaning for (a
      // terminal report). Drop just that sequence — never the keys behind it.
      return skipUnparsed();
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
