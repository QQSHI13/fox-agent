import { describe, expect, test } from "bun:test";
import { join } from "node:path";
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

  // The bug: the zip-bomb guard threw from inside an inflate stream's `data`
  // handler. That throw is nobody's to catch — it does not reject the awaited
  // promise, it becomes an UNCAUGHT exception and takes the process down. So a
  // corrupt or hostile session archive killed the running fox instead of the
  // import reporting a broken file.
  test("a lying central directory is a catchable error, not an uncaught throw", async () => {
    const { unzipEntryToFile } = await import("../src/store/zip.ts");
    const { deflateRawSync } = await import("node:zlib");
    const { tmpdir } = await import("node:os");
    const { mkdtempSync, rmSync } = await import("node:fs");
    const d = mkdtempSync(join(tmpdir(), "fox-zipbomb-"));
    // entry NAME is the manifest, so assertPlausibleSize's ratio floor does not
    // intercept it first — this exercises the streaming guard itself
    const name = new TextEncoder().encode("manifest.json");
    const comp = deflateRawSync(Buffer.alloc(100_000, 0x41));
    const u16 = (v: number) => [v & 0xff, (v >>> 8) & 0xff];
    const u32 = (v: number) => [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff];
    const declared = 10; // the lie: it really inflates to 100 KB
    const local = new Uint8Array([...u32(0x04034b50), ...u16(20), ...u16(0), ...u16(8), ...u16(0), ...u16(0), ...u32(0), ...u32(comp.length), ...u32(declared), ...u16(name.length), ...u16(0), ...name]);
    const cd = new Uint8Array([...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0), ...u16(8), ...u16(0), ...u16(0), ...u32(0), ...u32(comp.length), ...u32(declared), ...u16(name.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(0), ...name]);
    const eocd = new Uint8Array([...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(1), ...u16(1), ...u32(cd.length), ...u32(local.length + comp.length), ...u16(0)]);
    const arc = new Uint8Array(local.length + comp.length + cd.length + eocd.length);
    arc.set(local, 0);
    arc.set(comp, local.length);
    arc.set(cd, local.length + comp.length);
    arc.set(eocd, local.length + comp.length + cd.length);
    try {
      // the assertion is that this REJECTS. If the guard threw out of the data
      // handler instead, bun test would report an unhandled error and this
      // promise would never settle.
      await expect(unzipEntryToFile(arc, "manifest.json", join(d, "out.db"))).rejects.toThrow(/more than its declared/);
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });
});
