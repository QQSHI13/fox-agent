import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { ConfigError } from "./errors.ts";
import { setConfiguredModels } from "../providers/models.ts";

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
  /**
   * Plugin modules to load, **from the global config only**.
   *
   * Every other extension point here — `[mcpServers.*]`, `[agents.*]`, `[lsp.*]`
   * — spawns a child process through `childEnv()`, which strips `*_API_KEY` and
   * `FOX_AGENT_AUTH*`. A plugin cannot be sandboxed that way: it is imported into fox-agent's
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
  /** every AGENTS.md / CLAUDE.md on the path from root to cwd, each labeled with its source path ("" if none) */
  projectInstructions: string;
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
  plugins: [],
  disabledPlugins: [],
  providers: {},
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
 */
function loadProjectInstructions(cwd: string): string {
  return findUpAll(cwd, ["AGENTS.md", "CLAUDE.md"])
    .map((p) => {
      const text = readTextFile(p);
      return text ? `From ${p} (relative paths in it resolve against ${dirname(p)}):\n${text}` : "";
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
  "providers", "disabledPlugins",
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

function applyTable(cfg: Config, t: Record<string, unknown> | null, scope: "global" | "project") {
  if (!t) return;
  // a typo'd key used to vanish silently, leaving the user on defaults with no
  // idea why — name it the way a project-file plugin entry already is
  for (const k of Object.keys(t)) {
    if (!KNOWN_KEYS.has(k)) cfg.warnings.push(`${scope} config: unknown key '${k}' — ignored (typo?)`);
  }
  if (typeof t.model === "string") cfg.model = t.model;
  if (typeof t.baseUrl === "string") {
    const u = t.baseUrl.replace(/\/$/, "");
    if (/^https?:\/\//.test(u)) cfg.baseUrl = u;
    else cfg.warnings.push(`${scope} config: baseUrl '${t.baseUrl}' is not an http(s) URL — ignored`);
  }
  if (typeof t.apiKey === "string") cfg.apiKey = t.apiKey;
  // any non-empty string: a plugin may register its own provider name, and
  // `resolveChat` reports one it cannot resolve
  if (typeof t.provider === "string" && t.provider.trim()) cfg.provider = t.provider.trim();
  if (typeof t.maxSteps === "number" && t.maxSteps >= 0) cfg.maxSteps = Math.floor(t.maxSteps);
  if (typeof t.retryLimit === "number" && t.retryLimit >= 0) cfg.retryLimit = Math.floor(t.retryLimit);
  if (typeof t.compactAt === "number" && t.compactAt > 0 && t.compactAt <= 1) cfg.compactAt = t.compactAt;
  if (typeof t.requestTimeoutMs === "number" && t.requestTimeoutMs >= 0) cfg.requestTimeoutMs = Math.floor(t.requestTimeoutMs);
  if (typeof t.diagnostics === "boolean") cfg.diagnostics = t.diagnostics;
  if (t.mcpServers && typeof t.mcpServers === "object") {
    for (const [name, v] of Object.entries(t.mcpServers as Record<string, unknown>)) {
      const s = v as { command?: string; args?: string[]; env?: Record<string, string> };
      if (typeof s?.command !== "string") continue;
      cfg.mcpServers[name] = { command: s.command, args: s.args, env: s.env };
    }
  }
  if (t.agents && typeof t.agents === "object") {
    for (const [name, v] of Object.entries(t.agents as Record<string, unknown>)) {
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
    for (const [name, v] of Object.entries(t.lsp as Record<string, unknown>)) {
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
    for (const [name, v] of Object.entries(t.providers as Record<string, unknown>)) {
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
 * Write login fields into the global config, preserving everything else.
 *
 * There is no TOML *writer* in Bun, so this is a line-level patch: top-level
 * assignments of the named keys (only those above the first `[table]` header)
 * are dropped and the new values prepended. Comments and tables survive
 * untouched. Values go through JSON.stringify, which is a valid TOML basic
 * string for anything a key/URL/model id can contain.
 */
export function saveGlobalConfig(
  fields: { provider?: string; apiKey?: string; baseUrl?: string; model?: string },
  path = globalConfigPath(),
): string {
  const KEYS = new Set(["provider", "apiKey", "baseUrl", "model"]);
  let rest = "";
  try {
    const lines = readFileSync(path, "utf8").split("\n");
    let inTables = false;
    const kept: string[] = [];
    for (const line of lines) {
      if (/^\s*\[/.test(line)) inTables = true;
      if (!inTables && new RegExp(`^\\s*(${[...KEYS].join("|")})\\s*=`).test(line)) continue;
      kept.push(line);
    }
    rest = kept.join("\n").replace(/^\n+/, "");
  } catch {
    // no existing file — start fresh
  }
  const head = [
    fields.provider !== undefined ? `provider = ${JSON.stringify(fields.provider)}` : null,
    fields.apiKey !== undefined ? `apiKey = ${JSON.stringify(fields.apiKey)}` : null,
    fields.baseUrl !== undefined ? `baseUrl = ${JSON.stringify(fields.baseUrl)}` : null,
    fields.model !== undefined ? `model = ${JSON.stringify(fields.model)}` : null,
  ].filter(Boolean);
  mkdirSync(dirname(path), { recursive: true });
  // a wrong write loses the user's key with no undo — keep one backup
  try {
    writeFileSync(`${path}.bak`, readFileSync(path, "utf8"));
  } catch {
    /* no existing file to back up */
  }
  writeFileSync(path, `${head.join("\n")}\n${rest ? `\n${rest.replace(/\n*$/, "\n")}` : ""}`);
  return path;
}

export function loadConfig(
  overrides: Partial<Config> & { configPath?: string; cwd?: string } = {},
  env: Record<string, string | undefined> = process.env,
): Config {
  const cwd = overrides.cwd ?? process.cwd();
  const globalPath = overrides.configPath ?? join(homedir(), ".config", GLOBAL_CONFIG_NAME);
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
  const merged: Config = { ...DEFAULTS, mcpServers: {}, agents: {}, lsp: {}, plugins: [], disabledPlugins: [], providers: {}, warnings: [], projectInstructions: "" };
  // An explicit --config that does not exist is a mistake worth surfacing; the
  // default global path being absent is normal and stays silent.
  if (overrides.configPath && !existsSync(overrides.configPath)) {
    throw new ConfigError(`config file not found: ${overrides.configPath}`);
  }
  applyTable(merged, readToml(globalPath), "global");
  applyTable(merged, readToml(projectPath), "project");
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
  if (!p) return { format: cfg.provider, baseUrl: cfg.baseUrl, apiKey: cfg.apiKey, headers: {} };
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
    baseUrl: p.baseUrl ?? cfg.baseUrl,
    apiKey: resolveValue(p.apiKey, env) ?? cfg.apiKey,
    headers,
    sampling: mc?.sampling,
    modelConfig: mc,
  };
}
