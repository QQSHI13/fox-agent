import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { droppedPath, expandMentions } from "../src/core/mentions.ts";

describe("mentions", () => {
  test("bare, quoted and file:// drops resolve; junk does not", () => {
    const dir = mkdtempSync(join(tmpdir(), "fox-mentions-"));
    writeFileSync(join(dir, "a.ts"), "const a = 1;\n");
    try {
      expect(droppedPath("a.ts", dir)).toBe(join(dir, "a.ts"));
      expect(droppedPath(`'${join(dir, "a.ts")}'`, dir)).toBe(join(dir, "a.ts"));
      expect(droppedPath(`file://${join(dir, "a.ts")}`, dir)).toBe(join(dir, "a.ts"));
      expect(droppedPath("nope.ts", dir)).toBeNull();
      expect(droppedPath("@handle", dir)).toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("@path inlines the file; unknown tokens stay literal", () => {
    const dir = mkdtempSync(join(tmpdir(), "fox-mentions-"));
    writeFileSync(join(dir, "b.txt"), "hello file\n");
    try {
      const { text, files } = expandMentions("look at @b.txt and @notreal please", dir);
      expect(files).toEqual([join(dir, "b.txt")]);
      expect(text).toContain("hello file");
      expect(text).toContain("@notreal");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("binaries are not inlined", () => {
    const dir = mkdtempSync(join(tmpdir(), "fox-mentions-"));
    writeFileSync(join(dir, "bin.dat"), Buffer.from([0, 1, 2]));
    try {
      const { text, files } = expandMentions("@bin.dat", dir);
      expect(files).toEqual([]);
      expect(text).toBe("@bin.dat");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
