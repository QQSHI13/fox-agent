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

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    // EPERM means the pid exists but isn't ours to signal (e.g. pid 1 in a
    // container); only ESRCH means gone
    return (e as NodeJS.ErrnoException).code === "EPERM";
  }
}

/** The live holder of this session's lock, or null (stale files are cleaned up). */
export function lockHolder(id: string): SessionLock | null {
  let l: SessionLock;
  try {
    l = JSON.parse(readFileSync(lockPath(id), "utf8"));
  } catch {
    return null;
  }
  if (typeof l?.pid !== "number") return null;
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
      const retry = lockHolder(id);
      if (retry && retry.pid !== process.pid) return retry;
      return null;
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
