// pty is a separate tool from exec, with the opposite cwd contract: it starts in
// the session directory and then keeps whatever directory it is walked to. The
// bug being pinned here is that `tmux new-session` without `-c` inherits the
// tmux *client's* cwd (fox's own process.cwd()), so the shell could open in a
// directory that has nothing to do with the session.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PtyState, ToolContext } from "../src/tools/types.ts";

const HAS_TMUX = !!Bun.which("tmux");
// CI without tmux skips the live cases rather than failing on a missing binary
const liveTest = HAS_TMUX ? test : test.skip;

let home: string;
let workdir: string;
const spawned: string[] = [];

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "fox-pty-"));
  process.env.FOX_HOME = home;
  workdir = join(home, "project", "nested");
  mkdirSync(workdir, { recursive: true });
});

afterEach(async () => {
  // kill only the sessions this file created — never `kill-server`, which would
  // take out whatever else the user has running
  for (const name of spawned.splice(0)) {
    Bun.spawnSync(["tmux", "kill-session", "-t", `=${name}`], { stdout: "ignore", stderr: "ignore" });
  }
  rmSync(home, { recursive: true, force: true });
});

function ctx(sessionId: string, cwd: string): ToolContext {
  let pty: PtyState | undefined;
  return {
    sessionId,
    cwd,
    turnStartSeq: 0,
    readFiles: new Set<string>(),
    get pty() {
      return pty;
    },
    set pty(v: PtyState | undefined) {
      pty = v;
      if (v) spawned.push(v.session);
    },
  } as ToolContext;
}

/** unique per test so a stray session from another run can never be adopted */
const sid = (tag: string) => `ptytest${tag}${Math.random().toString(36).slice(2, 8)}`;

describe("pty starting directory", () => {
  liveTest("the shell starts in ctx.cwd, not in fox's own cwd", async () => {
    const { drivePty } = await import("../src/tools/pty.ts");
    const c = ctx(sid("cwd"), workdir);
    // process.cwd() here is the repo, so a pane that ignored -c would report that
    expect(process.cwd()).not.toBe(workdir);

    // the prompt itself contains the cwd, so asserting on a bare path would pass
    // even with no command output at all — the marker is what makes this real
    const res = await drivePty({ keys: "echo AT:$(pwd):END\n", quiet_ms: 400 }, c);
    expect(res.output).toContain(`AT:${workdir}:END`);
    expect(res.ok).toBe(true);
  }, 20_000);

  liveTest("tmux itself reports the pane path as the session dir", async () => {
    const { ensurePty } = await import("../src/tools/pty.ts");
    const c = ctx(sid("pane"), workdir);
    const { pty } = await ensurePty(c);
    // "=name:" — the trailing colon is required for a pane target; "=name" alone
    // is a session target and returns nothing here
    const out = Bun.spawnSync(["tmux", "display-message", "-p", "-t", `=${pty.session}:`, "#{pane_current_path}"]);
    expect(out.stdout.toString().trim()).toBe(workdir);
    expect(pty.cwd).toBe(workdir);
  }, 20_000);

  liveTest("a cd inside the shell persists to the next call — drift is allowed here", async () => {
    const { drivePty } = await import("../src/tools/pty.ts");
    const other = join(home, "elsewhere");
    mkdirSync(other, { recursive: true });
    const c = ctx(sid("drift"), workdir);

    await drivePty({ keys: `cd ${other}\n`, quiet_ms: 400 }, c);
    const res = await drivePty({ keys: "echo AT:$(pwd):END\n", quiet_ms: 400 }, c);
    // exec would have snapped back to the session dir; pty must not
    expect(res.output).toContain(`AT:${other}:END`);
  }, 25_000);

  liveTest("an unusable start directory is reported, not silently swapped for $HOME", async () => {
    // tmux does not fail when -c names a missing directory — it falls back to
    // $HOME. Left unreported, every relative path the model writes lands in the
    // wrong tree while pty says it succeeded.
    const { drivePty } = await import("../src/tools/pty.ts");
    const gone = join(home, "deleted-out-from-under-us");
    const c = ctx(sid("nodir"), gone);

    const res = await drivePty({ keys: "echo AT:$(pwd):END\n", quiet_ms: 400 }, c);
    expect(res.output).toContain("was not usable as a starting directory");
    expect(res.output).toContain(gone);
    // and the state agrees with the shell rather than with what we asked for
    expect(c.pty!.cwd).not.toBe(gone);
    expect(res.output).toContain(`AT:${c.pty!.cwd}:END`);

    // reported once: a later call must not keep repeating it
    const second = await drivePty({ keys: "echo again\n", quiet_ms: 400 }, c);
    expect(second.output).not.toContain("was not usable");
  }, 25_000);

  liveTest("a usable start directory produces no warning", async () => {
    const { drivePty } = await import("../src/tools/pty.ts");
    const c = ctx(sid("okdir"), workdir);
    const res = await drivePty({ keys: "echo hi\n", quiet_ms: 400 }, c);
    expect(res.output).not.toContain("not usable");
    expect(c.pty!.cwd).toBe(workdir);
  }, 20_000);

  liveTest("a symlinked session dir is not mistaken for a fallback", async () => {
    // tmux reports the pane's *resolved* path, so a raw string compare would warn
    // on every spawn for anyone whose project dir is reached through a symlink
    const { drivePty } = await import("../src/tools/pty.ts");
    const link = join(home, "link-to-project");
    symlinkSync(workdir, link, "dir");
    const c = ctx(sid("symlink"), link);
    const res = await drivePty({ keys: "echo hi\n", quiet_ms: 400 }, c);
    expect(res.output).not.toContain("not usable");
    expect(c.pty!.cwd).toBe(workdir); // resolved, and that is fine
  }, 20_000);
});

