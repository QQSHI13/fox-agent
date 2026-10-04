// stdin byte-stream decoder: CSI keys, ctrl combos, bracketed paste, SGR mouse
export type Key =
  | { type: "char"; ch: string }
  | { type: "named"; name: string; ctrl?: boolean; meta?: boolean; shift?: boolean; x?: number; y?: number }
  /**
   * Left button, as three distinct events rather than one.
   *
   * The decoder used to collapse all of this into a single `click` on *press*
   * and silently drop the release, which made a drag indistinguishable from a
   * tap: the thinking box collapsed the instant the button went down, and there
   * was no motion stream to select text with. `down`/`drag`/`up` is the minimum
   * that lets a consumer tell "clicked here" from "dragged from here to there".
   *
   * `button` names the physical button (0 left, 1 middle, 2 right) and the
   * modifier flags ride along: xterm adds shift=4, alt=8, ctrl=16 to the SGR
   * button code, and the old decoder matched only the bare codes — so
   * shift/ctrl/alt+click produced NOTHING (no press, no drag, no selection
   * anchor). Now they decode; the app keeps its current gestures, plugins get
   * the chords.
   */
  | { type: "mouse"; action: "down" | "drag" | "up"; x: number; y: number; button: 0 | 1 | 2; shift?: boolean; meta?: boolean; ctrl?: boolean }
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
  ["11~", "f1"],
  ["12~", "f2"],
  ["13~", "f3"],
  ["14~", "f4"],
  ["15~", "f5"],
  ["17~", "f6"],
  ["18~", "f7"],
  ["19~", "f8"],
  ["20~", "f9"],
  ["21~", "f10"],
  ["23~", "f11"],
  ["24~", "f12"],
  ["29~", "menu"],
]);

/**
 * SS3 finals (`ESC O <byte>`) — a SEPARATE table from CSI on purpose. Several
 * of these bytes tail-end ordinary terminal reports (`ESC [ 6 n` is a cursor
 * position report; `ESC [ M` heads the X10 mouse encoding), so a shared map
 * would turn every report into phantom keypad presses. The keypad block
 * (digits, operators, enter) matters even though the app never enables
 * application-keypad mode: a program before us can leave it ON, and undecoded,
 * a numpad type arrives as `escape` (clears the input!) plus a stray digit.
 */
const SS3 = new Map<string, string>([
  ["A", "up"],
  ["B", "down"],
  ["C", "right"],
  ["D", "left"],
  ["H", "home"],
  ["F", "end"],
  ["P", "f1"],
  ["Q", "f2"],
  ["R", "f3"],
  ["S", "f4"],
  ["M", "kpenter"],
  ["j", "kp*"],
  ["k", "kp+"],
  ["l", "kp,"],
  ["m", "kp-"],
  ["n", "kp."],
  ["p", "kp0"],
  ["q", "kp1"],
  ["r", "kp2"],
  ["s", "kp3"],
  ["t", "kp4"],
  ["u", "kp5"],
  ["v", "kp6"],
  ["w", "kp7"],
  ["x", "kp8"],
  ["y", "kp9"],
]);

/** xterm pads the SGR button code with modifier bits: shift=4, alt=8, ctrl=16. */
function mouseMods(btn: number): { shift?: boolean; meta?: boolean; ctrl?: boolean } {
  const out: { shift?: boolean; meta?: boolean; ctrl?: boolean } = {};
  if (btn & 4) out.shift = true;
  if (btn & 8) out.meta = true;
  if (btn & 16) out.ctrl = true;
  return out;
}

/**
 * xterm encodes modifiers as a second CSI parameter, 1 + a bitmask:
 * shift=1, alt=2, ctrl=4. So ctrl+right is ESC [ 1 ; 5 C and alt+shift+up
 * is ESC [ 1 ; 4 A. Without decoding this, ctrl+left arrives looking exactly
 * like a bare left.
 */
