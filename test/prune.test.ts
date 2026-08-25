// Prune deletes hidden message bodies for real. The contract that matters is
// that it changes DISK, never the PROMPT: whatever renderContext() produced
// before pruning it must produce byte-for-byte afterward. The trap is that a
// compaction summary renders off the first message row of the hidden span, so a
// naive DELETE of all hidden rows silently drops the summary from the context.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "fox-prune-"));
  process.env.FOX_HOME = dir;
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

/** A session compacted the way the loop does it: a delete op carrying a summary. */
async function compactedSession(bodyKb = 4) {
  const { createSession, appendMessage, appendOps } = await import("../src/store/db.ts");
  const s = createSession("/w", "m1");
  const body = "x".repeat(bodyKb * 1024);
  const a = appendMessage(s.id, { parent_id: null, role: "user", content: `old question ${body}`, tokens: 100 });
  const b = appendMessage(s.id, { parent_id: null, role: "assistant", content: `old answer ${body}`, tokens: 100 });
  const c = appendMessage(s.id, { parent_id: null, role: "user", content: "recent question", tokens: 3 });
  appendOps(s.id, [{ kind: "delete", ids: [a.seq, b.seq], summary: "SUMMARY: discussed X, decided Y" }]);
  return { s, seqs: { a: a.seq, b: b.seq, c: c.seq } };
}

describe("prune preserves the rendered prompt", () => {
  test("render is byte-identical before and after, summary included", async () => {
    const { renderContext } = await import("../src/context/render.ts");
    const { pruneSession } = await import("../src/store/prune.ts");
    const { s } = await compactedSession();

    const before = renderContext(s.id, "SYS");
    expect(JSON.stringify(before)).toContain("SUMMARY: discussed X, decided Y");

    const report = pruneSession(s.id);
    expect(report.applied).toBe(true);

    const after = renderContext(s.id, "SYS");
    // the whole point: identical prompt, smaller database
    expect(JSON.stringify(after)).toBe(JSON.stringify(before));
    expect(JSON.stringify(after)).toContain("SUMMARY: discussed X, decided Y");
  });

  test("the summary anchor survives as a stub; the other hidden row is gone", async () => {
    const { pruneSession } = await import("../src/store/prune.ts");
    const { allMessages } = await import("../src/store/db.ts");
    const { s, seqs } = await compactedSession();

    pruneSession(s.id);
    const rows = allMessages(s.id);
    const bySeq = new Map(rows.map((m) => [m.seq, m]));
    // anchor kept, but blanked — this row is what renderContext hangs the summary on
    expect(bySeq.has(seqs.a)).toBe(true);
    expect(bySeq.get(seqs.a)!.content).toBe("");
    expect(bySeq.get(seqs.a)!.tokens).toBe(0);
    // second hidden row has no such duty and is deleted outright
    expect(bySeq.has(seqs.b)).toBe(false);
    // the visible message is untouched
    expect(bySeq.get(seqs.c)!.content).toBe("recent question");
  });

  test("the database actually shrinks", async () => {
    const { pruneSession } = await import("../src/store/prune.ts");
    const { s } = await compactedSession(64); // big enough that pages are definitely freed
    const r = pruneSession(s.id);
    expect(r.bytesAfter).toBeLessThan(r.bytesBefore);
    expect(r.messages).toBe(1);
    expect(r.stubs).toBe(1);
  });

  test("pruning twice is idempotent and the second run frees nothing", async () => {
    const { pruneSession } = await import("../src/store/prune.ts");
    const { renderContext } = await import("../src/context/render.ts");
    const { s } = await compactedSession();

    pruneSession(s.id);
    const once = renderContext(s.id, "SYS");
    const second = pruneSession(s.id);
    // nothing left to do: no rows to delete, and the anchor is already blank
    expect(second.applied).toBe(false);
    expect(second.messages).toBe(0);
    expect(JSON.stringify(renderContext(s.id, "SYS"))).toBe(JSON.stringify(once));
  });

  test("ops are never deleted, so projection still replays", async () => {
    const { pruneSession } = await import("../src/store/prune.ts");
    const { allOps } = await import("../src/store/db.ts");
    const { projectView } = await import("../src/context/view.ts");
    const { s, seqs } = await compactedSession();

    const opsBefore = allOps(s.id).length;
    pruneSession(s.id);
    expect(allOps(s.id).length).toBe(opsBefore);
    // the surviving stub is still projected as deleted, carrying its summary
    const anchor = projectView(s.id).find((n) => n.msg.seq === seqs.a)!;
    expect(anchor.deleted).toBe(true);
    expect(anchor.summary).toBe("SUMMARY: discussed X, decided Y");
  });
});

