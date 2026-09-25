import { dirname, isAbsolute, join } from "node:path";
import { homedir } from "node:os";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { parse as parseTomlLib, stringify as stringifyToml } from "smol-toml";
import { ConfigError } from "./errors.ts";
import { setConfiguredModels } from "../providers/models.ts";
import { presetById } from "../providers/modelsdev.ts";

export interface McpServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

/**
 * An external agent fox-agent can delegate to (`task { agent: "<name>" }`).
 *
 * Two protocols, chosen by shape: `command` spawns a child process and speaks
 * ACP (see `src/acp/client.ts`); `url` reaches an already-running agent over
 * HTTP and speaks A2A (see `src/a2a/client.ts`). An ACP child runs with
 * fox-agent's full environment; an A2A target gets nothing but the prompt plus
 * whatever `headers` (e.g. a bearer token) the entry carries. Only names
 * present in this table are reachable, so the model can pick among them but
 * cannot invent one.
 */
export interface ExternalAgentConfig {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  /** A2A base URL — when set, `command` is ignored */
  url?: string;
  /** extra HTTP headers for A2A calls (Authorization etc.) */
  headers?: Record<string, string>;
}

/**
 * A language server fox-agent may consult for diagnostics after an edit.
 *
 * `extensions` is what makes an entry usable — a server with no extensions can
 * never be selected, so it is required here even though the built-in table in
 * `src/lsp/servers.ts` supplies defaults for ts/py/rs.
 */
export interface LspConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  extensions: string[];
  rootMarkers?: string[];
}

/**
 * One model entry inside a provider profile — pi-style depth in TOML form:
 *
 *   [[providers.openrouter.models]]
 *   id = "moonshotai/kimi-k2"
 *   contextWindow = 262144
 *   sampling = { temperature = 1.0 }
 *
 * Everything but `id` is optional; unset fields fall back to the models.dev
 * catalog, then the static table, then conservative defaults.
 */
export interface ModelConfig {
  id: string;
  name?: string;
  contextWindow?: number;
  maxOutput?: number;
  reasoning?: boolean;
  /** input modalities, e.g. ["text", "image", "audio", "video"] */
  input?: string[];
  /** per-Mtok USD, informational */
  costIn?: number;
  costOut?: number;
  /** merged verbatim onto the request's sampling fields (temperature, topP, …) */
  sampling?: Record<string, unknown>;
  /** extra headers for this model only, on top of the profile's */
  headers?: Record<string, string>;
  /** hidden from /model and refused as a target */
  disabled?: boolean;
}

/**
 * A named provider profile (`[providers.openrouter]`). Selecting it is
 * `provider = "openrouter"`; a `provider` value that names no profile keeps
 * its legacy meaning of an API format (`openai-compatible`, …).
 *
 * `apiKey` and `headers` values go through `resolveValue`: "$ENV"/"${ENV}"
 * interpolate from the environment, "!cmd" runs a command at request time,
 * "$$"/"$!" escape. A literal key works too, but env references keep secrets
 * out of the file.
 */
export interface ProviderProfile {
  /** wire format; default "openai-compatible" */
  format?: string;
  baseUrl?: string;
  apiKey?: string;
  headers?: Record<string, string>;
  defaultModel?: string;
  models: ModelConfig[];
}

export interface Config {
  model: string;
  baseUrl: string;
  apiKey: string;
  /**
   * `openai-compatible`, `anthropic` and `google` are built in; any other string
   * must be registered by a plugin (`FoxPlugin.providers`), and `resolveChat`
   * throws a named error if it is not. Widened from a union for that reason.
   */
  provider: string;
  /** max tool-call steps in one turn; 0 = unlimited (the default) */
  maxSteps: number;
  retryLimit: number;
  /** fraction of the model context window that triggers auto-compaction */
  compactAt: number;
  /** abort a provider request after this long with no streamed progress (0 = never) */
  requestTimeoutMs: number;
  mcpServers: Record<string, McpServerConfig>;
  /** external agents (ACP `command` or A2A `url`) available to the `task` tool, by name */
  agents: Record<string, ExternalAgentConfig>;
  /** language servers for post-edit diagnostics; overrides the built-in table by extension */
  lsp: Record<string, LspConfig>;
  /** consult language servers after edit/write at all (built-ins are PATH-detected) */
  diagnostics: boolean;
  /** cap on one tool result's text (default 30000, min 1000) */
  toolOutputCap: number;
  /** how many sessions /sessions, `fox ls` and the picker list (default 50) */
  sessionListLimit: number;
  /** TUI: collapsed tool output preview length (default 240) */
  tuiCollapsedChars: number;
  /** TUI: chars kept when a tool result is folded inline (default 4000) */
  tuiKeptChars: number;
  /** TUI rich mode: syntax-tinted code fences + diff-colored tool output (default off) */
  tuiRich: boolean;
  /** reasoning effort: "low" | "medium" | "high" — unset lets the provider default rule */
  reasoningEffort?: "low" | "medium" | "high";
  /** TUI color theme: a preset name or a plugin-registered one (default "default") */
  theme: string;
  /**
   * Render [mN] markers on messages and give the agent ctx_edit (default true).
   * Weak models echo the markers instead of acting on them — set false for
   * them; the render and store paths strip echoed markers regardless.
   */
  contextMarkers: boolean;
  /**
   * Plugin modules to load, **from the global config only**.
   *
   * Every other extension point here — `[mcpServers.*]`, `[agents.*]`, `[lsp.*]`
   * — spawns a child process through `childEnv()`, which passes the full
   * environment (no credential stripping). A plugin cannot be sandboxed that way: it is imported into fox-agent's
   * own process and gets the whole environment, the API key included. So a
   * project file naming one is skipped with a warning — "clone a repo, cd in, run
   * fox" must not be able to execute that repo's code. `default` in `[agents.*]`
   * is unbindable for a smaller version of the same reason.
   */
  plugins: string[];
  /**
   * Plugin names that must not load at all, even when listed in `plugins`.
   * Matched against the entry as written, its basename, and the basename
   * without extension — the module is never imported, so its code never runs.
   */
  disabledPlugins: string[];
  /** named provider profiles (`[providers.*]`), keyed by profile name */
  providers: Record<string, ProviderProfile>;
  /**
   * How much of a stored transcript `session/load` replays to an ACP client:
   * "full" (default), "last" (the latest exchange), or a number of trailing
   * nodes. Clients that only display the tail don't need the whole history.
   */
  acpHistory: "full" | "last" | number;
  /** every AGENTS.md / CLAUDE.md on the path from root to cwd, each labeled with its source path ("" if none) */
  projectInstructions: string;
  /**
   * Whether the cwd was trusted at load time. When false, project-scope
   * executable sections ([mcpServers.*], [agents.*], [lsp.*], [providers.*])
   * are skipped with warnings — "clone a repo, cd in, run fox" must not
   * execute that repo's commands. Safe keys (model, theme, …) still apply.
   * Undefined (hand-built configs, older callers) means trusted.
   */
  trusted?: boolean;
  /**
   * Problems found while loading config that are not fatal — a project file
   * naming a plugin, for instance. Surfaced as `warn` events at the top of a
   * turn, the way MCP connection failures already are: silence is the one
   * outcome a user cannot debug.
   */
  warnings: string[];
}

