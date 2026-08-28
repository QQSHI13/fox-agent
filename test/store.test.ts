import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "fox-store-"));
  process.env.FOX_AGENT_HOME = dir;
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

describe("session recency", () => {
  test("updated_at tracks the last append and is projected on every read", async () => {
    const { createSession, appendMessage, getSession, listSessions, latestSessionFor } = await import("../src/store/db.ts");
    const s = createSession("/w", "m1");
    const born = getSession(s.id)!;
    expect(born.updated_at).toBe(born.created_at);

    appendMessage(s.id, { parent_id: null, role: "user", content: "later", tokens: 1 });
    const after = getSession(s.id)!;
    expect(after.updated_at).toBeGreaterThanOrEqual(after.created_at);
    // the column existed and was maintained for a long time while every read
    // query projected only created_at, so it was invisible to callers
    expect(listSessions()[0].updated_at).toBe(after.updated_at);
    expect(latestSessionFor("/w")!.updated_at).toBe(after.updated_at);
  });

  test("listings rank by last use, not by birth", async () => {
    const { createSession, appendMessage, listSessions, latestSessionFor } = await import("../src/store/db.ts");
    const old = createSession("/w", "m1");
    const fresh = createSession("/w", "m1"); // created later, never touched
    expect(listSessions()[0].id).toBe(fresh.id);

    // work in the older one: "latest" has to mean this now, or /sessions and
    // `fox -c` offer up a session the user has never typed into
    appendMessage(old.id, { parent_id: null, role: "user", content: "hi", tokens: 1 });
    expect(listSessions()[0].id).toBe(old.id);
    expect(listSessions(10, "/w")[0].id).toBe(old.id);
    expect(latestSessionFor("/w")!.id).toBe(old.id);
  });

  test("the order is total, so -c cannot flip between runs", async () => {
    const { createSession, listSessions } = await import("../src/store/db.ts");
    // several sessions created inside the same millisecond tie on updated_at;
    // ids are timestamp-prefixed, so the id tie-break keeps the order stable
    const ids = Array.from({ length: 6 }, () => createSession("/w", "m1").id);
    const once = listSessions().map((s) => s.id);
    expect(listSessions().map((s) => s.id)).toEqual(once);
    expect(new Set(once)).toEqual(new Set(ids));
  });

  test("a fork enters the list at the top, not at its parent's age", async () => {
    const { createSession, appendMessage, forkSession, getSession, listSessions } = await import("../src/store/db.ts");
    const src = createSession("/w", "m1");
    appendMessage(src.id, { parent_id: null, role: "user", content: "a", tokens: 1 });
    const other = createSession("/w", "m1");
    const fork = forkSession(src.id)!;
    const row = getSession(fork.id)!;
    // copying the parent's timestamps would bury a brand-new fork under
    // sessions the user has not touched since
    expect(row.updated_at).toBeGreaterThanOrEqual(row.created_at);
    expect(row.created_at).toBeGreaterThanOrEqual(getSession(other.id)!.created_at);
    expect(listSessions()[0].id).toBe(fork.id);
  });

  test("index-only queries survive an index db created before updated_at was indexed", async () => {
    // CREATE INDEX IF NOT EXISTS silently does nothing when the name is taken,
    // so reusing the old index name for new columns would have left every
    // already-created install ordering off the wrong index forever
    const { createSession } = await import("../src/store/db.ts");
    createSession("/w", "m1");
    const { Database } = await import("bun:sqlite");
    const { indexDbPath } = await import("../src/core/paths.ts");
    const idx = new Database(indexDbPath());
    const names = idx
      .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'sessions'")
      .all()
      .map((r: any) => r.name);
    idx.close();
    expect(names).toContain("idx_sessions_cwd_recent");
    expect(names).not.toContain("idx_sessions_cwd");
  });
});