describe("prune edge cases", () => {
  test("a session with nothing hidden is a no-op", async () => {
    const { createSession, appendMessage, allMessages } = await import("../src/store/db.ts");
    const { pruneSession } = await import("../src/store/prune.ts");
    const s = createSession("/w", "m1");
    appendMessage(s.id, { parent_id: null, role: "user", content: "hello", tokens: 2 });

    const r = pruneSession(s.id);
    expect(r.applied).toBe(false);
    expect(r.messages).toBe(0);
    expect(allMessages(s.id)).toHaveLength(1);
  });

  test("a delete op with no summary drops every row in the span", async () => {
    const { createSession, appendMessage, appendOps, allMessages } = await import("../src/store/db.ts");
    const { pruneSession } = await import("../src/store/prune.ts");
    const s = createSession("/w", "m1");
    const a = appendMessage(s.id, { parent_id: null, role: "user", content: "junk one", tokens: 2 });
    const b = appendMessage(s.id, { parent_id: null, role: "user", content: "junk two", tokens: 2 });
    appendMessage(s.id, { parent_id: null, role: "user", content: "keep", tokens: 2 });
    appendOps(s.id, [{ kind: "delete", ids: [a.seq, b.seq] }]); // no summary -> no anchor to keep

    const r = pruneSession(s.id);
    expect(r.messages).toBe(2);
    expect(r.stubs).toBe(0);
    expect(allMessages(s.id).map((m) => m.content)).toEqual(["keep"]);
  });

  test("a restored node is visible again and therefore never pruned", async () => {
    const { createSession, appendMessage, appendOps, undoLastOp, allMessages } = await import("../src/store/db.ts");
    const { pruneSession } = await import("../src/store/prune.ts");
    const s = createSession("/w", "m1");
    const a = appendMessage(s.id, { parent_id: null, role: "user", content: "precious", tokens: 2 });
    appendOps(s.id, [{ kind: "delete", ids: [a.seq] }]);
    undoLastOp(s.id); // restores it

    pruneSession(s.id);
    // prune reads the projected view, not the raw op log, so the restore wins
    expect(allMessages(s.id).map((m) => m.content)).toEqual(["precious"]);
  });

  test("orphaned usage rows go with their message", async () => {
    const { createSession, appendMessage, appendOps, recordUsage, sessionUsage } = await import("../src/store/db.ts");
    const { pruneSession } = await import("../src/store/prune.ts");
    const s = createSession("/w", "m1");
    const a = appendMessage(s.id, { parent_id: null, role: "assistant", content: "old", tokens: 5 });
    const b = appendMessage(s.id, { parent_id: null, role: "assistant", content: "new", tokens: 5 });
    recordUsage(s.id, a.id, 100, 10);
    recordUsage(s.id, b.id, 200, 20);
    appendOps(s.id, [{ kind: "delete", ids: [a.seq] }]);

    expect(sessionUsage(s.id).prompt).toBe(300);
    const r = pruneSession(s.id);
    expect(r.usage).toBe(1);
    expect(sessionUsage(s.id).prompt).toBe(200); // only the surviving message's usage
  });
});

describe("/prune slash command", () => {
  const state = (sessionId: string) => ({
    sessionId,
    cwd: "/w",
    provider: { model: "m", baseUrl: "http://x/v1", apiKey: "k" },
  });

  test("/prune reports and writes nothing", async () => {
    const { runSlashCommand } = await import("../src/commands.ts");
    const { allMessages } = await import("../src/store/db.ts");
    const { s } = await compactedSession();

    const before = allMessages(s.id).map((m) => m.content);
    const res = runSlashCommand("/prune", state(s.id))!;
    expect(res.output).toMatch(/would delete 1 hidden message/);
    expect(res.output).toMatch(/one-way/);
    // dry run: every body still there
    expect(allMessages(s.id).map((m) => m.content)).toEqual(before);
  });

  test("/prune yes performs it and reports what was freed", async () => {
    const { runSlashCommand } = await import("../src/commands.ts");
    const { allMessages } = await import("../src/store/db.ts");
    const { s } = await compactedSession(64);

    const res = runSlashCommand("/prune yes", state(s.id))!;
    expect(res.output).toMatch(/^pruned 1 hidden message/);
    expect(res.output).toMatch(/freed/);
    expect(allMessages(s.id)).toHaveLength(2); // stub + visible
  });

  test("a bogus argument explains itself instead of pruning", async () => {
    const { runSlashCommand } = await import("../src/commands.ts");
    const { allMessages } = await import("../src/store/db.ts");
    const { s } = await compactedSession();
    const res = runSlashCommand("/prune now", state(s.id))!;
    expect(res.output).toMatch(/usage: \/prune/);
    expect(allMessages(s.id)).toHaveLength(3); // untouched
  });

  test("/prune on a clean session says so", async () => {
    const { runSlashCommand } = await import("../src/commands.ts");
    const { createSession, appendMessage } = await import("../src/store/db.ts");
    const s = createSession("/w", "m1");
    appendMessage(s.id, { parent_id: null, role: "user", content: "hi", tokens: 1 });
    expect(runSlashCommand("/prune", state(s.id))!.output).toMatch(/nothing to prune/);
  });

  test("/prune is listed in help", async () => {
    const { SLASH_HELP, COMMANDS } = await import("../src/commands.ts");
    expect(SLASH_HELP).toContain("/prune");
    expect(COMMANDS.some((c) => c.name === "/prune")).toBe(true);
  });
});
