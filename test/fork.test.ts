// Forking now copies a whole database file rather than INSERT..SELECTing rows
// into a shared one. The isolation that buys is the thing to test: a fork and
// its source must be unable to affect each other at all.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "fox-fork-"));
  process.env.FOX_AGENT_HOME = dir;
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

async function seeded() {
  const { createSession, appendMessage, appendOps, kvSet } = await import("../src/store/db.ts");
  const s = createSession("/work", "m1");
  const a = appendMessage(s.id, { parent_id: null, role: "user", content: "one", tokens: 1 });
  const b = appendMessage(s.id, { parent_id: a.id, role: "assistant", content: "two", tokens: 1 });
  const c = appendMessage(s.id, { parent_id: b.id, role: "user", content: "three", tokens: 1 });
  appendOps(s.id, [{ kind: "replace", id: b.seq, content: "two!" }]);
  kvSet(s.id, "todos", [{ content: "carry me", status: "pending" }]);
  return { s, seqs: { a: a.seq, b: b.seq, c: c.seq } };
}

describe("fork isolation", () => {
  test("the fork is a separate file and the source is untouched by later writes", async () => {
    const { forkSession, appendMessage, allMessages } = await import("../src/store/db.ts");
    const { sessionDbPath } = await import("../src/core/paths.ts");
    const { s } = await seeded();

    const fork = forkSession(s.id)!;
    expect(existsSync(sessionDbPath(fork.id))).toBe(true);
    expect(sessionDbPath(fork.id)).not.toBe(sessionDbPath(s.id));

    // write into the fork; the source must not see it, in either direction
    appendMessage(fork.id, { parent_id: null, role: "user", content: "only in fork", tokens: 3 });
    appendMessage(s.id, { parent_id: null, role: "user", content: "only in source", tokens: 3 });
    expect(allMessages(fork.id).map((m) => m.content)).toEqual(["one", "two", "three", "only in fork"]);
    expect(allMessages(s.id).map((m) => m.content)).toEqual(["one", "two", "three", "only in source"]);
  });

  test("deleting a fork's file leaves the source readable", async () => {
    const { forkSession, allMessages } = await import("../src/store/db.ts");
    const { sessionDbPath } = await import("../src/core/paths.ts");
    const { closeAll } = await import("../src/store/db.ts");
    const { s } = await seeded();
    const fork = forkSession(s.id)!;

    closeAll(); // release the handle before unlinking
    rmSync(sessionDbPath(fork.id), { force: true });
    expect(allMessages(s.id)).toHaveLength(3);
  });

  test("ops, kv and the model carry over; usage does not", async () => {
    const { forkSession, allOps, kvGet, recordUsage, sessionUsage, getSession } = await import("../src/store/db.ts");
    const { s } = await seeded();
    recordUsage(s.id, null, 500, 50);

    const fork = forkSession(s.id)!;
    expect(allOps(fork.id)).toHaveLength(1);
    expect(kvGet<{ content: string }[]>(fork.id, "todos")![0]!.content).toBe("carry me");
    expect(getSession(fork.id)!.model).toBe("m1");
    expect(getSession(fork.id)!.cwd).toBe("/work");
    // billing belongs to the calls that were actually made, i.e. the source's
    expect(sessionUsage(fork.id)).toEqual({ prompt: 0, completion: 0 });
    expect(sessionUsage(s.id).prompt).toBe(500);
  });

  test("a view op still applies to the fork's copy of the message", async () => {
    const { forkSession } = await import("../src/store/db.ts");
    const { projectView } = await import("../src/context/view.ts");
    const { s, seqs } = await seeded();
    const fork = forkSession(s.id)!;
    // the replace op referenced seq b; seqs are preserved by the copy, so it lands
    expect(projectView(fork.id).find((n) => n.msg.seq === seqs.b)!.content).toBe("two!");
  });
});

