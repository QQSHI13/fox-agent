// The on-disk layout is a contract: FOX_HOME is honored, one file per session,
// and the pre-1.0 single-file store is removed rather than left to rot.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "fox-paths-"));
  process.env.FOX_HOME = dir;
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("paths", () => {
  test("every path derives from FOX_HOME, read live", async () => {
    const { foxHome, indexDbPath, sessionDbPath, ptyDir, legacyDbPath } = await import("../src/core/paths.ts");
    expect(foxHome()).toBe(dir);
    expect(indexDbPath()).toBe(join(dir, "index.db"));
    expect(sessionDbPath("abc")).toBe(join(dir, "sessions", "abc.db"));
    expect(ptyDir()).toBe(join(dir, "pty"));
    expect(legacyDbPath()).toBe(join(dir, "sessions.db"));

    // read on every call, not captured at import: the store and pty tool both
    // depend on this to follow a FOX_HOME that changes between test cases
    const other = join(dir, "elsewhere");
    process.env.FOX_HOME = other;
    expect(foxHome()).toBe(other);
    process.env.FOX_HOME = dir;
  });

  test("ensureLayout creates sessions/ and pty/", async () => {
    const { ensureLayout } = await import("../src/core/paths.ts");
    ensureLayout();
    expect(existsSync(join(dir, "sessions"))).toBe(true);
    expect(existsSync(join(dir, "pty"))).toBe(true);
  });
});

describe("per-session files", () => {
  test("each session gets its own database file", async () => {
    const { createSession, appendMessage } = await import("../src/store/db.ts");
    const a = createSession("/w", "m1");
    const b = createSession("/w", "m1");
    appendMessage(a.id, { parent_id: null, role: "user", content: "in a", tokens: 2 });
    appendMessage(b.id, { parent_id: null, role: "user", content: "in b", tokens: 2 });

    const files = readdirSync(join(dir, "sessions")).filter((f) => f.endsWith(".db"));
    expect(files).toContain(`${a.id}.db`);
    expect(files).toContain(`${b.id}.db`);
    expect(existsSync(join(dir, "index.db"))).toBe(true);
  });

  test("the index lists sessions without needing the session files", async () => {
    const { createSession, listSessions, latestSessionFor, getSession } = await import("../src/store/db.ts");
    const s = createSession("/work/here", "m1");
    createSession("/work/elsewhere", "m2");

    expect(listSessions().map((r) => r.id)).toContain(s.id);
    expect(latestSessionFor("/work/here")!.id).toBe(s.id);
    expect(latestSessionFor("/nowhere")).toBeNull();
    expect(getSession(s.id)!.model).toBe("m1");
    expect(getSession("no-such-session")).toBeNull();
  });

  test("more open sessions than the handle cap still all read back", async () => {
    // the LRU closes handles beyond the cap; a closed one must reopen silently
    const { createSession, appendMessage, allMessages } = await import("../src/store/db.ts");
    const ids: string[] = [];
    for (let i = 0; i < 12; i++) {
      const s = createSession("/w", "m1");
      appendMessage(s.id, { parent_id: null, role: "user", content: `msg ${i}`, tokens: 2 });
      ids.push(s.id);
    }
    // the first sessions were evicted long ago
    expect(allMessages(ids[0]!).map((m) => m.content)).toEqual(["msg 0"]);
    expect(allMessages(ids[11]!).map((m) => m.content)).toEqual(["msg 11"]);
  });
});

describe("legacy store", () => {
  test("a pre-1.0 sessions.db is deleted on first open, not migrated", async () => {
    const { closeAll } = await import("../src/store/db.ts");
    closeAll(); // drop handles so this case starts clean

    const legacy = join(dir, "sessions.db");
    writeFileSync(legacy, "pretend sqlite");
    writeFileSync(`${legacy}-wal`, "wal");
    writeFileSync(`${legacy}-shm`, "shm");

    const { createSession } = await import("../src/store/db.ts");
    createSession("/w", "m1");

    expect(existsSync(legacy)).toBe(false);
    expect(existsSync(`${legacy}-wal`)).toBe(false);
    expect(existsSync(`${legacy}-shm`)).toBe(false);
  });

  test("no legacy file is a silent no-op", async () => {
    const { closeAll, createSession, listSessions } = await import("../src/store/db.ts");
    closeAll();
    mkdirSync(join(dir, "sessions"), { recursive: true });
    const s = createSession("/w", "m1");
    expect(listSessions().map((r) => r.id)).toContain(s.id);
  });
});
