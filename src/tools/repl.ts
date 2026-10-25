/**
 * In-process JavaScript environment, as a bundled plugin.
 *
 * A persistent `node:vm` context per session, seeded with the real host
 * environment — `process`, timers, `Buffer`, `fetch`, and working dynamic
 * `import()`. The model already has full machine control through `exec`
 * (which runs anything, including `node -e "process.exit()"`), so the
 * scratchpad deliberately offers the same power: sandboxing one tool while
 * every other tool runs unrestricted would be theater, not safety.
 *
 * From code the agent reaches its own tools directly (`tools.call`), shell
 * included, without shell-quoting hell: compute over data instead of pasting
 * data into context. Direct calls bypass the turn loop's beforeTool/afterTool
 * hooks (documented in the def) — they are invocations, not steps.
 *
 * Background: `background: true` runs the eval detached and returns a job id;
 * `job` polls it (incremental console output + status), `signal: "kill"`
 * stops it. This is the ONE background surface — exec and task are
 * foreground-only, so a long-running process is `repl({code, background})`
 * whose code shells out via `tools.call("exec", …)` or `spawnShell`.
 */
import vm from "node:vm";
import { safeDelay, setLongTimeout, type LongTimeout } from "../core/timers.ts";
import type { ToolDef } from "../providers/types.ts";
import type { ToolContext, ToolResult } from "./types.ts";
import { fail, ok, validateArgs } from "./types.ts";
import { outCap } from "./files.ts";
import { steer, backgroundStarted, backgroundEnded } from "../loop/steer.ts";

export const replDef: ToolDef = {
  name: "repl",
  description:
    "In-process JavaScript environment (no shell, no subprocess — works in the compiled binary with no bun on PATH). Full environment: `process`, timers, `fetch`, and dynamic `import()` all work. State persists across calls in this session: assign once (`rows = ...`), reuse for twenty turns. `return` (or a trailing expression) becomes the result; `console.log` lines are captured alongside it. Reach your tools from code as `await tools.call(name, args)` (shell included: `await tools.call(\"exec\", {cmd})`); `tools.list()` and `tools.search(\"...\")` discover them. Direct tool calls bypass the turn loop's beforeTool/afterTool hooks. There is NO default timeout: an eval runs as long as it needs, so pass `timeout_ms` when you want a bound (omit it, or 0, for none). `background: true` runs the eval detached and returns a job id immediately — poll its incremental output/status with `job`, stop it with `signal:\"kill\"`; it notifies you on completion and reaps after a grace window.",
  parameters: {
    type: "object",
    properties: {
      code: { type: "string", description: "JavaScript to evaluate: a bare expression (or await) completes to its value; multi-statement blocks need an explicit return. Not needed when polling or killing a job." },
      reset: { type: "boolean", description: "Drop the session's scratchpad state before evaluating" },
      timeout_ms: { type: "number", description: "Optional bound in milliseconds; there is NO default — omit it (or pass 0) to run for as long as the eval needs, with no upper bound. vm cannot preempt a running eval, so an omitted bound on a hung eval blocks the call until the turn is interrupted (foreground only — background jobs always run until they exit or you kill them)" },
      label: { type: "string", description: "A short label for a background job (shown in poll output). Defaults to the first line of code." },
      background: { type: "boolean", description: "Run the eval detached: returns a job id immediately. The eval keeps running while you move on; you are notified when it finishes." },
      job: { type: "string", description: "Poll a background job: returns console output produced since your last poll plus its status (running/finished/exit). Omit code." },
      signal: { type: "string", enum: ["kill"], description: "With job: terminate that background job. Omit code." },
    },
    required: [],
  },
};

/** Session-nesting depth of repl-in-repl calls; unbounded nesting is a hang with extra steps. */
const MAX_REPL_DEPTH = 3;
const depths = new Map<string, number>();

interface ReplSession {
  context: vm.Context;
}

const sessions = new Map<string, ReplSession>();

