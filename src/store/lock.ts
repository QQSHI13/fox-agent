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
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { agentHome } from "../core/paths.ts";

export interface SessionLock {
  pid: number;
  /** "tui" | "acp" | "a2a" — shown to the second opener so it knows what it's looking at */
  kind: string;
  ts: number;
}

function lockPath(id: string): string {
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
 */
export function acquireLock(id: string, kind: string): SessionLock | null {
  const holder = lockHolder(id);
  if (holder && holder.pid !== process.pid) return holder;
  mkdirSync(join(agentHome(), "locks"), { recursive: true });
  const self: SessionLock = { pid: process.pid, kind, ts: Date.now() };
  writeFileSync(lockPath(id), JSON.stringify(self));
  return null;
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
