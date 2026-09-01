// Persistent interactive shell backed by tmux. Raw output is teed by
// `tmux pipe-pane` into a per-session log file, so draining reads a byte
// stream — immune to pane rewrapping (the old capture-pane byte cursor
// corrupted on resize). Draining waits for output to go quiet instead of a
// fixed sleep.
//
// This is a separate tool from `exec`, and the cwd rules are deliberately
// opposite: exec re-resolves from the session directory on every call and can
// never drift, while this shell starts in the session directory and then keeps
// whatever cwd it has been walked to. That persistence is the whole point —
// `cd build && make` has to still be in build/ on the next call.
import { openSync, readSync, fstatSync, closeSync, statSync, writeFileSync, mkdirSync, realpathSync } from "node:fs";
import { join } from "node:path";
import type { ToolDef } from "../providers/types.ts";
import type { ToolContext, ToolResult, PtyState } from "./types.ts";
import { fail, ok } from "./types.ts";
import { childEnv } from "../core/childenv.ts";
import { ptyDir } from "../core/paths.ts";
import { outCap } from "./files.ts";

export const ptyDef: ToolDef = {
  name: "pty",
  description:
    "Drive one persistent interactive shell for this session (tmux-backed): send keystrokes, drain new output since last call, send control chars like ^c. Use for servers, REPLs, watch modes — poll instead of re-running. The shell starts in the session directory and KEEPS its own working directory and environment between calls, so a `cd` or an exported variable persists (unlike exec, which always starts fresh in the session directory).",
  parameters: {
    type: "object",
    properties: {
      keys: {
        type: "string",
        description:
          'Keystrokes, sent literally — every character is typed exactly as given, nothing stripped, nothing added. A "\\n" presses Enter (in a shell that runs the line; multi-line input runs line by line). Without a newline the text just sits at the prompt. "^c" alone = ctrl+c. Omit to just drain.',
      },
      quiet_ms: { type: "number", description: "Return once output is silent for this long (default 400, max 5000)" },
    },
  },
};

/** Raised when tmux is missing — reported to the model, not thrown as a crash. */
export class PtyUnavailable extends Error {}

/**
 * `Bun.which` resolves against the PATH it was *started* with unless one is
 * passed explicitly, so a PATH change made after boot would go unnoticed and we
 * would report tmux as present right before failing to spawn it.
 */
function tmuxPath(): string | null {
  return Bun.which("tmux", { PATH: process.env.PATH ?? "" });
}

async function tmux(...argv: string[]): Promise<{ code: number; out: string }> {
  const proc = Bun.spawn(["tmux", ...argv], { stdout: "pipe", stderr: "pipe", env: childEnv() });
  const out = await new Response(proc.stdout).text();
  const err = await new Response(proc.stderr).text();
  const code = await proc.exited;
  return { code, out: out + err };
}

/** tmux session name for a fox-agent session — single definition for both sides. */
export function ptySessionName(sessionId: string): string {
  return `fox-agent-${sessionId.slice(0, 12)}`;
}

/**
 * Exact-match targets. A bare name is a *prefix* match in tmux, so `fox-agent-abc`
 * would happily resolve to `fox-agent-abcdef` once the real session is gone — the `=`
 * forbids that. The two forms are not interchangeable: session commands take
 * `=name`, while anything addressing a pane needs the trailing colon (`=name:`),
 * which fails with "can't find pane" if omitted.
 */
const sessionTarget = (name: string) => `=${name}`;
const paneTarget = (name: string) => `=${name}:`;

async function hasSession(name: string): Promise<boolean> {
  const { code } = await tmux("has-session", "-t", sessionTarget(name));
  return code === 0;
}

/** Where tmux says the pane actually is, or null if it won't say. */
async function panePath(name: string): Promise<string | null> {
  const { code, out } = await tmux("display-message", "-p", "-t", paneTarget(name), "#{pane_current_path}");
  const p = out.trim();
  return code === 0 && p ? p : null;
}

/**
 * Did the shell land somewhere other than where we asked?
 *
 * Compared through `realpath` because tmux reports the pane's resolved path: a
 * session directory reached through a symlink would otherwise look like a
 * mismatch on every spawn. A requested path that cannot be resolved at all is a
 * mismatch by definition — that is the case tmux silently redirects to $HOME.
 */
function landedElsewhere(requested: string, actual: string): boolean {
  if (requested === actual) return false;
  try {
    return realpathSync(requested) !== actual;
  } catch {
    return true;
  }
}

