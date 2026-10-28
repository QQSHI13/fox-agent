/**
 * Cross-process "a turn is running on this session" markers.
 *
 * A session is one SQLite file; two live writers (a TUI and `fox --acp`, two
 * TUIs in different terminals) would interleave appends into the same
 * transcript and produce a history neither front end showed. The marker names
 * the ONE turn that may write, so a second process asking to run a turn here
 * is refused instead of interleaving.
 *
 * The marker is TURN-SCOPED, not attachment-scoped: it exists only while a turn
 * actually runs (claimed in `runTurnCore`, released in its `finally`), so an
 * idle session — no foreground turn, nothing streaming — carries no lock at
 * all. Any client may then send the next message; whoever claims first owns
 * that turn. Holding a lock for a session's whole attached lifetime (the old
 * behaviour) meant a second opener stayed a read-only viewer until the owner
 * quit, which is both stricter than the transcript needs and surprising.
 *
 * It is a best-effort marker file, not an OS lock: `$FOX_AGENT_HOME/locks/
 * <id>.json` holds `{pid, ts, kind}`. Liveness is the pid, not the file — a
 * crashed fox leaves the file behind, so a holder whose pid is gone (or has
 * been recycled... accepted risk, pid reuse is rare inside a session's life)
 * is treated as stale and its file removed on sight.
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync, linkSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { agentHome, assertSafeSessionId } from "../core/paths.ts";
import { pidAlive } from "../core/proc.ts";

export interface SessionLock {
  pid: number;
  /** "tui" | "acp" | "a2a" — shown to the refused caller so it knows what it's looking at */
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
 * The live holder of this session, when it is ANOTHER process — null when the
 * session is free for us (no marker, a stale one, or one of our own).
 *
 * Callers that only need "may I write here right now" use this rather than
 * `lockHolder`, so the same-process case never has to be spelled out again.
 */
export function foreignLock(id: string): SessionLock | null {
  const l = lockHolder(id);
  return l && l.pid !== process.pid ? l : null;
}

/**
 * Publish this lock atomically: write it complete, under a private name, then
 * `link()` it into place. Returns true when the link succeeded (we hold it),
 * false when the target already exists (someone else does).
 *
 * The obvious version — `openSync(path, "wx")` then write — has a window where
 * the lock file exists and is EMPTY, and `lockHolder` treats an unparseable file
 * as garbage and deletes it. A second process landing in that window got
 * "no lock", deleted our file, and both processes then believed they held the
 * session — the interleaved-transcript failure this module exists to prevent.
 *
 * `link()` is the atomic primitive here: it either creates the name pointing at
 * a complete file, or fails with EEXIST. No reader can ever observe a partial
 * lock.
 */
function publishLock(id: string, data: string): boolean {
  const tmp = `${lockPath(id)}.${process.pid}.tmp`;
  try {
    writeFileSync(tmp, data, { mode: 0o600 });
    linkSync(tmp, lockPath(id));
    return true;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "EEXIST") return false;
    throw e;
  } finally {
    try {
      unlinkSync(tmp);
    } catch {}
  }
}

/**
 * Take the lock for this process. Returns null on success, or the live holder
 * when another process has it — the caller decides what refusal means.
 *
 * The create is atomic (`publishLock`), so two processes racing both see "no
 * holder" cannot both win: exactly one link succeeds.
 */
export function acquireLock(id: string, kind: string): SessionLock | null {
  assertSafeSessionId(id);
  mkdirSync(join(agentHome(), "locks"), { recursive: true });
  const self: SessionLock = { pid: process.pid, kind, ts: Date.now() };
  const data = JSON.stringify(self);
  if (publishLock(id, data)) return null;
  const holder = lockHolder(id);
  // Stale/dead holder was cleaned (or file was corrupt): retry once.
  if (!holder) {
    if (publishLock(id, data)) return null;
    // Second collision: someone else published in the gap between our
    // lockHolder read and this attempt. Re-read the LIVE holder and report it —
    // never return null ("we hold it") on faith. The old code returned null when
    // the retry looked like ours or was gone, which could claim a lock we do not
    // actually hold (the create failed, so the file on disk is some other
    // writer's, or a third process's fresh lock).
    const retry = lockHolder(id);
    if (retry) return retry;
    // lockHolder cleaned a now-stale file that appeared mid-race: one more
    // honest attempt, and if THAT collides the live holder wins.
    if (publishLock(id, data)) return null;
    return lockHolder(id);
  }
  if (holder.pid === process.pid) return null;
  return holder;
}

/** Drop the lock, but only ours — never another process's. Also forgets our
 *  depth count, so a teardown mid-turn (session close/delete) does not leave a
 *  stale depth that would make the next turn think it is nested. */
export function releaseLock(id: string): void {
  heldDepth.delete(id);
  try {
    const l = JSON.parse(readFileSync(lockPath(id), "utf8")) as SessionLock;
    if (l?.pid === process.pid) rmSync(lockPath(id), { force: true });
  } catch {
    // unreadable or already gone — either way there is nothing of ours to undo
  }
}

/** Turn markers this process currently holds, by depth (see `acquireTurnLock`). */
const heldDepth = new Map<string, number>();

/**
 * Claim the session's in-flight-turn marker. True when this process may run the
 * turn; false when another LIVE process is already running one here.
 *
 * Depth-counted because `acquireLock` reports our own pid as "already held":
 * without a counter, a nested turn (a host's `turn` wrapper around
 * `runTurnCore` — ACP's `turnEvents` is exactly that) would drop the outer
 * turn's marker on its way out and leave the session looking idle mid-turn,
 * which is the interleaving this module exists to prevent.
 */
export function acquireTurnLock(id: string, kind = "fox"): boolean {
  const n = heldDepth.get(id) ?? 0;
  if (n > 0) {
    heldDepth.set(id, n + 1);
    return true;
  }
  if (foreignLock(id)) return false;
  const res = acquireLock(id, kind);
  // A non-null result that is not ours means the create lost a race to a live
  // holder; null means we took it.
  if (res && res.pid !== process.pid) return false;
  heldDepth.set(id, 1);
  return true;
}

/** Release one depth of the session's turn marker; the file goes when it hits 0. */
export function releaseTurnLock(id: string): void {
  const n = heldDepth.get(id) ?? 0;
  if (n > 1) {
    heldDepth.set(id, n - 1);
    return;
  }
  heldDepth.delete(id);
  releaseLock(id);
}
