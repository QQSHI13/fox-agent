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
 */
import vm from "node:vm";
import { appendFileSync, closeSync, mkdirSync, openSync, readSync, rmSync, statSync } from "node:fs";
import type { ToolDef } from "../providers/types.ts";
import type { ToolContext, ToolResult } from "./types.ts";
import { fail, ok, validateArgs } from "./types.ts";
import { outCap } from "./files.ts";
import { steer } from "../loop/steer.ts";
import { agentHome } from "../core/paths.ts";
import { killTree, spawnShell } from "./exec.ts";
import { partialTailBytes } from "./pty.ts";

export const replDef: ToolDef = {
  name: "repl",
  description:
    "In-process JavaScript environment (no shell, no subprocess — works in the compiled binary with no bun on PATH). Full environment: `process`, timers, `fetch`, and dynamic `import()` all work. State persists across calls in this session: assign once (`rows = ...`), reuse for twenty turns. `return` (or a trailing expression) becomes the result; `console.log` lines are captured alongside it. Reach your tools from code as `await tools.call(name, args)` (shell included: `await tools.call(\"exec\", {cmd})`); `tools.list()` and `tools.search(\"...\")` discover them. Direct tool calls bypass the turn loop's beforeTool/afterTool hooks. A hanging eval is killed at timeout_ms. Background work is a `jobs` API: `jobs.spawn(\"shell cmd\" | fn | {description,prompt,agent?})` returns an id, `jobs.poll(id)` reads incremental output/status, `jobs.kill(id)` stops it, `jobs.list()` shows all — jobs notify the agent on completion and reap after a grace window.",
  parameters: {
    type: "object",
    properties: {
      code: { type: "string", description: "JavaScript to evaluate: a bare expression (or await) completes to its value; multi-statement blocks need an explicit return" },
      reset: { type: "boolean", description: "Drop the session's scratchpad state before evaluating" },
      timeout_ms: { type: "number", description: "Kill a hanging eval after this long, default 30000" },
    },
    required: ["code"],
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

// ---- background jobs -------------------------------------------------------
//
// The ONE place background work lives. exec and task are foreground-only; any
// long-running process, detached subagent, or polled computation is a repl job.
// Three kinds: a shell command (spawned detached, output pumped to a log), a
// subagent (task's executeTask under an AbortController), or a JS function
// (runs in-process, its return value becomes the result). Every job notifies
// the agent on completion via steer and reaps after a grace window.

interface ReplJob {
  id: string;
  kind: "shell" | "task" | "fn";
  label: string;
  startedAt: number;
  done: boolean;
  ok: boolean;
  result: string; // shell: accumulated output tail; task/fn: the report/return value
  pid?: number; // shell jobs only — killTree target
  logPath?: string; // shell jobs only
  cursor?: number; // shell jobs only — byte offset the model has already polled
  exitCode?: number | null; // shell jobs only
  ac?: AbortController; // task jobs only
  killed?: boolean; // suppresses the completion steer for a deliberately-killed job
  reaped?: boolean;
  readAt?: number; // when a settled job was first polled — starts the reap grace
}

const jobs = new Map<string, Map<string, ReplJob>>(); // sessionId -> id -> job
let jobSeq = 0;
const MAX_JOBS_PER_SESSION = 16;
const JOB_REAP_MS = 10 * 60_000;
const MAX_POLL_BYTES = 1_000_000;
const MAX_FN_RESULT = 50_000;

function sessionJobs(sessionId: string): Map<string, ReplJob> {
  let m = jobs.get(sessionId);
  if (!m) jobs.set(sessionId, (m = new Map()));
  return m;
}

function reapJob(sessionId: string, id: string): void {
  const job = sessionJobs(sessionId).get(id);
  if (!job) return;
  job.reaped = true;
  sessionJobs(sessionId).delete(id);
  if (job.logPath) {
    try {
      rmSync(job.logPath, { force: true });
    } catch {}
  }
}

function scheduleReap(sessionId: string, job: ReplJob): void {
  // a settled job stays readable for a grace window after it finishes, so the
  // model can still read the result if it polls promptly; a forgotten job must
  // not leak the log fd + map entry for the session
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
    `repl job ${job.id} (${job.kind}: ${job.label}) ${job.ok ? "finished" : "FAILED"} after ${secs}s\n` +
      `its result is ${job.result.length} chars — repl jobs.poll("${job.id}") to read it.`,
  );
}

function startShellJob(sessionId: string, cmd: string, cwd: string): ReplJob {
  const dir = `${agentHome()}/jobs/${sessionId}`;
  mkdirSync(dir, { recursive: true });
  const id = `r${++jobSeq}`;
  const logPath = `${dir}/${id}.log`;
  appendFileSync(logPath, ""); // create, so a fast-exiting job still polls clean
  const proc = spawnShell(cmd, cwd);
  const job: ReplJob = { id, kind: "shell", label: cmd, startedAt: Date.now(), done: false, ok: false, result: "", pid: proc.pid, logPath, cursor: 0, exitCode: null };
  sessionJobs(sessionId).set(id, job);
  // pump both streams to the log for the job's whole life; the model only ever
  // sees what it explicitly polls, so a chatty job cannot flood the context
  const pump = async (stream: ReadableStream) => {
    try {
      for await (const chunk of stream as any) {
        if (job.reaped) return; // log was unlinked; appending would resurrect it
        appendFileSync(logPath, chunk as Uint8Array);
      }
    } catch {}
  };
  void pump(proc.stdout as ReadableStream);
  void pump(proc.stderr as ReadableStream);
  void proc.exited.then((code) => {
    job.exitCode = code;
    job.done = true;
    job.ok = code === 0;
    job.result = `exit ${code}`;
    notifyDone(sessionId, job);
    scheduleReap(sessionId, job);
  });
  return job;
}

/** Session end: drop the scratchpad AND kill any jobs still running under it. */
export function cleanupRepl(sessionId: string): void {
  const m = jobs.get(sessionId);
  if (m) {
    for (const j of m.values()) {
      if (j.done) continue;
      j.killed = true; // suppress the completion steer — the session is ending
      if (j.kind === "shell" && j.pid !== undefined) killTree(j.pid);
      else j.ac?.abort();
    }
    jobs.delete(sessionId);
  }
  sessions.delete(sessionId);
  depths.delete(sessionId);
}

/**
 * Register a task job and kick off executeTask under an AbortController. Shared by
 * startTaskJob (awaited import) and jobsBridge.spawn (sync — returns the id
 * immediately, kicking off the lazy import in the background). `executeTask` may
 * be a getter that returns the function (for the lazy-import case) or the
 * function itself once loaded.
 */
function runTaskJob(
  sessionId: string,
  executeTask: () => (spec: { description: string; prompt: string; agent?: string }, ctx: ToolContext) => Promise<ToolResult>,
  spec: { description: string; prompt: string; agent?: string },
  ctx: ToolContext,
): ReplJob {
  const id = `r${++jobSeq}`;
  const ac = new AbortController();
  const job: ReplJob = { id, kind: "task", label: spec.description.trim(), startedAt: Date.now(), done: false, ok: false, result: "", ac };
  sessionJobs(sessionId).set(id, job);
  // the job's lifetime is the SESSION's, not the turn's — it keeps going while
  // the agent moves on, and ends only when the session does (cleanupRepl) or a
  // jobs.kill asks it to
  const finish = (r: ToolResult) => {
    job.done = true;
    job.ok = r.ok;
    job.result = r.output;
    notifyDone(sessionId, job);
    scheduleReap(sessionId, job);
  };
  const fail = (e: unknown) => {
    job.done = true;
    job.ok = false;
    job.result = job.killed ? "killed by request" : `error: ${(e as Error).message ?? e}`;
    notifyDone(sessionId, job);
    scheduleReap(sessionId, job);
  };
  void Promise.resolve()
    .then(() => executeTask()(spec, { ...ctx, signal: ac.signal }))
    .then(finish, fail);
  return job;
}

async function startTaskJob(sessionId: string, spec: { description: string; prompt: string; agent?: string }, ctx: ToolContext): Promise<ReplJob> {
  const { executeTask } = await import("./task.ts");
  return runTaskJob(sessionId, () => executeTask, spec, ctx);
}

function startFnJob(sessionId: string, fn: (...a: unknown[]) => unknown, args: unknown[], label: string): ReplJob {
  const id = `r${++jobSeq}`;
  const job: ReplJob = { id, kind: "fn", label, startedAt: Date.now(), done: false, ok: false, result: "" };
  sessionJobs(sessionId).set(id, job);
  // run the function off the eval's stack so a slow/sleepy fn does not block the
  // tool call; its return value (or throw) becomes the result the caller polls
  void (async () => {
    try {
      const v = await fn(...args);
      job.done = true;
      job.ok = true;
      job.result = typeof v === "string" ? v : fmt(v);
    } catch (e) {
      job.done = true;
      job.ok = false;
      job.result = `error: ${(e as Error).message ?? e}`;
    }
    if (job.result.length > MAX_FN_RESULT) job.result = job.result.slice(0, MAX_FN_RESULT) + `\n… (${job.result.length - MAX_FN_RESULT} more chars)`;
    notifyDone(sessionId, job);
    scheduleReap(sessionId, job);
  })();
  return job;
}

/** Poll a shell job's log for output produced since the caller's last poll. */
function readShellTail(job: ReplJob): string {
  if (!job.logPath) return "";
  try {
    const st = statSync(job.logPath);
    const end = st.size;
    const start = Math.max(job.cursor ?? 0, end - MAX_POLL_BYTES);
    const skipped = start - (job.cursor ?? 0);
    const len = end - start;
    if (len <= 0) return "";
    const fd = openSync(job.logPath, "r");
    try {
      const buf = Buffer.alloc(len);
      readSync(fd, buf, 0, len, start);
      const tail = partialTailBytes(buf);
      job.cursor = end - tail;
      return (skipped > 0 ? `… (${skipped} bytes skipped, log too chatty)\n` : "") + buf.subarray(0, buf.length - tail).toString("utf8");
    } finally {
      closeSync(fd);
    }
  } catch {
    return "";
  }
}

/** The `jobs` object exposed inside the repl sandbox: spawn/poll/kill/list. */
function jobsBridge(sessionId: string, cwd: string, ctx: ToolContext) {
  const live = () => [...sessionJobs(sessionId).values()].filter((j) => !j.done).length;
  const guardRoom = () => {
    if (live() >= MAX_JOBS_PER_SESSION) {
      throw new Error(`too many live jobs in this session (${live()}/${MAX_JOBS_PER_SESSION}) — poll or kill one before starting more`);
    }
  };
  return {
    spawn: (what: unknown, opts?: unknown) => {
      guardRoom();
      const o = (opts ?? {}) as Record<string, unknown>;
      // a string is a shell command; a function is an in-process job; an object
      // with a prompt is a subagent task
      if (typeof what === "string") {
        const cmd = what;
        if (!cmd.trim()) throw new Error("jobs.spawn needs a non-empty shell command");
        const cwdOpt = typeof o.cwd === "string" ? o.cwd : cwd;
        const job = startShellJob(sessionId, cmd, cwdOpt);
        return job.id;
      }
      if (typeof what === "function") {
        const label = typeof o.label === "string" ? o.label : "fn job";
        const job = startFnJob(sessionId, what as (...a: unknown[]) => unknown, Array.isArray(o.args) ? o.args : [], label);
        return job.id;
      }
      if (what && typeof what === "object" && typeof (what as { prompt?: unknown }).prompt === "string") {
        const spec = what as { description?: string; prompt: string; agent?: string };
        if (!spec.description?.trim()) throw new Error("jobs.spawn task needs a description");
        // fire and forget — the id is returned synchronously; the lazy import
        // resolves on the next tick, then executeTask runs detached. The getter
        // hands runTaskJob a function that awaits the import each call (the
        // module is cached after the first), so the id assignment (which happens
        // synchronously in runTaskJob, before any await) is stable.
        const executeTask = async (s: { description: string; prompt: string; agent?: string }, c: ToolContext): Promise<ToolResult> => {
          const { executeTask: run } = await import("./task.ts");
          return run(s, c);
        };
        return runTaskJob(sessionId, () => executeTask, { description: spec.description!, prompt: spec.prompt, agent: spec.agent }, ctx).id;
      }
      throw new Error("jobs.spawn: pass a shell command string, a function, or a {description, prompt, agent?} task");
    },
    poll: (id: unknown) => {
      const job = sessionJobs(sessionId).get(String(id));
      if (!job) throw new Error(`no job ${String(id)} in this session`);
      const secs = Math.floor((Date.now() - job.startedAt) / 1000);
      let data = "";
      if (job.kind === "shell") data = readShellTail(job);
      if (!job.done) return { id: job.id, kind: job.kind, label: job.label, done: false, secs, output: data };
      // first read of a settled job starts the reap grace window
      if (job.readAt === undefined) job.readAt = Date.now();
      const out = job.kind === "shell" ? data : job.result;
      const status = `${job.id} (${job.kind}: ${job.label}) ${job.ok ? "finished" : "FAILED"} after ${secs}s`;
      return { id: job.id, kind: job.kind, label: job.label, done: true, ok: job.ok, secs, output: `${status}\n${out.trimEnd() || "(no output)"}` };
    },
    kill: (id: unknown) => {
      const job = sessionJobs(sessionId).get(String(id));
      if (!job) throw new Error(`no job ${String(id)} in this session`);
      if (job.done) return `${job.id} already ${job.ok ? "finished" : "failed"} — nothing to kill`;
      job.killed = true;
      if (job.kind === "shell" && job.pid !== undefined) killTree(job.pid);
      else job.ac?.abort();
      reapJob(sessionId, job.id);
      return `${job.id} (${job.kind}: ${job.label}) killed`;
    },
    list: () =>
      [...sessionJobs(sessionId).values()].map((j) => ({
        id: j.id,
        kind: j.kind,
        label: j.label,
        done: j.done,
        ok: j.done ? j.ok : undefined,
        secs: Math.floor((Date.now() - j.startedAt) / 1000),
      })),
  };
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
  args: { code?: string; reset?: boolean; timeout_ms?: number },
  ctx: ToolContext,
): Promise<ToolResult> {
  if (typeof args.code !== "string" || !args.code.trim()) return fail("error: repl needs code");
  if (!ctx.tools) return fail("error: repl has no tool registry in this context");
  if ((depths.get(ctx.sessionId) ?? 0) >= MAX_REPL_DEPTH) {
    return fail(`error: repl nesting too deep (>${MAX_REPL_DEPTH}) — compute directly instead`);
  }
  if (args.reset) cleanupRepl(ctx.sessionId);
  const timeout = Math.min(300_000, Math.max(1_000, args.timeout_ms ?? 30_000));
  const state = sessionState(ctx.sessionId);
  state.log.length = 0;

  const tools = ctx.tools;
  const sessionId = ctx.sessionId;
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
      const args = (callArgs ?? {}) as Record<string, unknown>;
      // Same unknown-argument refusal a step's call gets — this path skips the
      // turn loop's execToolCall, so without it `tools.call("task", {job:"t3",
      // signal:"kill"})` from the scratchpad is the silent no-op it now is
      // nowhere else.
      const schemaErr = validateArgs(tool.def.name, tool.def, args);
      if (schemaErr) throw new Error(schemaErr);
      // nested repl calls count against the same depth budget
      const child = tool.def.name === "repl" ? { depth: (depths.get(sessionId) ?? 0) + 1 } : null;
      if (child) depths.set(sessionId, child.depth);
      try {
        // direct invocation: validated like a step's call, but outside the
        // turn loop, so no live streaming and no beforeTool/afterTool hooks
        const r = await tool.run(args as any, { ...ctx, emit: undefined, callId: undefined });
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
  // The one place background work lives: a shell command, an in-process
  // function, or a subagent task — each spawned detached, polled, and killed
  // from here. See jobsBridge.
  sandbox.jobs = jobsBridge(sessionId, ctx.cwd, ctx);
  // Capture console output per call. The seeded `console` is replaced with a
  // line-collecting one so `console.log` lands in the tool result; other
  // methods (error/warn/info/debug) also capture, since a scratchpad's output
  // is the point.
  const capture = (level: string) => (...a: unknown[]) =>
    void state.log.push(a.map((x) => (typeof x === "string" ? x : fmt(x))).join(" "));
  sandbox.console = {
    log: capture("log"),
    info: capture("info"),
    warn: capture("warn"),
    error: capture("error"),
    debug: capture("debug"),
  };

  // `importModuleDynamically` resolves a dynamic `import()` inside the eval
  // against the host module registry, so `await import("node:fs")` works.
  // Without it Bun's vm throws "A dynamic import callback was not specified."
  // on any `import()`. Bun's vm types declare this field on neither
  // ScriptOptions nor RunningScriptOptions, so the object is built untyped and
  // passed through — both keys are honored at runtime (the probe confirmed
  // timeout still bounds a sync loop and the import resolves).
  const runOptions: Record<string, unknown> = {
    timeout,
    importModuleDynamically: async (specifier: string) => import(specifier),
  };

  try {
    // expression-first: `40+2`, `x = 1`, `await foo()` complete to values,
    // which is what a scratchpad is for. Anything that is not one expression
    // (declarations, loops, multi-statement blocks — end those with an
    // explicit `return`) falls back to statement form. Only SyntaxError falls
    // through: runtime failures are the answer, not a retry signal.
    const expr = args.code.replace(/;+\s*$/, "");
    let value: unknown;
    // raceEval: eval vs a real timer, with the timer CLEARED when the eval
    // wins — a left-running timer rejects a promise nobody awaits anymore,
    // which surfaces as an unhandled rejection and fails the turn's teardown.
    // vm's `timeout` only bounds SYNCHRONOUS execution; these evals are async
    // IIFEs, so a hung `await` would otherwise ignore it forever. The loser's
    // microtasks keep running, but this tool call returns and frees the slot.
    const raceEval = (body: string) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const hang = new Promise<never>((_, rej) => {
        timer = setTimeout(() => rej(new Error(`eval exceeded timeout_ms (${timeout}ms) — likely a hung await; the eval keeps running detached and cannot be killed`)), timeout);
        (timer as { unref?: () => void }).unref?.();
      });
      try {
        // a SYNCHRONOUS infinite loop throws straight out of runInContext —
        // clear the timer there too, or it fires later and rejects a promise
        // nobody is awaiting (unhandled rejection, blames the next tool call)
        return Promise.race([vm.runInContext(`(async () => ${body})()`, state.context, runOptions), hang]).finally(() => clearTimeout(timer));
      } catch (e) {
        clearTimeout(timer);
        throw e;
      }
    };
    try {
      value = await raceEval(`(${expr})`);
    } catch (e) {
      if (e instanceof SyntaxError) value = await raceEval(`{\n${args.code}\n}`);
      else throw e;
    }
    const body = [state.log.join("\n"), fmt(value)].filter(Boolean).join("\n").trimEnd() || "(no output)";
    return ok(body.length > outCap() ? body.slice(-outCap()) + "\n… (head truncated)" : body);
  } catch (e) {
    const msg = (e as Error).message ?? String(e);
    const stack = (e as Error).stack?.split("\n").slice(0, 4).join("\n");
    return fail(`error: ${msg}${stack && !msg.includes("\n") ? `\n${stack}` : ""}`);
  }
}