function modsOf(param: string | undefined): { ctrl?: boolean; meta?: boolean; shift?: boolean } {
  // colon subparams (kitty: `CSI 97:1;5u` carries an event type after the
  // code point) — the modifier lives in the first subparam
  const n = Number(param?.split(":")[0]);
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
   * One decoder for the whole session, in streaming mode.
   *
   * A fresh `TextDecoder` per chunk cannot work: a multi-byte character split
   * across two reads decodes as two replacement chars. That is not theoretical —
   * a pty delivers whatever bytes are ready, so typing or pasting CJK/emoji at a
   * chunk boundary produced `hi<?><?><?>there` (measured). `{stream:true}` holds
   * the partial sequence until its remaining bytes arrive.
   */
  const utf8 = new TextDecoder("utf-8");

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
    buf += utf8.decode(chunk, { stream: true });
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
    // A bare two-byte prefix (`ESC [`, `ESC O`) may be the head of a sequence
    // split across reads: keep waiting until a byte behind it proves the rest
    // is genuinely lost. Dropping it on quiet alone reintroduces the split-
    // arrow bug — the re-drive timer fires 15ms later and would eat the head
    // off every arrow key that arrives one chunk at a time.
    if (buf.length === 2 && (buf[1] === "[" || buf[1] === "O")) return false;
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
      // ctrl+<letter> arrives as byte 64+letter (a=1 … z=26): emit the BARE
      // letter with ctrl so the app's per-chord handlers (`name === "x" &&
      // ctrl`) match uniformly — a new chord in the app needs no decoder
      // change. A lookup table used to live here; it mislabeled ctrl+n as
      // "t" (14 is n) and left every unlisted chord as "ctrl-x", which the
      // app never matched.
      return void emit({ type: "named", name: String.fromCharCode(96 + code), ctrl: true });
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
      // Take a whole code point, not a UTF-16 code unit. An emoji is a surrogate
      // pair, and emitting its halves separately put two entries in the input
      // buffer for one glyph the user saw once — so erasing it took two
      // backspaces, the first of which left a broken half-character on screen.
      const cp = buf.codePointAt(0)!;
      const ch = String.fromCodePoint(cp);
      // A lone surrogate at the buffer head means the pair is still arriving;
      // wait for its mate rather than emitting a half.
      if (cp >= 0xd800 && cp <= 0xdbff && buf.length < 2) {
        if (moreComing()) return false;
      }
      emitChar(ch);
      buf = buf.slice(ch.length);
      return true;
    }

    // SGR mouse: ESC [ < btn ; x ; y (M=press/motion | m=release), 1-based coords
    const mm = /^\x1b\[<(\d+);(\d+);(\d+)([Mm])/.exec(buf);
    if (mm) {
      const btn = Number(mm[1]);
      const x = Number(mm[2]) - 1;
      const y = Number(mm[3]) - 1;
      buf = buf.slice(mm[0].length);
      // Full button-code decode (the old decoder matched only bare codes 0/32,
      // so shift/ctrl/alt+click produced nothing at all):
      //   bits 0-1  physical button (0 left, 1 middle, 2 right)
      //   bit 2/3/4 shift / alt / ctrl
      //   bit 5     motion — with ?1002h the terminal reports movement while a
      //             button is held
      //   bit 6     wheel — not a button at all, it is a scroll at a position,
      //             so it carries the coordinates the app routes it by (dock vs
      //             transcript). A wheel *release* (SGR `m`) reports nothing new
      //             — the notch already scrolled on its press — and several
      //             terminals send one per notch, so emitting it too would
      //             scroll every notch twice.
      const mods = mouseMods(btn);
      if (btn & 64) {
        if (mm[4] === "m") return true;
        emit({ type: "named", name: btn & 1 ? "wheeldown" : "wheelup", x, y, ...mods });
        return true;
      } else if (mm[4] === "m") emit({ type: "mouse", action: "up", x, y, button: (btn & 3) as 0 | 1 | 2, ...mods });
      else if (btn & 32) emit({ type: "mouse", action: "drag", x, y, button: (btn & 3) as 0 | 1 | 2, ...mods });
      else emit({ type: "mouse", action: "down", x, y, button: (btn & 3) as 0 | 1 | 2, ...mods });
      return true;
    }

    // X10-compatible mouse fallback: ESC [ M <cb> <cx> <cy> — three raw bytes,
    // coordinates 1-based, press-only. A terminal that ignored the SGR
    // (?1006h) request speaks this dialect instead; undecoded, its coordinate
    // bytes land in the input buffer as garbage characters.
    if (buf.startsWith("\x1b[M")) {
      if (buf.length < 6) {
        if (moreComing()) return false;
        buf = ""; // dead prefix mid-burst: nothing behind it can be saved
        return true;
      }
      const cb = buf.charCodeAt(3) - 32;
      const cx = buf.charCodeAt(4) - 32;
      const cy = buf.charCodeAt(5) - 32;
      buf = buf.slice(6);
      if (cb >= 0 && cx >= 0 && cy >= 0) {
        const mods = mouseMods(cb);
        if (cb & 64) {
          if (!(cb & 1)) emit({ type: "named", name: "wheelup", x: cx - 1, y: cy - 1, ...mods });
          else emit({ type: "named", name: "wheeldown", x: cx - 1, y: cy - 1, ...mods });
        } else if (cb & 32) emit({ type: "mouse", action: "drag", x: cx - 1, y: cy - 1, button: (cb & 3) as 0 | 1 | 2, ...mods });
        else emit({ type: "mouse", action: "down", x: cx - 1, y: cy - 1, button: (cb & 3) as 0 | 1 | 2, ...mods });
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
    // Two-byte partial prefixes: `ESC [` and `ESC O` are the heads of most
    // sequences, and a slow pty can split right between them. Waiting matters:
    // `ESC O` alone decoded as escape + a literal `O` typed into the input, and
    // `ESC [` alone fell into skipUnparsed, which silently ate the prefix so
    // the arrow key's final byte arrived as a bare character (measured: ESC, [,
    // "A" split across reads produced escape, `[`, `A` — three keystrokes for
    // one press). skipUnparsed also refuses to drop a bare prefix, so the
    // re-drive timer cannot eat it out from under the wait; the prefix is
    // dropped only once a following byte proves the sequence is truly lost.
    if (buf.length === 2 && (buf[1] === "[" || buf[1] === "O")) {
      if (moreComing()) return false;
    }
    // string-type escapes carry no keys and must not reach emitChar
    if (buf[1] === "]" || buf[1] === "P" || buf[1] === "_" || buf[1] === "X" || buf[1] === "^") {
      return consumeString();
    }
    if (buf[1] !== "[") {
      // ESC followed by a plain char: alt+key or bare escape
      if (buf[1] === "O") {
        // An SS3 head with no final byte yet: wait for it regardless of the
        // quiet window. No terminal sends a bare `ESC O` as a user gesture, so
        // waiting costs nothing — while giving up here emitted `escape` + a
        // typed `O` for every SS3 key that arrived one byte at a time. The
        // re-drive timer re-runs consume; only a real following byte (or the
        // whole-buffer guard in drain) resolves this.
        if (buf.length === 2) return false;
        const s3 = buf[2];
        if (s3 !== undefined) {
          // rxvt encodes ctrl+arrows as SS3 lowercase a-d
          const rxvt = "abcd".indexOf(s3);
          if (rxvt >= 0) {
            emit({ type: "named", name: ["up", "down", "right", "left"][rxvt], ctrl: true });
            buf = buf.slice(3);
            return true;
          }
          const n = SS3.get(s3);
          if (n) {
            emit({ type: "named", name: n });
            buf = buf.slice(3);
            return true;
          }
          // Unmapped SS3 final: degrade to alt+char (or alt+backspace), never
          // escape + a typed letter — escape clears the whole input, the chord
          // is what a keyboard without an SS3 dialect means
          if (s3 === "\x7f" || s3 === "\x08") {
            emit({ type: "named", name: "backspace", meta: true });
            buf = buf.slice(3);
            return true;
          }
          if (s3 >= " " && s3 !== "\x7f") {
            emit({ type: "named", name: s3.toLowerCase(), meta: true });
            buf = buf.slice(3);
            return true;
          }
        }
      }
      // alt+backspace ("delete previous word" everywhere else) decoded as
      // `escape` then `backspace`. Since escape clears the whole input, pressing
      // it erased the entire line instead of one word — measured: "xxyz hello"
      // became empty. Report it as the chord it is and let the app decide.
      if (buf[1] === "\x7f" || buf[1] === "\x08") {
        emit({ type: "named", name: "backspace", meta: true });
        buf = buf.slice(2);
        return true;
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

    /**
     * `CSI <code> ; <mods> u` (kitty keyboard) and `CSI 27 ; <mods> ; <code> ~`
     * (xterm modifyOtherKeys=2) report keys as raw code points.
     *
     * Terminals turn these on themselves — kitty, foot, WezTerm and Ghostty all
     * negotiate a keyboard protocol, and once active, backspace stops arriving as
     * `0x7f` and starts arriving as `CSI 127 u`. This decoder matched neither, so
     * backspace produced NOTHING (measured `[]` for both). Mapping them through
     * `emitChar` reuses the control-code naming already used for raw bytes.
     */
    if (m[2] === "u") {
      const cp = Number(params[0]);
      if (Number.isFinite(cp) && cp > 0) {
        const mu = modsOf(params[1]);
        if (cp === 127 || cp === 8) emit({ type: "named", name: "backspace", ...mu });
        else if (cp === 13) emit({ type: "named", name: "return", ...mu });
        else if (cp === 9) emit({ type: "named", name: "tab", ...mu });
        else if (cp === 27) emit({ type: "named", name: "escape", ...mu });
        else if (mu.ctrl || mu.meta) {
          const letter = String.fromCodePoint(cp).toLowerCase();
          emit({ type: "named", name: letter, ...mu });
        } else emit({ type: "char", ch: String.fromCodePoint(cp) });
      }
      return true;
    }
    if (m[2] === "~" && params[0] === "27" && params.length >= 3) {
      const cp = Number(params[2]);
      const mu = modsOf(params[1]);
      if (Number.isFinite(cp) && cp > 0) {
        if (cp === 127 || cp === 8) emit({ type: "named", name: "backspace", ...mu });
        else if (cp === 13) emit({ type: "named", name: "return", ...mu });
        else if (cp === 9) emit({ type: "named", name: "tab", ...mu });
        else if (mu.ctrl || mu.meta) emit({ type: "named", name: String.fromCodePoint(cp).toLowerCase(), ...mu });
        else emit({ type: "char", ch: String.fromCodePoint(cp) });
      }
      return true;
    }
    // for a modified key the lookup key is the final char (arrows) or
    // "<n>~" (tilde keys); the raw seq only matches when unmodified
    const tilde = m[2] === "~" ? `${params[0]}~` : undefined;
    const name = CSI.get(seq) ?? (tilde ? CSI.get(tilde) : undefined) ?? CSI.get(m[2]);
    if (name) emit({ type: "named", name, ...mods });
    return true;
  }

  return { feed };
}
