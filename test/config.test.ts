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
    expect(cfg.maxSteps).toBe(40);
    expect(cfg.mcpServers).toEqual({});
  });

  test("env overrides defaults; claude model sniffs anthropic provider", async () => {
    const { loadConfig } = await import("../src/core/config.ts");
    const cfg = loadConfig({ cwd: projectDir }, { FOX_MODEL: "claude-sonnet-4", FOX_API_KEY: "k", FOX_MAX_STEPS: "12" });
    expect(cfg.model).toBe("claude-sonnet-4");
    expect(cfg.provider).toBe("anthropic");
    expect(cfg.maxSteps).toBe(12);
  });

  test("env beats project .fox.json (npm-style precedence)", async () => {
    writeFileSync(join(projectDir, ".fox.json"), JSON.stringify({ model: "kimi-k2", maxSteps: 7, mcpServers: { fs: { command: "npx", args: ["-y", "@modelcontextprotocol/server-fs"] } } }));
    const { loadConfig } = await import("../src/core/config.ts");
    const withEnv = loadConfig({ cwd: projectDir }, { FOX_MODEL: "gpt-4o", FOX_API_KEY: "k" });
    expect(withEnv.model).toBe("gpt-4o"); // env outranks project file
    const withoutEnv = loadConfig({ cwd: projectDir }, { FOX_API_KEY: "k" });
    expect(withoutEnv.model).toBe("kimi-k2"); // project fills when env silent
    expect(withoutEnv.maxSteps).toBe(7);
    expect(withoutEnv.mcpServers.fs.command).toBe("npx");
  });

  test("explicit override beats everything + AGENTS.md discovery", async () => {
    writeFileSync(join(projectDir, "AGENTS.md"), "# rules\nbe terse");
    const sub = join(projectDir, "deep", "deeper");
    mkdirSync(sub, { recursive: true });
    const { loadConfig } = await import("../src/core/config.ts");
    const cfg = loadConfig({ cwd: sub, model: "override-x" }, { FOX_MODEL: "gpt-4o" });
    expect(cfg.model).toBe("override-x");
    expect(cfg.projectInstructions).toContain("be terse");
  });

  test("invalid values are rejected safely", async () => {
    writeFileSync(join(projectDir, ".fox.json"), JSON.stringify({ maxSteps: -5 }));
    const { loadConfig } = await import("../src/core/config.ts");
    const cfg = loadConfig({ cwd: projectDir }, {});
    expect(cfg.maxSteps).toBe(40); // invalid -> default stands
  });
});
