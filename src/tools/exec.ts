import { resolve } from "node:path";
import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import type { ToolDef } from "../providers/types.ts";
import type { ToolContext, ToolResult } from "./types.ts";
import { fail, ok } from "./types.ts";
import { childEnv } from "../core/childenv.ts";
import { outCap } from "./files.ts";
import { agentHome } from "../core/paths.ts";

export const execDef: ToolDef = {
  name: "exec",
  description:
    "Run a shell command (bash) starting from the session's directory. Each call is independent: the working directory NEVER carries over from a previous exec, so a `cd` has no effect on the next call — use the workdir argument (or `cd x && cmd` within one call) instead. `background: true` starts the command detached and returns a job id immediately — poll new output with exec({job}) and stop it with exec({job, signal:\"kill\"}); output is NOT pushed to you, you only see what you poll. For an interactive shell that keeps its directory, use pty. Foreground runs return exit code + merged output (tail-capped). Runs with full machine access.",
  parameters: {
    type: "object",
    properties: {
      cmd: { type: "string", description: "Command to run. Not needed (ignored) when polling a job." },
      workdir: { type: "string", description: "Directory to run in, relative to the session directory. Applies to this call only." },
      timeout_ms: { type: "number", description: "Kill the process tree after this long, default 120000 (foreground only — background jobs run until they exit or you kill them)" },
      background: { type: "boolean", description: "Start detached and return a job id instead of waiting for the exit code" },
      job: { type: "string", description: "Poll a background job: returns output produced since your last poll plus its status" },
      signal: { type: "string", enum: ["kill"], description: "With job: terminate the job's process tree" },
    },
    required: [],
  },
};

/**
 * TERM then KILL the whole process group (child is spawned as setsid leader).
 * Returns a canceller so the caller can drop the pending SIGKILL once the
 * child has actually exited — otherwise the timer keeps the loop alive.
 */
export function killTree(pid: number): () => void {
  try {
    Bun.spawnSync(["kill", "-TERM", "--", `-${pid}`], { stdout: "ignore", stderr: "ignore" });
  } catch {}
  const t = setTimeout(() => {
    try {
      Bun.spawnSync(["kill", "-KILL", "--", `-${pid}`], { stdout: "ignore", stderr: "ignore" });
    } catch {}
  }, 1_500);
  return () => clearTimeout(t);
}

// ---- background jobs -------------------------------------------------------

interface ExecJob {
  id: string;
  pid: number;
  cmd: string;
  cwd: string;
  logPath: string;
  /** byte offset the model has already seen — a poll returns only the tail after it */
  cursor: number;
  startedAt: number;
  exitCode: number | null;
}

const jobs = new Map<string, Map<string, ExecJob>>(); // sessionId -> id -> job
let jobSeq = 0;

function sessionJobs(sessionId: string): Map<string, ExecJob> {
  let m = jobs.get(sessionId);
  if (!m) jobs.set(sessionId, (m = new Map()));
  return m;
}

function spawnShell(cmd: string, cwd: string) {
  const useSetsid = !!Bun.which("setsid");
  return Bun.spawn([...(useSetsid ? ["setsid"] : []), "/bin/bash", "-c", cmd], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
    stdin: "ignore",
    env: childEnv(undefined, cwd),
  });
}

function startJob(args: { cmd: string; workdir?: string }, ctx: ToolContext): ToolResult {
  const cwd = args.workdir ? resolve(ctx.cwd, args.workdir) : ctx.cwd;
  const dir = `${agentHome()}/jobs/${ctx.sessionId}`;
  mkdirSync(dir, { recursive: true });
  const id = `j${++jobSeq}`;
  const logPath = `${dir}/${id}.log`;
  appendFileSync(logPath, ""); // create, so a fast-exiting job still polls clean
  const proc = spawnShell(args.cmd, cwd);
  const job: ExecJob = { id, pid: proc.pid, cmd: args.cmd, cwd, logPath, cursor: 0, startedAt: Date.now(), exitCode: null };
  sessionJobs(ctx.sessionId).set(id, job);

  // pump both streams to the log for the job's whole life; the model only ever
  // sees what it explicitly polls, so a chatty job cannot flood the context
  const pump = async (stream: ReadableStream) => {
    try {
      for await (const chunk of stream as any) appendFileSync(logPath, chunk as Uint8Array);
    } catch {}
  };
  void pump(proc.stdout as ReadableStream);
  void pump(proc.stderr as ReadableStream);
  void proc.exited.then((code) => {
    job.exitCode = code;
  });

  return ok(`job ${id} started (pid ${proc.pid}, cwd ${cwd}) — poll with exec({job:"${id}"}), stop with exec({job:"${id}", signal:"kill"})`);
}