const DEFAULTS: Omit<Config, "projectInstructions"> = {
  model: "gpt-4o-mini",
  baseUrl: "https://api.openai.com/v1",
  apiKey: "",
  provider: "openai-compatible",
  maxSteps: 0, // 0 = no step cap; a turn ends when the model stops calling tools
  retryLimit: 3,
  compactAt: 0.85,
  requestTimeoutMs: 120_000,
  mcpServers: {},
  agents: {},
  lsp: {},
  diagnostics: true,
  toolOutputCap: 30_000,
  sessionListLimit: 50,
  tuiCollapsedChars: 240,
  tuiKeptChars: 4_000,
  tuiRich: false,
  theme: "default",
  contextMarkers: true,
  trusted: true,
  plugins: [],
  disabledPlugins: [],
  providers: {},
  acpHistory: "full",
  warnings: [],
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
  return parseTomlDocument(text, path);
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

/**
 * Walk up from `cwd` collecting EVERY existing candidate, root-most first.
 *
 * Instructions nest: a monorepo root AGENTS.md and a package-local one both
 * apply, and the nearest one should get the last word, so it comes last.
 */
export function findUpAll(cwd: string, names: string[]): string[] {
  const found: string[] = [];
  let dir = cwd;
  for (;;) {
    for (const n of names) {
      const p = join(dir, n);
      if (existsSync(p)) found.push(p);
    }
    const parent = join(dir, "..");
    if (parent === dir) break;
    dir = parent;
  }
  return found.reverse();
}

/**
 * Every AGENTS.md / CLAUDE.md on the path from the filesystem root to cwd,
 * each labeled with the file it came from.
 *
 * The label is load-bearing, not decoration: instructions that say "run
 * ./scripts/x" mean the file's own directory, and a bare concatenation leaves
 * the model guessing which directory that is — or even whether the file came
 * from cwd at all.
 *
 * Files with byte-identical content are included once: the common
 * AGENTS.md-symlinked-to-CLAUDE.md (or copied) pairing would otherwise inject
 * the same text twice. The first (root-most) occurrence wins, and its label is
 * the correct one for relative paths.
 */
function loadProjectInstructions(cwd: string): string {
  const seen = new Set<string>();
  return findUpAll(cwd, ["AGENTS.md", "CLAUDE.md"])
    .map((p) => {
      const text = readTextFile(p);
      if (!text || seen.has(text)) return "";
      seen.add(text);
      return `From ${p} (relative paths in it resolve against ${dirname(p)}):\n${text}`;
    })
    .filter(Boolean)
    .join("\n\n");
}

function readTextFile(path: string, cap = 8192): string {
  try {
    return readFileSync(path, "utf8").slice(0, cap).trim();
  } catch {
    return "";
  }
}

function applyEnv(cfg: Config, env: Record<string, string | undefined>) {
  cfg.model = env.FOX_AGENT_MODEL ?? cfg.model;
  const envBase = env.FOX_AGENT_BASE_URL ?? env.OPENAI_BASE_URL;
  if (envBase) {
    const u = envBase.replace(/\/$/, "");
    if (/^https?:\/\//.test(u)) cfg.baseUrl = u;
    else cfg.warnings.push(`env baseUrl '${envBase}' is not an http(s) URL — ignored`);
  }
  cfg.apiKey = env.FOX_AGENT_API_KEY ?? env.OPENAI_API_KEY ?? env.ANTHROPIC_API_KEY ?? env.GEMINI_API_KEY ?? env.GOOGLE_API_KEY ?? cfg.apiKey;
  // any string is accepted now that a plugin may register a provider name;
  // `resolveChat` is what reports an unresolvable one, with the list of what is
  // available, rather than this silently falling through to openai-compatible
  if (env.FOX_AGENT_PROVIDER) cfg.provider = env.FOX_AGENT_PROVIDER;
  else if (/^claude/i.test(env.FOX_AGENT_MODEL ?? "")) cfg.provider = "anthropic";
  else if (/^gemini/i.test(env.FOX_AGENT_MODEL ?? "")) cfg.provider = "google";
  const steps = Number(env.FOX_AGENT_MAX_STEPS);
  if (Number.isFinite(steps) && steps >= 0) cfg.maxSteps = Math.floor(steps);
  const at = Number(env.FOX_AGENT_COMPACT_AT);
  if (Number.isFinite(at) && at > 0 && at <= 1) cfg.compactAt = at;
  const retries = Number(env.FOX_AGENT_RETRY_LIMIT);
  if (Number.isFinite(retries) && retries >= 0) cfg.retryLimit = Math.floor(retries);
  // 0 is meaningful here (disable the timeout), so the guard is >= 0
  const reqTimeout = Number(env.FOX_AGENT_REQUEST_TIMEOUT_MS);
  if (Number.isFinite(reqTimeout) && reqTimeout >= 0) cfg.requestTimeoutMs = Math.floor(reqTimeout);
  // an escape hatch for a machine with a pathological language server: any of
  // 0/false/no turns post-edit diagnostics off without touching a config file
  if (env.FOX_AGENT_DIAGNOSTICS !== undefined) cfg.diagnostics = !/^(0|false|no)$/i.test(env.FOX_AGENT_DIAGNOSTICS.trim());
  if (env.FOX_AGENT_THEME?.trim()) cfg.theme = env.FOX_AGENT_THEME.trim();
  const effort = env.FOX_AGENT_REASONING_EFFORT?.trim();
  if (effort === "low" || effort === "medium" || effort === "high") cfg.reasoningEffort = effort;
  const outCap = Number(env.FOX_AGENT_TOOL_OUTPUT_CAP);
  if (Number.isFinite(outCap) && outCap >= 1000) cfg.toolOutputCap = Math.floor(outCap);
}

/**
 * Copy recognised keys off a parsed config table. Unknown keys are ignored and
 * out-of-range values leave the current setting alone, so a bad entry degrades
 * to the default rather than propagating a nonsense number into the loop.
 *
 * `scope` exists for exactly one key. `plugins` is global-only (see the field's
 * comment on `Config`), and a source-blind version of this function could not
 * tell a global file from a project one — both are applied through here.
 */
const KNOWN_KEYS = new Set([
  "model", "baseUrl", "apiKey", "provider", "maxSteps", "retryLimit", "compactAt",
  "requestTimeoutMs", "diagnostics", "mcpServers", "agents", "lsp", "plugins",
  "providers", "disabledPlugins", "toolOutputCap", "sessionListLimit",
  "tuiCollapsedChars", "tuiKeptChars", "tuiRich", "theme", "contextMarkers", "acpHistory",
  "reasoningEffort",
]);

/** Parse one `[[providers.x.models]]` entry; junk fields degrade to absent. */
function parseModelConfig(v: unknown): ModelConfig | null {
  const m = v as Record<string, unknown>;
  if (typeof m?.id !== "string" || !m.id.trim()) return null;
  const out: ModelConfig = { id: m.id.trim() };
  if (typeof m.name === "string") out.name = m.name;
  if (typeof m.contextWindow === "number" && m.contextWindow > 0) out.contextWindow = Math.floor(m.contextWindow);
  if (typeof m.maxOutput === "number" && m.maxOutput > 0) out.maxOutput = Math.floor(m.maxOutput);
  if (typeof m.reasoning === "boolean") out.reasoning = m.reasoning;
  if (Array.isArray(m.input)) out.input = m.input.filter((x): x is string => typeof x === "string");
  if (typeof m.costIn === "number") out.costIn = m.costIn;
  if (typeof m.costOut === "number") out.costOut = m.costOut;
  if (m.sampling && typeof m.sampling === "object") out.sampling = m.sampling as Record<string, unknown>;
  if (m.headers && typeof m.headers === "object") {
    out.headers = Object.fromEntries(Object.entries(m.headers as Record<string, unknown>).filter((e): e is [string, string] => typeof e[1] === "string"));
  }
  if (m.disabled === true) out.disabled = true;
  return out;
}

/** Parse one `[providers.x]` table. */
function parseProfile(v: unknown): ProviderProfile | null {
  const p = v as Record<string, unknown>;
  if (!p || typeof p !== "object") return null;
  const out: ProviderProfile = { models: [] };
  if (typeof p.format === "string" && p.format.trim()) out.format = p.format.trim();
  if (typeof p.baseUrl === "string" && /^https?:\/\//.test(p.baseUrl)) out.baseUrl = p.baseUrl.replace(/\/$/, "");
  if (typeof p.apiKey === "string") out.apiKey = p.apiKey;
  if (p.headers && typeof p.headers === "object") {
    out.headers = Object.fromEntries(Object.entries(p.headers as Record<string, unknown>).filter((e): e is [string, string] => typeof e[1] === "string"));
  }
  if (typeof p.defaultModel === "string") out.defaultModel = p.defaultModel;
  if (Array.isArray(p.models)) {
    for (const m of p.models) {
      const parsed = parseModelConfig(m);
      if (parsed) out.models.push(parsed);
    }
  }
  return out;
}

function applyTable(cfg: Config, t: Record<string, unknown> | null, scope: "global" | "project", opts: { trusted?: boolean } = {}) {
  if (!t) return;
  const untrustedProject = scope === "project" && opts.trusted === false;
  // a typo'd key used to vanish silently, leaving the user on defaults with no
  // idea why — name it the way a project-file plugin entry already is
  for (const k of Object.keys(t)) {
    if (!KNOWN_KEYS.has(k)) cfg.warnings.push(`${scope} config: unknown key '${k}' — ignored (typo?)`);
  }
  if (typeof t.model === "string") cfg.model = t.model;
  if (typeof t.baseUrl === "string") {
    // An untrusted baseUrl would redirect prompts + tool output to an
    // attacker's endpoint — same exfil class as a malicious MCP server.
    if (untrustedProject) cfg.warnings.push(`project config: baseUrl ignored in untrusted directory — trust this folder to enable`);
    else {
      const u = t.baseUrl.replace(/\/$/, "");
      if (/^https?:\/\//.test(u)) cfg.baseUrl = u;
      else cfg.warnings.push(`${scope} config: baseUrl '${t.baseUrl}' is not an http(s) URL — ignored`);
    }
  }
  if (typeof t.apiKey === "string") {
    if (untrustedProject) cfg.warnings.push(`project config: apiKey ignored in untrusted directory — trust this folder to enable`);
    else cfg.apiKey = t.apiKey;
  }
  // any non-empty string: a plugin may register its own provider name, and
  // `resolveChat` reports one it cannot resolve
  if (typeof t.provider === "string" && t.provider.trim()) cfg.provider = t.provider.trim();
  if (typeof t.maxSteps === "number" && t.maxSteps >= 0) cfg.maxSteps = Math.floor(t.maxSteps);
  if (typeof t.retryLimit === "number" && t.retryLimit >= 0) cfg.retryLimit = Math.floor(t.retryLimit);
  if (typeof t.compactAt === "number" && t.compactAt > 0 && t.compactAt <= 1) cfg.compactAt = t.compactAt;
  if (typeof t.requestTimeoutMs === "number" && t.requestTimeoutMs >= 0) cfg.requestTimeoutMs = Math.floor(t.requestTimeoutMs);
  if (typeof t.diagnostics === "boolean") cfg.diagnostics = t.diagnostics;
  if (typeof t.toolOutputCap === "number" && t.toolOutputCap >= 1000) cfg.toolOutputCap = Math.floor(t.toolOutputCap);
  if (typeof t.sessionListLimit === "number" && t.sessionListLimit >= 1) cfg.sessionListLimit = Math.floor(t.sessionListLimit);
  if (typeof t.tuiCollapsedChars === "number" && t.tuiCollapsedChars >= 40) cfg.tuiCollapsedChars = Math.floor(t.tuiCollapsedChars);
  if (typeof t.tuiKeptChars === "number" && t.tuiKeptChars >= 200) cfg.tuiKeptChars = Math.floor(t.tuiKeptChars);
  if (typeof t.tuiRich === "boolean") cfg.tuiRich = t.tuiRich;
  if (t.reasoningEffort === "low" || t.reasoningEffort === "medium" || t.reasoningEffort === "high") cfg.reasoningEffort = t.reasoningEffort;
  if (typeof t.theme === "string" && t.theme.trim()) cfg.theme = t.theme.trim();
  if (typeof t.contextMarkers === "boolean") cfg.contextMarkers = t.contextMarkers;
  if (t.acpHistory === "full" || t.acpHistory === "last") cfg.acpHistory = t.acpHistory;
  else if (typeof t.acpHistory === "number" && t.acpHistory >= 1) cfg.acpHistory = Math.floor(t.acpHistory);
  if (t.mcpServers && typeof t.mcpServers === "object") {
    if (untrustedProject) {
      const n = Object.keys(t.mcpServers as Record<string, unknown>).length;
      if (n) cfg.warnings.push(`project config: ${n} [mcpServers.*] entr${n === 1 ? "y" : "ies"} ignored in untrusted directory — trust this folder to enable`);
    } else for (const [name, v] of Object.entries(t.mcpServers as Record<string, unknown>)) {
      const s = v as { command?: string; args?: string[]; env?: Record<string, string> };
      if (typeof s?.command !== "string") continue;
      cfg.mcpServers[name] = { command: s.command, args: s.args, env: s.env };
    }
  }
  if (t.agents && typeof t.agents === "object") {
    if (untrustedProject) {
      const n = Object.keys(t.agents as Record<string, unknown>).length;
      if (n) cfg.warnings.push(`project config: ${n} [agents.*] entr${n === 1 ? "y" : "ies"} ignored in untrusted directory — trust this folder to enable`);
    } else for (const [name, v] of Object.entries(t.agents as Record<string, unknown>)) {
      const s = v as { command?: string; args?: string[]; env?: Record<string, string>; url?: string; headers?: Record<string, string> };
      // an entry is an ACP spawn (command) or an A2A endpoint (url); neither = junk
      if (typeof s?.command !== "string" && typeof s?.url !== "string") continue;
      // "default" is fox-agent delegating to itself and is synthesized at call time, so
      // it is not a name a config file may rebind — silently accepting a rebind
      // would make `task` route somewhere the model has no way to know about.
      if (name === "default") continue;
      cfg.agents[name] = { command: s.command, args: s.args, env: s.env, url: s.url, headers: s.headers };
    }
  }
  if (t.lsp && typeof t.lsp === "object") {
    if (untrustedProject) {
      const n = Object.keys(t.lsp as Record<string, unknown>).length;
      if (n) cfg.warnings.push(`project config: ${n} [lsp.*] entr${n === 1 ? "y" : "ies"} ignored in untrusted directory — trust this folder to enable`);
    } else for (const [name, v] of Object.entries(t.lsp as Record<string, unknown>)) {
      const s = v as { command?: string; args?: string[]; env?: Record<string, string>; extensions?: unknown; rootMarkers?: string[] };
      if (typeof s?.command !== "string") continue;
      // An entry with no extensions could never be selected for any file, so it
      // is skipped rather than stored — silently keeping it would make a typo'd
      // `extension = ".rs"` look configured while never firing.
      const exts = Array.isArray(s.extensions) ? s.extensions.filter((e): e is string => typeof e === "string") : [];
      if (!exts.length) continue;
      // normalized so both ".rs" and "rs" work; the matcher compares against extname()
      cfg.lsp[name] = {
        command: s.command,
        args: s.args,
        env: s.env,
        extensions: exts.map((e) => (e.startsWith(".") ? e : `.${e}`)),
        rootMarkers: s.rootMarkers,
      };
    }
  }
  if (t.providers && typeof t.providers === "object") {
    if (untrustedProject) {
      const n = Object.keys(t.providers as Record<string, unknown>).length;
      if (n) cfg.warnings.push(`project config: ${n} [providers.*] profile${n === 1 ? "" : "s"} ignored in untrusted directory — trust this folder to enable (!cmd would run as you)`);
    } else for (const [name, v] of Object.entries(t.providers as Record<string, unknown>)) {
      const p = parseProfile(v);
      // a profile that says nothing at all is a typo, not a configuration
      if (p && (p.format || p.baseUrl || p.apiKey || p.models.length || p.defaultModel)) cfg.providers[name] = p;
    }
  }
  if (Array.isArray(t.disabledPlugins)) {
    for (const p of t.disabledPlugins) if (typeof p === "string" && p.trim()) cfg.disabledPlugins.push(p.trim());
  }
  if (Array.isArray(t.plugins)) {
    const entries = t.plugins.filter((p): p is string => typeof p === "string" && p.trim().length > 0);
    if (scope === "project") {
      // Reported, not ignored. A plugin runs in fox-agent's own process with the API
      // key in its environment, so a repo cannot be allowed to name one — but a
      // user who wrote the entry and sees nothing happen has no way to find out why.
      if (entries.length) {
        cfg.warnings.push(
          `${PROJECT_CONFIG_NAME}: 'plugins' is ignored in a project config (${entries.length} skipped) — a plugin runs in fox-agent's own process with your credentials, so it must be listed in ~/.config/${GLOBAL_CONFIG_NAME}`,
        );
      }
    } else {
      for (const p of entries) cfg.plugins.push(p.trim());
    }
  }
}

export const GLOBAL_CONFIG_NAME = join("fox-agent", "config.toml");
export const PROJECT_CONFIG_NAME = "fox-agent.toml";
/** Pre-TOML project config. Detected only so it can be reported, never parsed. */
const LEGACY_PROJECT_NAME = ".fox.json";

export function globalConfigPath(): string {
  return join(homedir(), ".config", GLOBAL_CONFIG_NAME);
}

/**
 * The global config file actually in play: explicit `--config`, else
 * `FOX_AGENT_CONFIG` (tests, sandboxes), else the default. Every writer must
 * go through this — writing the default while the process read the override
 * silently edits a file the user never named (measured).
 */
export function effectiveConfigPath(override?: string): string {
  return override ?? process.env.FOX_AGENT_CONFIG ?? globalConfigPath();
}

/**
 * Add or remove one entry in the global config's top-level `disabledPlugins`.
 */
export function setPluginDisabled(
  entry: string,
  disable: boolean,
  path = effectiveConfigPath(),
): { path: string; disabled: string[] } {
  const values = editStringArray(path, "disabledPlugins", (cur) =>
    disable ? [...cur.filter((d) => d !== entry), entry] : cur.filter((d) => d !== entry),
  );
  return { path, disabled: values };
}

/**
 * Read a config file, mutate the parsed document, and write it back through
 * the TOML library — never line surgery, so written files are always
 * well-formed. Unknown keys and tables round-trip untouched. A malformed
 * file throws loudly instead of being overwritten; a missing file starts
 * empty. A wrong write loses keys with no undo, so the previous content is
 * kept beside it as `.bak`.
 */
function editConfigFile(path: string, edit: (doc: Record<string, unknown>) => void): void {
  let text: string | null = null;
  try {
    text = readFileSync(path, "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException)?.code !== "ENOENT") throw new ConfigError(`cannot read ${path}: ${(e as Error).message}`);
  }
  const doc = (text === null ? {} : parseTomlDocument(text, path)) as Record<string, unknown>;
  edit(doc);
  mkdirSync(dirname(path), { recursive: true });
  if (text !== null) {
    try {
      writeFileSync(`${path}.bak`, text);
    } catch {}
  }
  writeFileSync(path, stringifyToml(doc));
}

/** Parse TOML text, throwing ConfigError naming the file. */
function parseTomlDocument(text: string, path: string): Record<string, unknown> {
  try {
    return parseTomlLib(text) as unknown as Record<string, unknown>;
  } catch (e) {
    // the library's message carries a multi-line source excerpt; the one-liner
    // contract (see the cli test) keeps the first line, which names the fault
    const first = (e as Error).message.split("\n")[0];
    throw new ConfigError(`invalid TOML in ${path}: ${first}`);
  }
}

/** Rewrite one top-level string-array key through `update`. */
function editStringArray(path: string, key: string, update: (cur: string[]) => string[]): string[] {
  let values: string[] = [];
  editConfigFile(path, (doc) => {
    const cur = Array.isArray(doc[key]) ? (doc[key] as unknown[]).filter((x): x is string => typeof x === "string") : [];
    values = update(cur);
    doc[key] = values;
  });
  return values;
}

/** Resolve a `plugins` entry the way the loader does (tilde + config-dir-relative). */
function expandPluginEntry(raw: string, configPath: string): string {
  let out = raw;
  if (out === "~") out = homedir();
  else if (out.startsWith("~/")) out = `${homedir()}/${out.slice(2)}`;
  if (!isAbsolute(out)) out = join(dirname(configPath), out);
  return out;
}

/**
 * Install a plugin file: append its path to the global `plugins` array.
 * The file must exist — a typo'd path would otherwise surface three turns
 * later as a load warning nobody connects to the install.
 */
export function addPluginPath(entry: string, path = effectiveConfigPath()): { path: string; plugins: string[] } {
  if (!existsSync(expandPluginEntry(entry, path))) {
    throw new ConfigError(`no plugin file '${entry}' (resolved against ${dirname(path)}) — nothing installed`);
  }
  return { path, plugins: editStringArray(path, "plugins", (cur) => (cur.includes(entry) ? cur : [...cur, entry])) };
}

/** Uninstall a plugin file: drop its path from the global `plugins` array. */
export function removePluginPath(entry: string, path = effectiveConfigPath()): { path: string; plugins: string[] } {
  return { path, plugins: editStringArray(path, "plugins", (cur) => cur.filter((p) => p !== entry)) };
}

export interface ProviderProfileFields {
  format?: string;
  baseUrl?: string;
  apiKey?: string;
  defaultModel?: string;
}

/**
 * Write a `[providers.<name>]` profile table. Only the passed fields are
 * set — anything else in the table (`models`, custom keys) survives, and a
 * field passed as `undefined` is removed (so a profile stops pinning a key
 * and falls back to the environment). Refuses junk names and non-table
 * occupants rather than guessing.
 */
export function saveProviderProfile(name: string, fields: ProviderProfileFields, path = effectiveConfigPath()): string {
  if (!/^[A-Za-z0-9_-]+$/.test(name)) throw new ConfigError(`bad profile name '${name}' — letters, numbers, dash, underscore`);
  editConfigFile(path, (doc) => {
    let providers = doc.providers;
    if (providers === undefined) {
      providers = {};
      doc.providers = providers;
    }
    if (typeof providers !== "object" || providers === null || Array.isArray(providers)) {
      throw new ConfigError(`'providers' in ${path} is not a table — fix it by hand, fox-agent will not guess`);
    }
    const tables = providers as Record<string, unknown>;
    let table = tables[name];
    if (table === undefined) {
      table = {};
      tables[name] = table;
    }
    if (typeof table !== "object" || table === null || Array.isArray(table)) {
      throw new ConfigError(`'[providers.${name}]' in ${path} is not a table — fix it by hand, fox-agent will not guess`);
    }
    const t = table as Record<string, unknown>;
    for (const [k, v] of Object.entries(fields)) {
      if (v === undefined) delete t[k];
      else t[k] = v;
    }
    if (!Object.keys(t).length) delete tables[name]; // a save that stores nothing stores no table
  });
  return path;
}

/**
 * Write login fields into the global config, preserving everything else.
 *
 * Read-modify-write through the TOML library: only the passed top-level keys
 * change, and unknown keys plus all tables round-trip untouched. `""` for
 * reasoningEffort clears the key; absence of a field keeps whatever was saved
 * (so `/theme` alone never erases the provider and key). `extraSettings`
 * carries the /settings keys — same line-level rules, validated by the caller.
 */
export function saveGlobalConfig(
  fields: { provider?: string; apiKey?: string; baseUrl?: string; model?: string; theme?: string; reasoningEffort?: string } & {
    extraSettings?: Record<string, string | number | boolean>;
  },
  path = effectiveConfigPath(),
): string {
  editConfigFile(path, (doc) => {
    if (fields.provider !== undefined) doc.provider = fields.provider;
    if (fields.apiKey !== undefined) doc.apiKey = fields.apiKey;
    if (fields.baseUrl !== undefined) doc.baseUrl = fields.baseUrl;
    if (fields.model !== undefined) doc.model = fields.model;
    if (fields.theme !== undefined) doc.theme = fields.theme;
    if (fields.reasoningEffort !== undefined) {
      if (fields.reasoningEffort) doc.reasoningEffort = fields.reasoningEffort;
      else delete doc.reasoningEffort;
    }
    for (const [k, v] of Object.entries(fields.extraSettings ?? {})) {
      if (v === "") delete doc[k];
      else doc[k] = v;
    }
  });
  return path;
}

/**
 * The settings `/settings` exposes: obscure-but-real knobs that have no
 * dedicated command. `key` is the config key, `def` its default, `validate`
 * parses/coerces a raw string answer (throw to reject) and `fmt` renders the
 * current value. Numbers come back as numbers, booleans as booleans — the
 * TOML writer stores the type.
 */
export interface SettingSpec {
  key: string;
  desc: string;
  def: string;
  validate(raw: string): string | number | boolean;
  fmt(v: unknown): string;
}

const num = (lo: number, hi?: number) => (raw: string) => {
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new Error(`not a number: ${raw}`);
  const i = Math.floor(n);
  if (i < lo || (hi !== undefined && i > hi)) throw new Error(`out of range (${lo}${hi !== undefined ? `..${hi}` : "+"})`);
  return i;
};
const bool = (raw: string) => {
  const t = raw.trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(t)) return true;
  if (["false", "0", "no", "off"].includes(t)) return false;
  throw new Error(`not a boolean: ${raw} (true/false)`);
};
const showBool = (v: unknown) => (v === undefined ? "unset (default)" : v ? "true" : "false");

export const SETTINGS: SettingSpec[] = [
  {
    key: "maxSteps",
    desc: "tool-call steps per turn (0 = unlimited)",
    def: "0",
    validate: num(0),
    fmt: (v) => (v === undefined ? "0 (unlimited)" : String(v)),
  },
  {
    key: "retryLimit",
    desc: "provider retry attempts on 429/5xx",
    def: "3",
    validate: num(0, 20),
    fmt: (v) => (v === undefined ? "3" : String(v)),
  },
  {
    key: "compactAt",
    desc: "auto-compact at this fraction of the context window",
    def: "0.85",
    validate: (raw) => {
      const n = Number(raw);
      if (!Number.isFinite(n) || n <= 0 || n > 1) throw new Error("must be a fraction in (0, 1], e.g. 0.85");
      return n;
    },
    fmt: (v) => (v === undefined ? "0.85" : String(v)),
  },
  {
    key: "requestTimeoutMs",
    desc: "abort a provider request silent this long (0 = never)",
    def: "120000",
    validate: num(0),
    fmt: (v) => (v === undefined ? "120000" : String(v)),
  },
  {
    key: "toolOutputCap",
    desc: "per-tool-result text cap in chars (min 1000)",
    def: "30000",
    validate: num(1000),
    fmt: (v) => (v === undefined ? "30000" : String(v)),
  },
  {
    key: "sessionListLimit",
    desc: "how many sessions /sessions and fox ls list",
    def: "50",
    validate: num(1, 500),
    fmt: (v) => (v === undefined ? "50" : String(v)),
  },
  {
    key: "tuiCollapsedChars",
    desc: "collapsed tool output preview length (min 40)",
    def: "240",
    validate: num(40),
    fmt: (v) => (v === undefined ? "240" : String(v)),
  },
  {
    key: "tuiKeptChars",
    desc: "chars kept in a folded tool result (min 200)",
    def: "4000",
    validate: num(200),
    fmt: (v) => (v === undefined ? "4000" : String(v)),
  },
  { key: "tuiRich", desc: "rich markdown: syntax-tinted fences + diff colors", def: "false", validate: bool, fmt: showBool },
  { key: "diagnostics", desc: "post-edit language-server diagnostics", def: "true", validate: bool, fmt: showBool },
  {
    key: "contextMarkers",
    desc: "[mN] markers + ctx tool (weak models: set false)",
    def: "true",
    validate: bool,
    fmt: showBool,
  },
  {
    key: "acpHistory",
    desc: 'session/load replay scope: full | last | N nodes',
    def: "full",
    validate: (raw) => {
      const t = raw.trim().toLowerCase();
      if (t === "full" || t === "last") return t;
      const n = Number(t);
      if (Number.isInteger(n) && n >= 1) return Math.floor(n);
      throw new Error("full | last | a positive integer");
    },
    fmt: (v) => (v === undefined ? "full" : String(v)),
  },
];

/** Read a setting's current value from the loaded config, rendered for display. */
export function settingValue(spec: SettingSpec, cfg?: Config): string {
  if (!cfg) return spec.def;
  const v = (cfg as unknown as Record<string, unknown>)[spec.key];
  return v === undefined ? spec.fmt(undefined) : spec.fmt(v);
}

export function loadConfig(
  overrides: Partial<Config> & { configPath?: string; cwd?: string; trusted?: boolean } = {},
  env: Record<string, string | undefined> = process.env,
): Config {
  const cwd = overrides.cwd ?? process.cwd();
  const trusted = overrides.trusted ?? true;
  // FOX_AGENT_CONFIG overrides the global path — tests and sandboxed runs must
  // never read the real ~/.config/fox-agent/config.toml.
  const globalPath = overrides.configPath ?? process.env.FOX_AGENT_CONFIG ?? join(homedir(), ".config", GLOBAL_CONFIG_NAME);
  const projectPath = findUp(cwd, [PROJECT_CONFIG_NAME]);

  // A leftover .fox.json is refused rather than ignored: fox-agent used to read it, so
  // silently dropping every setting in it is the one outcome the user can't see.
  if (!projectPath) {
    const legacy = findUp(cwd, [LEGACY_PROJECT_NAME]);
    if (legacy) {
      throw new ConfigError(
        `${legacy} is no longer read — fox-agent config is TOML now. Rename it to ${PROJECT_CONFIG_NAME} and convert the keys (model = "gpt-4o", maxSteps = 40, [mcpServers.fs] tables).`,
      );
    }
  }

  // merge order: defaults <- global <- project <- env <- explicit overrides
  // `mcpServers`, `agents`, `lsp`, `plugins` and `warnings` are re-initialized,
  // not spread: DEFAULTS holds one shared object for each, and applyTable writes
  // into them, so reusing the reference would leak one config's entries into
  // every later load in the same process (the ACP server loads config per run,
  // so this is reachable).
  const merged: Config = { ...DEFAULTS, mcpServers: {}, agents: {}, lsp: {}, plugins: [], disabledPlugins: [], providers: {}, warnings: [], projectInstructions: "", trusted };
  // An explicit --config that does not exist is a mistake worth surfacing; the
  // default global path being absent is normal and stays silent.
  if (overrides.configPath && !existsSync(overrides.configPath)) {
    throw new ConfigError(`config file not found: ${overrides.configPath}`);
  }
  applyTable(merged, readToml(globalPath), "global", { trusted });
  applyTable(merged, readToml(projectPath), "project", { trusted });
  applyEnv(merged, env);

  if (overrides.model) merged.model = overrides.model;
  if (overrides.baseUrl) merged.baseUrl = overrides.baseUrl.replace(/\/$/, "");
  if (overrides.apiKey) merged.apiKey = overrides.apiKey;
  if (overrides.provider) merged.provider = overrides.provider;
  if (overrides.maxSteps !== undefined) merged.maxSteps = overrides.maxSteps;
  if (overrides.retryLimit !== undefined) merged.retryLimit = overrides.retryLimit;
  if (overrides.compactAt !== undefined) merged.compactAt = overrides.compactAt;
  if (overrides.requestTimeoutMs !== undefined) merged.requestTimeoutMs = overrides.requestTimeoutMs;

  merged.maxSteps = Math.max(0, Math.floor(merged.maxSteps));
  merged.projectInstructions = loadProjectInstructions(cwd);

  // config model entries feed the context-window/modality lookup — registered
  // here so every later lookupModel call sees them without threading cfg around
  setConfiguredModels(Object.values(merged.providers).flatMap((p) => p.models));

  if (!merged.model) throw new ConfigError("no model configured");
  return merged;
}

/**
 * Config value resolution, pi-style: "!cmd" runs the command and takes stdout
 * (cached per process — a slow vault lookup must not tax every request),
 * "$VAR"/"${VAR}" interpolate from the environment, "$$"/"$!" escape.
 * Returns undefined when a reference cannot be resolved.
 */
const cmdCache = new Map<string, string>();
export function resolveValue(v: string | undefined, env: Record<string, string | undefined> = process.env): string | undefined {
  if (v === undefined) return undefined;
  if (v.startsWith("!")) {
    const cmd = v.slice(1);
    const hit = cmdCache.get(cmd);
    if (hit !== undefined) return hit;
    try {
      const out = execSync(cmd, { encoding: "utf8", timeout: 10_000, stdio: ["ignore", "pipe", "ignore"] }).trim();
      cmdCache.set(cmd, out);
      return out;
    } catch {
      return undefined;
    }
  }
  const out = v.replace(/\$\$|\$!|\$\{([A-Za-z_][A-Za-z0-9_]*)\}|\$([A-Za-z_][A-Za-z0-9_]*)/g, (m, braced, bare) => {
    if (m === "$$" || m === "$!") return m[1];
    return env[braced ?? bare] ?? "";
  });
  return out;
}

/** What a resolved profile looks like to the provider layer. */
export interface ResolvedProfile {
  /** the API format: openai-compatible / openai-responses / anthropic / google / plugin name */
  format: string;
  /** what the user calls it — the profile name or preset id, for display */
  label?: string;
  baseUrl: string;
  apiKey: string;
  headers: Record<string, string>;
  /** sampling fields from the active model's config entry, if any */
  sampling?: Record<string, unknown>;
  /** the active model's config entry, when the profile lists it */
  modelConfig?: ModelConfig;
}

/**
 * Resolve the active provider. `cfg.provider` naming a `[providers.*]` table
 * selects that profile; anything else keeps its legacy meaning of an API
 * format, with the flat top-level keys as the profile. Profile fields fall
 * back to the flat keys, so `[providers.x]` with only a baseUrl still uses
 * the top-level apiKey.
 */
export function resolveProfile(cfg: Config, env: Record<string, string | undefined> = process.env): ResolvedProfile {
  const p = cfg.providers[cfg.provider];
  if (!p) {
    // /model saves a catalog preset id (opencode, deepseek, …) as `provider` —
    // it has no [providers.*] table, so expand it here or the name would leak
    // to resolveChat as if it were an API format ("unknown provider 'opencode'").
    const preset = presetById(cfg.provider);
    if (preset) {
      const envKey = preset.env.map((n) => env[n]).find((v) => !!v);
      return {
        format: preset.format,
        label: preset.id,
        baseUrl: preset.api ?? cfg.baseUrl,
        apiKey: envKey || cfg.apiKey,
        headers: {},
      };
    }
    // a provider name that is neither a profile nor a preset is a plugin's
    // registered format — it IS the identity, so label it as itself
    const bare = cfg.provider !== DEFAULTS.provider ? cfg.provider : undefined;
    return { format: cfg.provider, label: bare, baseUrl: cfg.baseUrl, apiKey: cfg.apiKey, headers: {} };
  }
  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(p.headers ?? {})) {
    const r = resolveValue(v, env);
    if (r !== undefined) headers[k] = r;
  }
  const mc = p.models.find((m) => m.id === cfg.model && !m.disabled);
  if (mc?.headers) {
    for (const [k, v] of Object.entries(mc.headers)) {
      const r = resolveValue(v, env);
      if (r !== undefined) headers[k] = r;
    }
  }
  return {
    format: p.format ?? "openai-compatible",
    label: cfg.provider,
    baseUrl: p.baseUrl ?? cfg.baseUrl,
    apiKey: resolveValue(p.apiKey, env) ?? cfg.apiKey,
    headers,
    sampling: mc?.sampling,
    modelConfig: mc,
  };
}