describe("open session handles", () => {
  test("a held handle for a pinned session is still usable after the cache overflows", async () => {
    const db = await import("../src/store/db.ts");
    const live = db.createSession("/w", "m1");
    db.appendMessage(live.id, { parent_id: null, role: "user", content: "start", tokens: 1 });
    db.pinSession(live.id);

    // The hazard is not `appendMessage` — that goes through sessionDb and
    // reopens on a miss. It is the callers that HOLD the Database across other
    // work: forkSession keeps srcDb while it snapshots, pruneSession keeps d
    // across projectView and a VACUUM. Measured: a closed bun:sqlite handle
    // throws "Cannot use a closed database" on the next prepare.
    const held = db.sessionDb(live.id);

    // the picker reads usage for every session, far more than the cache holds
    for (let i = 0; i < 20; i++) db.sessionUsage(db.createSession("/w", "m1").id);

    expect(() => held.prepare("SELECT COUNT(*) AS n FROM messages").get()).not.toThrow();
    expect(held.prepare("SELECT COUNT(*) AS n FROM messages").get()).toEqual({ n: 1 });
  });

  test("an unpinned held handle is closed by the overflow, which is why pinning exists", async () => {
    // the inverse measurement: without a pin the same sequence really does
    // close the handle, so the test above is not passing for some other reason
    const db = await import("../src/store/db.ts");
    const s = db.createSession("/w", "m1");
    db.appendMessage(s.id, { parent_id: null, role: "user", content: "start", tokens: 1 });
    const held = db.sessionDb(s.id);
    for (let i = 0; i < 20; i++) db.sessionUsage(db.createSession("/w", "m1").id);
    expect(() => held.prepare("SELECT 1").get()).toThrow();
    // but the store itself is unharmed: sessionDb reopens on the next call
    expect(db.allMessages(s.id)).toHaveLength(1);
  });

  test("a fork of a session survives the cache being full", async () => {
    // forkSession holds srcDb across a checkpoint and a VACUUM INTO, so an
    // eviction in the middle would abort the fork
    const db = await import("../src/store/db.ts");
    const src = db.createSession("/w", "m1");
    db.appendMessage(src.id, { parent_id: null, role: "user", content: "a", tokens: 1 });
    db.pinSession(src.id);
    for (let i = 0; i < 20; i++) db.sessionUsage(db.createSession("/w", "m1").id);
    const fork = db.forkSession(src.id);
    expect(fork).toBeTruthy();
    expect(db.allMessages(fork!.id)).toHaveLength(1);
  });

  test("unpinning releases the handle for eviction again", async () => {
    const db = await import("../src/store/db.ts");
    const s = db.createSession("/w", "m1");
    db.pinSession(s.id);
    const held = db.sessionDb(s.id);
    db.unpinSession(s.id);
    // unpinSession evicts immediately when the cache is already over the cap
    for (let i = 0; i < 20; i++) db.sessionUsage(db.createSession("/w", "m1").id);
    expect(() => held.prepare("SELECT 1").get()).toThrow();
    expect(db.getSession(s.id)).toBeTruthy();
  });

  test("unpinning an unknown id and pinning twice are both harmless", async () => {
    const db = await import("../src/store/db.ts");
    const s = db.createSession("/w", "m1");
    db.pinSession(s.id);
    db.pinSession(s.id);
    db.unpinSession(s.id);
    db.unpinSession("nope");
    expect(db.getSession(s.id)).toBeTruthy();
  });

  test("deleting a pinned session does not leave a stale pin behind", async () => {
    const db = await import("../src/store/db.ts");
    const victim = db.createSession("/w", "m1");
    db.pinSession(victim.id);
    expect(db.deleteSession(victim.id)).toBe(true);

    // a stale pin makes the cache un-evictable one slot at a time; the next
    // session to be pinned must still be the only protected one
    const live = db.createSession("/w", "m1");
    db.pinSession(live.id);
    const held = db.sessionDb(live.id);
    const other = db.createSession("/w", "m1");
    const otherHeld = db.sessionDb(other.id);
    for (let i = 0; i < 20; i++) db.sessionUsage(db.createSession("/w", "m1").id);
    expect(() => held.prepare("SELECT 1").get()).not.toThrow();
    expect(() => otherHeld.prepare("SELECT 1").get()).toThrow();
  });

  test("everything pinned means going over the cap, not spinning forever", async () => {
    // evict() is bounded by the map size rather than looping while size > cap;
    // an all-pinned cache has nothing evictable and must simply return
    const db = await import("../src/store/db.ts");
    const held: { id: string; d: any }[] = [];
    for (let i = 0; i < 12; i++) {
      const s = db.createSession("/w", "m1");
      db.pinSession(s.id);
      held.push({ id: s.id, d: db.sessionDb(s.id) });
    }
    for (const h of held) expect(() => h.d.prepare("SELECT 1").get()).not.toThrow();
    for (const h of held) db.unpinSession(h.id);
  });
});
