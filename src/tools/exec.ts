import type { ToolDef } from "../provider/openai.ts";
import { OUT_CAP } from "./files.ts";
import type { ToolContext } from "./index.ts";

// ---------- exec: one-shot + persistent pty (tmux backend) ----------
export const execDef: ToolDef = {
  name: "exec",
  description:
    "Run a shell command. One-shot by default. With pty:true, drives one persistent interactive shell for this session: send keystrokes, drain new output, send control chars like ^c.",
  parameters: {
    type: "object",
    properties: {
      cmd: { type: "string", description: "Command to run (one-shot mode)" },
      workdir: { type: "string" },
      timeout_ms: { type: "number", description: "One-shot timeout, default 120000" },
      pty: { type: "boolean", description: "Operate on the persistent interactive shell" },
      keys: { type: "string", description: "Text to type into the pty (append \\n to press enter). '^c' = ctrl+c" },
    },
  },
};

interface Pty {
  session: string; // tmux session name
  cursor: number; // byte offset into history already returned
}

const PTY_CAP = 100_000; // keep last 100KB of pane history

export async function execRun(
  args: { cmd?: string; workdir?: string; timeout_ms?: number; pty?: boolean; keys?: string },
  ctx: ToolContext,
): Promise<string> {
  if (!args.pty) {
    return runOneShot(args, ctx);
  }
  return drivePty(args, ctx);
}

async function runOneShot(args: { cmd?: string; workdir?: string; timeout_ms?: number }, ctx: ToolContext): Promise<string> {
  if (!args.cmd) return "error: one-shot mode needs cmd";
  const proc = Bun.spawn(["/bin/bash", "-c", args.cmd], {
    cwd: args.workdir ? resolveSafe(ctx.cwd, args.workdir) : ctx.cwd,
    stdout: "pipe",
    stderr: "pipe",
    env: process.env,
  });
  const timer = setTimeout(() => proc.kill(9), args.timeout_ms ?? 120_000);
  const [out, err] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
  clearTimeout(timer);
  const code = await proc.exited;
  let s = "";
  if (out.trim()) s += out;
  if (err.trim()) s += (s ? "\n[stderr]\n" : "") + err;
  s = s.trimEnd();
  const truncated = s.length > OUT_CAP ? s.slice(-OUT_CAP) + "\n… (head truncated)" : s;
  return `exit ${code}\n${truncated || "(no output)"}`;
}

function resolveSafe(cwd: string, p: string): string {
  return p.startsWith("/") ? p : `${cwd}/${p}`;
}

// ---- pty via tmux ----

async function tmux(...argv: string[]): Promise<{ code: number; out: string }> {
  const proc = Bun.spawn(["tmux", ...argv], { stdout: "pipe", stderr: "pipe", env: process.env });
  const out = await new Response(proc.stdout).text();
  const err = await new Response(proc.stderr).text();
  const code = await proc.exited;
  return { code, out: out + err };
}

async function ensurePty(ctx: ToolContext): Promise<Pty> {
  if (!ctx.pty) {
    const name = `foxc-${ctx.sessionId.slice(0, 12)}`;
    await tmux("kill-session", "-t", name).catch(() => {});
    const { code, out } = await tmux("new-session", "-d", "-s", name, "-x", "220", "-y", "50");
    if (code !== 0) throw new Error(`tmux new-session failed: ${out}`);
    ctx.pty = { session: name, cursor: 0 };
  }
  return ctx.pty;
}

async function paneDump(session: string): Promise<string> {
  // read the whole scrollback+screen
  const { code, out } = await tmux("capture-pane", "-p", "-J", "-S", `-${PTY_CAP}`, "-t", session);
  if (code !== 0) throw new Error(`tmux capture failed: ${out}`);
  return out;
}

async function drivePty(args: { keys?: string }, ctx: ToolContext): Promise<string> {
  const pty = await ensurePty(ctx);

  if (args.keys) {
    if (args.keys === "^c") {
      await tmux("send-keys", "-t", pty.session, "C-c");
    } else {
      // literal text then Enter if it ends with \n
      const text = args.keys;
      const hasEnter = text.endsWith("\n");
      const body = hasEnter ? text.slice(0, -1) : text;
      if (body) await tmux("send-keys", "-t", pty.session, "-l", body);
      if (hasEnter) await tmux("send-keys", "-t", pty.session, "Enter");
    }
    // give output a moment to arrive
    await Bun.sleep(400);
  }

  const full = await paneDump(pty.session);
  const fresh = full.length >= pty.cursor ? full.slice(pty.cursor) : `\n… (pane reset)\n${full}`;
  pty.cursor = full.length;

  const tail = fresh.trimEnd();
  return tail.length > OUT_CAP ? `…\n${tail.slice(-OUT_CAP)}` : tail || "(no new output)";
}
