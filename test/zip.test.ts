import { describe, expect, test } from "bun:test";
import { zipSync, unzipSync } from "../src/store/zip.ts";

describe("zip roundtrip", () => {
  test("stored and deflated entries survive a roundtrip", () => {
    const big = new TextEncoder().encode("CREATE TABLE x;\n".repeat(1000)); // compresses
    const tiny = new TextEncoder().encode("hi"); // stays STORE (< 64 bytes)
    const arc = zipSync([
      { name: "session.db", data: big },
      { name: "manifest.json", data: tiny },
    ]);
    const out = unzipSync(arc);
    expect(out.get("session.db")).toEqual(big);
    expect(out.get("manifest.json")).toEqual(tiny);
  });

  test("binary data with all byte values roundtrips", () => {
    const bin = new Uint8Array(256 * 3);
    for (let i = 0; i < bin.length; i++) bin[i] = i % 256;
    const out = unzipSync(zipSync([{ name: "bin/binary blob", data: bin }]));
    expect(out.get("bin/binary blob")).toEqual(bin);
  });

  test("empty entries and unicode names", () => {
    const out = unzipSync(
      zipSync([
        { name: "empty.db", data: new Uint8Array(0) },
        { name: "日本語.txt", data: new TextEncoder().encode("hello") },
      ]),
    );
    expect(out.get("empty.db")!.length).toBe(0);
    expect(new TextDecoder().decode(out.get("日本語.txt")!)).toBe("hello");
  });

  test("garbage input throws, not corrupts", () => {
    expect(() => unzipSync(new TextEncoder().encode("this is not a zip file at all........"))).toThrow();
  });
});
