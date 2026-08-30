import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let dir: string;
let projectDir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "fox-cfg-"));
  projectDir = join(dir, "proj");
  mkdirSync(projectDir, { recursive: true });
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("config cascade", () => {
  test("defaults when nothing configured", async () => {
    const { loadConfig } = await import("../src/core/config.ts");
    const cfg = loadConfig({ cwd: projectDir }, {});
    expect(cfg.model).toBe("gpt-4o-mini");
    expect(cfg.provider).toBe("openai-compatible");
    expect(cfg.maxSteps).toBe(0); // no step cap by default
    expect(cfg.mcpServers).toEqual({});
  });

  test("env overrides defaults; claude model sniffs anthropic provider", async () => {
    const { loadConfig } = await import("../src/core/config.ts");
    const cfg = loadConfig({ cwd: projectDir }, { FOX_AGENT_MODEL: "claude-sonnet-4", FOX_AGENT_API_KEY: "k", FOX_AGENT_MAX_STEPS: "12" });
    expect(cfg.model).toBe("claude-sonnet-4");
    expect(cfg.provider).toBe("anthropic");
    expect(cfg.maxSteps).toBe(12);
  });

  test("env beats project fox-agent.toml (npm-style precedence)", async () => {
    writeFileSync(
      join(projectDir, "fox-agent.toml"),
      `model = "kimi-k2"
maxSteps = 7

[mcpServers.fs]
command = "npx"
args = ["-y", "@modelcontextprotocol/server-fs"]
`,
    );
    const { loadConfig } = await import("../src/core/config.ts");
    const withEnv = loadConfig({ cwd: projectDir }, { FOX_AGENT_MODEL: "gpt-4o", FOX_AGENT_API_KEY: "k" });
    expect(withEnv.model).toBe("gpt-4o"); // env outranks project file
    const withoutEnv = loadConfig({ cwd: projectDir }, { FOX_AGENT_API_KEY: "k" });
    expect(withoutEnv.model).toBe("kimi-k2"); // project fills when env silent
    expect(withoutEnv.maxSteps).toBe(7);
    expect(withoutEnv.mcpServers.fs.command).toBe("npx");
    expect(withoutEnv.mcpServers.fs.args).toEqual(["-y", "@modelcontextprotocol/server-fs"]);
  });

  test("[agents.*] tables become delegation targets; 'default' cannot be rebound", async () => {
    writeFileSync(
      join(projectDir, "fox-agent.toml"),
      `[agents.helper]
command = "some-other-agent"
args = ["--acp"]

[agents.broken]
args = ["--acp"]

[agents.default]
command = "not-fox"
`,
    );
    const { loadConfig } = await import("../src/core/config.ts");
    const cfg = loadConfig({ cwd: projectDir }, { FOX_AGENT_API_KEY: "k" });
    expect(cfg.agents.helper).toEqual({ command: "some-other-agent", args: ["--acp"], env: undefined });
    // a table with no command is skipped, exactly like a malformed mcpServers entry
    expect(cfg.agents.broken).toBeUndefined();
    // "default" is fox-agent delegating to itself, synthesized at call time; letting a
    // config rebind it would silently route `task` somewhere the model can't know
    expect(cfg.agents.default).toBeUndefined();
  });

  test("[agents.*] with a url is an A2A endpoint; neither command nor url is junk", async () => {
    writeFileSync(
      join(projectDir, "fox-agent.toml"),
      `[agents.remote]
url = "https://agent.example.com"
headers = { authorization = "Bearer t" }

[agents.junk]
args = ["--acp"]
`,
    );
    const { loadConfig } = await import("../src/core/config.ts");
    const cfg = loadConfig({ cwd: projectDir }, { FOX_AGENT_API_KEY: "k" });
    expect(cfg.agents.remote.url).toBe("https://agent.example.com");
    expect(cfg.agents.remote.headers).toEqual({ authorization: "Bearer t" });
    expect(cfg.agents.remote.command).toBeUndefined();
    expect(cfg.agents.junk).toBeUndefined();
  });

  test("agents from one load do not leak into the next", async () => {
    // DEFAULTS holds one shared object per table and applyTable writes into it, so
    // reusing the reference would carry a project's agents into every later load
    // in the process — and `fox --acp` loads config per run.
    writeFileSync(join(projectDir, "fox-agent.toml"), `[agents.helper]\ncommand = "x"\n`);
    const clean = join(dir, "clean");
    mkdirSync(clean, { recursive: true });
    const { loadConfig } = await import("../src/core/config.ts");
    loadConfig({ cwd: projectDir }, { FOX_AGENT_API_KEY: "k" });
    // `clean` is a sibling of `proj`, so findUp cannot reach proj/fox-agent.toml
    expect(loadConfig({ cwd: clean }, { FOX_AGENT_API_KEY: "k" }).agents).toEqual({});
  });

  test("[lsp.*] tables configure language servers; unusable entries are skipped", async () => {
    writeFileSync(
      join(projectDir, "fox-agent.toml"),
      `[lsp.gopls]
command = "gopls"
extensions = ["go", ".mod"]
rootMarkers = ["go.mod"]

[lsp.zls]
command = "zls"
extensions = []

[lsp.nocommand]
extensions = [".ex"]
`,
    );
    const { loadConfig } = await import("../src/core/config.ts");
    const cfg = loadConfig({ cwd: projectDir }, { FOX_AGENT_API_KEY: "k" });
    // extensions are normalized so a user writing "go" gets the same result as ".go";
    // the matcher compares against extname(), which always has the dot
    expect(cfg.lsp.gopls).toEqual({
      command: "gopls",
      args: undefined,
      env: undefined,
      extensions: [".go", ".mod"],
      rootMarkers: ["go.mod"],
    });
    // An entry with no extensions can never be selected for any file. Storing it
    // would make a typo'd `extension = ".zig"` look configured while never firing.
    expect(cfg.lsp.zls).toBeUndefined();
    expect(cfg.lsp.nocommand).toBeUndefined();
  });

  test("lsp entries do not leak between loads, and diagnostics can be turned off", async () => {
    // same shared-DEFAULTS hazard as agents: `fox --acp` loads config per run
    writeFileSync(join(projectDir, "fox-agent.toml"), `diagnostics = false\n[lsp.gopls]\ncommand = "gopls"\nextensions = [".go"]\n`);
    const clean = join(dir, "clean2");
    mkdirSync(clean, { recursive: true });
    const { loadConfig } = await import("../src/core/config.ts");
    expect(loadConfig({ cwd: projectDir }, { FOX_AGENT_API_KEY: "k" }).diagnostics).toBe(false);
    const next = loadConfig({ cwd: clean }, { FOX_AGENT_API_KEY: "k" });
    expect(next.lsp).toEqual({});
    expect(next.diagnostics).toBe(true); // on by default
  });

  test("FOX_AGENT_DIAGNOSTICS turns diagnostics off without touching a config file", async () => {
    const { loadConfig } = await import("../src/core/config.ts");
    for (const v of ["0", "false", "no", "NO", " false "]) {
      expect(loadConfig({ cwd: projectDir }, { FOX_AGENT_API_KEY: "k", FOX_AGENT_DIAGNOSTICS: v }).diagnostics).toBe(false);
    }
    // anything else means on — an unset-but-present var must not silently disable it
    expect(loadConfig({ cwd: projectDir }, { FOX_AGENT_API_KEY: "k", FOX_AGENT_DIAGNOSTICS: "1" }).diagnostics).toBe(true);
  });

  test("explicit override beats everything + AGENTS.md discovery", async () => {
    writeFileSync(join(projectDir, "AGENTS.md"), "# rules\nbe terse");
    const sub = join(projectDir, "deep", "deeper");
    mkdirSync(sub, { recursive: true });
    const { loadConfig } = await import("../src/core/config.ts");
    const cfg = loadConfig({ cwd: sub, model: "override-x" }, { FOX_AGENT_MODEL: "gpt-4o" });
    expect(cfg.model).toBe("override-x");
    expect(cfg.projectInstructions).toContain("be terse");
  });

  test("every AGENTS.md / CLAUDE.md up the tree is loaded, each labeled with its path", async () => {
    writeFileSync(join(projectDir, "AGENTS.md"), "root rules");
    const sub = join(projectDir, "pkg");
    mkdirSync(sub, { recursive: true });
    writeFileSync(join(sub, "AGENTS.md"), "package rules");
    writeFileSync(join(sub, "CLAUDE.md"), "claude notes");
    const { loadConfig } = await import("../src/core/config.ts");
    const cfg = loadConfig({ cwd: sub }, { FOX_AGENT_API_KEY: "k" });
    expect(cfg.projectInstructions).toContain("root rules");
    expect(cfg.projectInstructions).toContain("package rules");
    expect(cfg.projectInstructions).toContain("claude notes");
    // provenance: the model can tell which directory each file speaks for
    expect(cfg.projectInstructions).toContain(join(projectDir, "AGENTS.md"));
    expect(cfg.projectInstructions).toContain(join(sub, "CLAUDE.md"));
    // nearest last, so the most local instructions get the final word
    expect(cfg.projectInstructions.indexOf("root rules")).toBeLessThan(cfg.projectInstructions.indexOf("package rules"));
  });

  test("invalid values are rejected safely", async () => {
    writeFileSync(join(projectDir, "fox-agent.toml"), "maxSteps = -5\n");
    const { loadConfig } = await import("../src/core/config.ts");
    const cfg = loadConfig({ cwd: projectDir }, {});
    expect(cfg.maxSteps).toBe(0); // invalid -> default (uncapped) stands
  });

  test("global config is found and outranked by the project file", async () => {
    const globalPath = join(dir, "global.toml");
    writeFileSync(globalPath, 'model = "from-global"\nretryLimit = 9\n');
    writeFileSync(join(projectDir, "fox-agent.toml"), 'model = "from-project"\n');
    const { loadConfig } = await import("../src/core/config.ts");
    const cfg = loadConfig({ cwd: projectDir, configPath: globalPath }, {});
    expect(cfg.model).toBe("from-project");
    expect(cfg.retryLimit).toBe(9); // global still supplies what the project omits
  });

  test("fox-agent.toml is discovered walking up from a nested cwd", async () => {
    writeFileSync(join(projectDir, "fox-agent.toml"), 'model = "found-upward"\n');
    const sub = join(projectDir, "a", "b", "c");
    mkdirSync(sub, { recursive: true });
    const { loadConfig } = await import("../src/core/config.ts");
    expect(loadConfig({ cwd: sub }, {}).model).toBe("found-upward");
  });
});