function pollJob(args: { job: string; signal?: string }, ctx: ToolContext): ToolResult {
  const job = sessionJobs(ctx.sessionId).get(args.job);
  if (!job) return fail(`error: no job ${args.job} in this session`);
  if (args.signal === "kill") {
    if (job.exitCode === null) killTree(job.pid);
    sessionJobs(ctx.sessionId).delete(args.job);
    return ok(`job ${job.id} killed`);
  }
  let data = "";
  try {
    const buf = readFileSync(job.logPath);
    data = buf.subarray(job.cursor).toString("utf8");
    job.cursor = buf.length;
  } catch {}
  const secs = Math.floor((Date.now() - job.startedAt) / 1000);
  const status =
    job.exitCode === null
      ? `job ${job.id} running (${secs}s, pid ${job.pid})`
      : `job ${job.id} exited ${job.exitCode} after ${secs}s`;
  if (job.exitCode !== null) sessionJobs(ctx.sessionId).delete(args.job); // final poll reaps it
  const body = data.length > outCap() ? data.slice(-outCap()) + "\n… (head truncated)" : data;
  return ok(`${status}\n${body.trimEnd() || "(no new output)"}`);
}

/** Session end: kill every job still running under it. */
export function killExecJobs(sessionId: string): void {
  const m = jobs.get(sessionId);
  if (!m) return;
  for (const j of m.values()) if (j.exitCode === null) killTree(j.pid);
  jobs.delete(sessionId);
}

// ---- foreground (with live output streaming to the UI) ---------------------

export async function execRun(
  args: { cmd?: string; workdir?: string; timeout_ms?: number; background?: boolean; job?: string; signal?: string },
  ctx: ToolContext,
): Promise<ToolResult> {
  if (args.job) return pollJob({ job: args.job, signal: args.signal }, ctx);
  if (!args.cmd) return fail("error: exec needs cmd (or a job to poll)");
  if (args.background) return startJob({ cmd: args.cmd, workdir: args.workdir }, ctx);

  // Contract: exec's cwd never drifts. `ctx.cwd` is the session's directory and
  // is immutable for the session's lifetime, and `workdir` is resolved against it
  // per call rather than being remembered — so no command, however it wanders,
  // can move where the *next* exec starts. `pty` is the tool for a shell that
  // keeps its place.
  const cwd = args.workdir ? resolve(ctx.cwd, args.workdir) : ctx.cwd;
  const timeout = Math.min(600_000, Math.max(1_000, args.timeout_ms ?? 120_000));
  const proc = spawnShell(args.cmd, cwd);

  let killedBy = "";
  const kill: { cancel: (() => void) | null } = { cancel: null };
  const timer = setTimeout(() => {
    killedBy = `timeout ${timeout}ms`;
    kill.cancel = killTree(proc.pid);
  }, timeout);
  const onAbort = () => {
    if (!killedBy) killedBy = "interrupted";
    kill.cancel = killTree(proc.pid);
  };
  ctx.signal?.addEventListener("abort", onAbort, { once: true });

  // Live-stream output to the host (the TUI paints it under the in-flight call),
  // throttled so a chatty command costs a repaint, not a flood. The agent still
  // gets only the final merged result — streaming is a UI affordance.
  let pending = "";
  let lastFlush = 0;
  const streamOut = (delta: string) => {
    if (!ctx.emit || !ctx.callId) return;
    pending += delta;
    const now = Date.now();
    if (now - lastFlush < 120) return;
    lastFlush = now;
    const d = pending;
    pending = "";
    ctx.emit({ type: "tool_output", id: ctx.callId, delta: d });
  };
  const flushStream = () => {
    if (pending && ctx.emit && ctx.callId) ctx.emit({ type: "tool_output", id: ctx.callId, delta: pending });
    pending = "";
  };

  let stdout = "";
  let stderr = "";
  const read = async (stream: ReadableStream, sink: (s: string) => void) => {
    try {
      const dec = new TextDecoder();
      for await (const chunk of stream as any) {
        const s = dec.decode(chunk as Uint8Array, { stream: true });
        sink(s);
        streamOut(s);
      }
    } catch {}
  };
  await Promise.all([
    read(proc.stdout as ReadableStream, (s) => (stdout += s)),
    read(proc.stderr as ReadableStream, (s) => (stderr += s)),
  ]);
  flushStream();
  clearTimeout(timer);
  ctx.signal?.removeEventListener("abort", onAbort);
  const code = await proc.exited;
  kill.cancel?.(); // child is gone; don't leave a SIGKILL timer pending

  let s = "";
  if (stdout.trim()) s += stdout;
  if (stderr.trim()) s += (s ? "\n[stderr]\n" : "") + stderr;
  s = s.trimEnd();
  const truncated = s.length > outCap() ? s.slice(-outCap()) + "\n… (head truncated)" : s;
  let head = `exit ${code}`;
  if (killedBy) head += ` (${killedBy})`;
  const body = `${head}\n${truncated || "(no output)"}`;
  // a non-zero exit is a tool failure — the model (and the TUI's ✗) need to know
  return code === 0 && !killedBy ? ok(body) : fail(body);
}
