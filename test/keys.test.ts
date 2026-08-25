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

  test("SGR left click gives 0-based coords; release ignored", () => {
    const ks = feedKeys("\x1b[<0;12;7M\x1b[<0;12;7m");
    expect(ks).toEqual([{ type: "click", x: 11, y: 6 }]);
  });

  test("plain keys still decode alongside mouse", () => {
    const ks = feedKeys("h\x1b[<64;1;1M\x1b[A");
    expect(ks.map((k) => (k.type === "char" ? k.ch : k.type === "named" ? k.name : "click"))).toEqual([
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
