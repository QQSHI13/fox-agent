// Persistent interactive shell backed by tmux. Raw output is teed by
// `tmux pipe-pane` into a per-session log file, so draining reads a byte
// stream — immune to pane rewrapping (the old capture-pane byte cursor
// corrupted on resize). Draining waits for output to go quiet instead of a
// fixed sleep.
import { openSync, readSync, fstatSync, closeSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ToolDef } from "../providers/types.ts";
import type { ToolContext, ToolResult, PtyState } from "./types.ts";
import { ok } from "./types.ts";
import { childEnv } from "../core/childenv.ts";
import { OUT_CAP } from "./files.ts";

export const ptyDef: ToolDef = {
  name: "pty",
  description:
    "Drive one persistent interactive shell for this session (tmux-backed): send keystrokes, drain new output since last call, send control chars like ^c. Use for servers, REPLs, watch modes — poll instead of re-running.",
  parameters: {
    type: "object",
    properties: {
      keys: { type: "string", description: 'Text to type (append \\n to press enter). "^c" = ctrl+c. Omit to just drain.' },
      quiet_ms: { type: "number", description: "Return once output is silent for this long (default 400, max 5000)" },
    },
  },
};

const PTY_DIR = () => {
  const dir = process.env.FOX_HOME ?? join(homedir(), ".local", "share", "fox");
  return join(dir, "pty");
};

async function tmux(...argv: string[]): Promise<{ code: number; out: string }> {
  const proc = Bun.spawn(["tmux", ...argv], { stdout: "pipe", stderr: "pipe", env: childEnv() });
  const out = await new Response(proc.stdout).text();
  const err = await new Response(proc.stderr).text();
  const code = await proc.exited;
  return { code, out: out + err };
}

/** tmux session name for a fox session — single definition for both sides. */
export function ptySessionName(sessionId: string): string {
  return `fox-${sessionId.slice(0, 12)}`;
}

export async function ensurePty(ctx: ToolContext): Promise<PtyState> {
  if (!ctx.pty) {
    const name = ptySessionName(ctx.sessionId);
    await tmux("kill-session", "-t", name).catch(() => {});
    const { code, out } = await tmux("new-session", "-d", "-s", name, "-x", "220", "-y", "50");
    if (code !== 0) throw new Error(`tmux new-session failed: ${out}`);
    const logPath = join(PTY_DIR(), `${name}.log`);
    try {
      writeFileSync(logPath, "");
    } catch {}
    // logPath goes through a shell; FOX_HOME is user-supplied so quote properly
    await tmux("pipe-pane", "-o", "-t", name, `cat >> '${logPath.replace(/'/g, `'\\''`)}'`);
    ctx.pty = { session: name, logPath, cursor: 0 };
  }
  return ctx.pty;
}

function fileSize(path: string): number {
  try {
    return statSync(path).size; // stat, not open+fstat — this is polled in a loop
  } catch {
    return 0;
  }
}

function readRange(path: string, from: number): { text: string; end: number } {
  let fd: number;
  try {
    fd = openSync(path, "r");
  } catch {
    return { text: "", end: from };
  }
  try {
    const size = fstatSync(fd).size;
    if (size <= from) return { text: "", end: size };
    const len = Math.min(size - from, OUT_CAP * 4);
    const buf = Buffer.alloc(len);
    readSync(fd, buf, 0, len, from);
    return { text: buf.toString("utf8"), end: from + len };
  } finally {
    closeSync(fd);
  }
}

async function waitForQuiet(logPath: string, quietMs: number): Promise<void> {
  // overall cap scales with the requested quiet window, so a long quiet_ms
  // isn't silently cut off at 6s
  const deadline = Date.now() + Math.max(6_000, quietMs * 4);
  const poll = Math.min(150, quietMs);
  const needed = Math.max(2, Math.ceil(quietMs / poll));
  let stable = 0;
  let last = fileSize(logPath);
  while (Date.now() < deadline && stable < needed) {
    await Bun.sleep(poll);
    const now = fileSize(logPath);
    if (now === last) stable++;
    else {
      stable = 0;
      last = now;
    }
  }
}

export async function drivePty(args: { keys?: string; quiet_ms?: number }, ctx: ToolContext): Promise<ToolResult> {
  const pty = await ensurePty(ctx);

  if (args.keys) {
    if (args.keys === "^c") {
      await tmux("send-keys", "-t", pty.session, "C-c");
    } else {
      const hasEnter = args.keys.endsWith("\n");
      const body = hasEnter ? args.keys.slice(0, -1) : args.keys;
      if (body) await tmux("send-keys", "-t", pty.session, "-l", body);
      if (hasEnter) await tmux("send-keys", "-t", pty.session, "Enter");
    }
    await waitForQuiet(pty.logPath, Math.min(5_000, Math.max(200, args.quiet_ms ?? 400)));
  }

  const { text, end } = readRange(pty.logPath, pty.cursor);
  pty.cursor = end;
  const fresh = text.replace(/\r/g, "").trimEnd();
  return ok(fresh.length > OUT_CAP ? `…\n${fresh.slice(-OUT_CAP)}` : fresh || "(no new output)");
}

export async function cleanupPty(ctxOrSession: ToolContext | string): Promise<void> {
  const session = typeof ctxOrSession === "string" ? ctxOrSession : ctxOrSession.pty?.session;
  if (session) await tmux("kill-session", "-t", session).catch(() => {});
}
