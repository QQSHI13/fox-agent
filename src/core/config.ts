import { join } from "node:path";
import { homedir } from "node:os";
import { existsSync, readFileSync } from "node:fs";
import { ConfigError } from "./errors.ts";

export interface McpServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

/**
 * An external ACP agent fox can delegate to (`task { agent: "<name>" }`).
 *
 * Same shape as an MCP server, different protocol and a different trust story:
 * an MCP server provides tools, an ACP agent is a peer harness that runs with
 * fox's full environment (see `src/acp/client.ts`). Only names present in this
 * table are reachable, so the model can pick among them but cannot invent one.
 */
export interface AcpAgentConfig {
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
  /** abort a provider request after this long with no streamed progress (0 = never) */
  requestTimeoutMs: number;
  mcpServers: Record<string, McpServerConfig>;
  /** external ACP agents available to the `task` tool, by name */
  agents: Record<string, AcpAgentConfig>;
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
  requestTimeoutMs: 120_000,
  mcpServers: {},
  agents: {},
};

/**
 * Parse a TOML config, or return null if the file simply isn't there.
 *
 * A *malformed* file throws instead: previously every failure was swallowed, so
 * a typo made a config indistinguishable from no config at all and settings
 * vanished silently.
 */
function readToml(path: string | null): Record<string, unknown> | null {
  if (!path || !existsSync(path)) return null;
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (e) {
    throw new ConfigError(`cannot read ${path}: ${(e as Error).message}`);
  }
  try {
    return Bun.TOML.parse(text) as Record<string, unknown>;
  } catch (e) {
    throw new ConfigError(`invalid TOML in ${path}: ${(e as Error).message}`);
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
  // 0 is meaningful here (disable the timeout), so the guard is >= 0
  const reqTimeout = Number(env.FOX_REQUEST_TIMEOUT_MS);
  if (Number.isFinite(reqTimeout) && reqTimeout >= 0) cfg.requestTimeoutMs = Math.floor(reqTimeout);
}

/**
 * Copy recognised keys off a parsed config table. Unknown keys are ignored and
 * out-of-range values leave the current setting alone, so a bad entry degrades
 * to the default rather than propagating a nonsense number into the loop.
 */
function applyTable(cfg: Config, t: Record<string, unknown> | null) {
  if (!t) return;
  if (typeof t.model === "string") cfg.model = t.model;
  if (typeof t.baseUrl === "string") cfg.baseUrl = t.baseUrl.replace(/\/$/, "");
  if (typeof t.apiKey === "string") cfg.apiKey = t.apiKey;
  if (t.provider === "anthropic" || t.provider === "openai-compatible") cfg.provider = t.provider;
  if (typeof t.maxSteps === "number" && t.maxSteps > 0) cfg.maxSteps = Math.floor(t.maxSteps);
  if (typeof t.retryLimit === "number" && t.retryLimit >= 0) cfg.retryLimit = Math.floor(t.retryLimit);
  if (typeof t.compactAt === "number" && t.compactAt > 0 && t.compactAt <= 1) cfg.compactAt = t.compactAt;
  if (typeof t.requestTimeoutMs === "number" && t.requestTimeoutMs >= 0) cfg.requestTimeoutMs = Math.floor(t.requestTimeoutMs);
  if (t.mcpServers && typeof t.mcpServers === "object") {
    for (const [name, v] of Object.entries(t.mcpServers as Record<string, unknown>)) {
      const s = v as { command?: string; args?: string[]; env?: Record<string, string> };
      if (typeof s?.command !== "string") continue;
      cfg.mcpServers[name] = { command: s.command, args: s.args, env: s.env };
    }
  }
  if (t.agents && typeof t.agents === "object") {
    for (const [name, v] of Object.entries(t.agents as Record<string, unknown>)) {
      const s = v as { command?: string; args?: string[]; env?: Record<string, string> };
      if (typeof s?.command !== "string") continue;
      // "default" is fox delegating to itself and is synthesized at call time, so
      // it is not a name a config file may rebind — silently accepting a rebind
      // would make `task` route somewhere the model has no way to know about.
      if (name === "default") continue;
      cfg.agents[name] = { command: s.command, args: s.args, env: s.env };
    }
  }
}

export const GLOBAL_CONFIG_NAME = join("fox", "config.toml");
export const PROJECT_CONFIG_NAME = "fox.toml";
/** Pre-TOML project config. Detected only so it can be reported, never parsed. */
const LEGACY_PROJECT_NAME = ".fox.json";

export function loadConfig(
  overrides: Partial<Config> & { configPath?: string; cwd?: string } = {},
  env: Record<string, string | undefined> = process.env,
): Config {
  const cwd = overrides.cwd ?? process.cwd();
  const globalPath = overrides.configPath ?? join(homedir(), ".config", GLOBAL_CONFIG_NAME);
  const projectPath = findUp(cwd, [PROJECT_CONFIG_NAME]);

  // A leftover .fox.json is refused rather than ignored: fox used to read it, so
  // silently dropping every setting in it is the one outcome the user can't see.
  if (!projectPath) {
    const legacy = findUp(cwd, [LEGACY_PROJECT_NAME]);
    if (legacy) {
      throw new ConfigError(
        `${legacy} is no longer read — fox config is TOML now. Rename it to ${PROJECT_CONFIG_NAME} and convert the keys (model = "gpt-4o", maxSteps = 40, [mcpServers.fs] tables).`,
      );
    }
  }

  // merge order: defaults <- global <- project <- env <- explicit overrides
  // `mcpServers` and `agents` are re-initialized, not spread: DEFAULTS holds one
  // shared object for each, and applyTable writes into them, so reusing the
  // reference would leak one config's servers/agents into every later load in
  // the same process (the ACP server loads config per run, so this is reachable).
  const merged: Config = { ...DEFAULTS, mcpServers: {}, agents: {}, projectInstructions: "" };
  // An explicit --config that does not exist is a mistake worth surfacing; the
  // default global path being absent is normal and stays silent.
  if (overrides.configPath && !existsSync(overrides.configPath)) {
    throw new ConfigError(`config file not found: ${overrides.configPath}`);
  }
  applyTable(merged, readToml(globalPath));
  applyTable(merged, readToml(projectPath));
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
