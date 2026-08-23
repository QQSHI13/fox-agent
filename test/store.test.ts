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
