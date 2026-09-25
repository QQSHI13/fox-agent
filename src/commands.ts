import {
  allOps,
  backfillUsage,
  backfillPreview,
  createSession,
  deleteSession,
  forkSession,
  getMessage,
  getSession,
  latestSessionFor,
  listSessions,
  setSessionModel,
  undoLastOp,
} from "./store/db.ts";
import { projectView } from "./context/view.ts";
import { formatPruneReport, pruneSession } from "./store/prune.ts";
import { viewTokenEstimate } from "./context/render.ts";
import { checkBudget } from "./context/budget.ts";
import type { ProviderConfig } from "./providers/types.ts";
import { renderTodos, getTodos } from "./tools/todo.ts";
import { resolveProfile, resolveValue, saveGlobalConfig, saveProviderProfile, type Config } from "./core/config.ts";
import { setTheme, themeName, themeNames } from "./tui/themes.ts";
import { availableProviders } from "./providers/index.ts";
import { ensureFreshCatalog, presetById, providerPresets } from "./providers/modelsdev.ts";
import { endpointModels, ensureEndpointModels } from "./providers/endpointmodels.ts";
import { setActiveEndpoint } from "./providers/models.ts";
import type { UiStep } from "./core/ui.ts";
import { activePlugins, isPluginPathDisabled, loadPlugins } from "./plugins/load.ts";
import { bundledDisabled, bundledPlugins } from "./plugins/bundled.ts";
import { BUNDLED_PROVIDER_PLUGIN_NAMES, bundledProviderPlugins } from "./providers/bundled.ts";
import { addPluginPath, effectiveConfigPath, globalConfigPath, removePluginPath, setPluginDisabled, SETTINGS, settingValue } from "./core/config.ts";
import { dirname } from "node:path";

/**
 * Apply a just-changed setting to the live process — the same hooks /reload
 * uses. Dynamic import: commands.ts ← app.ts is already a cycle (app imports
 * runSlashCommand), and a static tui import here would widen it; the tui
 * module is only needed in interactive hosts where it is loaded anyway.
 */
function applyResultLive(state: HarnessState, key: string): void {
  void (async () => {
    try {
      const app = await import("./tui/app.ts");
      if (key === "tuiCollapsedChars" || key === "tuiKeptChars") {
        app.setTuiCaps(state.config?.tuiCollapsedChars ?? 240, state.config?.tuiKeptChars ?? 4_000);
      } else if (key === "tuiRich") {
        app.setTuiRich(!!state.config?.tuiRich);
      }
    } catch {}
  })();
}
import type { FoxPlugin } from "./plugins/types.ts";
import type { PluginCommand } from "./plugins/types.ts";

/**
 * Plugin slash commands across the active plugins. Built-ins win on
 * collision (warned at registry build), so this only feeds matching, help
 * and the fallback branch — never the built-in switch.
 */
function pluginCommands(): PluginCommand[] {
  return activePlugins().flatMap((p) => p.commands ?? []);
}

export interface HarnessState {
  sessionId: string;
  cwd: string;
  provider: ProviderConfig;
  config?: Config;
  /** where /login writes — the --config override when given, else the global default */
  configPath?: string;
  /**
   * True only for a front end that can take over the keyboard — today just the
   * TUI. Commands that would rather show a picker check this and fall back to
   * printing, because the same `runSlashCommand` runs in plain mode and under
   * `-p`, neither of which can block on a keypress (see `/prune`).
   */
  interactive?: boolean;
  /**
   * TUI fresh launch: no session row exists yet — one is created when the user
   * actually submits a message, so opening and closing the TUI never leaves an
   * empty session behind. `sessionId` is "" until then.
   */
  pendingSession?: boolean;
  /**
   * This process opened a session another live process (TUI, ACP, A2A) already
   * holds — see src/store/lock.ts. The viewer may draft and run read-only
   * commands, but nothing may be sent and nothing may mutate the session.
   */
  readOnly?: boolean;
}

/**
 * What a read-only viewer may run. Everything else either sends to the agent
 * or writes to the session/config, both owned by the process holding the lock.
 * /new and /fork are allowed: both target a NEW session (which this process
 * then owns via switchSession -> attachLock); they never write the locked one.
 */
export const READONLY_COMMANDS = new Set(["/help", "/?", "/todo", "/todos", "/sessions", "/usage", "/exit", "/quit", "/new", "/fork"]);

/** A front end that set `interactive` is asked to open one of these. */
export type PickerRequest = { kind: "sessions"; cwd?: string };

/** One question in a prompt wizard — the shared protocol from core/ui.ts. */
export type PromptStep = UiStep;

/**
 * A multi-step question flow the interactive host runs on a command's behalf.
 *
 * The command layer stays UI-agnostic: it describes the steps and supplies
 * `run`, the TUI collects the answers (text in the input dock, selects as an
 * option list) and calls `run(answers, state)` at the end. Hosts that cannot
 * take over the keyboard never see one — commands only return a prompt when
 * `state.interactive` is set, and keep their printed/argument forms otherwise.
 */
export interface PromptRequest {
  title: string;
  steps: PromptStep[];
  run: (answers: Record<string, string>, state: HarnessState) => CommandResult;
}

export interface CommandResult {
  handled: true;
  output?: string;
  newSessionId?: string;
  exit?: boolean;
  /** open an interactive chooser instead of printing (interactive hosts only) */
  picker?: PickerRequest;
  /** ask the user a series of questions, then `run` with the answers */
  prompt?: PromptRequest;
  /**
   * Async work the host runs in the background; its returned lines are shown
   * when it settles. For commands that fetch/download (`/upgrade`) — the
   * command layer itself stays synchronous.
   */
  task?: () => Promise<string>;
  /** the host should show its welcome block (a fresh session via /new) */
  welcome?: boolean;
  /** the host should re-read config files and re-apply them (/reload) */
  reload?: boolean;
  /** transient output (like /help): the TUI drops it on the next keypress/click */
  ephemeral?: boolean;
}

/**
 * One command, described once.
 *
 * This used to be two lists — a `{name, desc}` array for the hint popup and a
 * hand-written `SLASH_HELP` template restating all of it — plus a third copy
 * inlined in the TUI's `/help` branch and a fourth rendering of the session list
 * in `cli.ts`. Four places to edit for one new command, and nothing failed when
 * they drifted. `desc` feeds the popup, `usage` + `help` feed `/help`, and
 * `arg` is what tells the completer to leave the cursor after the name instead
 * of running the command immediately.
 */
export interface CommandSpec {
  name: string;
  aliases?: string[];
  /** short, one line — the hint popup has a single row per command */
  desc: string;
  /** argument syntax, if any; shown in /help and as the argument hint */
  usage?: string;
  /** longer /help line; falls back to `desc` */
  help?: string;
  /** takes an argument, so completing it should not fire the command */
  arg?: boolean;
}

export const COMMANDS: CommandSpec[] = [
  { name: "/help", aliases: ["/?"], desc: "show commands" },
  { name: "/new", desc: "start a fresh session" },
  {
    name: "/sessions",
    aliases: ["/ls"],
    desc: "browse sessions — switch, fork or delete",
    usage: "[id|n]",
    arg: true,
    help: "interactive session browser (plain list outside the TUI); with an id or list index, switch to it",
  },
  { name: "/fork", desc: "fork this session at [mN], or another by id", usage: "[mN|id]", arg: true },
  {
    name: "/delete",
    desc: "delete another session for good (needs 'yes')",
    usage: "<id|n> yes",
    arg: true,
    help: "delete that session's database for good — not the current one, and /undo cannot reach it",
  },
  { name: "/undo", desc: "revert last ctx_edit op (append-only)" },
  {
    name: "/prune",
    desc: "reclaim disk from hidden context (needs 'yes')",
    usage: "[yes]",
    arg: true,
    help: 'report reclaimable disk; "/prune yes" deletes hidden context + VACUUM',
  },
  { name: "/ops", desc: "show context surgery ops" },
  { name: "/view", desc: "preview visible nodes ([mN] role preview)" },
  { name: "/todo", aliases: ["/todos"], desc: "show agent todo list" },
  { name: "/usage", desc: "token totals + budget" },
  { name: "/model", desc: "show or switch model — picker lists every configured profile and catalog model", usage: "[profile/][name]", arg: true },
  { name: "/theme", desc: "show or switch the color theme", usage: "[name]", arg: true, help: "bare: searchable chooser in the TUI; with a name, switches and saves to the global config" },
  { name: "/thinking", desc: "reasoning effort for reasoning models", usage: "[low|medium|high|default]", arg: true, help: "bare: chooser in the TUI; sets provider reasoning options (OpenAI reasoningEffort, Anthropic thinking budget, Google thinkingConfig) and saves to the global config" },
  { name: "/reload", desc: "re-read config files and re-apply model, theme, caps and plugins" },
  {
    name: "/plugin",
    aliases: ["/plugins"],
    desc: "manage plugins: list, inspect, install, switch on/off",
    usage: "[on|off|add|rm|info <name>]",
    arg: true,
    help: "bare: interactive wizard in the TUI, printed list elsewhere; on/off flips it live, add/rm installs/uninstalls a file, info details one",
  },
  {
    name: "/settings",
    desc: "show or change config settings (caps, limits, markers…)",
    usage: "[key[=value]]",
    arg: true,
    help: "bare: all settings with current values; key: show one; key=value: set (empty value resets to default). Saved to the global config, applied live.",
  },
  {
    name: "/upgrade",
    desc: "upgrade fox-agent to the latest release",
    usage: "[beta|<version>]",
    arg: true,
    help: "bare: latest stable; 'beta': newest release incl. betas; a version installs that tag. TUI offers a chooser",
  },
  {
    name: "/login",
    desc: "set provider credentials, live and in the global config",
    usage: "[provider=<p>] [key=<k>] [baseUrl=<u>] [model=<m>]",
    arg: true,
    help: "bare: interactive setup wizard in the TUI, status print elsewhere; with key=value pairs, saves to the global config and activates immediately",
  },
  { name: "/exit", aliases: ["/quit"], desc: "quit fox-agent" },
];

