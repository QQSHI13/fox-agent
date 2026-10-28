import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "fox-lock-"));
  process.env.FOX_AGENT_HOME = dir;
  // BOTH: loadConfig reads the global config from FOX_AGENT_CONFIG when set,
  // else ~/.config — setting only the home left this suite asserting against
  // the developer's real config (a stray key there flips expect(warnings)).
  // Point it inside the tmp home; never touch the real config (CLAUDE.md).
  process.env.FOX_AGENT_CONFIG = join(dir, "config.toml");
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  delete process.env.FOX_AGENT_HOME;
  delete process.env.FOX_AGENT_CONFIG;
});

describe("session lock", () => {
  test("a free session locks; our own re-entry is not a conflict", async () => {
    const { acquireLock, lockHolder } = await import("../src/store/lock.ts");
    expect(acquireLock("s1", "tui")).toBeNull();
    expect(lockHolder("s1")?.pid).toBe(process.pid);
    expect(acquireLock("s1", "acp")).toBeNull(); // same process, re-taken
  });

  test("a live foreign pid holds the lock; release never removes it", async () => {
    const { acquireLock, releaseLock, lockHolder } = await import("../src/store/lock.ts");
    mkdirSync(join(dir, "locks"), { recursive: true });
    // pid 1 always exists; as non-root we can't signal it, which must read as alive
    writeFileSync(join(dir, "locks", "s2.json"), JSON.stringify({ pid: 1, kind: "tui", ts: Date.now() }));
    const holder = acquireLock("s2", "tui");
    expect(holder?.pid).toBe(1);
    releaseLock("s2");
    expect(lockHolder("s2")?.pid).toBe(1); // still there — not ours to delete
  });

  test("a dead holder's file is stale and cleaned on sight", async () => {
    const { acquireLock, lockHolder } = await import("../src/store/lock.ts");
    mkdirSync(join(dir, "locks"), { recursive: true });
    writeFileSync(join(dir, "locks", "s3.json"), JSON.stringify({ pid: 0xffffff, kind: "tui", ts: Date.now() }));
    expect(lockHolder("s3")).toBeNull();
    expect(acquireLock("s3", "tui")).toBeNull();
  });

  test("an unreadable lock file is cleaned, never read as 'free while still there'", async () => {
    const { acquireLock, lockHolder } = await import("../src/store/lock.ts");
    mkdirSync(join(dir, "locks"), { recursive: true });
    // a crash between the O_EXCL create and the write leaves it empty
    writeFileSync(join(dir, "locks", "s5.json"), "");
    expect(lockHolder("s5")).toBeNull();
    // and the empty file must be GONE, so the create below really succeeds
    expect(acquireLock("s5", "tui")).toBeNull();
    expect(lockHolder("s5")?.pid).toBe(process.pid);
    // a file that parses but is not a lock is not a holder either
    writeFileSync(join(dir, "locks", "s6.json"), JSON.stringify({ kind: "tui" }));
    expect(lockHolder("s6")).toBeNull();
    expect(acquireLock("s6", "tui")).toBeNull();
    expect(lockHolder("s6")?.pid).toBe(process.pid);
  });

  test("release removes our own lock", async () => {
    const { acquireLock, releaseLock, lockHolder } = await import("../src/store/lock.ts");
    acquireLock("s4", "tui");
    releaseLock("s4");
    expect(lockHolder("s4")).toBeNull();
  });

  // The bug: acquireLock created the file with O_EXCL and wrote the JSON into it
  // afterwards, so for a moment the lock existed but was EMPTY — and lockHolder
  // treats an unparseable file as garbage and removes it. A second process
  // landing in that window got "free", deleted the first process's lock, and
  // both then believed they held the session (interleaved transcripts — the one
  // thing this module exists to prevent). The lock is now published by link(),
  // which is atomic: the name appears already holding a complete file.
  test("a lock is never observable before it is complete", async () => {
    const { acquireLock } = await import("../src/store/lock.ts");
    const { readFileSync, readdirSync } = await import("node:fs");
    expect(acquireLock("s7", "tui")).toBeNull();
    // the published file parses on the first read, with no retry or window
    const raw = readFileSync(join(dir, "locks", "s7.json"), "utf8");
    expect(() => JSON.parse(raw)).not.toThrow();
    expect(JSON.parse(raw).pid).toBe(process.pid);
    // and no temp file is left lying around for a later opener to trip over
    expect(readdirSync(join(dir, "locks")).filter((f) => f.endsWith(".tmp"))).toHaveLength(0);
  });

  test("two racers still produce exactly one holder", async () => {
    const { lockHolder } = await import("../src/store/lock.ts");
    mkdirSync(join(dir, "locks"), { recursive: true });
    // A foreign live holder published between our two attempts must win: the
    // claim path never reports success on faith after a collision.
    writeFileSync(join(dir, "locks", "s8.json"), JSON.stringify({ pid: 1, kind: "acp", ts: Date.now() }));
    const { acquireLock } = await import("../src/store/lock.ts");
    expect(acquireLock("s8", "tui")?.pid).toBe(1);
    expect(lockHolder("s8")?.kind).toBe("acp");
  });
});