/**
 * The host globals a fresh scratchpad starts with.
 *
 * These are seeded once, at context creation — and they are the REAL host
 * bindings, not stand-ins, because the whole point is a full environment:
 * `exec` already runs anything, so a hobbled repl adds friction, not safety.
 * A dynamic `import()` inside the eval resolves through
 * `importModuleDynamically` (Bun's vm supports it; the probe confirmed it),
 * so `await import("node:fs")` works exactly as it does in the harness itself.
 */
function seed(): Record<string, unknown> {
  return {
    process,
    console,
    Buffer,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    setImmediate,
    clearImmediate,
    queueMicrotask,
    fetch,
    URL,
    URLSearchParams,
    TextEncoder,
    TextDecoder,
    AbortController,
    AbortSignal,
    atob,
    btoa,
    structuredClone,
  };
}

function sessionState(sessionId: string): ReplSession {
  let s = sessions.get(sessionId);
  if (!s) {
    s = { context: vm.createContext(seed()) };
    sessions.set(sessionId, s);
  }
  return s;
}

// ---- background evals ------------------------------------------------------
//
// The ONE background surface. `background: true` runs `code` detached and
// returns a job id; `job` polls it, `signal: "kill"` stops it. A job's output
// is the console.log lines + return value, captured incrementally so a poll
// only returns what is new. Completion steers the agent; a settled job reaps
// after a grace window.

interface ReplJob {
  id: string;
  label: string;
  startedAt: number;
  done: boolean;
  ok: boolean;
  result: string;
  log: string[]; // console lines captured since the last poll
  logCursor: number; // how many of `log` the caller has already seen
  /** lines dropped by the retention cap before the caller ever polled them */
  lostLines: number;
  ac: AbortController; // cancelling aborts a job awaiting a fetch/timeout
  killed?: boolean; // suppresses the completion steer for a deliberately-killed job
  /** The session's background count was already decremented for this job.
   *  A job can settle on its own, be killed, or be released at session end —
   *  whichever happens first must decrement, and the rest must not. */
  bgEnded?: boolean;
  reaped?: boolean;
  readAt?: number; // when a settled job was first polled — starts the reap grace
}

const jobs = new Map<string, Map<string, ReplJob>>(); // sessionId -> id -> job
let jobSeq = 0;
const MAX_JOBS_PER_SESSION = 16;
const JOB_REAP_MS = 10 * 60_000;
const MAX_JOB_RESULT = 50_000;
/**
 * Bounded console retention for one background job.
 *
 * A long-lived chatty job (a watch loop, a server) used to grow `log` for its
 * whole lifetime — the RESULT was capped at 50k, the log was not. Keep the
 * newest lines: a poll is about recent progress, and 2000 lines is far more
 * than any realistic poll interval produces. Dropping unpolled lines is
 * reported once, so a poll never silently skips ahead.
 */
const MAX_JOB_LOG_LINES = 2_000;
/** One line's ceiling: an object dump can put megabytes on a single line. */
const MAX_JOB_LOG_LINE = 2_000;

function sessionJobs(sessionId: string): Map<string, ReplJob> {
  let m = jobs.get(sessionId);
  if (!m) jobs.set(sessionId, (m = new Map()));
  return m;
}

function liveJobCount(sessionId: string): number {
  return [...sessionJobs(sessionId).values()].filter((j) => !j.done).length;
}

/** Decrement the session's live-background count for this job, at most once.
 *  vm cannot preempt a running eval, so a killed job's promise may never
 *  settle — the kill path and session teardown must be able to release the
 *  count themselves without double-counting a job that later settles. */
function endBackground(sessionId: string, job: ReplJob): void {
  if (job.bgEnded) return;
  job.bgEnded = true;
  backgroundEnded(sessionId);
}

function reapJob(sessionId: string, id: string): void {
  const job = sessionJobs(sessionId).get(id);
  if (!job) return;
  job.reaped = true;
  sessionJobs(sessionId).delete(id);
}

