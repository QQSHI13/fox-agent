import { describe, expect, test } from "bun:test";
import { createDecoder, type Key } from "../src/tui/keys.ts";

function feedKeys(input: string): Key[] {
  const out: Key[] = [];
  const dec = createDecoder((k) => out.push(k));
  dec.feed(new TextEncoder().encode(input));
  return out;
}

describe("key decoder", () => {
  test("SGR wheel events", () => {
    const ks = feedKeys("\x1b[<64;10;5M\x1b[<65;3;2M");
    expect(ks).toEqual([
      { type: "named", name: "wheelup" },
      { type: "named", name: "wheeldown" },
    ]);
  });

  test("SGR left button reports press, drag and release separately", () => {
    // The bug this pins: press and release were collapsed into one `click` on
    // press, and the release was thrown away — so a consumer could not tell a
    // tap from a drag, and the thinking box toggled on button-DOWN.
    const ks = feedKeys("\x1b[<0;12;7M\x1b[<32;15;7M\x1b[<0;15;7m");
    expect(ks).toEqual([
      { type: "mouse", action: "down", x: 11, y: 6 },
      { type: "mouse", action: "drag", x: 14, y: 6 },
      { type: "mouse", action: "up", x: 14, y: 6 },
    ]);
  });

  test("a release is reported wherever the button comes up, button code and all", () => {
    // xterm sends the button code on release too; ?1002h drags carry code+32.
    // A release must be an `up` regardless of which code it names.
    expect(feedKeys("\x1b[<32;4;2m")).toEqual([{ type: "mouse", action: "up", x: 3, y: 1 }]);
  });

  test("wheel is not mistaken for a button press or drag", () => {
    // 64/65 are wheel notches, and they arrive with `M` like a press does
    expect(feedKeys("\x1b[<64;1;1M\x1b[<65;1;1M")).toEqual([
      { type: "named", name: "wheelup" },
      { type: "named", name: "wheeldown" },
    ]);
  });

  test("plain keys still decode alongside mouse", () => {
    const ks = feedKeys("h\x1b[<64;1;1M\x1b[A");
    expect(ks.map((k) => (k.type === "char" ? k.ch : k.type === "named" ? k.name : k.type))).toEqual([
      "h",
      "wheelup",
      "up",
    ]);
  });

  test("CSI modifier params decode ctrl/alt/shift", () => {
    expect(feedKeys("\x1b[1;5C")).toEqual([{ type: "named", name: "right", ctrl: true }]);
    expect(feedKeys("\x1b[1;3D")).toEqual([{ type: "named", name: "left", meta: true }]);
    expect(feedKeys("\x1b[1;2A")).toEqual([{ type: "named", name: "up", shift: true }]);
    expect(feedKeys("\x1b[1;6B")).toEqual([{ type: "named", name: "down", shift: true, ctrl: true }]);
  });

  test("unmodified keys carry no modifier flags", () => {
    expect(feedKeys("\x1b[C")).toEqual([{ type: "named", name: "right" }]);
    expect(feedKeys("\x1b[3~")).toEqual([{ type: "named", name: "delete" }]);
    expect(feedKeys("\x1b[5~")).toEqual([{ type: "named", name: "pageup" }]);
  });

  test("modified tilde keys keep their identity", () => {
    // ctrl+delete is ESC [ 3 ; 5 ~ — the "3" must still map to `delete`
    expect(feedKeys("\x1b[3;5~")).toEqual([{ type: "named", name: "delete", ctrl: true }]);
    expect(feedKeys("\x1b[6;2~")).toEqual([{ type: "named", name: "pagedown", shift: true }]);
  });

  test("ctrl letters and shift+tab", () => {
    expect(feedKeys("\x03")).toEqual([{ type: "named", name: "c", ctrl: true }]);
    expect(feedKeys("\x1b[Z")).toEqual([{ type: "named", name: "shifttab" }]);
    expect(feedKeys("\t")).toEqual([{ type: "named", name: "tab" }]);
  });

  test("bracketed paste is one event with CRLF normalized", () => {
    const ks = feedKeys("\x1b[200~a\r\nb\x1b[201~");
    expect(ks).toEqual([{ type: "paste", text: "a\nb" }]);
  });

  test("split CSI across chunks decodes once complete", () => {
    const out: Key[] = [];
    const dec = createDecoder((k) => out.push(k));
    dec.feed(new TextEncoder().encode("\x1b[1;"));
    expect(out).toEqual([]);
    dec.feed(new TextEncoder().encode("5C"));
    expect(out).toEqual([{ type: "named", name: "right", ctrl: true }]);
  });
});