describe("config failures are loud", () => {
  // a swallowed parse error used to be indistinguishable from having no config,
  // so every setting silently reverted to defaults
  test("malformed fox-agent.toml throws ConfigError naming the file", async () => {
    const p = join(projectDir, "fox-agent.toml");
    writeFileSync(p, 'model = "unterminated\nmaxSteps = 3\n');
    const { loadConfig } = await import("../src/core/config.ts");
    const { ConfigError } = await import("../src/core/errors.ts");
    expect(() => loadConfig({ cwd: projectDir }, {})).toThrow(ConfigError);
    try {
      loadConfig({ cwd: projectDir }, {});
    } catch (e) {
      expect((e as Error).message).toContain(p);
      expect((e as Error).message).toMatch(/invalid TOML/);
    }
  });

  test("a malformed global config also throws", async () => {
    const globalPath = join(dir, "global.toml");
    writeFileSync(globalPath, "this is not = = toml\n");
    const { loadConfig } = await import("../src/core/config.ts");
    const { ConfigError } = await import("../src/core/errors.ts");
    expect(() => loadConfig({ cwd: projectDir, configPath: globalPath }, {})).toThrow(ConfigError);
  });

  test("a leftover .fox.json is reported, not silently ignored", async () => {
    writeFileSync(join(projectDir, ".fox.json"), JSON.stringify({ model: "kimi-k2" }));
    const { loadConfig } = await import("../src/core/config.ts");
    const { ConfigError } = await import("../src/core/errors.ts");
    expect(() => loadConfig({ cwd: projectDir }, {})).toThrow(ConfigError);
    try {
      loadConfig({ cwd: projectDir }, {});
    } catch (e) {
      expect((e as Error).message).toContain(".fox.json");
      expect((e as Error).message).toContain("fox-agent.toml");
    }
  });

  test("a fox-agent.toml beside a stale .fox.json wins with no complaint", async () => {
    writeFileSync(join(projectDir, ".fox.json"), JSON.stringify({ model: "old" }));
    writeFileSync(join(projectDir, "fox-agent.toml"), 'model = "new"\n');
    const { loadConfig } = await import("../src/core/config.ts");
    expect(loadConfig({ cwd: projectDir }, {}).model).toBe("new");
  });

  test("an explicit --config that doesn't exist is an error, not a silent default", async () => {
    // a typo'd path would otherwise look like it worked while every setting in
    // the file the user meant to pass was ignored
    const { loadConfig } = await import("../src/core/config.ts");
    const { ConfigError } = await import("../src/core/errors.ts");
    const missing = join(dir, "not-there.toml");
    expect(() => loadConfig({ cwd: projectDir, configPath: missing }, {})).toThrow(ConfigError);
    try {
      loadConfig({ cwd: projectDir, configPath: missing }, {});
    } catch (e) {
      expect((e as Error).message).toContain(missing);
    }
  });

  test("the default global config being absent stays silent", async () => {
    // only an *explicit* path is checked: not having ~/.config/fox-agent/config.toml is
    // the normal case for most users
    const { loadConfig } = await import("../src/core/config.ts");
    expect(() => loadConfig({ cwd: projectDir }, {})).not.toThrow();
  });
});
