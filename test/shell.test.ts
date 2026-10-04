/**
 * The shell is resolved, never hardcoded — and the thing that spawns commands
 * must agree with the thing that describes them to the model. Everything here
 * also has to hold on a machine that is not this one: macOS ships bash 3.2
 * with zsh as the login shell, and a minimal container may have /bin/sh alone.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { accessSync, chmodSync, constants, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execDef } from "../src/tools/exec.ts";
import { shellName, shellPath } from "../src/core/shell.ts";
import { buildRuntimeHeader } from "../src/loop/prompt.ts";

/** Captured at load, the same moment `execDef` was built — mutations below must not affect it. */
const AMBIENT = shellName();
const savedShell = process.env.SHELL;
let seq = 0;

afterEach(() => {
  if (savedShell === undefined) delete process.env.SHELL;
  else process.env.SHELL = savedShell;
});

/** an executable that is unambiguously not a real shell, so a match means "$SHELL was read" */
function fakeShell(): { path: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "fox-shell-"));
  const path = join(dir, "notabash");
  writeFileSync(path, "#!/bin/sh\nexit 0\n");
  chmodSync(path, 0o755);
  return { path, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

describe("shell resolution", () => {
  test("is an absolute, executable path — never a bare name that may not exist", () => {
    const p = shellPath();
    expect(p.startsWith("/")).toBe(true);
    expect(() => accessSync(p, constants.X_OK)).not.toThrow();
  });

  test("shellName is the path's basename, so the two can never disagree", () => {
    expect(shellPath().endsWith(`/${shellName()}`)).toBe(true);
    expect(shellName()).not.toContain("/");
  });

  test("$SHELL wins when it names something executable", () => {
    const fake = fakeShell();
    try {
      process.env.SHELL = fake.path;
      expect(shellPath()).toBe(fake.path);
      expect(shellName()).toBe("notabash");
    } finally {
      fake.cleanup();
    }
  });

  test("a $SHELL that is not there falls back to one that is", () => {
    process.env.SHELL = "/nonexistent/definitely-not-a-shell";
    expect(shellPath()).not.toBe("/nonexistent/definitely-not-a-shell");
    expect(() => accessSync(shellPath(), constants.X_OK)).not.toThrow();
  });

  test("an empty $SHELL is treated as unset, not as a shell named ''", () => {
    process.env.SHELL = "";
    expect(shellPath().length).toBeGreaterThan(1);
  });
});

describe("what the model is told", () => {
  test("exec names this machine's shell rather than asserting bash", () => {
    expect(execDef.description).toStartWith(`Run a shell command (${AMBIENT})`);
  });

  test("that name comes from $SHELL, not from a hardcoded literal", async () => {
    const fake = fakeShell();
    try {
      process.env.SHELL = fake.path;
      // the description is frozen when the module is evaluated, so evaluate it
      // again under the new value — a literal "bash" would not move
      const spec = `../src/tools/exec.ts?shell=${++seq}`;
      const fresh = (await import(spec)) as { execDef: { description: string } };
      expect(fresh.execDef.description).toStartWith("Run a shell command (notabash)");
    } finally {
      fake.cleanup();
    }
  });

  test("the runtime header reports that same shell, as a runnable path", () => {
    const h = buildRuntimeHeader({ sessionId: "s-shell", cwd: "/work", model: "gpt-4o-mini", tools: [] });
    const shell = /^os: .*shell=(\S+)$/m.exec(h)?.[1];
    expect(shell).toBeTruthy();
    expect(shell!.startsWith("/")).toBe(true);
    expect(() => accessSync(shell!, constants.X_OK)).not.toThrow();
  });
});
