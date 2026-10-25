/**
 * Cross-process "this session is open" markers.
 *
 * A session is one SQLite file; two live writers (a TUI and `fox --acp`, two
 * TUIs in different terminals) would interleave appends into the same
 * transcript and produce a history neither front end showed. The lock makes
 * the second opener a read-only viewer instead of a second writer.
 *
 * It is a best-effort marker file, not an OS lock: `$FOX_AGENT_HOME/locks/
 * <id>.json` holds `{pid, ts, kind}`. Liveness is the pid, not the file — a
 * crashed fox leaves the file behind, so a holder whose pid is gone (or has
 * been recycled... accepted risk, pid reuse is rare inside a session's life)
 * is treated as stale and its file removed on sight.
 */
import { mkdirSync, openSync, readFileSync, rmSync, writeFileSync, closeSync } from "node:fs";
import { join } from "node:path";
import { agentHome, assertSafeSessionId } from "../core/paths.ts";
import { pidAlive } from "../core/proc.ts";

export interface SessionLock {
  pid: number;
  /** "tui" | "acp" | "a2a" — shown to the second opener so it knows what it's looking at */
  kind: string;
  ts: number;
}

function lockPath(id: string): string {
  assertSafeSessionId(id);
  return join(agentHome(), "locks", `${id}.json`);
}

/** The live holder of this session's lock, or null (stale files are cleaned up). */
export function lockHolder(id: string): SessionLock | null {
  let l: SessionLock;
  try {
    l = JSON.parse(readFileSync(lockPath(id), "utf8"));
  } catch (e) {
    // ENOENT is simply "no lock". Anything else is an unusable file — a crash
    // between the O_EXCL create and the write leaves it empty, and a file we
    // cannot read is not evidence of a holder. Removing it matters: left in
    // place it is immortal, and every later opener would ALSO be told the lock
    // is free while never owning it (two writers on one session).
    if ((e as NodeJS.ErrnoException)?.code !== "ENOENT") rmSync(lockPath(id), { force: true });
    return null;
  }
  if (typeof l?.pid !== "number") {
    // parses, but is not a lock (truncated write, a foreign file)
    rmSync(lockPath(id), { force: true });
    return null;
  }
  if (l.pid === process.pid) return l;
  if (!pidAlive(l.pid)) {
    rmSync(lockPath(id), { force: true });
    return null;
  }
  return l;
}

/**
 * Take the lock for this process. Returns null on success, or the live holder
 * when another process has it — the caller decides what read-only means.
 * Uses O_EXCL create so two processes racing both see "no holder" cannot both
 * win: exactly one exclusive create succeeds.
 */
export function acquireLock(id: string, kind: string): SessionLock | null {
  assertSafeSessionId(id);
  mkdirSync(join(agentHome(), "locks"), { recursive: true });
  const self: SessionLock = { pid: process.pid, kind, ts: Date.now() };
  const data = JSON.stringify(self);
  try {
    const fd = openSync(lockPath(id), "wx", 0o600);
    try {
      writeFileSync(fd, data);
    } finally {
      closeSync(fd);
    }
    return null;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
  }
  const holder = lockHolder(id);
  // Stale/dead holder was cleaned (or file was corrupt): retry once.
  if (!holder) {
    try {
      const fd = openSync(lockPath(id), "wx", 0o600);
      try {
        writeFileSync(fd, data);
      } finally {
        closeSync(fd);
      }
      return null;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
      // Second EEXIST: someone else created the file in the gap between our
      // lockHolder read and this create. Re-read the LIVE holder and report it —
      // never return null ("we hold it") on faith. The old code returned null
      // when retry.pid === process.pid or retry was null, which could claim a
      // lock we do not actually hold (the create failed, so the file on disk is
      // some other writer's, or a third process's fresh lock).
      const retry = lockHolder(id);
      if (retry) return retry;
      // lockHolder cleaned a now-stale file that appeared mid-race: one more
      // honest create attempt, and if THAT hits EEXIST the live holder wins.
      try {
        const fd = openSync(lockPath(id), "wx", 0o600);
        try {
          writeFileSync(fd, data);
        } finally {
          closeSync(fd);
        }
        return null;
      } catch (e2) {
        if ((e2 as NodeJS.ErrnoException).code !== "EEXIST") throw e2;
        return lockHolder(id);
      }
    }
  }
  if (holder.pid === process.pid) return null;
  return holder;
}

/** Drop the lock, but only ours — never another process's. */
export function releaseLock(id: string): void {
  try {
    const l = JSON.parse(readFileSync(lockPath(id), "utf8")) as SessionLock;
    if (l?.pid === process.pid) rmSync(lockPath(id), { force: true });
  } catch {
    // unreadable or already gone — either way there is nothing of ours to undo
  }
}
