// Cross-process exclusion, with a REAL second process.
//
// Every other lock test runs in one process, which cannot prove the thing the
// marker exists for: that a second fox-agent on the same session actually backs
// off. A hand-written `{pid: 1}` file exercises only the read path — it says
// nothing about whether a live process's marker survives the liveness check, or
// whether the refusal clears once that process is gone.
//
// So this spawns `test/fixtures/lock-holder.ts` as its own process, which claims
// the marker for a session and holds it until killed. The assertions then are
// the real contract: refused while it lives, accepted the moment it dies, with
// nothing manual in between.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const HOLDER = join(ROOT, "test", "fixtures", "lock-holder.ts");

let home: string;
let procs: ReturnType<typeof Bun.spawn>[] = [];

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "fox-xproc-"));
  process.env.FOX_AGENT_HOME = home;
  // never let a subprocess read the developer's real config (CLAUDE.md)
  process.env.FOX_AGENT_CONFIG = join(home, "config.toml");
  procs = [];
});

afterEach(() => {
  for (const p of procs) {
    try {
      p.kill();
    } catch {}
  }
  rmSync(home, { recursive: true, force: true });
  delete process.env.FOX_AGENT_HOME;
  delete process.env.FOX_AGENT_CONFIG;
});

const cfg = () => ({ baseUrl: "http://localhost:9", apiKey: "test", model: "test-model" });

// Annotated rather than inferred: without it `type` widens to `string` and the
// script stops satisfying `StreamEvent`.
type Script = import("../src/providers/types.ts").StreamEvent[];
const textDone = (t: string): Script => [
  { type: "text", delta: t },
  { type: "done", reason: "stop" },
];

function mockChat(script: Script) {
  return async function* (): AsyncGenerator<import("../src/providers/types.ts").StreamEvent> {
    for (const ev of script) yield ev;
  };
}

/** Spawn the fixture and resolve once it has actually published the marker. */
async function holdFromAnotherProcess(sessionId: string, kind = "tui") {
  const p = Bun.spawn(["bun", HOLDER], {
    cwd: ROOT,
    env: { ...process.env, FOX_AGENT_HOME: home, FOX_AGENT_CONFIG: join(home, "config.toml"), FOX_LOCK_SESSION: sessionId, FOX_LOCK_KIND: kind },
    stdout: "pipe",
    stderr: "pipe",
  });
  procs.push(p);
  // Wait for the "holding" line rather than sleeping: the marker must be on
  // disk before the assertions run, or this races its own setup.
  const reader = p.stdout.getReader();
  let seen = "";
  const deadline = Date.now() + 15_000;
  while (!seen.includes("holding") && Date.now() < deadline) {
    const { value, done } = await reader.read();
    if (done) break;
    seen += new TextDecoder().decode(value);
  }
  reader.releaseLock();
  if (!seen.includes("holding")) {
    const err = await new Response(p.stderr).text();
    throw new Error(`lock-holder never reported holding: ${seen}${err}`);
  }
  return p;
}

describe("a turn marker claimed by a real second process", () => {
  test("it is a live foreign pid, and the turn is refused", async () => {
    const db = await import("../src/store/db.ts");
    const lock = await import("../src/store/lock.ts");
    const turn = await import("../src/loop/turn.ts");

    const s = db.createSession("/w", "m1");
    const p = await holdFromAnotherProcess(s.id, "acp");
    expect(p.pid).toBeGreaterThan(0);

    // the marker is genuinely theirs, and the liveness check did not clean it
    const holder = lock.lockHolder(s.id);
    expect(holder?.pid).toBe(p.pid);
    expect(holder?.kind).toBe("acp");
    expect(holder?.pid).not.toBe(process.pid);

    let refused = "";
    try {
      for await (const _ev of turn.runTurnCore(s.id, cfg(), "hi", undefined, {
        chat: mockChat(textDone("must not run")) as never,
        quiet: true,
      })) {
        // nothing
      }
    } catch (e) {
      refused = (e as Error).message;
    }
    expect(refused).toContain("another fox-agent process");
    expect(refused).toContain("acp");
    expect(refused).toContain(String(p.pid));
    // and nothing was written through that refusal
    expect(db.allMessages(s.id)).toHaveLength(0);
  }, 30_000);

  test("once that process dies, the turn is accepted and the stale file is cleared", async () => {
    const db = await import("../src/store/db.ts");
    const lock = await import("../src/store/lock.ts");
    const turn = await import("../src/loop/turn.ts");

    const s = db.createSession("/w", "m1");
    const p = await holdFromAnotherProcess(s.id);
    expect(lock.lockHolder(s.id)?.pid).toBe(p.pid);

    // the holder crashes — it never releases, which is exactly the case the
    // pid-liveness rule exists for
    p.kill();
    await p.exited;
    // let the OS finish reaping so kill(pid, 0) reports ESRCH
    for (let i = 0; i < 200; i++) {
      const alive = (await import("../src/core/proc.ts")).pidAlive(p.pid);
      if (!alive) break;
      await new Promise((r) => setTimeout(r, 25));
    }

    // the stale marker does not survive being looked at, and does not block
    const events: import("../src/core/events.ts").AgentEvent[] = [];
    for await (const ev of turn.runTurnCore(s.id, cfg(), "after the crash", undefined, {
      chat: mockChat(textDone("accepted")) as never,
      quiet: true,
    })) {
      events.push(ev);
    }
    expect(events.at(-1)).toMatchObject({ type: "done", reason: "stop" });
    expect(db.allMessages(s.id).some((m) => m.content === "after the crash")).toBe(true);
    // and the dead process's file is gone, not left for the next opener
    expect(lock.lockHolder(s.id)).toBeNull();
  }, 30_000);

  test("two live processes never both hold the marker", async () => {
    const db = await import("../src/store/db.ts");
    const lock = await import("../src/store/lock.ts");

    const s = db.createSession("/w", "m1");
    await holdFromAnotherProcess(s.id);
    // this process now tries the same session: it must lose, not overwrite
    expect(lock.acquireTurnLock(s.id, "tui")).toBe(false);
    // and the on-disk marker still names the other process
    expect(lock.lockHolder(s.id)?.pid).not.toBe(process.pid);
  }, 30_000);

  test("a lock file left by a dead process does not block a later opener", async () => {
    // The narrow version of the crash case, without the subprocess: proves the
    // on-sight cleanup (rmSync) rather than only the "no refusal" outcome.
    const db = await import("../src/store/db.ts");
    const lock = await import("../src/store/lock.ts");
    const { writeFileSync, mkdirSync } = await import("node:fs");

    const s = db.createSession("/w", "m1");
    mkdirSync(join(home, "locks"), { recursive: true });
    const marker = join(home, "locks", `${s.id}.json`);
    writeFileSync(marker, JSON.stringify({ pid: 0xffffff, kind: "tui", ts: Date.now() }));
    expect(existsSync(marker)).toBe(true);

    expect(lock.lockHolder(s.id)).toBeNull();
    expect(existsSync(marker)).toBe(false); // removed on sight, not just ignored
    expect(lock.acquireTurnLock(s.id, "tui")).toBe(true);
    lock.releaseTurnLock(s.id);
  });
});