/**
 * Terminals send more than keys down the same pipe: mode reports, color replies,
 * version strings — unsolicited, and in whatever dialect they prefer. Anything the
 * decoder cannot parse must be *dropped*, never left at the head of the buffer and
 * never allowed to take real keystrokes with it.
 *
 * Every case here was measured against the old decoder first. `ESC [ ?1000;1$y`
 * (a DECRQM report, whose `$` intermediate the CSI pattern did not cover) wedged
 * the buffer permanently: backspace, typing, Enter and arrows after it produced
 * ZERO keys for the rest of the session. That is the bug behind "backspace only
 * works if I hold it down" — a long press eventually lands a byte outside the
 * window in which the buffer gets wiped.
 */
describe("key decoder: terminal noise must never eat keystrokes", () => {
  /** Feed each chunk as its own burst, then wait past the re-drive timer. */
  async function feedBursts(chunks: string[]): Promise<Key[]> {
    const out: Key[] = [];
    const dec = createDecoder((k) => out.push(k));
    for (const c of chunks) {
      dec.feed(new TextEncoder().encode(c));
      await Bun.sleep(20);
    }
    await Bun.sleep(40);
    return out;
  }

  const NOISE: [string, string][] = [
    ["\x1b[?1000;1$y", "DECRQM mode report — '$' intermediate"],
    ["\x1b[?62;1;6c", "DA1 device attributes"],
    ["\x1b[>0;276;0c", "DA2 device attributes"],
    ["\x1b[4;1;1t", "window size report"],
    ["\x1b]11;rgb:1/2/3\x07", "OSC background color reply, BEL-terminated"],
    ["\x1b]10;rgb:f/f/f\x1b\\", "OSC foreground reply, ST-terminated"],
    ["\x1bP>|xterm(370)\x1b\\", "DCS XTVERSION reply"],
    ["\x1b_junk\x1b\\", "APC string"],
    ["\x1b[", "a truncated CSI that never completes"],
  ];

  for (const [seq, desc] of NOISE) {
    test(`${desc} is dropped, and the backspace behind it survives`, async () => {
      expect(await feedBursts([seq, "\x7f"])).toEqual([{ type: "named", name: "backspace" }]);
    });
  }

  test("the wedge is gone: input keeps working for the whole session after a bad report", async () => {
    // the exact sequence that killed the keyboard: one report, then ordinary use
    const ks = await feedBursts(["\x1b[?1000;1$y", "\x7f", "hi", "\r", "\x1b[A"]);
    expect(ks).toEqual([
      { type: "named", name: "backspace" },
      { type: "char", ch: "h" },
      { type: "char", ch: "i" },
      { type: "named", name: "return" },
      { type: "named", name: "up" },
    ]);
  });

  test("a held key coalesced behind noise loses none of its repeats", async () => {
    // autorepeat arrives as a run of 0x7f, often in one chunk with whatever the
    // terminal happened to send; all of them must land
    const ks = await feedBursts(["\x1b[?1000;1$y" + "\x7f".repeat(8)]);
    expect(ks).toHaveLength(8);
    expect(new Set(ks.map((k) => (k.type === "named" ? k.name : k.type)))).toEqual(new Set(["backspace"]));
  });

  test("an OSC reply does not type its own payload into the input", async () => {
    // the old decoder emitted `escape` then the literal chars ]11;rgb:1/2/3
    const ks = await feedBursts(["\x1b]11;rgb:1/2/3\x07"]);
    expect(ks).toEqual([]);
  });

  test("a lone Esc emits without waiting for the next keypress", async () => {
    // esc is interrupt: it may not sit in the buffer until the user types again
    expect(await feedBursts(["\x1b"])).toEqual([{ type: "named", name: "escape" }]);
  });

  test("alt+key still beats the lone-Esc path when they arrive together", async () => {
    expect(await feedBursts(["\x1bb"])).toEqual([
      { type: "named", name: "escape" },
      { type: "char", ch: "b" },
    ]);
  });

  test("an unterminated paste does not strand later keys forever", async () => {
    // A paste whose closing marker never arrives must not become a permanent
    // wedge. The text that did arrive is kept as ordinary input rather than
    // discarded, so nothing the user pasted is silently lost.
    const out: Key[] = [];
    const dec = createDecoder((k) => out.push(k));
    dec.feed(new TextEncoder().encode("\x1b[200~abc"));
    await Bun.sleep(60);
    expect(out).toEqual([]); // still waiting — a real paste may span many chunks
    await Bun.sleep(500); // past the grace period
    dec.feed(new TextEncoder().encode("\x7f"));
    await Bun.sleep(40);
    expect(out.map((k) => (k.type === "named" ? k.name : k.type === "char" ? k.ch : k.type))).toEqual([
      "a",
      "b",
      "c",
      "backspace",
    ]);
  });
});

