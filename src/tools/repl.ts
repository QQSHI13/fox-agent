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
import type { ToolDef } from "../providers/types.ts";
import type { ToolContext, ToolResult } from "./types.ts";
import { fail, ok, validateArgs } from "./types.ts";
import { outCap } from "./files.ts";
import { steer } from "../loop/steer.ts";

export const replDef: ToolDef = {
  name: "repl",
  description:
    "In-process JavaScript environment (no shell, no subprocess — works in the compiled binary with no bun on PATH). Full environment: `process`, timers, `fetch`, and dynamic `import()` all work. State persists across calls in this session: assign once (`rows = ...`), reuse for twenty turns. `return` (or a trailing expression) becomes the result; `console.log` lines are captured alongside it. Reach your tools from code as `await tools.call(name, args)` (shell included: `await tools.call(\"exec\", {cmd})`); `tools.list()` and `tools.search(\"...\")` discover them. Direct tool calls bypass the turn loop's beforeTool/afterTool hooks. A hanging eval is killed at timeout_ms (any value you pass; 0 = no timeout). `background: true` runs the eval detached and returns a job id immediately — poll its incremental output/status with `job`, stop it with `signal:\"kill\"`; it notifies you on completion and reaps after a grace window.",
  parameters: {
    type: "object",
    properties: {
      code: { type: "string", description: "JavaScript to evaluate: a bare expression (or await) completes to its value; multi-statement blocks need an explicit return. Not needed when polling or killing a job." },
      reset: { type: "boolean", description: "Drop the session's scratchpad state before evaluating" },
      timeout_ms: { type: "number", description: "Kill a hanging eval after this many milliseconds; default 30000, no upper bound, 0 = run until it finishes with no timeout at all (foreground only — background jobs run until they exit or you kill them)" },
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
  log: string[];
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
    s = { context: vm.createContext(seed()), log: [] };
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
  ac: AbortController; // cancelling aborts a job awaiting a fetch/timeout
  killed?: boolean; // suppresses the completion steer for a deliberately-killed job
  reaped?: boolean;
  readAt?: number; // when a settled job was first polled — starts the reap grace
}

const jobs = new Map<string, Map<string, ReplJob>>(); // sessionId -> id -> job
let jobSeq = 0;
const MAX_JOBS_PER_SESSION = 16;
const JOB_REAP_MS = 10 * 60_000;
const MAX_JOB_RESULT = 50_000;

function sessionJobs(sessionId: string): Map<string, ReplJob> {
  let m = jobs.get(sessionId);
  if (!m) jobs.set(sessionId, (m = new Map()));
  return m;
}

function liveJobCount(sessionId: string): number {
  return [...sessionJobs(sessionId).values()].filter((j) => !j.done).length;
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
  return fresh.join("\n");
}

/** Run `code` as an async IIFE in the session's vm context, resolving to its value. */
function evalInContext(state: ReplSession, code: string, timeout: number): Promise<unknown> {
  // timeout 0 = no bound at all: vm's sync `timeout` is omitted (it means
  // "infinite" when 0, but leaving it out is explicit) and the hang timer is
  // never armed.
  const runOptions: Record<string, unknown> = {
    ...(timeout > 0 ? { timeout } : {}),
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
    let timer: ReturnType<typeof setTimeout> | undefined;
    const hang = new Promise<never>((_, rej) => {
      if (timeout <= 0) return; // timeout_ms: 0 — never race, never reject
      timer = setTimeout(() => rej(new Error(`eval exceeded timeout_ms (${timeout}ms) — likely a hung await; the eval keeps running detached and cannot be killed`)), timeout);
      (timer as { unref?: () => void }).unref?.();
    });
    try {
      // a SYNCHRONOUS infinite loop throws straight out of runInContext — clear
      // the timer there too, or it fires later into a promise nobody is awaiting
      return Promise.race([vm.runInContext(`(async () => ${body})()`, state.context, runOptions), hang]).finally(() => clearTimeout(timer));
    } catch (e) {
      clearTimeout(timer);
      throw e;
    }
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
  // timeout_ms is the agent's call: any positive value is honoured (no upper
  // cap — the agent may legitimately wait on a long fetch), and 0 disables the
  // timeout entirely for an eval the agent knows will outlast any default.
  const rawTimeout = args.timeout_ms ?? 30_000;
  if (!Number.isFinite(rawTimeout) || rawTimeout < 0) return fail("error: timeout_ms must be a non-negative number (0 = no timeout)");
  const timeout = rawTimeout === 0 ? 0 : Math.max(1, Math.floor(rawTimeout));
  const state = sessionState(sessionId);
  state.log.length = 0;

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
  // A line-collecting console: `console.log` (and warn/error/info/debug) land in
  // the result. For a background job they accumulate into job.log so a poll
  // returns only what is new.
  const capture = (level: string) => (...a: unknown[]) => {
    const line = a.map((x) => (typeof x === "string" ? x : fmt(x))).join(" ");
    if (activeJob) activeJob.log.push(line);
    else state.log.push(line);
  };
  sandbox.console = {
    log: capture("log"),
    info: capture("info"),
    warn: capture("warn"),
    error: capture("error"),
    debug: capture("debug"),
  };

  // ---- background: run the eval detached, return the job id ----
  if (args.background) {
    if (liveJobCount(sessionId) >= MAX_JOBS_PER_SESSION) {
      return fail(`error: too many live jobs in this session (${liveJobCount(sessionId)}/${MAX_JOBS_PER_SESSION}) — poll or kill one before starting more`);
    }
    const label = (args.label ?? args.code.split("\n")[0]).slice(0, 60);
    const id = `r${++jobSeq}`;
    const ac = new AbortController();
    const job: ReplJob = { id, label, startedAt: Date.now(), done: false, ok: false, result: "", log: [], logCursor: 0, ac };
    sessionJobs(sessionId).set(id, job);
    activeJob = job;
    // The job's lifetime is the SESSION's, not the turn's — it keeps running
    // while the agent moves on, and ends only when the session does
    // (cleanupRepl) or a kill asks it to. vm has no way to preempt a running
    // eval, so abort reaches a job only when it awaits.
    void evalInContext(state, args.code, timeout)
      .then((v) => {
        job.result = fmt(v);
        job.done = true;
        job.ok = true;
        notifyDone(sessionId, job);
        scheduleReap(sessionId, job);
      })
      .catch((e) => {
        job.done = true;
        job.ok = false;
        job.result = job.killed ? "killed by request" : `error: ${(e as Error).message ?? e}`;
        notifyDone(sessionId, job);
        scheduleReap(sessionId, job);
      })
      .finally(() => {
        if (activeJob === job) activeJob = null;
      });
    return ok(`job ${id} started (${label}) — poll with repl({job:"${id}"}), stop with repl({job:"${id}", signal:"kill"})`);
  }

  // ---- foreground eval ----
  try {
    const value = await evalInContext(state, args.code, timeout);
    const body = [state.log.join("\n"), fmt(value)].filter(Boolean).join("\n").trimEnd() || "(no output)";
    return ok(body.length > outCap() ? body.slice(-outCap()) + "\n… (head truncated)" : body);
  } catch (e) {
    const msg = (e as Error).message ?? String(e);
    const stack = (e as Error).stack?.split("\n").slice(0, 4).join("\n");
    return fail(`error: ${msg}${stack && !msg.includes("\n") ? `\n${stack}` : ""}`);
  }
}

/** The job currently owning console capture, so background logs accumulate into it. */
let activeJob: ReplJob | null = null;
