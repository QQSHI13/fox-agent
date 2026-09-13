import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("trusted folders are saved", () => {
  test("markTrusted persists to $FOX_AGENT_HOME/trusted_dirs", async () => {
    const home = mkdtempSync(join(tmpdir(), "fox-trust-"));
    const prev = process.env.FOX_AGENT_HOME;
    process.env.FOX_AGENT_HOME = home;
    try {
      const { isTrusted, markTrusted, trustFilePath } = await import("../src/core/trust.ts");
      const dir = join(home, "some-repo");
      expect(isTrusted(dir)).toBe(false);
      markTrusted(dir);
      expect(isTrusted(dir)).toBe(true);
      const saved = readFileSync(trustFilePath(), "utf8");
      expect(saved).toContain(dir);
      // idempotent: second mark does not duplicate
      markTrusted(dir);
      const lines = readFileSync(trustFilePath(), "utf8").split("\n").filter(Boolean);
      expect(lines.filter((l) => l === dir).length).toBe(1);
    } finally {
      if (prev === undefined) delete process.env.FOX_AGENT_HOME;
      else process.env.FOX_AGENT_HOME = prev;
    }
  });
});