function scheduleReap(sessionId: string, job: ReplJob): void {
  // a settled job stays readable for a grace window after it finishes, so the
  // model can still read the result if it polls promptly; a forgotten job must
  // not leak the map entry for the session
  const grace = setTimeout(() => {
    if (!job.reaped && job.done) reapJob(sessionId, job.id);
  }, JOB_REAP_MS);
  (grace as { unref?: () => void }).unref?.();
}

function notifyDone(sessionId: string, job: ReplJob): void {
  // Tell the agent it finished, wherever it is right now. steer's queue is the
  // existing delivery path: it arrives at the next step boundary as a real
  // message, and peekSteer shows it in the TUI meanwhile.
  if (job.killed) return;
  const secs = Math.floor((Date.now() - job.startedAt) / 1000);
  steer(
    sessionId,
    `repl job ${job.id} (${job.label}) ${job.ok ? "finished" : "FAILED"} after ${secs}s — ` +
      `poll it with repl({job:"${job.id}"}).`,
  );
}

/** Session end: drop the scratchpad AND abort any background evals still running. */
export function cleanupRepl(sessionId: string): void {
  const m = jobs.get(sessionId);
  if (m) {
    for (const j of m.values()) {
      if (j.done) continue;
      j.killed = true; // suppress the completion steer — the session is ending
      j.ac.abort();
      // vm cannot preempt a running eval, so its promise may never settle and
      // may never release the count itself
      endBackground(sessionId, j);
    }
    jobs.delete(sessionId);
  }
  sessions.delete(sessionId);
  depths.delete(sessionId);
}

/** Poll a job's incremental console log: returns lines captured since the last poll. */
function readJobLogTail(job: ReplJob): string {
  const fresh = job.log.slice(job.logCursor);
  job.logCursor = job.log.length;
  const note =
    job.lostLines > 0 ? `… (${job.lostLines} earlier line(s) dropped — a job keeps the last ${MAX_JOB_LOG_LINES})` : "";
  job.lostLines = 0;
  return (note ? [note, ...fresh] : fresh).join("\n");
}

/** Append to a job's log, keeping it bounded in both lines and line length. */
function pushJobLine(job: ReplJob, raw: string): void {
  job.log.push(raw.length > MAX_JOB_LOG_LINE ? `${raw.slice(0, MAX_JOB_LOG_LINE)} …` : raw);
  const over = job.log.length - MAX_JOB_LOG_LINES;
  if (over <= 0) return;
  job.log.splice(0, over);
  // a line the caller had not polled yet is gone for good; a line it already
  // saw just shifts the cursor
  job.lostLines += Math.max(0, over - job.logCursor);
  job.logCursor = Math.max(0, job.logCursor - over);
}

/**
 * Run `code` as an async IIFE in the session's vm context, resolving to its
 * value, with `console` bound to THIS eval's sink.
 *
 * The context is shared by every eval in a session, so a single global
 * `console` cannot say which eval a `console.log` belongs to: it used to be
 * routed by a module-global `activeJob`, which meant one background job
 * hijacked every other eval's output (including a foreground call's, whose
 * lines then vanished from its result) and two sessions' jobs cross-talked.
 * Passing the collected object in as the IIFE's `console` parameter binds it
 * per call — the argument is read synchronously during `runInContext`, before
 * any other eval can interleave, and the async body carries it in its closure.
 */
