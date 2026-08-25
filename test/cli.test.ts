// Two things only the real entry point can prove, because both are about what
// happens *around* main(): a slash command passed to -p must not be sent to the
// model as a prompt, and a broken config must print one line rather than a stack
// trace. Both are exercised by spawning the CLI, with a base URL pointing at a
// closed port so any accidental provider call fails loudly instead of hanging.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CLI = join(import.meta.dir, "..", "src", "cli.ts");
let home: string;
let work: string;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "fox-cli-"));
  work = join(home, "work");
  mkdirSync(work, { recursive: true });
});

afterEach(() => {
  rmSync(home, { recursive: true, force: true });
});

function runCli(args: string[], env: Record<string, string> = {}) {
  const p = Bun.spawnSync(["bun", "run", CLI, ...args], {
    cwd: work,
    env: {
      ...process.env,
      FOX_HOME: home,
      FOX_API_KEY: "test-key",
      // a closed port: an unintended turn shows up as a connection error, and a
      // silently-passing test cannot be hiding a real provider call
      FOX_BASE_URL: "http://127.0.0.1:1",
      FOX_MODEL: "test-model",
      ...env,
    },
  });
  return { code: p.exitCode, out: p.stdout.toString(), err: p.stderr.toString() };
}

describe("headless slash commands", () => {
  test("-p '/prune' runs the command instead of prompting the model", () => {
    const r = runCli(["-p", "/prune"]);
    expect(r.code).toBe(0);
    expect(r.out).toContain("nothing to prune");
    // the giveaway that it was sent as a prompt would be a provider error
    expect(r.out + r.err).not.toMatch(/ECONNREFUSED|fetch failed|Unable to connect/i);
  }, 30_000);

  test("-p '/help' lists /prune", () => {
    const r = runCli(["-p", "/help"]);
    expect(r.code).toBe(0);
    expect(r.out).toContain("/prune");
  }, 30_000);

  test("a non-slash prompt does still reach the provider", () => {
    // the mirror image of the case above: proves the routing is a slash-only
    // branch and not an accidental short-circuit of every -p. Retries off, or
    // the backoff loop would keep hammering the closed port until the timeout.
    const r = runCli(["-p", "hello"], { FOX_RETRY_LIMIT: "0", FOX_REQUEST_TIMEOUT_MS: "2000" });
    expect(r.out + r.err).toMatch(/ECONNREFUSED|fetch failed|Unable to connect|error/i);
  }, 30_000);
});

/** stderr with ANSI removed, as a list of non-empty lines */
function errLines(err: string): string[] {
  return err
    .replace(/\[[0-9;]*m/g, "")
    .split("\n")
    .filter((l) => l.trim() !== "");
}

describe("config failures are one-liners", () => {
  test("malformed TOML names the file and exits 1", () => {
    const bad = join(home, "bad.toml");
    writeFileSync(bad, 'model = "unterminated\n');
    const r = runCli(["--config", bad, "-p", "hi"]);
    expect(r.code).toBe(1);
    expect(r.err).toContain("invalid TOML");
    expect(r.err).toContain(bad);
    // An uncaught throw prints Bun's source-quoted dump — the offending lines of
    // config.ts, a stack, and the Bun version — which buries the one fact the
    // user needs. Exactly one line of stderr is the whole point of catching it.
    const lines = errLines(r.err);
    expect(lines).toHaveLength(1);
    expect(lines[0]!.startsWith("fox: ")).toBe(true);
  }, 30_000);

  test("a stale .fox.json explains the rename instead of being ignored", () => {
    writeFileSync(join(work, ".fox.json"), JSON.stringify({ model: "old" }));
    const r = runCli(["-p", "hi"]);
    expect(r.code).toBe(1);
    expect(r.err).toContain(".fox.json");
    expect(r.err).toContain("fox.toml");
    expect(errLines(r.err)).toHaveLength(1);
  }, 30_000);
});