const byWord = new Map<string, CommandSpec>();
for (const c of COMMANDS) for (const n of [c.name, ...(c.aliases ?? [])]) byWord.set(n, c);

/** Exact lookup by name or alias, `/`-prefixed. */
export function findCommand(word: string): CommandSpec | undefined {
  return byWord.get(word);
}

/**
 * Commands matching what has been typed so far, best first.
 *
 * The one matcher for every consumer — the hint popup, tab-completion, the
 * up/down selection and submit's "run the highlighted match" path each used to
 * re-derive this with their own `COMMANDS.filter(c => c.name.startsWith(d))`,
 * so improving completion meant finding all four and they could disagree about
 * which entry index 2 was.
 *
 * Ranking, in order: exact hit, prefix on the canonical name, prefix on an
 * alias, then subsequence — so `/sesh` still finds `/sessions` and `/dl` finds
 * `/delete`, which plain prefix matching cannot. Everything is compared against
 * the first word only, so hints survive typing an argument.
 */
export function matchCommands(input: string): CommandSpec[] {
  const word = input.trim().split(/\s+/)[0] ?? "";
  if (!word.startsWith("/")) return [];
  const q = word.toLowerCase();
  const exact = byWord.get(q);
  if (exact) return [exact];

  const scored: { c: CommandSpec; rank: number }[] = [];
  for (const c of COMMANDS) {
    const names = [c.name, ...(c.aliases ?? [])];
    let rank = -1;
    if (c.name.startsWith(q)) rank = 0;
    else if (names.some((n) => n.startsWith(q))) rank = 1;
    else if (names.some((n) => isSubsequence(q.slice(1), n.slice(1)))) rank = 2;
    if (rank >= 0) scored.push({ c, rank });
  }
  const out = scored.sort((a, b) => a.rank - b.rank || a.c.name.length - b.c.name.length).map((s) => s.c);
  // Plugin commands complete like built-ins (arg:true: complete the name, don't
  // fire), ranked after them — a built-in always wins the name.
  const have = new Set(out.map((c) => c.name));
  for (const pc of pluginCommands()) {
    if (have.has(pc.name)) continue;
    const view: CommandSpec = { name: pc.name, desc: pc.description, usage: pc.usage, help: pc.help, arg: true };
    if (pc.name.startsWith(q)) out.push(view);
    else if (isSubsequence(q.slice(1), pc.name.slice(1))) out.push(view);
  }
  return out;
}

/** Are all of `q`'s characters present in `s`, in order? (fuzzy match) */
function isSubsequence(q: string, s: string): boolean {
  if (!q) return true;
  let i = 0;
  for (const ch of s) if (ch === q[i] && ++i === q.length) return true;
  return false;
}

/**
 * Tab-completion for line-based hosts (mini): slash-command words only, so a
 * completer can offer them without understanding arguments. A trailing space
 * after commands that take one, so the next keystroke starts the argument
 * rather than extending the name — the same rule submit() applies on enter.
 */
export function completeSlashCommand(line: string): string[] {
  if (!line.startsWith("/") || /\s/.test(line)) return [];
  return matchCommands(line).map((c) => c.name + (c.usage ? " " : ""));
}

/** The `/help` text, generated from COMMANDS so it cannot drift from them. */
export function helpText(): string {
  const left = COMMANDS.map((c) => `${c.name}${c.usage ? ` ${c.usage}` : ""}`);
  const w = Math.max(...left.map((s) => s.length));
  const lines = COMMANDS.map((c, i) => `${left[i].padEnd(w)}  ${c.help ?? c.desc}`);
  // Plugin commands get their own section rather than merging into the roster,
  // so their provenance stays visible. Absent with no plugins, so the bare
  // output is byte-identical to before.
  const pcs = pluginCommands();
  if (pcs.length) {
    lines.push("", "plugin commands:");
    for (const pc of pcs) lines.push(`${`${pc.name}${pc.usage ? ` ${pc.usage}` : ""}`.padEnd(w)}  ${pc.help ?? pc.description}`);
  }
  return lines.join("\n");
}

// ---- session listing (shared by /sessions, `fox ls` and the picker) ----

export interface SessionListItem {
  /** 1-based position in this list — what `/sessions 2` and `/delete 2` mean */
  index: number;
  id: string;
  /** what to show in the last column: the title, or the cwd when untitled */
  label: string;
  /**
   * The real title, or null when the session has never had a user message.
   * Kept apart from `label` so a caller that wants to *quote* a title (the
   * picker's delete confirm) does not end up quoting a directory instead.
   */
  title: string | null;
  cwd: string;
  model: string;
  tokens: number;
  /** last user/assistant message snippet; null only before backfill */
  preview: string;
  updatedAt: number;
  current: boolean;
}

/**
 * The session list, most recently worked in first, as data.
 *
 * Token totals come from the index row itself (maintained by `recordUsage`), so
 * listing no longer opens every session's database. Rows written before the
 * index carried totals are backfilled lazily — one file open per legacy session,
 * once, then never again.
 */
export function sessionList(opts: { currentId?: string; cwd?: string; limit?: number } = {}): SessionListItem[] {
  return listSessions(opts.limit ?? 50, opts.cwd).map((s, i) => {
    const u =
      s.prompt_tokens === null || s.completion_tokens === null
        ? backfillUsage(s.id)
        : { prompt: s.prompt_tokens, completion: s.completion_tokens };
    return {
      index: i + 1,
      id: s.id,
      label: s.title ?? s.cwd,
      title: s.title,
      cwd: s.cwd,
      model: s.model,
      tokens: u.prompt + u.completion,
      preview: s.preview ?? backfillPreview(s.id),
      updatedAt: s.updated_at,
      current: s.id === opts.currentId,
    };
  });
}