function evalInContext(state: ReplSession, code: string, timeout: number, consoleObj: Record<string, unknown>): Promise<unknown> {
  // timeout 0 = no bound at all: vm's sync `timeout` is omitted (it means
  // "infinite" when 0, but leaving it out is explicit) and the hang timer is
  // never armed. vm's own `timeout` is a plain setTimeout value, so it shares
  // the 32-bit limit: a budget past ~24 days would overflow there and abort the
  // eval instantly. Clamp THAT to the ceiling — the promise race below carries
  // the real deadline with setLongTimeout.
  const runOptions: Record<string, unknown> = {
    ...(timeout > 0 ? { timeout: safeDelay(timeout) } : {}),
    importModuleDynamically: async (specifier: string) => import(specifier),
  };
  // expression-first: a bare expression completes to its value; anything that is
  // not one expression (declarations, loops, blocks — end those with `return`)
  // falls back to statement form. Only SyntaxError falls through: runtime
  // failures are the answer, not a retry signal.
  const expr = code.replace(/;+\s*$/, "");
  const raceEval = (body: string) => {
    // raceEval: eval vs a real timer, with the timer CLEARED when the eval wins
    // (a left-running timer rejecting a promise nobody awaits is an unhandled
    // rejection that blames the next tool call). vm's `timeout` only bounds
    // SYNCHRONOUS execution; these evals are async IIFEs, so a hung `await`
    // would otherwise ignore it forever.
    let timer: LongTimeout | undefined;
    const hang = new Promise<never>((_, rej) => {
      if (timeout <= 0) return; // timeout_ms: 0 — never race, never reject
      // setLongTimeout, not setTimeout: the agent may legitimately pass a budget
      // above the 32-bit wall, and a plain setTimeout would fire it after 1ms
      timer = setLongTimeout(() => rej(new Error(`eval exceeded timeout_ms (${timeout}ms) — likely a hung await; the eval keeps running detached and cannot be killed`)), timeout);
      timer.unref();
    });
    // The argument is evaluated synchronously by runInContext, so the binding
    // is captured before this call returns and the temporary global can be
    // removed again without affecting the running eval.
    const sandbox = state.context as Record<string, unknown>;
    let ran: Promise<unknown>;
    sandbox.__fox_repl_console = consoleObj;
    try {
      ran = vm.runInContext(`(async (console) => ${body})(__fox_repl_console)`, state.context, runOptions);
    } catch (e) {
      // a SYNCHRONOUS infinite loop (or a parse error) throws straight out of
      // runInContext — clear the timer there too, or it fires later into a
      // promise nobody is awaiting
      timer?.clear();
      throw e;
    } finally {
      delete sandbox.__fox_repl_console;
    }
    return Promise.race([ran, hang]).finally(() => timer?.clear());
  };
  return (async () => {
    try {
      return await raceEval(`(${expr})`);
    } catch (e) {
      if (e instanceof SyntaxError) return await raceEval(`{\n${code}\n}`);
      throw e;
    }
  })();
}

function fmt(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === undefined) return "";
  try {
    const j = JSON.stringify(value);
    return j === undefined ? String(value) : j;
  } catch {
    return String(value);
  }
}

/**
 * Bound a background job's stored result.
 *
 * MAX_JOB_RESULT existed but was never applied, so a job returning a huge
 * value kept it all in memory for the whole reap grace window (10 minutes).
 * Keep the head (where the answer usually starts) and say it was cut.
 */
function capJobResult(s: string): string {
  if (s.length <= MAX_JOB_RESULT) return s;
  return `${s.slice(0, MAX_JOB_RESULT)}\n… (job result truncated at ${MAX_JOB_RESULT} chars of ${s.length})`;
}

