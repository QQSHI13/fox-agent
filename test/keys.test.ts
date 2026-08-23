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
});
