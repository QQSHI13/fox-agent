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
});
