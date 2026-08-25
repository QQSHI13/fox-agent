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
});

function ctx(): ToolContext {
  return { sessionId: "execcwd", cwd: session, turnStartSeq: 0, readFiles: new Set<string>() } as ToolContext;
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
    // level where fox's own behavior is visible.
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
    process.env.FOX_HOME = root;
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
