import { resolve } from "node:path";
import type { ToolDef } from "../providers/types.ts";
import type { ToolContext, ToolResult } from "./types.ts";
import { fail, ok } from "./types.ts";
import { OUT_CAP } from "./files.ts";

export const execDef: ToolDef = {
  name: "exec",
  description:
    "Run a shell command (bash). Returns exit code + merged output (tail-capped). For long-running/interactive things use pty instead. Runs with full machine access.",
  parameters: {
    type: "object",
    properties: {
      cmd: { type: "string" },
      workdir: { type: "string" },
      timeout_ms: { type: "number", description: "Kill the process tree after this long, default 120000" },
    },
    required: ["cmd"],
  },
};

/** TERM then KILL the whole process group (child is spawned as setsid leader). */
function killTree(pid: number) {
  try {
    Bun.spawnSync(["kill", "-TERM", "--", `-${pid}`], { stdout: "ignore", stderr: "ignore" });
  } catch {}
  setTimeout(() => {
    try {
      Bun.spawnSync(["kill", "-KILL", "--", `-${pid}`], { stdout: "ignore", stderr: "ignore" });
    } catch {}
  }, 1_500);
}

export async function execRun(
  args: { cmd?: string; workdir?: string; timeout_ms?: number },
  ctx: ToolContext,
): Promise<ToolResult> {
  if (!args.cmd) return fail("error: exec needs cmd");
  const cwd = args.workdir ? resolve(ctx.cwd, args.workdir) : ctx.cwd;
  const timeout = Math.min(600_000, Math.max(1_000, args.timeout_ms ?? 120_000));

  const useSetsid = !!Bun.which("setsid");
  const proc = Bun.spawn([...(useSetsid ? ["setsid"] : []), "/bin/bash", "-c", args.cmd], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
    stdin: "ignore",
    env: process.env,
  });

  let killedBy = "";
  const timer = setTimeout(() => {
    killedBy = `timeout ${timeout}ms`;
    killTree(proc.pid);
  }, timeout);
  const onAbort = () => {
    if (!killedBy) killedBy = "interrupted";
    killTree(proc.pid);
  };
  ctx.signal?.addEventListener("abort", onAbort, { once: true });

  let stdout = "";
  let stderr = "";
  try {
    [stdout, stderr] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
  } catch {}
  clearTimeout(timer);
  ctx.signal?.removeEventListener("abort", onAbort);
  const code = await proc.exited;

  let s = "";
  if (stdout.trim()) s += stdout;
  if (stderr.trim()) s += (s ? "\n[stderr]\n" : "") + stderr;
  s = s.trimEnd();
  const truncated = s.length > OUT_CAP ? s.slice(-OUT_CAP) + "\n… (head truncated)" : s;
  let head = `exit ${code}`;
  if (killedBy) head += ` (${killedBy})`;
  return ok(`${head}\n${truncated || "(no output)"}`);
}
