// exec's cwd contract, which is the exact opposite of pty's: every call starts
// from the session directory, and nothing a command does can move where the next
// one starts. `workdir` is a per-call argument, never a sticky setting.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ToolContext } from "../src/tools/types.ts";

let root: string;
let session: string;
let sub: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "fox-exec-"));
  session = join(root, "session");
  sub = join(session, "sub");
  mkdirSync(sub, { recursive: true });
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  delete process.env.FOX_AGENT_HOME;
  delete process.env.FOX_AGENT_CONFIG;
});

function ctx(): ToolContext {
  return { sessionId: "execcwd", cwd: session,  } as ToolContext;
}

describe("exec never drifts", () => {
  test("a cd in one call does not move the next call", async () => {
    const { execRun } = await import("../src/tools/exec.ts");
    const c = ctx();
    await execRun({ cmd: `cd ${sub} && pwd` }, c);
    const after = await execRun({ cmd: "pwd" }, c);
    expect(after.output).toContain(session);
    expect(after.output).not.toContain(sub);
  }, 20_000);

  test("workdir applies to its own call only", async () => {
    const { execRun } = await import("../src/tools/exec.ts");
    const c = ctx();
    const inSub = await execRun({ cmd: "pwd", workdir: "sub" }, c);
    expect(inSub.output).toContain(sub);
    // the next call with no workdir is back at the session dir, not still in sub
    const next = await execRun({ cmd: "pwd" }, c);
    expect(next.output.split("\n").map((l) => l.trim())).toContain(session);
  }, 20_000);

  test("ctx.cwd is not mutated by running commands", async () => {
    const { execRun } = await import("../src/tools/exec.ts");
    const c = ctx();
    await execRun({ cmd: "cd /tmp && pwd", workdir: "sub" }, c);
    expect(c.cwd).toBe(session);
  }, 20_000);

  test("childEnv pins PWD to the spawn cwd and drops a stale OLDPWD", async () => {
    // This is asserted on childEnv, not through exec, because it cannot be
    // observed through exec at all: exec always goes via `bash -c`, and bash
    // rewrites PWD and unsets OLDPWD for its own children regardless. The fix
    // therefore protects shell-less children (MCP servers), and this is the
    // level where fox-agent's own behavior is visible.
    const { childEnv } = await import("../src/core/childenv.ts");
    const prev = { PWD: process.env.PWD, OLDPWD: process.env.OLDPWD };
    process.env.PWD = "/somewhere/else";
    process.env.OLDPWD = "/definitely/not/here";
    try {
      const env = childEnv(undefined, sub);
      expect(env.PWD).toBe(sub);
      // a stale OLDPWD would make `cd -` in a shell-less child jump somewhere
      // unrelated; absent is the only safe value
      expect(env.OLDPWD).toBeUndefined();
      // without a cwd (tmux, MCP with no dir) the inherited value is left alone
      expect(childEnv().PWD).toBe("/somewhere/else");
    } finally {
      for (const [k, v] of Object.entries(prev)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  });
});

describe("exec vs pty: the contrast is deliberate", () => {
  test("pty keeps a cd that exec discards", async () => {
    if (!Bun.which("tmux")) return; // covered by test/pty.test.ts when tmux exists
    const { execRun } = await import("../src/tools/exec.ts");
    const { drivePty, cleanupPty } = await import("../src/tools/pty.ts");
    process.env.FOX_AGENT_HOME = root;
  // BOTH: loadConfig reads the global config from FOX_AGENT_CONFIG when set,
  // else ~/.config — setting only the home left this suite asserting against
  // the developer's real config (a stray key there flips expect(warnings)).
  // Point it inside the tmp home; never touch the real config (CLAUDE.md).
  process.env.FOX_AGENT_CONFIG = join(root, "config.toml");
    const c = ctx();
    c.sessionId = `execpty${Math.random().toString(36).slice(2, 8)}`;
    try {
      await drivePty({ keys: `cd ${sub}\n`, quiet_ms: 400 }, c);
      const ptyPwd = await drivePty({ keys: "echo AT:$(pwd):END\n", quiet_ms: 400 }, c);
      const execPwd = await execRun({ cmd: "pwd" }, c);
      expect(ptyPwd.output).toContain(`AT:${sub}:END`); // drifted, as intended
      expect(execPwd.output).toContain(session); // did not
    } finally {
      await cleanupPty(c);
    }
  }, 30_000);
});

// Interrupting a command that has stopped producing output but has not exited:
// the read loops end when the child closes its own fds, and the tool then waits
// on `proc.exited`. The abort listener used to be removed just before that
// wait, so ESC in that window could not kill the child and the call sat until
// it exited on its own.
describe("exec interrupt and encoding", () => {
  test("an abort after the pipes close still kills the child", async () => {
    const { execRun } = await import("../src/tools/exec.ts");
    const ac = new AbortController();
    const c = { ...ctx(), signal: ac.signal } as ToolContext;
    const t0 = Date.now();
    setTimeout(() => ac.abort(), 300);
    // closes fd 1 and 2 (so both read loops finish immediately), then keeps
    // running for far longer than the assertion window
    const r = await execRun({ cmd: "exec 1>&- 2>&-; sleep 30" }, c);
    expect(Date.now() - t0).toBeLessThan(10_000);
    expect(r.ok).toBe(false);
    expect(r.output).toContain("interrupted");
  }, 20_000);

  test("an incomplete trailing UTF-8 sequence is surfaced, not dropped", async () => {
    // the stream ends mid-character; without a decoder flush those bytes were
    // silently discarded and the output looked empty
    const { execRun } = await import("../src/tools/exec.ts");
    const r = await execRun({ cmd: "printf '\\xe6\\x97'" }, ctx());
    expect(r.output).toContain("\uFFFD");
  });
});
