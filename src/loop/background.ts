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
  /** short and stable; shown in the tool result so the agent can kill this one */
  id: string;
  sessionId: string;
  /** the tool's name, so a completion line is recognisable */
  name: string;
  /** the tool_call id whose result row the placeholder occupies */
  callId: string;
  startedAt: number;
}

interface Entry {
  job: BackgroundJob;
  ac: AbortController;
  settled: boolean;
  /** called when the job is KILLED, so the caller can rewrite its result row */
  onKilled: ((output: string) => void) | null;
}

const jobs = new Map<string, Entry>();
let seq = 0;

/**
 * Adopt a call that has just detached.
 *
 * `ac` must be the controller whose signal the tool is already running under —
 * created before the call started — so killing actually aborts the work rather
 * than only forgetting it. `onKilled` rewrites the placeholder result row with
 * the kill notice; the normal completion path does its own rewrite and only
 * needs `settleBackground`.
 */
export function adoptBackground(
  sessionId: string,
  name: string,
  callId: string,
  ac: AbortController,
  onKilled: (output: string) => void,
): BackgroundJob {
  const id = `bg${++seq}`;
  const job: BackgroundJob = { id, sessionId, name, callId, startedAt: Date.now() };
  jobs.set(id, { job, ac, settled: false, onKilled });
  return job;
}

/** The job for a call id, if that call is currently detached. */
export function backgroundFor(callId: string): BackgroundJob | null {
  for (const e of jobs.values()) if (!e.settled && e.job.callId === callId) return e.job;
  return null;
}

/** The work finished on its own: the caller already wrote the result. Deregister. */
export function settleBackground(id: string): void {
  const e = jobs.get(id);
  if (!e) return;
  e.settled = true;
  jobs.delete(id);
}

/** Live jobs, newest last. `sessionId` narrows to one session. */
export function listBackground(sessionId?: string): BackgroundJob[] {
  return [...jobs.values()]
    .filter((e) => !e.settled && (sessionId === undefined || e.job.sessionId === sessionId))
    .map((e) => e.job);
}

/**
 * Kill one job. Always returns a line describing what happened — "no such job"
 * is information the agent needs, not an error it has to infer from silence.
 */
export function killBackground(id: string): string {
  const e = jobs.get(id);
  if (!e) return `no live job '${id}' (already finished, or never existed)`;
  e.settled = true;
  jobs.delete(id);
  const age = Math.round((Date.now() - e.job.startedAt) / 1000);
  try {
    // the tool sees this through the combined signal and stops its own work
    e.ac.abort(new Error(`killed by jobs({id:"${id}"})`));
  } catch {}
  e.onKilled?.(`${id} (${e.job.name}) was killed after ${age}s — no output.`);
  return `killed ${id} (${e.job.name}, ${age}s)`;
}

/** Drop every job for a session — session end/switch. Returns how many. */
export function killSessionBackground(sessionId: string): number {
  let n = 0;
  for (const e of [...jobs.values()]) {
    if (e.job.sessionId !== sessionId) continue;
    e.settled = true;
    jobs.delete(e.job.id);
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
  seq = 0;
}
