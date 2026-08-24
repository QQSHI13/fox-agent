import { join } from "node:path";
import { homedir } from "node:os";
import { existsSync, readFileSync } from "node:fs";
import { ConfigError } from "./errors.ts";

export interface McpServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface Config {
  model: string;
  baseUrl: string;
  apiKey: string;
  provider: "openai-compatible" | "anthropic";
  maxSteps: number;
  retryLimit: number;
  /** fraction of the model context window that triggers auto-compaction */
  compactAt: number;
  mcpServers: Record<string, McpServerConfig>;
  /** contents of AGENTS.md / CLAUDE.md found walking up from cwd ("" if none) */
  projectInstructions: string;
}

const DEFAULTS: Omit<Config, "projectInstructions"> = {
  model: "gpt-4o-mini",
  baseUrl: "https://api.openai.com/v1",
  apiKey: "",
  provider: "openai-compatible",
  maxSteps: 40,
  retryLimit: 3,
  compactAt: 0.85,
  mcpServers: {},
};

function readJsonIfExists(path: string): Record<string, unknown> | null {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Walk up from `cwd` looking for the first existing candidate filename. */
export function findUp(cwd: string, names: string[]): string | null {
  let dir = cwd;
  for (;;) {
    for (const n of names) {
      const p = join(dir, n);
      if (existsSync(p)) return p;
    }
    const parent = join(dir, "..");
    if (parent === dir) return null;
    dir = parent;
  }
}

function readTextFile(path: string, cap = 8192): string {
  try {
    return readFileSync(path, "utf8").slice(0, cap).trim();
  } catch {
    return "";
  }
}

function applyEnv(cfg: Config, env: Record<string, string | undefined>) {
  cfg.model = env.FOX_MODEL ?? cfg.model;
  cfg.baseUrl = (env.FOX_BASE_URL ?? env.OPENAI_BASE_URL ?? cfg.baseUrl).replace(/\/$/, "");
  cfg.apiKey = env.FOX_API_KEY ?? env.OPENAI_API_KEY ?? env.ANTHROPIC_API_KEY ?? cfg.apiKey;
  if (env.FOX_PROVIDER === "anthropic" || env.FOX_PROVIDER === "openai-compatible") cfg.provider = env.FOX_PROVIDER;
  else if (!env.FOX_PROVIDER && /^claude/i.test(env.FOX_MODEL ?? "")) cfg.provider = "anthropic";
  const steps = Number(env.FOX_MAX_STEPS);
  if (Number.isFinite(steps) && steps > 0) cfg.maxSteps = Math.floor(steps);
  const at = Number(env.FOX_COMPACT_AT);
  if (Number.isFinite(at) && at > 0 && at <= 1) cfg.compactAt = at;
  const retries = Number(env.FOX_RETRY_LIMIT);
  if (Number.isFinite(retries) && retries >= 0) cfg.retryLimit = Math.floor(retries);
}

function applyJson(cfg: Config, json: Record<string, unknown> | null) {
  if (!json) return;
  if (typeof json.model === "string") cfg.model = json.model;
  if (typeof json.baseUrl === "string") cfg.baseUrl = json.baseUrl.replace(/\/$/, "");
  if (typeof json.apiKey === "string") cfg.apiKey = json.apiKey;
  if (json.provider === "anthropic" || json.provider === "openai-compatible") cfg.provider = json.provider;
  if (typeof json.maxSteps === "number" && json.maxSteps > 0) cfg.maxSteps = Math.floor(json.maxSteps);
  if (typeof json.retryLimit === "number" && json.retryLimit >= 0) cfg.retryLimit = Math.floor(json.retryLimit);
  if (typeof json.compactAt === "number" && json.compactAt > 0 && json.compactAt <= 1) cfg.compactAt = json.compactAt;
  if (json.mcpServers && typeof json.mcpServers === "object") {
    for (const [name, v] of Object.entries(json.mcpServers as Record<string, unknown>)) {
      const s = v as { command?: string; args?: string[]; env?: Record<string, string> };
      if (typeof s?.command !== "string") continue;
      cfg.mcpServers[name] = { command: s.command, args: s.args, env: s.env };
    }
  }
}

export function loadConfig(
  overrides: Partial<Config> & { configPath?: string; cwd?: string } = {},
  env: Record<string, string | undefined> = process.env,
): Config {
  const cwd = overrides.cwd ?? process.cwd();
  const globalPath = overrides.configPath ?? join(homedir(), ".config", "fox", "config.json");
  const projectPath = findUp(cwd, [".fox.json"]);

  // merge order: defaults <- global <- project <- env <- explicit overrides
  const merged: Config = { ...DEFAULTS, mcpServers: {}, projectInstructions: "" };
  applyJson(merged, readJsonIfExists(globalPath));
  applyJson(merged, readJsonIfExists(projectPath!));
  applyEnv(merged, env);

  if (overrides.model) merged.model = overrides.model;
  if (overrides.baseUrl) merged.baseUrl = overrides.baseUrl.replace(/\/$/, "");
  if (overrides.apiKey) merged.apiKey = overrides.apiKey;
  if (overrides.provider) merged.provider = overrides.provider;
  if (overrides.maxSteps) merged.maxSteps = overrides.maxSteps;
  if (overrides.retryLimit !== undefined) merged.retryLimit = overrides.retryLimit;
  if (overrides.compactAt !== undefined) merged.compactAt = overrides.compactAt;

  merged.maxSteps = Math.min(200, Math.max(1, merged.maxSteps));
  merged.projectInstructions = readTextFile(findUp(cwd, ["AGENTS.md", "CLAUDE.md"]) ?? "");

  if (!merged.model) throw new ConfigError("no model configured");
  return merged;
}