/**
 * The turn-scoped API — the property the flexible lock exists for. These are
 * separate from the raw marker tests above because they carry the DEPTH count
 * (nested turns) and the "foreign means busy" rule, which is what callers
 * actually rely on.
 */
describe("turn-scoped lock", () => {
  test("claiming a free session publishes a marker; releasing removes it", async () => {
    const { acquireTurnLock, releaseTurnLock, lockHolder } = await import("../src/store/lock.ts");
    expect(acquireTurnLock("t1", "tui")).toBe(true);
    expect(lockHolder("t1")?.pid).toBe(process.pid);
    expect(lockHolder("t1")?.kind).toBe("tui");
    releaseTurnLock("t1");
    // the file is GONE, not merely ours — an idle session carries no lock, so
    // another process can take the next turn immediately
    expect(lockHolder("t1")).toBeNull();
    expect(acquireTurnLock("t1", "acp")).toBe(true);
    releaseTurnLock("t1");
  });

  test("a foreign live turn refuses the claim", async () => {
    const { acquireTurnLock } = await import("../src/store/lock.ts");
    mkdirSync(join(dir, "locks"), { recursive: true });
    writeFileSync(join(dir, "locks", "t2.json"), JSON.stringify({ pid: 1, kind: "acp", ts: Date.now() }));
    expect(acquireTurnLock("t2", "tui")).toBe(false);
    // and it did not overwrite the holder
    expect((await import("../src/store/lock.ts")).lockHolder("t2")?.kind).toBe("acp");
  });

  test("nested claims keep the marker until the OUTERMOST turn ends", async () => {
    // ACP's turnEvents wraps runTurnCore, so one logical turn takes the marker
    // twice. Without the depth count the inner release deleted the marker
    // mid-turn and the session looked idle while it was still streaming.
    const { acquireTurnLock, releaseTurnLock, lockHolder } = await import("../src/store/lock.ts");
    expect(acquireTurnLock("t3", "acp")).toBe(true);
    expect(acquireTurnLock("t3", "acp")).toBe(true);
    releaseTurnLock("t3");
    expect(lockHolder("t3")?.pid).toBe(process.pid); // still claimed
    releaseTurnLock("t3");
    expect(lockHolder("t3")).toBeNull();
  });

  test("a stale foreign marker does not block, and is cleaned on sight", async () => {
    const { acquireTurnLock, releaseTurnLock } = await import("../src/store/lock.ts");
    mkdirSync(join(dir, "locks"), { recursive: true });
    writeFileSync(join(dir, "locks", "t4.json"), JSON.stringify({ pid: 0xffffff, kind: "tui", ts: Date.now() }));
    expect(acquireTurnLock("t4", "acp")).toBe(true);
    releaseTurnLock("t4");
  });

  test("releaseLock forgets the depth, so a teardown mid-turn does not strand it", async () => {
    // session/close and session/delete call releaseLock while the turn may have
    // nested claims outstanding; a leftover count would make the NEXT turn
    // believe it is nested and skip its own acquire.
    const { acquireTurnLock, releaseTurnLock, releaseLock, lockHolder } = await import("../src/store/lock.ts");
    expect(acquireTurnLock("t5", "acp")).toBe(true);
    expect(acquireTurnLock("t5", "acp")).toBe(true);
    releaseLock("t5");
    expect(lockHolder("t5")).toBeNull();
    // a fresh acquire after the teardown really publishes again
    expect(acquireTurnLock("t5", "acp")).toBe(true);
    expect(lockHolder("t5")?.pid).toBe(process.pid);
    releaseTurnLock("t5");
    releaseTurnLock("t5");
    expect(lockHolder("t5")).toBeNull();
  });
});