export async function replRun(
  args: { code?: string; reset?: boolean; timeout_ms?: number; label?: string; background?: boolean; job?: string; signal?: string },
  ctx: ToolContext,
): Promise<ToolResult> {
  if (!ctx.tools) return fail("error: repl has no tool registry in this context");
  const sessionId = ctx.sessionId;

  // ---- poll / kill a background job (no code) ----
  if (args.job !== undefined) {
    const job = sessionJobs(sessionId).get(args.job);
    if (!job) return fail(`error: no job ${args.job} in this session`);
    if (args.signal === "kill") {
      if (job.done) return ok(`job ${job.id} already ${job.ok ? "finished" : "failed"} — nothing to kill`);
      job.killed = true;
      job.ac.abort();
      reapJob(sessionId, job.id);
      // the eval may never settle after an abort (vm has no preemption), so the
      // outstanding-work count has to be released here, not left to the promise
      endBackground(sessionId, job);
      return ok(`job ${job.id} (${job.label}) killed`);
    }
    const secs = Math.floor((Date.now() - job.startedAt) / 1000);
    const fresh = readJobLogTail(job);
    if (!job.done) {
      return ok(`job ${job.id} (${job.label}) running (${secs}s)\n${fresh.trimEnd() || "(no new output)"}`);
    }
    // first read of a settled job starts the reap grace window
    if (job.readAt === undefined) {
      job.readAt = Date.now();
      scheduleReap(sessionId, job);
    }
    const head = `job ${job.id} (${job.label}) ${job.ok ? "finished" : "FAILED"} after ${secs}s`;
    const rest = fresh.trimEnd() || job.result;
    return (job.ok ? ok : fail)(`${head}\n${rest || "(no output)"}`);
  }
  if (args.signal !== undefined) return fail("error: signal needs a job to act on");

  if (typeof args.code !== "string" || !args.code.trim()) return fail("error: repl needs code (or a job to poll)");
  if ((depths.get(sessionId) ?? 0) >= MAX_REPL_DEPTH) {
    return fail(`error: repl nesting too deep (>${MAX_REPL_DEPTH}) — compute directly instead`);
  }
  if (args.reset) cleanupRepl(sessionId);
  // NO TIMEOUT BY DEFAULT (0 = unbounded). A silent default deadline was the
  // wrong shape for this tool: an eval is the agent's own computation, so "how
  // long may this take" is a question only the agent can answer, and a default
  // killed long computations that would have finished. A caller that wants a
  // bound passes one; nothing else is imposed.
  //
  // The cost is stated plainly because it is real: vm cannot preempt a running
  // eval, so an unbounded eval that hangs hangs the tool call until ESC aborts
  // the turn (the eval itself keeps running detached). That is a deliberate
  // trade — the old 30s default fired on legitimate work far more often than it
  // rescued anyone, and a user can always interrupt.
  const rawTimeout = args.timeout_ms ?? 0;
  if (!Number.isFinite(rawTimeout) || rawTimeout < 0) return fail("error: timeout_ms must be a non-negative number (0 = no timeout)");
  const timeout = rawTimeout === 0 ? 0 : Math.max(1, Math.floor(rawTimeout));
  const state = sessionState(sessionId);

  const tools = ctx.tools;
  const bridge = {
    list: () => [...tools.values()].map((t) => ({ name: t.def.name, description: t.def.description })),
    search: (q: unknown) => {
      const needle = String(q ?? "").toLowerCase();
      return [...tools.values()]
        .filter((t) => !needle || t.def.name.toLowerCase().includes(needle) || t.def.description.toLowerCase().includes(needle))
        .map((t) => ({ name: t.def.name, description: t.def.description }));
    },
    call: async (name: unknown, callArgs: unknown) => {
      const tool = tools.get(String(name));
      if (!tool) throw new Error(`unknown tool ${String(name)}`);
      if (callArgs !== undefined && (typeof callArgs !== "object" || callArgs === null)) {
        throw new Error(`tool args must be a JSON object`);
      }
      const cargs = (callArgs ?? {}) as Record<string, unknown>;
      // Same unknown-argument refusal a step's call gets — this path skips the
      // turn loop's execToolCall, so without it `tools.call("exec", {job:"x"})`
      // from the scratchpad is the silent no-op it now is nowhere else.
      const schemaErr = validateArgs(tool.def.name, tool.def, cargs);
      if (schemaErr) throw new Error(schemaErr);
      // nested repl calls count against the same depth budget
      const child = tool.def.name === "repl" ? { depth: (depths.get(sessionId) ?? 0) + 1 } : null;
      if (child) depths.set(sessionId, child.depth);
      try {
        // direct invocation: validated like a step's call, but outside the
        // turn loop, so no live streaming and no beforeTool/afterTool hooks
        const r = await tool.run(cargs as any, { ...ctx, emit: undefined, callId: undefined });
        const result = typeof r === "string" ? { ok: true, output: r } : r;
        if (!result.ok) throw new Error(result.output.slice(0, 500));
        return result.output;
      } finally {
        if (child) depths.set(sessionId, (depths.get(sessionId) ?? 1) - 1);
      }
    },
  };

  const sandbox = state.context as Record<string, unknown>;
  sandbox.tools = bridge;
  /** A line-collecting console whose output goes to exactly one eval's sink. */
  const makeConsole = (sink: (line: string) => void): Record<string, unknown> => {
    const capture = () => (...a: unknown[]) => {
      sink(a.map((x) => (typeof x === "string" ? x : fmt(x))).join(" "));
    };
    return { log: capture(), info: capture(), warn: capture(), error: capture(), debug: capture() };
  };
  // The eval wrapper below shadows this with its own binding; the global is the
  // fallback for code that reaches `globalThis.console` explicitly. Each branch
  // replaces it with that eval's own console before running anything.
  sandbox.console = makeConsole(() => {});

  // ---- background: run the eval detached, return the job id ----
  if (args.background) {
    if (liveJobCount(sessionId) >= MAX_JOBS_PER_SESSION) {
      return fail(`error: too many live jobs in this session (${liveJobCount(sessionId)}/${MAX_JOBS_PER_SESSION}) — poll or kill one before starting more`);
    }
    const label = (args.label ?? args.code.split("\n")[0]).slice(0, 60);
    const id = `r${++jobSeq}`;
    const ac = new AbortController();
    const job: ReplJob = { id, label, startedAt: Date.now(), done: false, ok: false, result: "", log: [], logCursor: 0, lostLines: 0, ac };
    sessionJobs(sessionId).set(id, job);
    // A live job is outstanding work: a one-shot client (fox -p, an ACP prompt,
    // an A2A task) must not report "done" while this can still steer more into
    // the session. Counted BEFORE the eval starts, so there is no window where
    // the session looks idle.
    backgroundStarted(sessionId);
    // Per-job sink: a background eval's console lines belong to that job, no
    // matter what else runs in the session meanwhile (the old module-global
    // "active job" made the newest job swallow every other eval's output).
    const jobConsole = makeConsole((line) => pushJobLine(job, line));
    sandbox.console = jobConsole;
    // The job's lifetime is the SESSION's, not the turn's — it keeps running
    // while the agent moves on, and ends only when the session does
    // (cleanupRepl) or a kill asks it to. vm has no way to preempt a running
    // eval, so abort reaches a job only when it awaits.
    void evalInContext(state, args.code, timeout, jobConsole)
      .then((v) => {
        job.result = capJobResult(fmt(v));
        job.done = true;
        job.ok = true;
        // ORDER: notify (which queues the steer) before ending the background
        // count. Ending first would make the session briefly quiescent and let
        // a waiter finish before the completion notification was even queued.
        notifyDone(sessionId, job);
        scheduleReap(sessionId, job);
        endBackground(sessionId, job);
      })
      .catch((e) => {
        job.done = true;
        job.ok = false;
        job.result = capJobResult(job.killed ? "killed by request" : `error: ${(e as Error).message ?? e}`);
        notifyDone(sessionId, job);
        scheduleReap(sessionId, job);
        endBackground(sessionId, job);
      });
    return ok(`job ${id} started (${label}) — poll with repl({job:"${id}"}), stop with repl({job:"${id}", signal:"kill"})`);
  }

  // ---- foreground eval ----
  // A per-call sink: two foreground calls (tools run in parallel within a step)
  // cannot steal each other's console lines either.
  const lines: string[] = [];
  const evalConsole = makeConsole((line) => lines.push(line));
  sandbox.console = evalConsole;
  try {
    const value = await evalInContext(state, args.code, timeout, evalConsole);
    const body = [lines.join("\n"), fmt(value)].filter(Boolean).join("\n").trimEnd() || "(no output)";
    return ok(body.length > outCap() ? body.slice(-outCap()) + "\n… (head truncated)" : body);
  } catch (e) {
    const msg = (e as Error).message ?? String(e);
    const stack = (e as Error).stack?.split("\n").slice(0, 4).join("\n");
    return fail(`error: ${msg}${stack && !msg.includes("\n") ? `\n${stack}` : ""}`);
  }
}