/** Create the tmux session and wire pipe-pane. Assumes nothing exists yet. */
async function spawnSession(sessionId: string, cwd: string): Promise<PtyState> {
  const name = ptySessionName(sessionId);
  await tmux("kill-session", "-t", sessionTarget(name)).catch(() => {});
  // -c is what pins the starting directory. Without it tmux inherits the *client's*
  // cwd (fox-agent's own process.cwd()), which is not necessarily the session's dir.
  const { code, out } = await tmux("new-session", "-d", "-s", name, "-c", cwd, "-x", "220", "-y", "50");
  if (code !== 0) throw new Error(`tmux new-session failed: ${out}`);
  // pty owns this directory. It used to rely on the store having created it as a
  // side effect, so pty in a fresh FOX_AGENT_HOME logged into a nonexistent path and
  // silently returned "(no new output)" forever.
  mkdirSync(ptyDir(), { recursive: true });
  const logPath = join(ptyDir(), `${name}.log`);
  // truncate: a log left over from a previous shell would be re-read from
  // offset 0 and served as if it were this shell's output. A failure here means
  // every later drain is empty, so it must not be swallowed.
  try {
    writeFileSync(logPath, "");
  } catch (e) {
    throw new PtyUnavailable(`pty unavailable: cannot write the output log ${logPath}: ${(e as Error).message}`);
  }
  // logPath goes through a shell; FOX_AGENT_HOME is user-supplied so quote properly
  await tmux("pipe-pane", "-o", "-t", paneTarget(name), `cat >> '${logPath.replace(/'/g, `'\\''`)}'`);
  // start the byte cursor past the shell's own startup noise (prompt, terminal
  // integration escapes) so the first drain returns the command's output, not a
  // banner the model has to read around
  const cursor = await waitForShell(logPath);
  // Where the shell *actually* is, which is not always where we asked. tmux does
  // not fail when -c names a missing or unreadable directory — it quietly falls
  // back to $HOME — so trusting the requested path would make PtyState.cwd, the
  // lost-session note and the tool description all describe a directory the shell
  // is nowhere near. This has to come after waitForShell: pane_current_path
  // reports the pane process's cwd, and until bash is up that is still fox-agent's own,
  // which would read as a mismatch on every single spawn.
  const actual = (await panePath(name)) ?? cwd;
  return { session: name, logPath, cursor, cwd: actual, requestedCwd: cwd };
}

/**
 * Wait for a freshly spawned shell to be ready for input.
 *
 * `tmux new-session` returns as soon as the pane exists — bash has not yet run
 * its rc files or drawn a prompt. Keys sent into that window are buffered by the
 * tty and do eventually run, so nothing is lost, but the *echo* of those
 * keystrokes hits the log immediately while the command's real output only
 * appears whenever the shell finally gets to it. `waitForQuiet` then sees the
 * echo go quiet and returns before the command ran, and its output surfaces on
 * the following call instead. Waiting for the first prompt is what keeps a
 * command's output attached to the call that issued it.
 */
async function waitForShell(logPath: string): Promise<number> {
  const deadline = Date.now() + 3_000;
  while (Date.now() < deadline && fileSize(logPath) === 0) await Bun.sleep(25);
  await waitForQuiet(logPath, 200);
  return fileSize(logPath);
}

/**
 * Get the session's shell, creating it if needed.
 *
 * Returns a `lost` flag when state existed but the tmux session was gone (tmux
 * server killed, machine rebooted). Silently building a fresh shell there would
 * let the model keep believing its earlier `cd`, exports and running processes
 * were still in place, so the caller reports the loss.
 */
export async function ensurePty(ctx: ToolContext): Promise<{ pty: PtyState; lost: boolean }> {
  if (!tmuxPath()) throw new PtyUnavailable("pty unavailable: tmux is not installed");

  if (ctx.pty && (await hasSession(ctx.pty.session))) return { pty: ctx.pty, lost: false };
  const lost = !!ctx.pty;
  ctx.pty = await spawnSession(ctx.sessionId, ctx.cwd);
  return { pty: ctx.pty, lost };
}


function fileSize(path: string): number {
  try {
    return statSync(path).size; // stat, not open+fstat — this is polled in a loop
  } catch {
    return 0;
  }
}

/**
 * How many trailing bytes of `buf` are the start of a UTF-8 sequence whose
 * remaining bytes have not arrived yet.
 *
 * The cursor is a byte offset into a log that a live shell is still writing, so
 * a read almost always lands mid-character eventually. `Buffer.toString("utf8")`
 * turns a truncated sequence into U+FFFD, and because the cursor then advances
 * past those bytes the character is lost for good — the next drain starts after
 * them. Same defect class as the streaming-decoder bug in `tui/keys.ts`: the fix
 * is to leave the partial sequence in the file and re-read it next time.
 *
 * A lead byte encodes its own length (0b110xxxxx = 2, 0b1110xxxx = 3,
 * 0b11110xxx = 4), so scanning back over at most 3 continuation bytes to the
 * lead is enough to decide. Returns 0 when the buffer ends on a clean boundary,
 * and 0 for malformed bytes too — those are not going to be completed by waiting,
 * and holding them back would stall the cursor forever.
 */
export function partialTailBytes(buf: Buffer): number {
  for (let back = 1; back <= 4 && back <= buf.length; back++) {
    const b = buf[buf.length - back];
    if (b < 0x80) return 0; // ASCII: the buffer ends on a boundary
    if (b < 0xc0) continue; // continuation byte; keep walking back to the lead
    // 0xf8 and up are not lead bytes in any UTF-8 sequence. Reading a length out
    // of one would hold it back waiting for bytes that are never coming, and a
    // shell that then goes quiet leaves the cursor parked on it — the exact
    // stall this function exists to avoid. Same for 0xc0/0xc1 (overlong).
    if (b > 0xf7 || b < 0xc2) return 0;
    const need = b >= 0xf0 ? 4 : b >= 0xe0 ? 3 : 2;
    return back < need ? back : 0;
  }
  return 0;
}

/** Exported for tests: the drain step that must not lose a character. */
export function readRange(path: string, from: number): { text: string; end: number } {
  let fd: number;
  try {
    fd = openSync(path, "r");
  } catch {
    return { text: "", end: from };
  }
  try {
    const size = fstatSync(fd).size;
    if (size <= from) return { text: "", end: size };
    const len = Math.min(size - from, outCap() * 4);
    const buf = Buffer.alloc(len);
    readSync(fd, buf, 0, len, from);
    // Stop short of a character split across this range's end (see
    // partialTailBytes) so the cursor resumes at the lead byte, not past it.
    const hold = partialTailBytes(buf);
    const keep = len - hold;
    return { text: buf.toString("utf8", 0, keep), end: from + keep };
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
  let pty: PtyState;
  let lost: boolean;
  try {
    ({ pty, lost } = await ensurePty(ctx));
  } catch (e) {
    if (e instanceof PtyUnavailable) return fail(e.message);
    throw e;
  }

  if (args.keys) {
    if (args.keys === "^c") {
      await tmux("send-keys", "-t", paneTarget(pty.session), "C-c");
    } else {
      // Literal, character for character: the agent owns this shell, so nothing
      // is stripped or synthesized. A "\n" in the string IS the Enter key
      // (tmux -l writes a raw LF, which a shell's line discipline reads as
      // accept-line), so multi-line input simply runs line by line.
      await tmux("send-keys", "-t", paneTarget(pty.session), "-l", args.keys);
    }
    await waitForQuiet(pty.logPath, Math.min(5_000, Math.max(200, args.quiet_ms ?? 400)));
  }

  const { text, end } = readRange(pty.logPath, pty.cursor);
  pty.cursor = end;
  const fresh = text.replace(/\r/g, "").trimEnd();
  const body = fresh.length > outCap() ? `…\n${fresh.slice(-outCap())}` : fresh || "(no new output)";
  // tell the model plainly that its shell is not the one it was using, rather
  // than handing back a pristine prompt that looks like nothing happened
  let note = lost
    ? `(pty: the tmux session was lost — started a fresh shell in ${pty.cwd}; the previous working directory, environment and any running processes are gone)\n`
    : "";
  // A shell in an unexpected directory is as misleading as a lost one: every
  // relative path the model writes would land somewhere else. Report it once, on
  // the call that created the shell, and then stop — after that the model may
  // have `cd`'d deliberately and a standing warning would be noise.
  if (pty.requestedCwd && landedElsewhere(pty.requestedCwd, pty.cwd)) {
    note += `(pty: ${pty.requestedCwd} was not usable as a starting directory, so the shell is in ${pty.cwd} instead — use absolute paths or cd first)\n`;
    pty.requestedCwd = undefined;
  }
  // Keys without a newline were typed but not submitted. Say so, or the model
  // reads the unchanged output as "the command did nothing" and its next call
  // concatenates onto a line that is still waiting.
  if (args.keys && args.keys !== "^c" && !args.keys.includes("\n")) {
    note += `(pty: keys contained no newline — the text was typed literally and is still sitting at the prompt unexecuted; include "\\n" to run it)\n`;
  }
  return ok(note + body);
}

export async function cleanupPty(ctxOrSession: ToolContext | string): Promise<void> {
  const session = typeof ctxOrSession === "string" ? ctxOrSession : ctxOrSession.pty?.session;
  if (session && tmuxPath()) await tmux("kill-session", "-t", sessionTarget(session)).catch(() => {});
}
