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
      FOX_AGENT_HOME: home,
      FOX_AGENT_API_KEY: "test-key",
      // a closed port: an unintended turn shows up as a connection error, and a
      // silently-passing test cannot be hiding a real provider call
      FOX_AGENT_BASE_URL: "http://127.0.0.1:1",
      FOX_AGENT_MODEL: "test-model",
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

  test("fox json -p runs the command as NDJSON, like --json", () => {
    const r = runCli(["json", "-p", "/usage"]);
    expect(r.code).toBe(0);
    const line = r.out
      .trim()
      .split("\n")
      .map((l) => {
        try {
          return JSON.parse(l);
        } catch {
          return null;
        }
      })
      .find((o) => o?.type === "command");
    expect(line).toBeTruthy();
    expect(line.output).toContain("billed");
  }, 30_000);

  test("a non-slash prompt does still reach the provider", () => {
    // the mirror image of the case above: proves the routing is a slash-only
    // branch and not an accidental short-circuit of every -p. Retries off, or
    // the backoff loop would keep hammering the closed port until the timeout.
    const r = runCli(["-p", "hello"], { FOX_AGENT_RETRY_LIMIT: "0", FOX_AGENT_REQUEST_TIMEOUT_MS: "2000" });
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
    expect(lines[0]!.startsWith("fox-agent: ")).toBe(true);
  }, 30_000);

  test("a stale .fox.json explains the rename instead of being ignored", () => {
    writeFileSync(join(work, ".fox.json"), JSON.stringify({ model: "old" }));
    const r = runCli(["-p", "hi"]);
    expect(r.code).toBe(1);
    expect(r.err).toContain(".fox.json");
    expect(r.err).toContain("fox-agent.toml");
    expect(errLines(r.err)).toHaveLength(1);
  }, 30_000);
});

describe("argv parsing", () => {
  test("subcommand flags reach their handler instead of dying in the parser", async () => {
    const { parseArgv } = await import("../src/cli.ts");
    expect(parseArgv(["upgrade", "--beta"]).rest).toEqual(["upgrade", "--beta"]);
    expect(parseArgv(["upgrade", "--help"]).rest).toEqual(["upgrade", "--help"]);
    expect(parseArgv(["ls", "--help"]).rest).toEqual(["ls", "--help"]);
    expect(parseArgv(["-p", "x"]).flags.get("print")).toBe("x");
    expect(parseArgv(["json", "-p", "x"]).flags.get("json")).toBe(true);
  });

  test("unknown flags still throw instead of running something unintended", async () => {
    const { parseArgv } = await import("../src/cli.ts");
    const { ConfigError } = await import("../src/core/errors.ts");
    // flag-first order was never supported: the usage documents flag-after
    expect(() => parseArgv(["--beta", "upgrade"])).toThrow(ConfigError);
    // and a typo after a subcommand is still caught, not swallowed
    expect(() => parseArgv(["ls", "--jsno"])).toThrow(ConfigError);
    expect(() => parseArgv(["--frobnicate"])).toThrow(ConfigError);
  });

  test("per-command help documents the command, unknown topics fall back", async () => {
    const { commandHelp } = await import("../src/cli.ts");
    expect(commandHelp("upgrade")).toContain("fox upgrade [--beta|<version>]");
    expect(commandHelp("plugin")).toContain("fox plugin [on|off|add|rm|info");
    expect(commandHelp("nope")).toContain("usage: fox");
  });

  test("fox help <cmd> prints the command help via spawn", () => {
    const r = runCli(["help", "upgrade"]);
    expect(r.code).toBe(0);
    expect(r.out).toContain("fox upgrade [--beta|<version>]");
  }, 30_000);
});

describe("upgrade auth", () => {
  test("githubHeaders honors GITHUB_TOKEN/GH_TOKEN, preferring GITHUB_TOKEN", async () => {
    const { githubHeaders } = await import("../src/core/upgrade.ts");
    const prevG = process.env.GITHUB_TOKEN;
    const prevH = process.env.GH_TOKEN;
    delete process.env.GITHUB_TOKEN;
    delete process.env.GH_TOKEN;
    try {
      expect(githubHeaders().Authorization).toBeUndefined();
      expect(githubHeaders()["User-Agent"]).toMatch(/^fox-agent\//);
      process.env.GH_TOKEN = "gh-x";
      expect(githubHeaders().Authorization).toBe("Bearer gh-x");
      process.env.GITHUB_TOKEN = "ghu-y";
      expect(githubHeaders().Authorization).toBe("Bearer ghu-y");
    } finally {
      if (prevG === undefined) delete process.env.GITHUB_TOKEN;
      else process.env.GITHUB_TOKEN = prevG;
      if (prevH === undefined) delete process.env.GH_TOKEN;
      else process.env.GH_TOKEN = prevH;
    }
  });
});

describe("session selection from the CLI", () => {
  test("`fox ls` renders the same list `/sessions` prints", () => {
    // one session to list, made by a headless command that touches the store
    runCli(["-p", "/usage"]);
    const r = runCli(["ls"]);
    expect(r.code).toBe(0);
    expect(r.out.trim()).not.toBe("");
    // the old `ls` had its own loop over created_at and disagreed with every
    // other listing about ordering; now both go through formatSessionList
    expect(r.out).toContain("tok");
    expect(r.out).toContain(work);
  }, 30_000);

  test("`ls` with nothing to show says so rather than printing blank", () => {
    const r = runCli(["ls"]);
    expect(r.code).toBe(0);
    expect(r.out).toContain("(no sessions)");
  }, 30_000);

  test("-c without a tty still resumes the latest session in this directory", () => {
    // spawnSync gives no tty, which is the standing constraint: -c has to answer
    // without a keypress under -p and in pipes
    runCli(["-p", "/usage"]);
    const first = runCli(["ls"]).out.trim().split(/\s+/)[1];
    const r = runCli(["-c", "-p", "/usage"]);
    expect(r.code).toBe(0);
    expect(r.err).toContain(`resuming ${first}`);
  }, 30_000);

  test("-c in a directory with no history exits 1 and says why", () => {
    const r = runCli(["-c", "-p", "/usage"]);
    expect(r.code).toBe(1);
    expect(r.err).toContain("no previous session in this directory");
    expect(errLines(r.err)).toHaveLength(1);
  }, 30_000);

  test("-c takes a list index or id, and rejects an unknown one", () => {
    runCli(["-p", "/usage"]);
    const first = runCli(["ls"]).out.trim().split(/\s+/)[1];
    // index 1 = most recent — same numbering /sessions and /delete use
    const byIndex = runCli(["-c", "1", "-p", "/usage"]);
    expect(byIndex.code).toBe(0);
    expect(byIndex.err).toContain(`resuming ${first}`);
    const byId = runCli(["-c", first, "-p", "/usage"]);
    expect(byId.code).toBe(0);
    const bad = runCli(["-c", "999", "-p", "/usage"]);
    expect(bad.code).toBe(1);
    expect(bad.err).toContain("no session '999'");
  }, 30_000);

  test("an unknown subcommand exits 1 instead of opening the TUI", () => {
    const r = runCli(["frobnicate"]);
    expect(r.code).toBe(1);
    expect(r.err).toContain("unknown command 'frobnicate'");
  }, 30_000);

  test("help documents -c's optional selector and no longer mentions /resume or --last", () => {
    const r = runCli(["help"]);
    expect(r.code).toBe(0);
    expect(r.out).not.toContain("--last");
    expect(r.out).toMatch(/-c, --continue \[n\|id\]/);
    expect(r.out).not.toContain("/resume");
  }, 30_000);
});
