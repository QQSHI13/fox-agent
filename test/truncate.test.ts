// Presentation truncation: the store keeps a tool result whole, and the VIEW
// carries a head+tail excerpt as a `replace` op. These pin the two properties
// that make that design safe — nothing is lost, and the truncation is always
// identifiable — plus the shape of what the model actually reads.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { DEFAULT_PRESENTATION_CAP, TRUNCATE_VERSION, truncateToolResult } from "../src/context/truncate.ts";

describe("truncateToolResult", () => {
  test("text at or under the cap is untouched — no op is appended at all", () => {
    expect(truncateToolResult("exec", "short output", 1000)).toBeNull();
    expect(truncateToolResult("exec", "x".repeat(1000), 1000)).toBeNull();
  });

  test("over the cap keeps the head AND the tail, and says how much went", () => {
    const text = "HEAD".repeat(50) + "MIDDLE".repeat(500) + "TAIL".repeat(50);
    const t = truncateToolResult("exec", text, 2000)!;
    expect(t).not.toBeNull();
    expect(t.text.startsWith("HEAD")).toBe(true);
    expect(t.text.endsWith("TAIL")).toBe(true);
    // the middle RUN is cut: the excerpt cannot contain all 500 repetitions.
    // (Asserting the word "MIDDLE" is absent would be wrong — the head budget
    // legitimately extends past the 200-char HEAD section into the middle run.)
    const middleRun = (s: string) => (s.match(/MIDDLE/g) ?? []).length;
    expect(middleRun(t.text)).toBeLessThan(500);
    expect(t.text).toContain("chars truncated");
    expect(t.text).toContain(String(text.length));
    expect(t.dropped).toBeGreaterThan(0);
    // the accounting is exact: original = excerpt + dropped + the marker text
    const markerOnly = t.text.match(/\n\n… \([^)]*\)\n\n/)?.[0] ?? "";
    expect(markerOnly.length).toBeGreaterThan(0);
    expect(t.text.length - markerOnly.length + t.dropped).toBe(text.length);
  });

  test("an oversized result is still well under the original", () => {
    const text = "y".repeat(500_000);
    const t = truncateToolResult("exec", text, DEFAULT_PRESENTATION_CAP)!;
    expect(t.text.length).toBeLessThan(DEFAULT_PRESENTATION_CAP + 200); // marker allowance
    expect(t.dropped).toBeGreaterThan(400_000);
  });

  test("a cap of 0 disables truncation entirely", () => {
    expect(truncateToolResult("exec", "z".repeat(100_000), 0)).toBeNull();
  });

  test("ctx and todo are never truncated — they are audit trail and task list", () => {
    const big = "x".repeat(200_000);
    expect(truncateToolResult("ctx", big, 1000)).toBeNull();
    expect(truncateToolResult("todo", big, 1000)).toBeNull();
  });

  test("every truncation carries the policy version", () => {
    const t = truncateToolResult("exec", "q".repeat(10_000), 500)!;
    expect(t!.version).toBe(TRUNCATE_VERSION);
    // a policy change must bump this, or a replay cannot tell old from new
    expect(typeof TRUNCATE_VERSION).toBe("number");
  });

  test("a cap too small to hold the marker degenerates to no truncation", () => {
    // truncating to less than the marker text would be a net loss: the note
    // alone would exceed the budget
    expect(truncateToolResult("exec", "w".repeat(10_000), 50)).toBeNull();
  });
});

describe("truncation as a view op end to end", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "fox-trunc-"));
    process.env.FOX_AGENT_HOME = dir;
    process.env.FOX_AGENT_CONFIG = join(dir, "config.toml");
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    delete process.env.FOX_AGENT_HOME;
    delete process.env.FOX_AGENT_CONFIG;
  });

  test("the stored row keeps every byte; the view shows the excerpt; /undo restores", async () => {
    const { createSession, appendMessage, appendOps, getMessage, undoLastOp } = await import("../src/store/db.ts");
    const { projectView, dropViewCache } = await import("../src/context/view.ts");

    const s = createSession("/w", "m1");
    const full = "A".repeat(100_000);
    const node = appendMessage(s.id, { parent_id: null, role: "tool", content: full, tokens: 1, tool_call_id: "c1" });

    const t = truncateToolResult("exec", full, 2_000)!;
    appendOps(s.id, [{ kind: "replace", id: node.seq, content: t.text, version: t.version }]);
    dropViewCache(s.id);

    // the model reads the excerpt
    const view = projectView(s.id);
    const seen = view.find((n) => n.msg.seq === node.seq)!;
    expect(seen.content.length).toBeLessThan(full.length);
    expect(seen.replaceVersion).toBe(TRUNCATE_VERSION);

    // storage is untouched — this is the whole point of doing it as an op
    expect(getMessage(s.id, node.seq)!.content).toBe(full);
    expect(getMessage(s.id, node.seq)!.content.length).toBe(100_000);

    // and the truncation is reversible through the ordinary undo path
    undoLastOp(s.id);
    dropViewCache(s.id);
    const restored = projectView(s.id).find((n) => n.msg.seq === node.seq)!;
    expect(restored.content).toBe(full);
    expect(restored.replaceVersion).toBeUndefined();
  });

  test("a ctx-authored replace carries no version, so hosts never second-guess it", async () => {
    const { createSession, appendMessage, appendOps } = await import("../src/store/db.ts");
    const { projectView, dropViewCache } = await import("../src/context/view.ts");
    const s = createSession("/w", "m1");
    const node = appendMessage(s.id, { parent_id: null, role: "tool", content: "original", tokens: 1, tool_call_id: "c1" });
    appendOps(s.id, [{ kind: "replace", id: node.seq, content: "an agent's deliberate edit" }]);
    dropViewCache(s.id);
    const n = projectView(s.id).find((x) => x.msg.seq === node.seq)!;
    expect(n.content).toBe("an agent's deliberate edit");
    expect(n.replaceVersion).toBeUndefined();
  });
});
