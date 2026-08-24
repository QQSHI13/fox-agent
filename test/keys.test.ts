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