/** "3m", "2h", "5d" — compact enough for a list column. */
export function relTime(ts: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86_400)}d`;
}

/**
 * ANSI styling for headless command output. Opt-in per call, never ambient:
 * the TUI paints its own styles (escape codes would land on its grid as
 * garbage), and piped output must stay clean — so only the CLI passes
 * `color: true`, and only when stdout is a TTY without NO_COLOR.
 */
export function cliColor(): boolean {
  return !!process.stdout.isTTY && !process.env.NO_COLOR;
}
export interface Sty {
  b: (s: string) => string;
  green: (s: string) => string;
  red: (s: string) => string;
  yellow: (s: string) => string;
  cyan: (s: string) => string;
  dim: (s: string) => string;
}
export function sty(color?: boolean): Sty {
  const p = (code: string) => (s: string) => (color ? `\x1b[${code}m${s}\x1b[0m` : s);
  return { b: p("1"), green: p("32"), red: p("31"), yellow: p("33"), cyan: p("36"), dim: p("2") };
}

/** The printed list, for `/sessions` outside the TUI and for `fox ls`. */
export function formatSessionList(items: SessionListItem[], opts: { color?: boolean } = {}): string {
  if (!items.length) return "(no sessions)";
  const st = sty(opts.color);
  return items
    .map((it) => {
      const marker = it.current ? st.green(`*${String(it.index).padStart(2)}`) : ` ${String(it.index).padStart(2)}`;
      const prev = it.preview ? st.dim(`  » ${it.preview.slice(0, 60)}`) : "";
      return `${marker}  ${st.cyan(it.id)}  ${st.dim(`${relTime(it.updatedAt).padStart(3)} ago`)}  ${st.dim(
        `${String(it.tokens).padStart(7)} tok`,
      )}  ${st.yellow(it.model.padEnd(20))} ${it.label}${prev}`;
    })
    .join("\n");
}

/**
 * Accept a session id, a 1-based index into `/sessions`, or a SEARCH TERM, returning
 * null if none resolves. Shared so `/sessions <x>`, `/delete <x>` and `fox -c <x>`
 * cannot disagree about what "2" means — a mismatch there would delete or resume
 * a different session than the one the list showed. `limit` must be the same
 * sessionListLimit the listing used: indices past a shorter page would resolve
 * to sessions the user was never shown. Both resolve against the same
 * recency-ordered list the picker shows.
 *
 * Search terms (anything not numeric, not an exact id) match the SAME text the
 * picker's type-to-filter searches — id, title, cwd, model, preview —
 * case-insensitive substring. `fox -c gesp` finds the session titled "GESP
 * prep". A unique match resolves; several matches return null WITHOUT saying
 * which (the caller's `no session` error would mislead), so the caller can
 * print the candidates — use resolveSessionArgMatches for that.
 */
export function sessionSearchText(s: { id: string; title?: string | null; cwd: string; model: string; preview?: string | null }): string {
  return `${s.id} ${s.title ?? ""} ${s.cwd} ${s.model} ${s.preview ?? ""}`.toLowerCase();
}

export function resolveSessionArgMatches(arg: string, limit = 50): SessionListItem[] {
  const q = arg.toLowerCase();
  return sessionList({ limit })
    .filter((s) => sessionSearchText(s).includes(q))
    .slice(0, 8);
}

export function resolveSessionArg(arg: string, limit = 50): string | null {
  const n = Number(arg);
  if (Number.isInteger(n) && n >= 1) return listSessions(limit)[n - 1]?.id ?? null;
  if (getSession(arg)) return arg;
  // not an id, not an index: treat as a search term
  const hits = resolveSessionArgMatches(arg, limit);
  return hits.length === 1 ? hits[0].id : null;
}

interface LoginFields {
  provider?: string;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
}

// ---- /model: switching across providers, not just model ids ----

/** Where a `/model` target lives: the current provider, a configured profile, or a catalog preset. */
interface ModelTarget {
  model: string;
  /** configured profile or catalog preset id when the switch crosses providers */
  profileName?: string;
  format?: string;
  baseUrl?: string;
  /** resolved from the profile's apiKey or the preset's env vars; undefined = fall back at apply time */
  apiKey?: string;
  headers?: Record<string, string>;
  sampling?: Record<string, unknown>;
  error?: string;
}

/** Profile + model headers, resolved through resolveValue ($ENV / !cmd). */
function profileHeaders(p: { headers?: Record<string, string> }, mc?: { headers?: Record<string, string> }): Record<string, string> | undefined {
  const out: Record<string, string> = {};
  for (const src of [p.headers, mc?.headers]) {
    for (const [k, v] of Object.entries(src ?? {})) {
      const r = resolveValue(v);
      if (r !== undefined) out[k] = r;
    }
  }
  return Object.keys(out).length ? out : undefined;
}

/**
 * Human name for the active provider. `/login` saves a catalog preset id
 * ("openrouter"), which is what `label` carries — shown raw it reads as an
 * id, so map it to the catalog display name ("OpenRouter"). A `[providers.*]`
 * profile name is user-chosen and shown as-is; with neither, the wire format
 * is the only honest identity.
 */
export function providerDisplayName(state: HarnessState): string {
  const label = state.provider.label;
  if (label) return presetById(label)?.name ?? label;
  return state.provider.provider ?? "openai-compatible";
}

/**
 * Parse a `/model` argument. `profile/model` splits only when the head names a
 * configured profile or catalog preset — model ids legitimately contain "/"
 * (openrouter's `anthropic/claude-sonnet-4`), so a bare id is never split.
 */
function parseModelArg(arg: string, state: HarnessState): ModelTarget {
  const slash = arg.indexOf("/");
  if (slash > 0) {
    const head = arg.slice(0, slash);
    const rest = arg.slice(slash + 1);
    const prof = state.config?.providers[head];
    if (prof && rest) {
      const mc = prof.models.find((m) => m.id === rest);
      if (mc?.disabled) return { model: rest, error: `model '${rest}' is disabled in profile '${head}'` };
      return {
        profileName: head,
        format: prof.format ?? "openai-compatible",
        baseUrl: prof.baseUrl,
        apiKey: resolveValue(prof.apiKey),
        model: rest,
        headers: profileHeaders(prof, mc),
        sampling: mc?.sampling,
      };
    }
    const preset = presetById(head);
    if (preset && rest) {
      let key: string | undefined;
      for (const n of preset.env) {
        const v = process.env[n];
        if (v) key = v;
      }
      return { profileName: preset.id, format: preset.format, baseUrl: preset.api, apiKey: key, model: rest };
    }
  }
  const cur = state.config?.providers[state.config.provider];
  const mc = cur?.models.find((m) => m.id === arg);
  if (mc?.disabled) return { model: arg, error: `model '${arg}' is disabled in profile '${state.config?.provider}'` };
  return { model: arg, sampling: mc?.sampling, headers: cur ? profileHeaders(cur, mc) : undefined };
}

/**
 * Apply a model switch: live provider state, the session record, and the
 * global config — so neither reopening the session nor starting a new one
 * snaps back to the old model.
 */
function applyModelSwitch(t: ModelTarget, state: HarnessState, keyOverride?: string): CommandResult {
  if (t.error) return { handled: true, output: t.error };
  const format = t.format ?? state.provider.provider ?? "openai-compatible";
  const baseUrl = t.baseUrl ?? state.provider.baseUrl;
  const sameEndpoint = baseUrl === state.provider.baseUrl && format === state.provider.provider;
  const apiKey = keyOverride ?? t.apiKey ?? (sameEndpoint ? state.provider.apiKey : "");
  state.provider = {
    ...state.provider,
    provider: format,
    // display identity: the profile/preset the switch named, else none — a
    // same-endpoint model bump is not a provider change
    label: t.profileName ?? (sameEndpoint ? state.provider.label : undefined),
    baseUrl,
    model: t.model,
    apiKey,
    headers: t.headers ?? (sameEndpoint ? state.provider.headers : undefined),
    sampling: t.sampling,
  };
  setActiveEndpoint(baseUrl);
  setSessionModel(state.sessionId, t.model);
  if (state.config) {
    state.config.provider = t.profileName ?? format;
    state.config.model = t.model;
    if (!t.profileName) state.config.baseUrl = baseUrl;
  }
  // persist: a profile-backed switch stores the profile NAME (the endpoint and
  // key live in its table); a preset/flat switch stores the resolved endpoint.
  // The top-level apiKey is the fallback a keyless profile resolves against, so
  // it is written back rather than dropped when it exists.
  const fallbackKey = state.config?.apiKey || (sameEndpoint ? apiKey : "");
  const saved = saveGlobalConfig(
    t.profileName
      ? { provider: t.profileName, model: t.model, ...(keyOverride ? { apiKey: keyOverride } : fallbackKey ? { apiKey: fallbackKey } : {}) }
      : { provider: format, model: t.model, baseUrl, ...(apiKey ? { apiKey } : {}) },
    state.configPath,
  );
  return {
    handled: true,
    output: `model: ${t.model}${t.profileName ? ` · profile ${t.profileName}` : ""} (${format}) — saved to session + ${saved} (/reload re-reads it)`,
  };
}

/** True when the wizard must ask for a key: the target has none anywhere else. */
function targetNeedsKey(t: ModelTarget, state: HarnessState): boolean {
  if (t.error || t.apiKey) return false;
  const baseUrl = t.baseUrl ?? state.provider.baseUrl;
  if (/^https?:\/\/(localhost|127\.|\[::1\])/.test(baseUrl)) return false;
  const sameEndpoint = baseUrl === state.provider.baseUrl && (t.format ?? state.provider.provider) === state.provider.provider;
  return !(sameEndpoint && state.provider.apiKey);
}

/** Turn a wizard answers map into a ModelTarget, resolving the custom-model step. */
function promptSelectionToTarget(a: Record<string, string>, state: HarnessState): ModelTarget {
  const v = a.model ?? "";
  const customBase = (a.baseUrl ?? "").trim();
  if (v.startsWith("m:")) return { model: v.slice(2) };
  if (v.startsWith("u:")) {
    // u:<format>:<id> — a custom endpoint chosen in the provider step
    const i = v.indexOf(":", 2);
    if (i < 0) return { model: "", error: "no model selected" };
    if (!customBase) return { model: "", error: "no base url entered" };
    return { model: v.slice(i + 1), format: v.slice(2, i), baseUrl: customBase };
  }
  if (v.startsWith("p:") || v.startsWith("x:")) {
    const i = v.indexOf(":", 2);
    return parseModelArg(`${v.slice(2, i)}/${v.slice(i + 1)}`, state);
  }
  if (v.startsWith("c:")) {
    const custom = (a.custom ?? "").trim();
    if (!custom) return { model: "", error: "no model id entered" };
    const rest = v.slice(2);
    if (!rest) return { model: custom };
    if (rest.startsWith("u:")) {
      if (!customBase) return { model: "", error: "no base url entered" };
      return { model: custom, format: rest.slice(2), baseUrl: customBase };
    }
    if (rest.startsWith("p:")) return { ...parseModelArg(`${rest.slice(2)}/${custom}`, state) };
    if (rest.startsWith("x:")) return { ...parseModelArg(`${rest.slice(2)}/${custom}`, state) };
  }
  return { model: "", error: `unrecognized selection '${v}'` };
}

/**
 * The interactive `/model`: pick a provider, then a model. Providers without
 * credentials anywhere (profile key, matching env var, live state, or a
 * localhost endpoint) are hidden, not offered: picking one could only end in a
 * 401. Model lists come from the endpoint's own /models when reachable
 * (cached, refreshed in the background), falling back to configured profile
 * models and then the models.dev catalog. A custom entry covers models the
 * endpoint does not advertise.
 */
function modelPrompt(state: HarnessState): PromptRequest {
  ensureFreshCatalog();
  const cur = state.provider.model;
  const isLocal = (u?: string) => !!u && /^https?:\/\/(localhost|127\.|\[::1\])/.test(u);

  // The key a listing request would use, or null when this provider is logged
  // out everywhere. "" means "needs no key" (localhost).
  const creds = (baseUrl: string | undefined, keys: (string | undefined)[]): string | null => {
    if (baseUrl && isLocal(baseUrl)) return "";
    for (const k of keys) if (k) return k;
    if (baseUrl && baseUrl === state.provider.baseUrl && state.provider.apiKey) return state.provider.apiKey;
    return null;
  };

  // Step 1 choices: the current provider, then every callable profile/preset.
  // A row resolving to the current identity is skipped — otherwise the
  // provider you are on appears twice, once as "(current)" and once bare.
  const providers: { value: string; label: string }[] = [
    { value: "m:", label: `${providerDisplayName(state)} — ${state.provider.baseUrl} (current)` },
  ];
  const profileNames: string[] = [];
  for (const [name, p] of Object.entries(state.config?.providers ?? {})) {
    const baseUrl = p.baseUrl ?? state.provider.baseUrl;
    if (creds(baseUrl, [p.apiKey]) === null) continue; // logged out — hidden
    if (state.provider.label === name) continue; // this profile is the current row
    profileNames.push(name);
    providers.push({ value: `p:${name}`, label: `${name} — ${p.format ?? "openai-compatible"} · ${baseUrl}` });
  }
  const presetIds: string[] = [];
  for (const preset of providerPresets()) {
    if (creds(preset.api, preset.env.map((e) => process.env[e])) === null) continue;
    // same endpoint under the same identity as the current row: selecting it
    // would be a no-op wearing a different value
    if (state.provider.label === preset.id && state.provider.baseUrl === (preset.api ?? state.provider.baseUrl)) continue;
    presetIds.push(preset.id);
    providers.push({ value: `x:${preset.id}`, label: `${preset.name} — ${preset.api ?? preset.format}` });
  }
  // Custom endpoints are always offered, one entry per API format — each is a
  // real provider choice with its own base-url step, not a hidden fallback.
  const customFormats = ["openai-compatible", "openai-responses", "anthropic", "google"];
  for (const f of customFormats) providers.push({ value: `u:${f}`, label: `custom — ${f} endpoint` });

  // Step 2 choices, from the provider picked in step 1.
  const modelOptions = (a: Record<string, string>) => {
    const sel = a.provider ?? "m:";
    const out: { value: string; label: string }[] = [];
    if (sel === "m:") {
      ensureEndpointModels(state.provider.baseUrl, state.provider.apiKey, state.provider.provider);
      out.push({ value: `m:${cur}`, label: `${cur} (current)` });
      for (const m of endpointModels(state.provider.baseUrl) ?? []) {
        if (m.id === cur) continue;
        const ctx = m.context ? ` — ${Math.round(m.context / 1000)}k` : "";
        out.push({ value: `m:${m.id}`, label: `${m.id}${ctx}` });
      }
      out.push({ value: "c:", label: "＋ custom model on this provider…" });
      return out;
    }
    if (sel.startsWith("u:")) {
      const format = sel.slice(2);
      const baseUrl = (a.baseUrl ?? "").trim();
      if (baseUrl) ensureEndpointModels(baseUrl, "");
      out.push({ value: `u:${format}:${cur}`, label: `${cur} (current)` });
      for (const m of endpointModels(baseUrl) ?? []) {
        if (m.id === cur) continue;
        const ctx = m.context ? ` — ${Math.round(m.context / 1000)}k` : "";
        out.push({ value: `u:${format}:${m.id}`, label: `${m.id}${ctx}` });
      }
      out.push({ value: "c:u:" + format, label: "＋ custom model…" });
      return out;
    }
    if (sel.startsWith("p:")) {
      const name = sel.slice(2);
      const p = state.config?.providers[name];
      if (!p) return out;
      const baseUrl = p.baseUrl ?? state.provider.baseUrl;
      const key = creds(baseUrl, [p.apiKey]) ?? "";
      ensureEndpointModels(baseUrl, key, p.format);
      const listed = endpointModels(baseUrl) ?? p.models.filter((m) => !m.disabled).map((m) => ({ id: m.id, name: m.name, context: m.contextWindow }));
      for (const m of listed) {
        const ctx = m.context ? ` — ${Math.round(m.context / 1000)}k` : "";
        out.push({ value: `p:${name}:${m.id}`, label: `${m.name ?? m.id}${m.name && m.name !== m.id ? ` (${m.id})` : ""}${ctx}` });
      }
      out.push({ value: `c:p:${name}`, label: "＋ custom model…" });
      return out;
    }
    const id = sel.slice(2);
    const preset = providerPresets().find((x) => x.id === id);
    if (!preset) return out;
    const key = creds(preset.api, preset.env.map((e) => process.env[e])) ?? "";
    if (preset.api) ensureEndpointModels(preset.api, key, preset.format);
    const listed = (preset.api ? endpointModels(preset.api) : null) ?? preset.models;
    for (const m of listed) {
      const ctx = m.context ? ` — ${Math.round(m.context / 1000)}k` : "";
      out.push({ value: `x:${id}:${m.id}`, label: `${m.id}${ctx}` });
    }
    out.push({ value: `c:x:${id}`, label: "＋ custom model…" });
    return out;
  };

  return {
    title: "switch model (persists to session + global config)",
    steps: [
      { key: "provider", label: "provider — type to search", kind: "select", options: providers, initial: "m:" },
      {
        key: "baseUrl",
        label: "base url",
        kind: "text",
        allowEmpty: false,
        hint: "https://… — the endpoint this provider serves",
        skipIf: (a) => !(a.provider ?? "").startsWith("u:"),
      },
      { key: "model", label: "model — type to search", kind: "select", options: modelOptions },
      {
        key: "custom",
        label: "model id",
        kind: "text",
        allowEmpty: false,
        hint: "any id the endpoint accepts, listed or not",
        skipIf: (a) => !(a.model ?? "").startsWith("c"),
      },
      {
        key: "key",
        label: "api key",
        kind: "text",
        secret: true,
        allowEmpty: true,
        hint: "empty = profile key, env var, or current key",
        skipIf: (a) => !targetNeedsKey(promptSelectionToTarget(a, state), state),
      },
    ],
    run: (a, s) => applyModelSwitch(promptSelectionToTarget(a, s), s, a.key?.trim() || undefined),
  };
}

/**
 * Persist login fields to the global config and activate them on the live
 * state — shared by `/login key=value…` and the interactive wizard, so the two
 * cannot drift apart on what "save and apply" means.
 */
function applyLogin(fields: LoginFields, state: HarnessState): CommandResult {
  // A preset id (openrouter, deepseek, …) expands to its provider format,
  // default endpoint and conventional env key before validation. The id itself
  // is what gets SAVED (resolveProfile expands preset ids on load, so a
  // restart keeps the identity) and what display shows; only the live
  // provider's format field takes the expansion.
  let format: string | undefined;
  if (fields.provider && !availableProviders().includes(fields.provider)) {
    const preset = presetById(fields.provider);
    if (preset) {
      format = preset.format;
      if (!fields.baseUrl && preset.api) fields.baseUrl = preset.api;
      if (!fields.apiKey) {
        for (const name of preset.env) {
          const v = process.env[name];
          if (v) {
            fields.apiKey = v;
            break;
          }
        }
      }
    }
  }
  const id = fields.provider;
  if (format) fields.provider = format; // live activation needs a real format
  if (fields.provider && !availableProviders().includes(fields.provider)) {
    return { handled: true, output: `unknown provider "${fields.provider}" — available: ${availableProviders().join(", ")}, or a /login preset` };
  }
  const path = saveGlobalConfig({ ...fields, provider: id }, state.configPath);
  // take effect immediately — the point is not having to restart
  if (fields.provider) state.provider.provider = fields.provider;
  if (id) {
    state.provider.label = id;
    if (state.config) state.config.provider = id;
  }
  if (fields.apiKey) state.provider.apiKey = fields.apiKey;
  if (fields.baseUrl) state.provider.baseUrl = fields.baseUrl;
  if (fields.baseUrl || fields.provider) setActiveEndpoint(state.provider.baseUrl);
  if (fields.model) {
    state.provider.model = fields.model;
    setSessionModel(state.sessionId, fields.model);
  }
  if (state.config) {
    if (fields.apiKey) state.config.apiKey = fields.apiKey;
    if (fields.baseUrl) state.config.baseUrl = fields.baseUrl;
    if (fields.model) state.config.model = fields.model;
  }
  return { handled: true, output: `saved to ${path} — active immediately (/reload re-reads the file)` };
}

/**
 * Everything plugin management can act on: bundled capabilities plus
 * configured files. `id` is what on/off accepts (short name, full
 * `bundled:` name, or the configured path); `storeId` is what lands in
 * `disabledPlugins` (short for bundled, the path as configured for files).
 */
export interface PluginInventoryEntry {
  id: string;
  name: string;
  source: string;
  storeId: string;
  enabled: boolean;
  contributes: string[];
}

/** One-line summary of what a loaded plugin contributes, for /plugin. */
function describePlugin(p: FoxPlugin): string[] {
  const parts: string[] = [];
  if (p.tools?.length) parts.push(`tools: ${p.tools.map((t) => t.def.name).join(", ")}`);
  const hooks = Object.keys(p.hooks ?? {});
  if (hooks.length) parts.push(`hooks: ${hooks.join(", ")}`);
  if (p.providers && Object.keys(p.providers).length) parts.push(`providers: ${Object.keys(p.providers).join(", ")}`);
  if (p.themes && Object.keys(p.themes).length) parts.push(`themes: ${Object.keys(p.themes).join(", ")}`);
  if (p.mcpServers && Object.keys(p.mcpServers).length) parts.push(`servers: ${Object.keys(p.mcpServers).join(", ")}`);
  if (p.agents && Object.keys(p.agents).length) parts.push(`agents: ${Object.keys(p.agents).join(", ")}`);
  if (p.commands?.length) parts.push(`commands: ${p.commands.map((c) => c.name).join(", ")}`);
  return parts.length ? parts : ["(no contributions)"];
}

/**
 * Load the configured files fresh (not the turn's cached actives) and lay
 * out every plugin with its on/off state. Disabled files are not imported —
 * their row shows the path and says so.
 */
export async function pluginInventory(opts: { config?: Config; configPath?: string }): Promise<{
  entries: PluginInventoryEntry[];
  warnings: string[];
}> {
  const configured = opts.config?.plugins ?? [];
  const disabled = opts.config?.disabledPlugins ?? [];
  const dir = dirname(opts.configPath ?? effectiveConfigPath());
  const { plugins, warnings, files } = await loadPlugins(configured, dir, disabled);
  const byName = new Map(plugins.map((p) => [p.name, p]));
  const entries: PluginInventoryEntry[] = [];
  const bundledOrder: FoxPlugin[] = [...bundledPlugins(), { name: "bundled:mcp", tools: [] }, ...bundledProviderPlugins()];
  for (const b of bundledOrder) {
    const short = b.name.replace(/^bundled:/, "");
    const off = bundledDisabled(b.name, disabled);
    entries.push({
      id: short,
      name: b.name,
      source: "bundled",
      storeId: short,
      enabled: !off,
      contributes: off ? ["(disabled)"] : describePlugin(byName.get(b.name) ?? b),
    });
  }
  for (const f of files) {
    const p = f.name ? byName.get(f.name) : undefined;
    entries.push({
      id: f.path,
      name: f.name ?? f.path,
      source: f.path,
      storeId: f.path,
      enabled: !f.disabled,
      contributes: f.disabled ? ["(disabled — enable to inspect)"] : p ? describePlugin(p) : ["(not loaded — see warnings)"],
    });
  }
  return { entries, warnings };
}

/**
 * The interactive /plugin wizard — the same select-step UI as /model and
 * /login, not the session-picker overlay. Options build synchronously from
 * config alone (no plugin imports to open the menu); the chosen action does
 * the loading. Values are on/off spellings matchPluginTarget resolves.
 */
function pluginsPrompt(state: HarnessState): PromptRequest {
  const disabled = state.config?.disabledPlugins ?? [];
  const configured = state.config?.plugins ?? [];
  const bundledIds = [...bundledPlugins().map((p) => p.name), "bundled:mcp", ...BUNDLED_PROVIDER_PLUGIN_NAMES];
  const options = [
    ...bundledIds.map((full) => {
      const short = full.replace(/^bundled:/, "");
      const on = !bundledDisabled(full, disabled);
      return { value: short, label: `${on ? "on " : "off"} ${short} (bundled)` };
    }),
    ...configured.map((raw) => {
      const on = !isPluginPathDisabled(raw, disabled);
      return { value: raw, label: `${on ? "on " : "off"} ${raw}` };
    }),
  ];
  return {
    title: "plugins — pick one, then what to do with it",
    steps: [
      { key: "plugin", label: "plugin — type to search", kind: "select", options, initial: options[0]?.value },
      {
        key: "action",
        label: "action",
        kind: "select",
        options: [
          { value: "on", label: "switch on" },
          { value: "off", label: "switch off" },
          { value: "info", label: "show details" },
          { value: "uninstall", label: "uninstall file (files only)" },
        ],
        initial: "off",
      },
    ],
    run: (a, s) => {
      const target = (a.plugin ?? "").trim();
      if (!target) return { handled: true, output: "no plugin selected" };
      if (a.action === "info") return { handled: true, task: () => pluginInfoText(s, target) };
      if (a.action === "uninstall") {
        if (bundledIds.some((b) => b === target || b.replace(/^bundled:/, "") === target)) {
          return { handled: true, output: `${target} is bundled — switch it off instead of uninstalling` };
        }
        return { handled: true, task: () => pluginRemovePath(s, target), reload: true };
      }
      if (a.action === "on" || a.action === "off") {
        return { handled: true, task: () => pluginSetEnabled(s, target, a.action === "on"), reload: true };
      }
      return { handled: true, output: "no action selected" };
    },
  };
}

/** Rendered inventory for `fox plugin` and non-interactive /plugin. */
export async function pluginListText(opts: { config?: Config; configPath?: string; color?: boolean }): Promise<string> {
  const { entries, warnings } = await pluginInventory(opts);
  const st = sty(opts.color);
  const on = entries.filter((e) => e.enabled);
  const lines = [st.b(`plugins (${on.length} on, ${entries.length - on.length} off):`)];
  for (const e of entries) {
    const what = e.enabled ? e.contributes.join("; ") : e.source === "bundled" ? "bundled" : e.source;
    lines.push(`  ${e.enabled ? st.green("on ") : st.red("off")} ${st.cyan(e.id)}  ${e.enabled ? what : st.dim(what)}`);
  }
  if (warnings.length) {
    lines.push(st.yellow("warnings:"));
    for (const w of warnings) lines.push(st.yellow(`  ! ${w}`));
  }
  lines.push(st.dim("manage: /plugin on|off|add|rm|info <name>  (headless: fox plugin …)"));
  return lines.join("\n");
}

/**
 * Resolve an on/off target against the inventory. A spelling can name several
 * entries (two configured paths with one basename) — that is ambiguous, never
 * a guess.
 */
export function matchPluginTarget(
  input: string,
  entries: PluginInventoryEntry[],
): { entry: PluginInventoryEntry } | { ambiguous: string[] } | null {
  const q = input.toLowerCase();
  const spellings = (e: PluginInventoryEntry): string[] => {
    // the plugin's own name first: that is what users will type. Then the
    // bundled short/full forms, or the configured path plus its basename and
    // stem (mirroring the loader's disabled matching).
    const out = [e.name.toLowerCase()];
    if (e.source === "bundled") out.push(e.id.toLowerCase());
    else {
      const base = e.source.split("/").pop() ?? e.source;
      out.push(e.source.toLowerCase(), base.toLowerCase(), base.replace(/\.(ts|js|mjs|mts)$/, "").toLowerCase());
    }
    return [...new Set(out)];
  };
  const hits = entries.filter((e) => spellings(e).includes(q));
  if (hits.length === 1) return { entry: hits[0] };
  if (hits.length > 1) return { ambiguous: hits.map((h) => h.source) };
  return null;
}

/** Flip one plugin in the global config's `disabledPlugins`. */
export async function pluginSetEnabled(
  opts: { config?: Config; configPath?: string; color?: boolean },
  input: string,
  enable: boolean,
): Promise<string> {
  const st = sty(opts.color);
  const { entries } = await pluginInventory(opts);
  const m = matchPluginTarget(input, entries);
  if (!m) {
    return st.yellow(`unknown plugin '${input}' — names: ${entries.map((e) => e.id).join(", ") || "(none)"}`);
  }
  if ("ambiguous" in m) return st.yellow(`'${input}' matches several plugins — be specific: ${m.ambiguous.join(", ")}`);
  const e = m.entry;
  if (enable && e.enabled) return `${e.id} is already on`;
  if (!enable && !e.enabled) return `${e.id} is already off`;
  const path = opts.configPath ?? effectiveConfigPath();
  const disabled = opts.config?.disabledPlugins ?? [];
  if (enable) {
    // remove every spelling that disables this target (short and bundled:
    // forms alike), or it stays off under the other one
    const gone = disabled.filter((d) =>
      e.source === "bundled" ? bundledDisabled(e.name, [d]) : isPluginPathDisabled(e.source, [d]),
    );
    for (const d of gone) setPluginDisabled(d, false, path);
    if (!gone.length) return `${e.id} is already on`;
  } else {
    setPluginDisabled(e.storeId, true, path);
  }
  const done = `${e.id} ${enable ? "on" : "off"} — saved to ${path} (/reload re-reads it)`;
  return enable ? st.green(done) : st.red(done);
}

/** Full detail on one plugin: source, status, every contribution, its warnings. */
export async function pluginInfoText(
  opts: { config?: Config; configPath?: string; color?: boolean },
  input: string,
): Promise<string> {
  const st = sty(opts.color);
  const { entries, warnings } = await pluginInventory(opts);
  const m = matchPluginTarget(input, entries);
  if (!m) return st.yellow(`unknown plugin '${input}' — names: ${entries.map((e) => e.id).join(", ") || "(none)"}`);
  if ("ambiguous" in m) return st.yellow(`'${input}' matches several plugins — be specific: ${m.ambiguous.join(", ")}`);
  const e = m.entry;
  const lines = [
    `${st.b(e.name)} — ${e.enabled ? st.green("on") : st.red("off")}`,
    st.dim(`source: ${e.source}`),
  ];
  for (const c of e.contributes) lines.push(`  ${c}`);
  const related = warnings.filter((w) => w.includes(e.name) || (e.source !== "bundled" && w.includes(e.source)));
  for (const w of related) lines.push(st.yellow(`  ! ${w}`));
  return lines.join("\n");
}

/** Install a plugin file into the global config. */
export async function pluginAddPath(
  opts: { config?: Config; configPath?: string },
  input: string,
): Promise<string> {
  const path = opts.configPath ?? effectiveConfigPath();
  if ((opts.config?.plugins ?? []).includes(input)) return `${input} is already installed`;
  try {
    const r = addPluginPath(input, path);
    return `${input} installed — ${r.plugins.length} plugin file(s) in ${r.path} (/reload re-reads it)`;
  } catch (e) {
    return `cannot install '${input}': ${(e as Error).message}`;
  }
}

/** Uninstall a plugin file, clearing its on/off state with it. */
export async function pluginRemovePath(
  opts: { config?: Config; configPath?: string },
  input: string,
): Promise<string> {
  const { entries } = await pluginInventory(opts);
  const m = matchPluginTarget(input, entries.filter((e) => e.source !== "bundled"));
  if (!m) return `unknown plugin file '${input}' — files: ${entries.filter((e) => e.source !== "bundled").map((e) => e.id).join(", ") || "(none)"}`;
  if ("ambiguous" in m) return `'${input}' matches several plugins — be specific: ${m.ambiguous.join(", ")}`;
  const e = m.entry;
  const path = opts.configPath ?? effectiveConfigPath();
  removePluginPath(e.storeId, path);
  // dropping the file must not leave a stale off-switch behind for a future
  // plugin installed under the same name
  const disabled = opts.config?.disabledPlugins ?? [];
  for (const d of disabled.filter((d) => isPluginPathDisabled(e.source, [d]))) setPluginDisabled(d, false, path);
  return `${e.id} uninstalled — removed from ${path}`;
}

/**
 * Activate a named provider profile: the live state, the session record and
 * the top-level config all resolve through the real profile path, exactly as
 * a restart would — so activation can never disagree with a reload about
 * what the profile means. With `writeProfile`, the table is created or
 * refreshed first (a login that keeps several providers side by side).
 */
function applyProfileLogin(
  name: string,
  opts: { model?: string; format?: string; baseUrl?: string; apiKey?: string; writeProfile?: boolean },
  state: HarnessState,
): CommandResult {
  if (!state.config) return { handled: true, output: "no config loaded — cannot switch profiles" };
  if (opts.writeProfile) {
    try {
      saveProviderProfile(
        name,
        { format: opts.format, baseUrl: opts.baseUrl, apiKey: opts.apiKey || undefined, defaultModel: opts.model },
        state.configPath,
      );
    } catch (e) {
      return { handled: true, output: `cannot save profile '${name}': ${(e as Error).message}` };
    }
    // the in-memory table gets the same row a reload would read
    state.config.providers[name] = {
      format: opts.format,
      baseUrl: opts.baseUrl,
      apiKey: opts.apiKey || undefined,
      defaultModel: opts.model,
      models: state.config.providers[name]?.models ?? [],
    };
  } else if (!state.config.providers[name]) {
    return { handled: true, output: `unknown profile '${name}'` };
  }
  const profile = state.config.providers[name];
  const model = opts.model ?? profile?.defaultModel ?? state.provider.model;
  const resolved = resolveProfile({ ...state.config, provider: name, model }, process.env);
  state.provider.provider = resolved.format;
  state.provider.label = resolved.label;
  state.provider.baseUrl = resolved.baseUrl;
  state.provider.apiKey = resolved.apiKey;
  state.provider.model = model;
  state.provider.headers = resolved.headers;
  state.provider.sampling = resolved.sampling;
  setActiveEndpoint(resolved.baseUrl);
  setSessionModel(state.sessionId, model);
  state.config.provider = name;
  state.config.model = model;
  const saved = saveGlobalConfig({ provider: name, model }, state.configPath);
  return {
    handled: true,
    output: `provider: ${name} (${resolved.format}) · model ${model} — saved to ${saved} (/reload re-reads it)`,
  };
}

/**
 * Resolve the login wizard's model answer: a listed pick wins, otherwise the
 * typed custom id. The fallback also covers the skipped select — a custom
 * endpoint lists nothing, so answers.model is unset and only modelCustom
 * holds the typed id (previously discarded, saving the old model silently).
 */
function loginModelAnswer(answers: Record<string, string>): string | undefined {
  if (answers.model && answers.model !== "__custom") return answers.model;
  return answers.modelCustom?.trim() || undefined;
}

/**
 * The `/login` wizard for interactive hosts: ask, don't make them read /help.
 * kv args from the command line prefill the steps, so `/login provider=google`
 * still lands in the wizard with that choice already made.
 *
 * Provider choices come from the models.dev catalog (cached, refreshed in the
 * background) plus static fallbacks; picking one prefills the
 * endpoint, names the env var an empty key falls back to, and turns the model
 * step into a list of what that provider actually serves.
 */
function loginPrompt(state: HarnessState, pre: LoginFields = {}): PromptRequest {
  const p = state.provider;
  ensureFreshCatalog();
  const presets = providerPresets();
  // which preset does the current config most look like? An exact endpoint
  // match first (openrouter, a gateway's fixed URL, …), then the canonical
  // preset for the configured format — but only when the endpoint is also the
  // default one, else the honest answer is "custom".
  const format = p.provider ?? "openai-compatible";
  const canonical: Record<string, string> = {
    "openai-compatible": "openai",
    "openai-responses": "openai-responses",
    anthropic: "anthropic",
    google: "google",
  };
  const byEndpoint = presets.find((x) => x.api && x.api === p.baseUrl);
  const canon = presets.find((x) => x.id === canonical[format]);
  const currentPreset =
    canon && canon.api === p.baseUrl ? canon.id : (byEndpoint?.id ?? (canon && !canon.api ? canon.id : "custom"));
  const presetOf = (a: Record<string, string>) => presets.find((x) => x.id === a.provider);
  // a configured profile is its own choice (value `profile:<name>`), not a
  // preset id — explicit config beats the catalog when both claim a name
  const profileOf = (a: Record<string, string>) => {
    const v = a.provider ?? "";
    return v.startsWith("profile:") ? state.config?.providers[v.slice("profile:".length)] : undefined;
  };
  const currentProfile = state.config && state.config.providers[state.config.provider] ? state.config.provider : null;
  const preProfile =
    pre.provider && pre.provider !== "custom" && state.config?.providers[pre.provider] ? `profile:${pre.provider}` : null;
  /**
   * Model options for the picked login target. Profiles list their own
   * models plus whatever the endpoint itself advertises (a corporate gateway
   * is in no catalog); presets list the catalog; a custom endpoint lists
   * nothing, sending the flow straight to the text step. `ensureLive` fires
   * the background endpoint refresh — options rendering passes true, skipIf
   * reads the cache only, so the predicate never doubles the fetch.
   */
  const loginModelOptions = (a: Record<string, string>, ensureLive: boolean): { value: string; label: string }[] => {
    const prof = profileOf(a);
    if (prof) {
      const baseUrl = prof.baseUrl ?? p.baseUrl;
      const key = resolveValue(prof.apiKey) ?? (baseUrl === p.baseUrl ? p.apiKey : undefined) ?? "";
      if (ensureLive) ensureEndpointModels(baseUrl, key, prof.format);
      const live = (endpointModels(baseUrl) ?? []).map((m) => ({
        value: m.id,
        label: m.context ? `${m.name ?? m.id} (${Math.round(m.context / 1000)}k ctx)` : (m.name ?? m.id),
      }));
      const configured = (prof.models ?? [])
        .filter((m) => !m.disabled)
        .map((m) => ({ value: m.id, label: m.contextWindow ? `${m.name ?? m.id} (${Math.round(m.contextWindow / 1000)}k ctx)` : (m.name ?? m.id) }));
      const seen = new Set<string>();
      const out = [...live, ...configured].filter((m) => (seen.has(m.value) ? false : (seen.add(m.value), true)));
      return [...out, { value: "__custom", label: "✎ type a model id…" }];
    }
    const models = presetOf(a)?.models ?? [];
    const opts = models.map((m) => ({
      value: m.id,
      label: m.context ? `${m.id} (${Math.round(m.context / 1000)}k ctx)` : m.id,
    }));
    return [...opts, { value: "__custom", label: "✎ type a model id…" }];
  };
  return {
    title: "login — leave a field empty to keep the current value",
    steps: [
      {
        key: "provider",
        label: "provider",
        kind: "select",
        options: [
          ...Object.entries(state.config?.providers ?? {}).map(([name, prof]) => ({
            value: `profile:${name}`,
            label: `${name} — profile · ${prof.format ?? "openai-compatible"}${prof.baseUrl ? ` · ${prof.baseUrl}` : ""}`,
          })),
          ...presets.map((x) => ({ value: x.id, label: x.api ? `${x.name} — ${x.api}` : x.name })),
          { value: "custom", label: "custom (any provider format fox-agent speaks)" },
        ],
        initial: preProfile ?? pre.provider ?? (currentProfile ? `profile:${currentProfile}` : currentPreset),
      },
      {
        key: "apiKey",
        label: "api key",
        kind: "text",
        secret: true,
        hint: (a) => {
          const env = presetOf(a)?.env ?? [];
          return env.length ? `empty = keep current / $${env[0]}` : "empty = keep current (none needed)";
        },
        // a profile carries its own credentials — nothing to ask
        skipIf: (a) => (a.provider ?? "").startsWith("profile:"),
      },
      {
        key: "baseUrl",
        label: "base url",
        kind: "text",
        initial: (a) => pre.baseUrl ?? presetOf(a)?.api ?? p.baseUrl,
        hint: "empty = keep current",
        skipIf: (a) => (a.provider ?? "").startsWith("profile:"),
      },
      {
        key: "model",
        label: "model",
        kind: "select",
        options: (a) => loginModelOptions(a, true),
        initial: (a) => {
          const cur = pre.model ?? p.model;
          const ids = loginModelOptions(a, false).map((m) => m.value);
          return ids.includes(cur) ? cur : "__custom";
        },
        // no catalog table for this provider (custom, or a preset that lists
        // nothing) — the select would be a one-row menu, so go straight to text
        skipIf: (a) => loginModelOptions(a, false).length <= 1,
      },
      {
        key: "modelCustom",
        label: "model id",
        kind: "text",
        allowEmpty: true,
        initial: (a) => pre.model ?? p.model,
        hint: (a) =>
          (a.model ?? "") === "__custom" ? "type the id the endpoint accepts" : "empty = keep the picked/current model",
        // asked only when the select was skipped (nothing listed) or the user
        // explicitly chose "type a model id…" — picking a listed model no
        // longer re-asks for an id it just confirmed
        skipIf: (a) => {
          const listed = loginModelOptions(a, false);
          return listed.length > 1 && (a.model ?? "") !== "__custom";
        },
      },
      {
        key: "saveProfile",
        label: "remember as profile",
        kind: "text",
        allowEmpty: true,
        initial: (a) => {
          const pr = presetOf(a);
          return pr && a.provider !== "custom" ? pr.id : "";
        },
        hint: "empty = one-off login in the flat slot; a name keeps this provider beside your others",
        skipIf: (a) => (a.provider ?? "").startsWith("profile:"),
      },
    ],
    run: (answers, s) => {
      const sel = answers.provider ?? "";
      // an existing profile: switch to it, nothing else to learn
      if (sel.startsWith("profile:")) {
        return applyProfileLogin(sel.slice("profile:".length), { model: loginModelAnswer(answers) }, s);
      }
      // "custom" means an arbitrary openai-compatible endpoint; other formats
      // can still be named explicitly via kv args (/login provider=anthropic …)
      const preset = presetOf(answers);
      const fields: LoginFields = { provider: answers.provider === "custom" ? "openai-compatible" : answers.provider };
      for (const k of ["apiKey", "baseUrl"] as const) {
        const v = answers[k]?.trim();
        if (v) fields[k] = v;
      }
      const model = loginModelAnswer(answers);
      if (model) fields.model = model;
      // kv args the user left untouched in the wizard still count as entered
      if (pre.apiKey && !fields.apiKey) fields.apiKey = pre.apiKey;
      if (pre.model && !fields.model) fields.model = pre.model;
      // a name keeps this login as a profile next to the others; empty stays
      // a one-off in the flat slot, exactly as before
      const saveName = (answers.saveProfile ?? "").trim();
      if (saveName) {
        const format = answers.provider === "custom" ? "openai-compatible" : (preset?.format ?? fields.provider!);
        if (!availableProviders().includes(format)) {
          return { handled: true, output: `unknown provider "${format}" — available: ${availableProviders().join(", ")}, or a /login preset` };
        }
        return applyProfileLogin(
          saveName,
          {
            model: fields.model,
            format,
            // an empty baseUrl keeps the current endpoint for custom logins,
            // but a preset names its own endpoint when nothing was typed
            baseUrl: fields.baseUrl ?? (answers.provider === "custom" ? undefined : preset?.api),
            apiKey: fields.apiKey,
            writeProfile: true,
          },
          s,
        );
      }
      return applyLogin(fields, s);
    },
  };
}

export function runSlashCommand(input: string, state: HarnessState): CommandResult | null {
  if (!input.startsWith("/")) return null;
  const [word, ...rest] = input.trim().split(/\s+/);
  const spec = findCommand(word.toLowerCase());
  const arg = rest.join(" ").trim();

  // A read-only viewer keeps the harmless commands and nothing else.
  if (state.readOnly && spec && !READONLY_COMMANDS.has(spec.name)) {
    return { handled: true, output: `${spec.name} is disabled — this session is open elsewhere (read-only view)` };
  }

  // A pending TUI session has no row yet; commands that read or mutate the
  // current session's data have nothing to work on until the first message.
  if (!state.sessionId && spec) {
    const needsSession = ["/undo", "/prune", "/ops", "/view", "/todo", "/usage"].includes(spec.name);
    const forkNeedsSession = spec.name === "/fork" && (!arg || /^m?\d+$/.test(arg)); // /fork <id> works sessionless
    if (needsSession || forkNeedsSession) {
      return { handled: true, output: "no session yet — send a message first" };
    }
  }

  switch (spec?.name) {
    case "/help":
      return { handled: true, output: helpText() };

    case "/new": {
      const s = createSession(state.cwd, state.provider.model);
      return { handled: true, newSessionId: s.id, output: `new session ${s.id}`, welcome: true };
    }

    case "/sessions": {
      // With an argument this is the old `/resume`: switch to that session.
      // Without one, an interactive host gets a picker and everyone else gets
      // the list they always got.
      if (arg) {
        const id = resolveSessionArg(arg, state.config?.sessionListLimit ?? 50);
        if (!id) {
          const n = Number(arg);
          if (Number.isInteger(n) && n >= 1)
            return { handled: true, output: `no session at index ${n}` };
          // a search term: ambiguous (or no hit) — show what it COULD be
          const hits = resolveSessionArgMatches(arg, state.config?.sessionListLimit ?? 50);
          return {
            handled: true,
            output: hits.length
              ? `several sessions match "${arg}" — narrow it or use the index:\n${hits.map((h) => `  ${h.index}  ${h.label}`).join("\n")}`
              : `unknown session ${arg}`,
          };
        }
        if (id === state.sessionId) return { handled: true, output: `already in ${id}` };
        return { handled: true, newSessionId: id, output: `switched to ${id}` };
      }
      if (state.interactive) return { handled: true, picker: { kind: "sessions" } };
      return { handled: true, output: formatSessionList(sessionList({ currentId: state.sessionId, limit: state.config?.sessionListLimit })) };
    }

    case "/fork": {
      // Bare in the TUI: ask where to cut instead of printing usage.
      if (!arg && state.interactive) {
        return {
          handled: true,
          prompt: {
            title: "fork — mN cuts this session at a marker, an id forks another session at its tip",
            steps: [{ key: "at", label: "marker or session id", kind: "text", hint: "empty = fork here at the tip" }],
            run: (a, s) => {
              const at = (a.at ?? "").trim();
              if (!at) {
                // empty forks here at the tip, as promised — re-entering
                // `/fork ` would reopen this same prompt in a loop
                if (!s.sessionId) return { handled: true, output: "no session yet — send a message first" };
                const fork = forkSession(s.sessionId);
                if (!fork) return { handled: true, output: "fork failed" };
                return { handled: true, newSessionId: fork.id, output: `forked -> ${fork.id}` };
              }
              return runSlashCommand(`/fork ${at}`, s) ?? { handled: true };
            },
          },
        };
      }
      // `/fork m3` cuts THIS session at a marker; `/fork <id>` forks another
      // session at its tip, which is what the picker's fork key sends. The two
      // cannot be confused: a marker is `m` plus digits only, and a session id
      // is base36 with at least one letter in its timestamp prefix.
      let source = state.sessionId;
      let upto: number | undefined;
      if (arg) {
        const m = /^m?(\d+)$/.exec(arg);
        if (m) {
          upto = Number(m[1]);
          if (!getMessage(state.sessionId, upto)) return { handled: true, output: `no message m${upto}` };
        } else {
          const id = resolveSessionArg(arg, state.config?.sessionListLimit ?? 50);
          if (!id) return { handled: true, output: `usage: /fork [mN|id|list-index]` };
          source = id;
        }
      }
      const fork = forkSession(source, upto);
      if (!fork) return { handled: true, output: "fork failed" };
      return { handled: true, newSessionId: fork.id, output: `forked ${source === state.sessionId ? "" : `${source} `}-> ${fork.id}` };
    }

    case "/delete": {
      // Bare in the TUI: the session picker already has a delete key with its
      // own confirm, so just open it rather than printing usage.
      if (!arg && state.interactive) return { handled: true, picker: { kind: "sessions" } };
      // Deliberately narrower than ACP's session/delete: the id must be spelled
      // out and confirmed, because unlike /prune this destroys a whole session
      // and /undo cannot reach it.
      const [target, confirm] = rest;
      if (!target) return { handled: true, output: "usage: /delete <id|list-index> yes" };
      const id = resolveSessionArg(target, state.config?.sessionListLimit ?? 50);
      if (!id) return { handled: true, output: `unknown session ${target}` };
      // The live session's database handle is open and the turn loop keeps
      // appending to it; deleting the file underneath would leave a TUI writing
      // into an unlinked inode with no visible error. Switch away first.
      if (id === state.sessionId)
        return { handled: true, output: `${id} is the current session — /new or /sessions <other> first` };
      if (confirm !== "yes")
        return { handled: true, output: `would delete ${id} and its history for good — repeat as "/delete ${target} yes"` };
      // plugins holding session resources (a tmux shell) release them here
      void import("./plugins/load.ts").then((m) => m.fireSessionEnd(id, "delete")).catch(() => {});
      return { handled: true, output: deleteSession(id) ? `deleted ${id}` : `unknown session ${id}` };
    }

    case "/undo": {
      const msg = undoLastOp(state.sessionId);
      return { handled: true, output: msg ? `undid: ${msg}` : "nothing to undo" };
    }

    case "/prune": {
      // Bare in the TUI: make the destructive choice an explicit menu pick
      // instead of a "did you mean yes?" second round-trip.
      if (!arg && state.interactive) {
        return {
          handled: true,
          prompt: {
            title: "prune — reclaim disk from hidden context",
            steps: [
              {
                key: "mode",
                label: "mode",
                kind: "select",
                options: [
                  { value: "", label: "report only — nothing is deleted" },
                  { value: "yes", label: "delete hidden context + VACUUM (cannot be undone by /undo)" },
                ],
                initial: "",
              },
            ],
            run: (a, s) => {
              // direct call, not runSlashCommand("/prune") — that would just
              // open this prompt again in an interactive host
              const report = pruneSession(s.sessionId, { dryRun: a.mode !== "yes" });
              return { handled: true, output: formatPruneReport(report) };
            },
          },
        };
      }
      // two-step rather than an interactive prompt: this runs identically in the
      // TUI, plain mode and -p, none of which can block on a keypress here
      if (arg && arg !== "yes") return { handled: true, output: "usage: /prune  (report only)  |  /prune yes  (do it)" };
      const report = pruneSession(state.sessionId, { dryRun: arg !== "yes" });
      return { handled: true, output: formatPruneReport(report) };
    }

    case "/ops": {
      const ops = allOps(state.sessionId);
      return {
        handled: true,
        output: ops.length ? ops.map((o, i) => `${i + 1}. ${o.kind} ${o.payload.slice(0, 110)}`).join("\n") : "(no ops)",
      };
    }

    case "/view": {
      const nodes = projectView(state.sessionId);
      const lines = nodes
        .filter((n) => !n.deleted)
        .slice(-30)
        .map((n) => `[m${n.msg.seq}] ${n.msg.role.padEnd(9)} ${n.content.replace(/\n/g, " ").slice(0, 70)}`);
      const est = viewTokenEstimate(nodes);
      return {
        handled: true,
        output: `(last 30 visible of ${nodes.filter((n) => !n.deleted).length}; ~${est} est tok)\n${lines.join("\n")}`,
      };
    }

    case "/todo": {
      const todos = getTodos(state.sessionId);
      return { handled: true, output: todos?.length ? renderTodos(todos) : "(no todos)" };
    }

    case "/usage": {
      // provider-reported only, from the sessions index row (the same totals
      // every listing shows — one source of truth); the live window figure is
      // the last request's billed prompt size. No estimates — a number we
      // invented is worse than no number.
      const row = getSession(state.sessionId);
      const t =
        row && row.prompt_tokens !== null && row.completion_tokens !== null
          ? { prompt: row.prompt_tokens, completion: row.completion_tokens }
          : row
            ? backfillUsage(state.sessionId) // pre-index-totals session: fill once
            : { prompt: 0, completion: 0 };
      const b = checkBudget(state.sessionId, state.provider.model, 0, state.config?.compactAt);
      const pct = Math.round(b.ratio * 100);
      return {
        handled: true,
        output:
          `billed: ↑${t.prompt} ↓${t.completion} = ${t.prompt + t.completion} tok (provider-reported)\n` +
          `context: ${b.reported ? `${b.reported}/${b.limit} tok (${pct}%)` : "no provider report yet"}${b.over ? " — over compaction threshold" : ""}`,
      };
    }

    case "/model": {
      if (!arg && state.interactive) return { handled: true, prompt: modelPrompt(state) };
      if (!arg)
        return {
          handled: true,
          output: `model: ${state.provider.model} · provider ${providerDisplayName(state)}`,
        };
      return applyModelSwitch(parseModelArg(arg, state), state);
    }

    case "/login": {
      // Parse kv pairs first — non-interactive clients need them (a headless
      // host has no other way), and in the TUI they prefill the wizard.
      const fields: LoginFields = {};
      for (const tok of rest) {
        const m = /^(provider|key|apiKey|baseUrl|model)=(.+)$/.exec(tok);
        if (!m) return { handled: true, output: `bad token "${tok}" — use key=value pairs: /login provider=google key=… [baseUrl=…] [model=…]` };
        fields[m[1] === "key" ? "apiKey" : (m[1] as keyof LoginFields)] = m[2];
      }
      // an interactive host always gets the wizard, args or not
      if (state.interactive) return { handled: true, prompt: loginPrompt(state, fields) };
      if (!Object.keys(fields).length) {
        const p = state.provider;
        return {
          handled: true,
          output: [
            `provider: ${p.provider ?? "openai-compatible"}   model: ${p.model}`,
            `baseUrl: ${p.baseUrl}`,
            `api key: ${p.apiKey ? "set" : "NOT SET — /login to configure"}`,
            `providers: ${availableProviders().join(", ")}`,
          ].join("\n"),
        };
      }
      // a configured profile name switches to it directly — headless
      // multi-provider use needs no wizard. Anything but model= alongside a
      // profile is refused loudly: the profile's credentials live in its table.
      if (fields.provider && state.config?.providers[fields.provider]) {
        if (fields.apiKey || fields.baseUrl) {
          return { handled: true, output: `provider '${fields.provider}' is a saved profile — switch with model= only, or edit its table for the rest` };
        }
        return applyProfileLogin(fields.provider, { model: fields.model }, state);
      }
      return applyLogin(fields, state);
    }

    case "/upgrade": {
      const upgradeTask = (opts: import("./core/upgrade.ts").UpgradeOptions) => async () => {
        const { upgrade } = await import("./core/upgrade.ts");
        const lines: string[] = [];
        const r = await upgrade(opts, (l) => lines.push(l));
        lines.push(r.changed ? `upgraded to v${r.version} — restart fox to run it` : `already on v${r.version}`);
        return lines.join("\n");
      };
      if (arg === "beta") return { handled: true, task: upgradeTask({ beta: true }) };
      if (arg === "list") {
        return {
          handled: true,
          task: async () => {
            const { fetchReleases } = await import("./core/upgrade.ts");
            const rs = await fetchReleases(10);
            if (!rs.length) return "no releases yet";
            return rs.map((r) => `${r.tag}${r.prerelease ? " (beta)" : ""} — ${r.publishedAt}`).join("\n");
          },
        };
      }
      if (arg) return { handled: true, task: upgradeTask({ to: arg }) };
      // bare: the TUI picks a channel, other hosts get the stable default
      if (state.interactive) {
        return {
          handled: true,
          prompt: {
            title: "upgrade fox-agent",
            steps: [
              {
                key: "channel",
                label: "channel",
                kind: "select",
                options: [
                  { value: "stable", label: "latest stable release" },
                  { value: "beta", label: "newest release, betas included" },
                ],
                initial: "stable",
              },
            ],
            run: (answers) => ({ handled: true, task: upgradeTask({ beta: answers.channel === "beta" }) }),
          },
        };
      }
      return { handled: true, task: upgradeTask({}) };
    }

    case "/theme": {
      const apply = (name: string): CommandResult => {
        if (!setTheme(name)) {
          return { handled: true, output: `unknown theme '${name}' — available: ${themeNames().join(", ")}` };
        }
        saveGlobalConfig({ theme: name }, state.configPath);
        return { handled: true, output: `theme: ${name} (saved to global config — repaints live; /reload re-reads the file)` };
      };
      // bare in the TUI: a searchable chooser; repainting is instant, so the
      // user can flip through and watch
      if (!arg && state.interactive) {
        return {
          handled: true,
          prompt: {
            title: `theme — current: ${themeName()}`,
            steps: [
              {
                key: "name",
                label: "theme",
                kind: "select",
                options: themeNames().map((n) => ({ value: n, label: n === themeName() ? `${n} (current)` : n })),
                initial: themeName(),
              },
            ],
            run: (a) => apply(a.name ?? themeName()),
          },
        };
      }
      if (!arg) return { handled: true, output: `theme: ${themeName()}\navailable: ${themeNames().join(", ")}` };
      return apply(arg);
    }

    case "/thinking": {
      // reasoning effort rides in provider.sampling — the providers turn it
      // into the format-specific options (openai reasoningEffort, anthropic
      // thinking budget, google thinkingConfig)
      const EFFORTS = ["low", "medium", "high"];
      const current = () => (state.provider.sampling?.reasoningEffort as string | undefined) ?? state.config?.reasoningEffort ?? "";
      const apply = (effort: string): CommandResult => {
        if (effort && !EFFORTS.includes(effort))
          return { handled: true, output: `unknown effort '${effort}' — use low | medium | high, or 'default' to clear` };
        // clearing drops the live key too — spreading nothing over the old
        // object left the provider receiving the previous effort while the
        // file (and the status readout) already said "provider default"
        if (effort) state.provider.sampling = { ...state.provider.sampling, reasoningEffort: effort };
        else if (state.provider.sampling) {
          const { reasoningEffort: _dropped, ...rest } = state.provider.sampling;
          state.provider.sampling = rest;
        }
        if (state.config) {
          if (effort) state.config.reasoningEffort = effort as "low" | "medium" | "high";
          else delete state.config.reasoningEffort;
        }
        const saved = saveGlobalConfig({ reasoningEffort: effort }, state.configPath);
        return { handled: true, output: `thinking: ${effort || "provider default"} — saved to ${saved}, live now (/reload re-reads it)` };
      };
      if (!arg && state.interactive) {
        const cur = current();
        return {
          handled: true,
          prompt: {
            title: `thinking effort — current: ${cur || "provider default"}`,
            steps: [
              {
                key: "effort",
                label: "effort",
                kind: "select",
                options: [
                  ...EFFORTS.map((e) => ({ value: e, label: e === cur ? `${e} (current)` : e })),
                  { value: "", label: "provider default (clear)" },
                ],
                initial: cur,
              },
            ],
            run: (a) => apply(a.effort ?? ""),
          },
        };
      }
      if (!arg) return { handled: true, output: `thinking: ${current() || "provider default"} — /thinking low|medium|high to change` };
      return apply(arg === "default" || arg === "off" ? "" : arg);
    }

    case "/reload":
      // the host owns the files: the TUI re-runs its boot config path, other
      // hosts just say where the config lives
      if (state.interactive) return { handled: true, reload: true };
      return { handled: true, output: `config reloads in the TUI (and on /new); file: ${state.configPath ?? "global config"}` };

    case "/plugin": {
      // Bare opens the same select-step wizard as /model and /login in the
      // TUI, and prints the list elsewhere. on/off/add/rm/info also run
      // directly; on/off/add/rm reload after the write lands.
      if (!arg) {
        if (state.interactive) return { handled: true, prompt: pluginsPrompt(state) };
        return { handled: true, task: () => pluginListText(state) };
      }
      const [sub, ...words] = arg.split(/\s+/);
      const name = words.join(" ");
      if ((sub === "on" || sub === "off") && name) {
        return { handled: true, task: () => pluginSetEnabled(state, name, sub === "on"), reload: true };
      }
      if (sub === "add") {
        if (name) return { handled: true, task: () => pluginAddPath(state, name), reload: true };
        if (state.interactive) {
          return {
            handled: true,
            prompt: {
              title: "install plugin",
              steps: [{ key: "path", label: "plugin file path", kind: "text", hint: "~ expands; relative to the config dir" }],
              run: (a, s) => {
                const p = (a.path ?? "").trim();
                if (!p) return { handled: true, output: "no path entered" };
                return { handled: true, task: () => pluginAddPath(s, p), reload: true };
              },
            },
          };
        }
        return { handled: true, output: "usage: /plugin add <path>" };
      }
      if (sub === "rm" || sub === "remove" || sub === "uninstall") {
        if (name) return { handled: true, task: () => pluginRemovePath(state, name), reload: true };
        if (state.interactive) return { handled: true, prompt: pluginsPrompt(state) };
        return { handled: true, output: "usage: /plugin rm <name>" };
      }
      if (sub === "info") {
        if (name) return { handled: true, task: () => pluginInfoText(state, name) };
        if (state.interactive) return { handled: true, prompt: pluginsPrompt(state) };
        return { handled: true, output: "usage: /plugin info <name>" };
      }
      return { handled: true, output: "usage: /plugin [on|off|add|rm|info <name>]" };
    }

    case "/settings": {
      // Obscure knobs that have no dedicated command. Bare lists everything
      // with current values; `/settings key=value` sets (validated, saved,
      // applied live); `/settings key` shows one. Setting an empty value
      // resets to the default.
      if (!arg) {
        const st = sty();
        const lines = SETTINGS.map((s) => `${s.key.padEnd(20)} ${settingValue(s, state.config)}`);
        lines.push(st.dim("set: /settings key=value · reset: /settings key= · show: /settings key · saved to global config"));
        return { handled: true, output: lines.join("\n") };
      }
      const eq = arg.indexOf("=");
      const key = (eq >= 0 ? arg.slice(0, eq) : arg).trim();
      const spec = SETTINGS.find((s) => s.key === key);
      if (!spec) return { handled: true, output: `unknown setting '${key}' — settings: ${SETTINGS.map((s) => s.key).join(", ")}` };
      if (eq < 0) return { handled: true, output: `${spec.key} = ${settingValue(spec, state.config)}\n${spec.desc} (default ${spec.def})` };
      const raw = arg.slice(eq + 1).trim();
      try {
        const value = raw ? spec.validate(raw) : (undefined as unknown as string);
        const saved = saveGlobalConfig({ extraSettings: { [spec.key]: value } }, state.configPath);
        if (state.config) (state.config as unknown as Record<string, unknown>)[spec.key] = value;
        applyResultLive(state, spec.key);
        return {
          handled: true,
          output: `${spec.key} = ${value === undefined ? `(default ${spec.def})` : String(value)} — saved to ${saved}, live now (/reload re-reads it)`,
        };
      } catch (e) {
        return { handled: true, output: `${spec.key}: ${(e as Error).message}` };
      }
    }

    case "/exit":
      return { handled: true, exit: true };
    default: {
      // Plugin slash commands run through the same result as built-ins —
      // output floats, newSessionId switches, task runs async work. A
      // read-only viewer gets the same refusal as any writing built-in.
      if (state.readOnly) return { handled: true, output: `${word} is disabled — this session is open elsewhere (read-only view)` };
      const hit = pluginCommands().find((c) => c.name.toLowerCase() === word.toLowerCase());
      if (hit) {
        try {
          return hit.run(arg, { sessionId: state.sessionId, cwd: state.cwd });
        } catch (e) {
          return { handled: true, output: `${word} failed: ${(e as Error).message}` };
        }
      }
      return { handled: true, output: `unknown command ${word} — try /help` };
    }
  }
}

// convenience for plain mode
export function continueLatest(cwd: string): string | undefined {
  return latestSessionFor(cwd)?.id;
}

export { createSession };
