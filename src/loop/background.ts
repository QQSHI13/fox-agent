/**
 * Tool calls that outlived their turn step.
 *
 * ## What this is
 *
 * `autoBackgroundMs` stops the turn waiting on a slow call. But "stopped waiting"
 * alone left the agent blind: it was told nothing, so it could neither see that
 * work was still running nor stop it. A backgrounded call is now a real job —
 * the step's tool result says so and names an id, and `jobs({id})` kills it.
 *
 * ## Why the registry is the loop's, not the tool's
 *
 * `14c6323` deleted per-tool background state (`killExecJobs`, `killTasks`) and
 * the three cleanup sites that each had to know about it. Re-introducing that
 * shape would restore the coupling. Here every tool is uniform: the loop owns the
 * controller, the id, and the lifetime, so a new tool becomes backgroundable
 * without knowing this file exists.
 *
 * ## Lifetime
 *
 * The caller creates the `AbortController` BEFORE starting the work, so the
 * tool's signal can be aborted at any point. Registration happens only if the
 * call actually detaches, and the entry is dropped when it settles or is killed.
 * Killing aborts a controller raced against the turn's own signal, so a tool that
 * honours `ctx.signal` — exec, fetch, task — really stops; one that ignores it
 * stops being *tracked*, which is the most the loop can honestly promise.
 */

export interface BackgroundJob {
  /**
   * The node id the agent sees as `[N]` — the placeholder tool row's seq.
   *
   * Jobs are addressed by node, not by a synthetic `bgN`: the agent already
   * reads `[N]` markers on every message, so `jobs({id: 4423})` needs no second
   * naming scheme to learn or remember.
   */
  node: number;
  sessionId: string;
  /** the tool's name, so a completion line is recognisable */
  name: string;
  /** the tool_call id the placeholder answers */
  callId: string;
  startedAt: number;
}

interface Entry {
  job: BackgroundJob;
  ac: AbortController;
  settled: boolean;
  /** called when the job is KILLED, so the caller can report why */
  onKilled: ((note: string) => void) | null;
}

const jobs = new Map<number, Entry>();

/**
 * Notified whenever a job leaves the registry, so a session that was waiting on
 * it can re-check quiescence.
 *
 * A hook rather than an import: `steer.ts` already imports this module to read
 * `backgroundCount`, and importing it back would be a cycle. Installed from
 * `steer.ts` at module load.
 */
let onSettled: ((sessionId: string) => void) | null = null;
export function setBackgroundSettledHook(fn: ((sessionId: string) => void) | null): void {
  onSettled = fn;
}

/**
 * Adopt a call that has just detached, keyed by the placeholder's node id.
 *
 * `ac` must be the controller whose signal the tool is already running under —
 * created before the call started — so killing actually aborts the work rather
 * than only forgetting it.
 */
export function adoptBackground(
  node: number,
  sessionId: string,
  name: string,
  callId: string,
  ac: AbortController,
  onKilled: (note: string) => void,
): BackgroundJob {
  const job: BackgroundJob = { node, sessionId, name, callId, startedAt: Date.now() };
  jobs.set(node, { job, ac, settled: false, onKilled });
  return job;
}

/** The work finished on its own: deregister. The caller reports the result. */
export function settleBackground(node: number): void {
  const e = jobs.get(node);
  if (!e) return;
  e.settled = true;
  jobs.delete(node);
  onSettled?.(e.job.sessionId);
}

/** Live jobs, oldest first. `sessionId` narrows to one session. */
export function listBackground(sessionId?: string): BackgroundJob[] {
  return [...jobs.values()]
    .filter((e) => !e.settled && (sessionId === undefined || e.job.sessionId === sessionId))
    .sort((a, b) => a.job.node - b.job.node)
    .map((e) => e.job);
}

/**
 * Kill one job by its node id. Always returns a line describing what happened —
 * "no such job" is information the agent needs, not an error to infer from
 * silence.
 */
export function killBackground(node: number): string {
  const e = jobs.get(node);
  if (!e) return `no live job [${node}] (already finished, or never existed)`;
  e.settled = true;
  jobs.delete(node);
  const age = Math.round((Date.now() - e.job.startedAt) / 1000);
  try {
    // the tool sees this through the combined signal and stops its own work
    e.ac.abort(new Error(`killed by jobs({id:${node}})`));
  } catch {}
  e.onKilled?.(`[${node}] (${e.job.name}) was killed after ${age}s — no output.`);
  onSettled?.(e.job.sessionId);
  return `killed [${node}] (${e.job.name}, ${age}s)`;
}

/** Drop every job for a session — session end/switch. Returns how many. */
export function killSessionBackground(sessionId: string): number {
  let n = 0;
  for (const e of [...jobs.values()]) {
    if (e.job.sessionId !== sessionId) continue;
    e.settled = true;
    jobs.delete(e.job.node);
    try {
      e.ac.abort(new Error("session ended"));
    } catch {}
    n++;
  }
  return n;
}

/** Tests only: forget everything without aborting. */
export function resetBackground(): void {
  jobs.clear();
}
