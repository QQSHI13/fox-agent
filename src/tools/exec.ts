import { resolve } from "node:path";
import type { ToolDef } from "../providers/types.ts";
import type { ToolContext, ToolResult } from "./types.ts";
import { fail, ok } from "./types.ts";
import { setLongTimeout } from "../core/timers.ts";
import { childEnv } from "../core/childenv.ts";
import { shellName, shellPath } from "../core/shell.ts";
import { outCap } from "./files.ts";

export const execDef: ToolDef = {
  name: "exec",
  description:
    "Run a shell command (" + shellName() + ") starting from the session's directory. Each call is independent: the working directory NEVER carries over from a previous exec, so a `cd` has no effect on the next call — use the workdir argument (or `cd x && cmd` within one call) instead. For an interactive shell that keeps its directory, use pty. For background work, long-running jobs, and polling, use the repl tool's `jobs` API. Foreground runs return exit code + merged output (tail-capped, unless full:true). `full: true` lifts the per-result output cap for this call so you receive the whole output — use it when the capped tail is not enough; the hard memory guards and the display budget still apply (a gigantic result is excerpted head+tail with a note saying so, and `ctx restore` brings it back). Runs with full machine access.",
  parameters: {
    type: "object",
    properties: {
      cmd: { type: "string", description: "Command to run." },
      workdir: { type: "string", description: "Directory to run in, relative to the session directory. Applies to this call only." },
      timeout_ms: { type: "number", description: "Kill the process tree after this many milliseconds; default 120000, no upper bound, 0 = no timeout (runs until it exits or is interrupted)" },
      full: { type: "boolean", description: "Return the full uncapped output for this call instead of the tail-capped default" },
    },
    required: [],
  },
};

/**
 * TERM then KILL the whole process group (the child is spawned `detached`, so
 * it leads its own session and `-pid` reaches grandchildren too).
 *
 * `kill(1)` is deliberately not used: BSD's kill on macOS does not accept `--`
 * as an end-of-options marker, so `kill -TERM -- -123` was a no-op there, and
 * forking a binary per timeout buys nothing. A group that is not there — the
 * child never became a leader, or it already exited — falls back to the single
 * pid rather than doing nothing.
 *
 * Returns a canceller so the caller can drop the pending SIGKILL once the
 * child has actually exited — otherwise the timer keeps the loop alive.
 */
export function killTree(pid: number): () => void {
  const signal = (sig: "SIGTERM" | "SIGKILL") => {
    try {
      process.kill(-pid, sig);
    } catch {
      try {
        process.kill(pid, sig);
      } catch {} // already gone
    }
  };
  signal("SIGTERM");
  const t = setTimeout(() => signal("SIGKILL"), 1_500);
  return () => clearTimeout(t);
}

export function spawnShell(cmd: string, cwd: string) {
  // `detached` makes the child lead its own session and process group, which
  // is what killTree targets. It replaces the `setsid` binary, which macOS
  // does not ship — without it the tree kill silently did nothing there, and
  // a timed-out command kept running.
  return Bun.spawn([shellPath(), "-c", cmd], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
    stdin: "ignore",
    detached: true,
    env: childEnv(undefined, cwd),
  });
}

// ---- foreground (with live output streaming to the UI) ---------------------

const MAX_FG_BYTES = 5_000_000;

