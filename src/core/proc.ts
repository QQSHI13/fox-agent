/**
 * Is this pid still running?
 *
 * `kill(pid, 0)` sends no signal and only probes, but it throws ESRCH when the
 * process is gone and EPERM when it exists and belongs to someone else (pid 1 in
 * a container, another user's process). Only ESRCH means dead — treating EPERM
 * as dead would declare a live holder stale and let a second writer take a
 * session that is really open.
 *
 * Used by the session lock and by the pty reaper, which must agree: one decides
 * who may write a session, the other whether a tmux session is orphaned.
 */
export function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException)?.code === "EPERM";
  }
}