/**
 * Backspace has to arrive as a backspace no matter which dialect the terminal
 * speaks, and one keypress must delete one glyph.
 *
 * Every case below was measured against the previous decoder. Three were silent
 * losses: `CSI 127 u` (kitty keyboard, which several modern terminals negotiate
 * on their own) and `CSI 27;5;127~` (xterm modifyOtherKeys=2) produced NO key at
 * all, and alt+backspace decoded as `escape` + `backspace`, so it wiped the
 * whole line instead of one word. A fourth split emoji into surrogate halves,
 * making one visible glyph cost two presses — the "long press" symptom.
 */
describe("backspace arrives in every keyboard dialect", () => {
  const DIALECTS: [string, string, Key][] = [
    ["\x7f", "DEL, the usual encoding", { type: "named", name: "backspace" }],
    ["\x08", "BS (0x08), sent by some terminals", { type: "named", name: "backspace" }],
    ["\x1b[127u", "kitty keyboard protocol, CSI-u", { type: "named", name: "backspace" }],
    ["\x1b[27;5;127~", "xterm modifyOtherKeys=2, ctrl held", { type: "named", name: "backspace", ctrl: true }],
    ["\x1b\x7f", "alt+backspace, the delete-word chord", { type: "named", name: "backspace", meta: true }],
  ];

  for (const [seq, desc, want] of DIALECTS) {
    test(`${desc} decodes to backspace`, () => {
      expect(feedKeys(seq)).toEqual([want]);
    });
  }

  test("alt+backspace is one chord, not escape followed by backspace", () => {
    // the regression: `escape` clears the entire input, so decoding the chord as
    // two keys erased the whole line the user was editing
    const ks = feedKeys("\x1b\x7f");
    expect(ks).toHaveLength(1);
    expect(ks.map((k) => (k.type === "named" ? k.name : k.type))).not.toContain("escape");
  });

  test("kitty-protocol ctrl and plain letters stay distinguishable", () => {
    expect(feedKeys("\x1b[97u")).toEqual([{ type: "char", ch: "a" }]);
    expect(feedKeys("\x1b[97;5u")).toEqual([{ type: "named", name: "a", ctrl: true }]);
    expect(feedKeys("\x1b[13u")).toEqual([{ type: "named", name: "return" }]);
  });

  test("the delete key is still delete, not backspace", () => {
    expect(feedKeys("\x1b[3~")).toEqual([{ type: "named", name: "delete" }]);
  });
});

describe("one glyph is one key, whatever its byte length", () => {
  test("an emoji is one char event, not two surrogate halves", () => {
    // Emitting the halves separately put two entries in the input buffer for one
    // glyph, so erasing it took two backspaces — the first leaving a broken
    // half-character on screen.
    expect(feedKeys("😀")).toEqual([{ type: "char", ch: "😀" }]);
  });

  test("a character split across two reads is not corrupted", () => {
    // a pty hands over whatever bytes are ready; a stateless TextDecoder turned
    // the halves into replacement chars (measured: "hi<?><?><?>there")
    const out: Key[] = [];
    const dec = createDecoder((k) => out.push(k));
    const bytes = new TextEncoder().encode("hi日there");
    dec.feed(bytes.slice(0, 3)); // mid-way through 日
    dec.feed(bytes.slice(3));
    const text = out.map((k) => (k.type === "char" ? k.ch : "")).join("");
    expect(text).toBe("hi日there");
    expect(text).not.toContain("�");
  });

  test("an emoji split across two reads survives", () => {
    const out: Key[] = [];
    const dec = createDecoder((k) => out.push(k));
    const bytes = new TextEncoder().encode("😀");
    dec.feed(bytes.slice(0, 2));
    dec.feed(bytes.slice(2));
    expect(out).toEqual([{ type: "char", ch: "😀" }]);
  });

  test("CJK still decodes as a single char", () => {
    expect(feedKeys("日本")).toEqual([
      { type: "char", ch: "日" },
      { type: "char", ch: "本" },
    ]);
  });
});