export async function execRun(
  args: { cmd?: string; workdir?: string; timeout_ms?: number; full?: boolean },
  ctx: ToolContext,
): Promise<ToolResult> {
  if (!args.cmd) return fail("error: exec needs cmd");

  // Contract: exec's cwd never drifts. `ctx.cwd` is the session's directory and
  // is immutable for the session's lifetime, and `workdir` is resolved against it
  // per call rather than being remembered — so no command, however it wanders,
  // can move where the *next* exec starts. `pty` is the tool for a shell that
  // keeps its place.
  const cwd = args.workdir ? resolve(ctx.cwd, args.workdir) : ctx.cwd;
  // The caller owns the budget: any positive value is honoured (no 10-minute
  // ceiling nobody can see), and 0 means "no timeout" — the command runs until
  // it exits or is interrupted. Same contract as repl's timeout_ms.
  const rawTimeout = args.timeout_ms ?? 120_000;
  if (!Number.isFinite(rawTimeout) || rawTimeout < 0) return fail("error: timeout_ms must be a non-negative number (0 = no timeout)");
  const timeout = rawTimeout === 0 ? 0 : Math.max(1, Math.floor(rawTimeout));
  const proc = spawnShell(args.cmd, cwd);

  let killedBy = "";
  const kill: { cancel: (() => void) | null } = { cancel: null };
  // setLongTimeout, not setTimeout: a budget past the 32-bit wall would fire
  // after 1ms and kill the command instantly
  const timer = timeout > 0
    ? setLongTimeout(() => {
        killedBy = `timeout ${timeout}ms`;
        kill.cancel = killTree(proc.pid);
      }, timeout)
    : null;
  timer?.unref();
  const onAbort = () => {
    if (!killedBy) killedBy = "interrupted";
    kill.cancel = killTree(proc.pid);
  };
  ctx.signal?.addEventListener("abort", onAbort, { once: true });
  // an already-aborted signal never fires the listener above
  if (ctx.signal?.aborted) onAbort();

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
  let dropped = 0;
  const capAppend = (cur: string, s: string): string => {
    const next = cur + s;
    if (next.length <= MAX_FG_BYTES) return next;
    // keep the tail (most recent output is what the model needs), count the drop
    dropped += next.length - MAX_FG_BYTES;
    return next.slice(-MAX_FG_BYTES);
  };
  const read = async (stream: ReadableStream, sink: (s: string) => void) => {
    const dec = new TextDecoder();
    try {
      for await (const chunk of stream as any) {
        const s = dec.decode(chunk as Uint8Array, { stream: true });
        sink(s);
        streamOut(s);
      }
    } catch {}
    // Flush the decoder: a stream that ends mid-character holds those bytes in
    // its internal buffer, and without this they were dropped rather than
    // surfaced as the replacement character. Same reasoning as the pty cursor.
    try {
      const tail = dec.decode();
      if (tail) {
        sink(tail);
        streamOut(tail);
      }
    } catch {}
  };
  let code: number;
  try {
    await Promise.all([
      read(proc.stdout as ReadableStream, (s) => (stdout = capAppend(stdout, s))),
      read(proc.stderr as ReadableStream, (s) => (stderr = capAppend(stderr, s))),
    ]);
    flushStream();
    timer?.clear();
    // The listener stays attached through this wait. A command can close its
    // own stdout/stderr and then keep running, so the reads finish while the
    // process is still alive; removing the listener here made an ESC during
    // that window unable to kill it, and the tool sat until the child exited.
    code = await proc.exited;
    kill.cancel?.(); // child is gone; don't leave a SIGKILL timer pending
  } finally {
    ctx.signal?.removeEventListener("abort", onAbort);
  }

  let s = "";
  if (stdout.trim()) s += stdout;
  if (stderr.trim()) s += (s ? "\n[stderr]\n" : "") + stderr;
  s = s.trimEnd();
  if (dropped > 0) s = `… (${dropped} chars dropped, output too chatty)\n${s}`;
  // full:true lifts the per-result cap for this call — the 5MB in-memory guard
  // above still bounds it, and says so when it bites
  const truncated = !args.full && s.length > outCap() ? s.slice(-outCap()) + "\n… (head truncated)" : s;
  let head = `exit ${code}`;
  if (killedBy) head += ` (${killedBy})`;
  const body = `${head}\n${truncated || "(no output)"}`;
  // a non-zero exit is a tool failure — the model (and the TUI's ✗) need to know
  const result = code === 0 && !killedBy ? ok(body) : fail(body);
  // full:true also tells the turn loop to skip ITS per-result tail cap; the
  // local cap above is already conditional on the same flag (see `truncated`)
  return args.full ? { ...result, uncapped: true } : result;
}