describe("fork truncation and lineage", () => {
  test("uptoSeq truncates and re-points main at the new tip", async () => {
    const { forkSession, allMessages, getRef } = await import("../src/store/db.ts");
    const { s, seqs } = await seeded();

    const fork = forkSession(s.id, seqs.b)!;
    expect(allMessages(fork.id).map((m) => m.content)).toEqual(["one", "two"]);
    expect(getRef(fork.id)).toBe(`${fork.id}:${seqs.b}`);
  });

  test("a parent cut off by truncation becomes null rather than dangling", async () => {
    const { forkSession, allMessages } = await import("../src/store/db.ts");
    const { s, seqs } = await seeded();
    const fork = forkSession(s.id, seqs.a)!;
    const rows = allMessages(fork.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.parent_id).toBeNull();
  });

  test("every parent_id resolves inside the fork, never into the source", async () => {
    const { forkSession, allMessages } = await import("../src/store/db.ts");
    const { s } = await seeded();
    const fork = forkSession(s.id)!;
    const rows = allMessages(fork.id);
    const own = new Set(rows.map((m) => m.id));
    for (const m of rows) {
      expect(m.session_id).toBe(fork.id);
      expect(m.id.startsWith(`${fork.id}:`)).toBe(true);
      if (m.parent_id) expect(own.has(m.parent_id)).toBe(true);
    }
  });

  test("forking twice yields two independent sessions", async () => {
    const { forkSession, appendMessage, allMessages } = await import("../src/store/db.ts");
    const { s } = await seeded();
    const f1 = forkSession(s.id)!;
    const f2 = forkSession(s.id)!;
    expect(f1.id).not.toBe(f2.id);

    appendMessage(f1.id, { parent_id: null, role: "user", content: "f1 only", tokens: 2 });
    expect(allMessages(f1.id)).toHaveLength(4);
    expect(allMessages(f2.id)).toHaveLength(3);
    // ids are unique across source and both forks
    const ids = [s.id, f1.id, f2.id].flatMap((id) => allMessages(id).map((m) => m.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("a fork of a fork keeps working", async () => {
    const { forkSession, allMessages } = await import("../src/store/db.ts");
    const { s } = await seeded();
    const f2 = forkSession(forkSession(s.id)!.id)!;
    expect(allMessages(f2.id).map((m) => m.content)).toEqual(["one", "two", "three"]);
    for (const m of allMessages(f2.id)) expect(m.id.startsWith(`${f2.id}:`)).toBe(true);
  });

  test("the fork is titled after its source and appears in the index", async () => {
    const { forkSession, setRefTitle, listSessions, getSession } = await import("../src/store/db.ts");
    const { s } = await seeded();
    setRefTitle(s.id, "the original");
    const fork = forkSession(s.id)!;
    expect(getSession(fork.id)!.title).toBe("fork of the original");
    expect(listSessions().map((r) => r.id)).toContain(fork.id);
  });

  test("forking an unknown session returns null and creates nothing", async () => {
    const { forkSession, listSessions } = await import("../src/store/db.ts");
    const before = listSessions().length;
    expect(forkSession("nope")).toBeNull();
    expect(listSessions().length).toBe(before);
  });

  test("uncommitted WAL content still makes it into the copy", async () => {
    // VACUUM INTO reads the database; without a checkpoint first, rows still
    // sitting in this process's WAL would be missing from the fork
    const { createSession, appendMessage, forkSession, allMessages } = await import("../src/store/db.ts");
    const s = createSession("/w", "m1");
    for (let i = 0; i < 50; i++) appendMessage(s.id, { parent_id: null, role: "user", content: `m${i}`, tokens: 1 });
    const fork = forkSession(s.id)!;
    expect(allMessages(fork.id)).toHaveLength(50);
    expect(allMessages(fork.id)[49]!.content).toBe("m49");
  });

  test("forking works with the handle cache saturated", async () => {
    // fork touches two databases, so it is the operation most exposed to the LRU
    // evicting a handle underneath it. It is safe today only because the copy is
    // finished before the fork's handle is opened; this pins that ordering, and
    // fails if a later change starts interleaving the two.
    const { createSession, appendMessage, forkSession, allMessages } = await import("../src/store/db.ts");
    const { s } = await seeded();
    for (let i = 0; i < 10; i++) {
      const filler = createSession("/w", "m1");
      appendMessage(filler.id, { parent_id: null, role: "user", content: `filler ${i}`, tokens: 1 });
    }
    const fork = forkSession(s.id)!;
    expect(allMessages(fork.id).map((m) => m.content)).toEqual(["one", "two", "three"]);
    expect(allMessages(s.id)).toHaveLength(3);
  });
});