describe("a lost tmux session is reported", () => {
  liveTest("the next call says so instead of silently handing back a fresh shell", async () => {
    const { drivePty, ptySessionName } = await import("../src/tools/pty.ts");
    const id = sid("lost");
    const c = ctx(id, workdir);

    await drivePty({ keys: "export MARKER=first\n", quiet_ms: 400 }, c);
    const firstSession = c.pty!.session;
    expect(firstSession).toBe(ptySessionName(id));

    // simulate the tmux server dying / a reboot
    Bun.spawnSync(["tmux", "kill-session", "-t", `=${firstSession}`], { stdout: "ignore", stderr: "ignore" });

    const res = await drivePty({ keys: "echo [$MARKER]\n", quiet_ms: 500 }, c);
    expect(res.output).toContain("the tmux session was lost");
    expect(res.output).toContain(workdir);
    // the state really is gone, and the note is what tells the model that
    expect(res.output).toContain("[]");
  }, 25_000);

  liveTest("the byte cursor resets, so stale log bytes are not replayed as new", async () => {
    const { drivePty } = await import("../src/tools/pty.ts");
    const c = ctx(sid("cursor"), workdir);

    await drivePty({ keys: "echo UNIQUE_BEFORE_LOSS\n", quiet_ms: 400 }, c);
    const advanced = c.pty!.cursor;
    expect(advanced).toBeGreaterThan(0);

    Bun.spawnSync(["tmux", "kill-session", "-t", `=${c.pty!.session}`], { stdout: "ignore", stderr: "ignore" });
    const res = await drivePty({ keys: "echo AFTER\n", quiet_ms: 400 }, c);

    // the log was truncated with the new shell; output from the dead one must not
    // reappear as if it had just been produced
    expect(res.output).not.toContain("UNIQUE_BEFORE_LOSS");
    expect(res.output).toContain("AFTER");
    // and the cursor followed the truncation back down rather than staying past
    // the end of the new, shorter log
    expect(c.pty!.cursor).toBeLessThan(advanced);
  }, 25_000);

  liveTest("a healthy session is reused, with no spurious loss note", async () => {
    const { drivePty } = await import("../src/tools/pty.ts");
    const c = ctx(sid("reuse"), workdir);
    await drivePty({ keys: "export KEEP=yes\n", quiet_ms: 400 }, c);
    const name = c.pty!.session;

    const res = await drivePty({ keys: "echo [$KEEP]\n", quiet_ms: 400 }, c);
    expect(c.pty!.session).toBe(name); // same shell
    expect(res.output).not.toContain("was lost");
    expect(res.output).toContain("[yes]"); // environment survived
  }, 25_000);
});

describe("pty without tmux", () => {
  test("reports a clear tool failure rather than a raw spawn crash", async () => {
    const { drivePty } = await import("../src/tools/pty.ts");
    const c = ctx(sid("notmux"), workdir);
    const realPath = process.env.PATH;
    // an empty PATH is how Bun.which fails to find tmux
    process.env.PATH = join(home, "empty-bin");
    mkdirSync(process.env.PATH, { recursive: true });
    try {
      const res = await drivePty({ keys: "echo hi\n" }, c);
      expect(res.ok).toBe(false);
      expect(res.output).toMatch(/tmux is not installed/);
    } finally {
      process.env.PATH = realPath;
    }
  }, 15_000);
});

describe("pty log path", () => {
  test("logs live under FOX_HOME/pty and survive a quoted home", async () => {
    const { ptyDir } = await import("../src/core/paths.ts");
    expect(ptyDir()).toBe(join(home, "pty"));
    // the log path is interpolated into a shell command, so a quote in FOX_HOME
    // must not break out of it
    writeFileSync(join(home, "sentinel"), "x");
    expect(ptyDir().startsWith(home)).toBe(true);
  });

  liveTest("draining twice does not repeat output already returned", async () => {
    const { drivePty } = await import("../src/tools/pty.ts");
    const c = ctx(sid("drain"), workdir);
    await drivePty({ keys: "echo ONLY_ONCE\n", quiet_ms: 400 }, c);
    const second = await drivePty({}, c);
    expect(second.output).not.toContain("ONLY_ONCE");
  }, 20_000);
});
