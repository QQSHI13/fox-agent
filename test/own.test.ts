// Terminal ownership: the layer BELOW the JS-property patches.
//
// The bug this pins: the TUI's stray-output quarantine replaces
// `process.stdout.write`, `process.stderr.write`, `console.error` and
// `Bun.stderr.write`. That only intercepts function CALLS through this
// process's JS objects. A child spawned with `stderr: "inherit"` — which
// `src/acp/client.ts` used to do for delegated agents — a native library, or
// anything holding its own descriptor reference writes to fd 1/2 directly and
// touches none of them, so it painted over the grid.
//
// The damage then persisted: the alternate screen has no scrollback, and
// `Screen.flush` compares row hashes against the buffer, finds it "already
// correct", and writes nothing. That is the black, textless input dock.
//
// ## Why these run in a child under a pty
//
// Ownership redirects the process's REAL fd 1/2, and only when stdout is a TTY
// (own.ts refuses otherwise — see the no-TTY case below). `bun test` gives the
// runner a pipe, and a test that redirected fds would swallow the runner's own
// report. So each case spawns a probe under `script -qec` (a real pty), where
// the probe does the redirect and writes its JSON verdict to a FILE — console
// output would be captured by the very mechanism under test.
import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { canOwnTerminal, ownTerminal } from "../src/tui/own.ts";

const hasLibc = canOwnTerminal();
const hasScript = !!Bun.which("script");
const probeTest = hasLibc && hasScript ? test : test.skip;

const ROOT = new URL("..", import.meta.url).pathname;

/**
 * Run `body` in a pty with ownership taken, and return its JSON verdict.
 * `body` receives `own` and must call `report(obj)` — writing through
 * `writeFileSync` to a path outside the captured descriptors.
 */
async function probe(body: string): Promise<Record<string, unknown>> {
  const dir = mkdtempSync(join(tmpdir(), "fox-own-"));
  const verdictFile = join(dir, "verdict.json");
  const file = join(dir, "probe.ts");
  writeFileSync(
    file,
    `
import { writeFileSync } from "node:fs";
import { ownTerminal } from ${JSON.stringify(join(ROOT, "src/tui/own.ts"))};
const report = (o) => writeFileSync(${JSON.stringify(verdictFile)}, JSON.stringify(o));
const own = ownTerminal();
if (!own) { report({ owned: false }); process.exit(2); }
${body}
`,
  );
  // -q quiet, -e return the child's exit code; this gives the probe a real pty
  Bun.spawnSync(["script", "-qec", `bun ${JSON.stringify(file)}`, "/dev/null"], { stdout: "ignore", stderr: "ignore" });
  try {
    return JSON.parse(readFileSync(verdictFile, "utf8"));
  } catch {
    return { owned: false, error: "probe produced no verdict" };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("ownTerminal: one writer, structurally", () => {
  probeTest("a child that INHERITS stdout/stderr is captured, not printed", async () => {
    const v = await probe(`
await Bun.spawn(["bash","-c","printf 'INH-ERR\\\\n' >&2; printf 'INH-OUT\\\\n' >&1"], { stdout: "inherit", stderr: "inherit" }).exited;
await Bun.sleep(100);
const cap = own.drain();
report({ err: cap.includes("INH-ERR"), out: cap.includes("INH-OUT") });
`);
    expect(v.err).toBe(true);
    expect(v.out).toBe(true);
  });

  probeTest("a grandchild's write is captured too", async () => {
    const v = await probe(`
await Bun.spawn(["bash","-c","bash -c 'printf GRAND-MARK >&2'"], { stderr: "inherit" }).exited;
await Bun.sleep(100);
report({ got: own.drain().includes("GRAND-MARK") });
`);
    expect(v.got).toBe(true);
  });

  probeTest("a write to fd 1 from this process is captured, not drawn", async () => {
    const v = await probe(`
process.stdout.write("SELF-STDOUT\\n");
await Bun.sleep(60);
report({ got: own.drain().includes("SELF-STDOUT") });
`);
    expect(v.got).toBe(true);
  });

  probeTest("the owner's own frame write is NOT captured — it reaches the terminal", async () => {
    const v = await probe(`
own.write("OWNER-FRAME\\n");
own.flush();
await Bun.sleep(60);
report({ captured: own.drain().includes("OWNER-FRAME") });
`);
    expect(v.captured).toBe(false);
  });

  probeTest("restore() returns what was not drained yet, and is idempotent", async () => {
    const v = await probe(`
process.stdout.write("PRE-RESTORE\\n");
await Bun.sleep(60);
const first = own.restore();
const second = own.restore();
report({ first: first.includes("PRE-RESTORE"), secondEmpty: second === "" });
`);
    expect(v.first).toBe(true);
    expect(v.secondEmpty).toBe(true);
  });

  // The bug: restore() gave fd 1 back and left fd 2 pointing at the capture
  // file, which it then unlinked. Everything printed AFTER the TUI comes down —
  // the "to resume: fox -c …" hint and the captured-output panel — goes through
  // stderr, so all of it was written into a deleted file and the user saw none
  // of it. term.ts's own comment says fd 2 "is still the capture file until this
  // restores it"; it never was restored.
  probeTest("restore() hands back BOTH descriptors, so post-exit stderr is visible", async () => {
    const v = await probe(`
import { readlinkSync } from "node:fs";
const readFd = (n) => { try { return readlinkSync("/proc/self/fd/" + n); } catch { return "(unreadable)"; } };
const before = { fd1: readFd(1), fd2: readFd(2) };
own.restore();
const after = { fd1: readFd(1), fd2: readFd(2) };
// post-restore stderr must not be swallowed: write a marker, then read the
// capture file's size — a capped fd 2 would keep growing it
console.error("POST-EXIT-MARKER");
report({ before, after, capturedStillExists: (() => { try { return require("node:fs").existsSync(own.capturePath); } catch { return false; } })() });
`);
    // both must be the SAME device after restore (the pty), not the capture file
    const before = v.before as { fd1: string; fd2: string };
    const after = v.after as { fd1: string; fd2: string };
    expect(after.fd2).toBe(after.fd1);
    expect(after.fd2).not.toContain("fox-capture");
    expect(before.fd2).toContain("fox-capture");
    expect(v.capturedStillExists).toBe(false);
  });

  probeTest("the capture file is removed on restore", async () => {
    const v = await probe(`
const { existsSync } = await import("node:fs");
const before = existsSync(own.capturePath);
own.restore();
report({ before, after: existsSync(own.capturePath) });
`);
    expect(v.before).toBe(true);
    expect(v.after).toBe(false);
  });
});

describe("ownTerminal: it declines rather than guessing", () => {
  test("without a TTY it takes nothing — the runner's own fds stay intact", () => {
    // `bun test` gives us a pipe. Redirecting here would swallow the report,
    // which is the bug this suite hit before the guard existed.
    expect(process.stdout.isTTY).toBeFalsy();
    expect(ownTerminal()).toBeNull();
  });

  test("an unsupported platform degrades to null instead of throwing", () => {
    // ownership failing must never fail the TUI: the caller keeps its
    // JS-property patches and writes through Bun.stdout.writer()
    if (!hasLibc) expect(ownTerminal()).toBeNull();
    else expect(typeof ownTerminal).toBe("function");
  });
});
