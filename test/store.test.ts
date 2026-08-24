import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "fox-store-"));
  process.env.FOX_HOME = dir;
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("store", () => {
  test("auto-titles session from first user message", async () => {
    const { createSession, appendMessage, getSession } = await import("../src/store/db.ts");
    const s = createSession("/w", "m1");
    expect(getSession(s.id)!.title).toBeNull();
    appendMessage(s.id, { parent_id: null, role: "user", content: "fix the login bug in auth.ts please", tokens: 8 });
    expect(getSession(s.id)!.title).toBe("fix the login bug in auth.ts please");
  });

  test("fork copies messages and ops up to a marker", async () => {
    const { createSession, appendMessage, appendOps, forkSession, allMessages, allOps } = await import(
      "../src/store/db.ts"
    );
    const s = createSession("/w", "m1");
    const m1 = appendMessage(s.id, { parent_id: null, role: "user", content: "one", tokens: 1 });
    const m2 = appendMessage(s.id, { parent_id: null, role: "assistant", content: "two", tokens: 1 });
    const m3 = appendMessage(s.id, { parent_id: null, role: "user", content: "three", tokens: 1 });
    appendOps(s.id, [{ kind: "replace", id: m2.seq, content: "two!" }]);

    const fork = forkSession(s.id, m2.seq)!;
    const msgs = allMessages(fork.id);
    expect(msgs.map((m: any) => m.content)).toEqual(["one", "two"]);
    expect(allOps(fork.id)).toHaveLength(1); // op carried over (references copied seq)
    void m3;
  });

  test("forking the same session twice does not collide on message ids", async () => {
    const { createSession, appendMessage, forkSession, allMessages } = await import("../src/store/db.ts");
    const s = createSession("/w", "m1");
    appendMessage(s.id, { parent_id: null, role: "user", content: "one", tokens: 1 });
    appendMessage(s.id, { parent_id: null, role: "assistant", content: "two", tokens: 1 });

    // regression: ids used to be copied verbatim, so the second fork threw
    // "UNIQUE constraint failed: messages.id"
    const f1 = forkSession(s.id)!;
    const f2 = forkSession(s.id)!;
    expect(f1.id).not.toBe(f2.id);
    expect(allMessages(f1.id).map((m: any) => m.content)).toEqual(["one", "two"]);
    expect(allMessages(f2.id).map((m: any) => m.content)).toEqual(["one", "two"]);
    // and no id is shared between the two forks or the source
    const ids = [s.id, f1.id, f2.id].flatMap((id) => allMessages(id).map((m: any) => m.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("fork of a fork works and keeps parent_id inside its own session", async () => {
    const { createSession, appendMessage, forkSession, allMessages } = await import("../src/store/db.ts");
    const s = createSession("/w", "m1");
    const a = appendMessage(s.id, { parent_id: null, role: "user", content: "a", tokens: 1 });
    appendMessage(s.id, { parent_id: a.id, role: "assistant", content: "b", tokens: 1 });

    const f1 = forkSession(s.id)!;
    const f2 = forkSession(f1.id)!;
    for (const sid of [f1.id, f2.id]) {
      const msgs = allMessages(sid);
      const own = new Set(msgs.map((m: any) => m.id));
      for (const m of msgs) {
        // a parent_id must point at a row in the SAME session, never the source
        if (m.parent_id) expect(own.has(m.parent_id)).toBe(true);
      }
    }
  });

  test("fork main ref points at the last copied message, not the first", async () => {
    const { createSession, appendMessage, forkSession, getRef } = await import("../src/store/db.ts");
    const s = createSession("/w", "m1");
    appendMessage(s.id, { parent_id: null, role: "user", content: "one", tokens: 1 });
    const m2 = appendMessage(s.id, { parent_id: null, role: "assistant", content: "two", tokens: 1 });
    appendMessage(s.id, { parent_id: null, role: "user", content: "three", tokens: 1 });

    const fork = forkSession(s.id, m2.seq)!;
    expect(getRef(fork.id)).toBe(`${fork.id}:${m2.seq}`);
  });

  test("kv roundtrip", async () => {
    const { createSession, kvSet, kvGet } = await import("../src/store/db.ts");
    const s = createSession("/w", "m1");
    kvSet(s.id, "todos", [{ content: "a", status: "pending" }]);
    expect(kvGet<any[]>(s.id, "todos")).toEqual([{ content: "a", status: "pending" }]);
    kvSet(s.id, "todos", []);
    expect(kvGet<any[]>(s.id, "todos")).toEqual([]);
    expect(kvGet(s.id, "missing")).toBeNull();
  });

  test("undo of replace restores original content via appended op", async () => {
    const { createSession, appendMessage, appendOps, undoLastOp } = await import("../src/store/db.ts");
    const { projectView } = await import("../src/context/view.ts");
    const s = createSession("/w", "m1");
    const m = appendMessage(s.id, { parent_id: null, role: "assistant", content: "truth", tokens: 2 });
    appendOps(s.id, [{ kind: "replace", id: m.seq, content: "lie" }]);
    expect(projectView(s.id).find((n) => n.msg.seq === m.seq)!.content).toBe("lie");
    const desc = undoLastOp(s.id);
    expect(desc).toContain("restored original content");
    expect(projectView(s.id).find((n) => n.msg.seq === m.seq)!.content).toBe("truth");
  });

  test("undo toggles delete/restore symmetrically", async () => {
    const { createSession, appendMessage, appendOps, undoLastOp } = await import("../src/store/db.ts");
    const { projectView } = await import("../src/context/view.ts");
    const s = createSession("/w", "m1");
    const m = appendMessage(s.id, { parent_id: null, role: "user", content: "x", tokens: 1 });
    appendOps(s.id, [{ kind: "delete", ids: [m.seq] }]);
    undoLastOp(s.id);
    expect(projectView(s.id).find((n) => n.msg.seq === m.seq)!.deleted).toBe(false);
    undoLastOp(s.id); // undoes the restore -> hidden again
    expect(projectView(s.id).find((n) => n.msg.seq === m.seq)!.deleted).toBe(true);
  });
});
