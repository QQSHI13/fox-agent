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
import { saveGlobalConfig, resolveValue, type Config } from "./core/config.ts";
import { setTheme, themeName, themeNames } from "./tui/themes.ts";
import { availableProviders } from "./providers/index.ts";
import { ensureFreshCatalog, presetById, providerPresets } from "./providers/modelsdev.ts";
import type { UiStep } from "./core/ui.ts";

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
}

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
  { name: "/todos", desc: "show agent todo list" },
  { name: "/usage", desc: "token totals + budget" },
  { name: "/model", desc: "show or switch model — picker lists every configured profile and catalog model", usage: "[profile/][name]", arg: true },
  { name: "/theme", desc: "show or switch the color theme", usage: "[name]", arg: true, help: "bare: searchable chooser in the TUI; with a name, switches and saves to the global config" },
  { name: "/reload", desc: "re-read config files and re-apply model, theme, caps and plugins" },
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
  return scored.sort((a, b) => a.rank - b.rank || a.c.name.length - b.c.name.length).map((s) => s.c);
}

/** Are all of `q`'s characters present in `s`, in order? (fuzzy match) */
function isSubsequence(q: string, s: string): boolean {
  if (!q) return true;
  let i = 0;
  for (const ch of s) if (ch === q[i] && ++i === q.length) return true;
  return false;
}

/** The `/help` text, generated from COMMANDS so it cannot drift from them. */
export function helpText(): string {
  const left = COMMANDS.map((c) => `${c.name}${c.usage ? ` ${c.usage}` : ""}`);
  const w = Math.max(...left.map((s) => s.length));
  return COMMANDS.map((c, i) => `${left[i].padEnd(w)}  ${c.help ?? c.desc}`).join("\n");
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

/** The printed list, for `/sessions` outside the TUI and for `fox ls`. */
export function formatSessionList(items: SessionListItem[]): string {
  if (!items.length) return "(no sessions)";
  return items
    .map(
      (it) =>
        `${it.current ? "*" : " "}${String(it.index).padStart(2)}  ${it.id}  ${relTime(it.updatedAt).padStart(3)} ago  ${
          String(it.tokens).padStart(7)
        } tok  ${it.model.padEnd(20)} ${it.label}${it.preview ? `  » ${it.preview.slice(0, 60)}` : ""}`,
    )
    .join("\n");
}

/**
 * Accept either a session id or a 1-based index into `/sessions`, returning null
 * if neither resolves. Shared so `/sessions <n>`, `/delete <n>` and `fox -c <n>`
 * cannot disagree about what "2" means — a mismatch there would delete or resume
 * a different session than the one the list showed. Both resolve against the same
 * recency-ordered list the picker shows.
 */
export function resolveSessionArg(arg: string): string | null {
  const n = Number(arg);
  if (Number.isInteger(n) && n >= 1) return listSessions(50)[n - 1]?.id ?? null;
  return getSession(arg) ? arg : null;
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
    baseUrl,
    model: t.model,
    apiKey,
    headers: t.headers ?? (sameEndpoint ? state.provider.headers : undefined),
    sampling: t.sampling,
  };
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
  if (v.startsWith("m:")) return { model: v.slice(2) };
  if (v.startsWith("p:") || v.startsWith("x:")) {
    const i = v.indexOf(":", 2);
    return parseModelArg(`${v.slice(2, i)}/${v.slice(i + 1)}`, state);
  }
  if (v.startsWith("c:")) {
    const custom = (a.custom ?? "").trim();
    if (!custom) return { model: "", error: "no model id entered" };
    const rest = v.slice(2);
    if (!rest) return { model: custom };
    if (rest.startsWith("p:")) return { ...parseModelArg(`${rest.slice(2)}/${custom}`, state) };
    if (rest.startsWith("x:")) return { ...parseModelArg(`${rest.slice(2)}/${custom}`, state) };
  }
  return { model: "", error: `unrecognized selection '${v}'` };
}

/**
 * The interactive `/model`: a searchable select over every configured profile's
 * models and the whole models.dev catalog — each labeled with its provider so a
 * cross-provider switch is one pick, not a /login. Custom entries cover models
 * the endpoint does not advertise.
 */
function modelPrompt(state: HarnessState): PromptRequest {
  ensureFreshCatalog();
  const cur = state.provider.model;
  const options: { value: string; label: string }[] = [{ value: `m:${cur}`, label: `${cur} (current)` }];
  for (const [name, p] of Object.entries(state.config?.providers ?? {})) {
    for (const m of p.models) {
      if (m.disabled) continue;
      const ctx = m.contextWindow ? ` — ${Math.round(m.contextWindow / 1000)}k` : "";
      options.push({ value: `p:${name}:${m.id}`, label: `${name} · ${m.name ?? m.id}${m.name && m.name !== m.id ? ` (${m.id})` : ""}${ctx}` });
    }
    options.push({ value: `c:p:${name}`, label: `＋ ${name} · custom model…` });
  }
  for (const preset of providerPresets()) {
    for (const m of preset.models) {
      const ctx = m.context ? ` — ${Math.round(m.context / 1000)}k` : "";
      options.push({ value: `x:${preset.id}:${m.id}`, label: `${preset.name} · ${m.id}${ctx}` });
    }
    options.push({ value: `c:x:${preset.id}`, label: `＋ ${preset.name} · custom model…` });
  }
  options.push({ value: "c:", label: "＋ custom model on the current provider…" });
  return {
    title: "switch model (persists to session + global config)",
    steps: [
      { key: "model", label: "model — type to search", kind: "select", options, initial: `m:${cur}` },
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
  // A preset id (tokenguard, openrouter, …) expands to its provider format,
  // default endpoint and conventional env key before validation.
  if (fields.provider && !availableProviders().includes(fields.provider)) {
    const preset = presetById(fields.provider);
    if (preset) {
      fields.provider = preset.format;
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
  if (fields.provider && !availableProviders().includes(fields.provider)) {
    return { handled: true, output: `unknown provider "${fields.provider}" — available: ${availableProviders().join(", ")}, or a /login preset` };
  }
  const path = saveGlobalConfig(fields, state.configPath);
  // take effect immediately — the point is not having to restart
  if (fields.provider) state.provider.provider = fields.provider;
  if (fields.apiKey) state.provider.apiKey = fields.apiKey;
  if (fields.baseUrl) state.provider.baseUrl = fields.baseUrl;
  if (fields.model) {
    state.provider.model = fields.model;
    setSessionModel(state.sessionId, fields.model);
  }
  if (state.config) {
    if (fields.provider) state.config.provider = fields.provider;
    if (fields.apiKey) state.config.apiKey = fields.apiKey;
    if (fields.baseUrl) state.config.baseUrl = fields.baseUrl;
    if (fields.model) state.config.model = fields.model;
  }
  return { handled: true, output: `saved to ${path} — active immediately (/reload re-reads the file)` };
}

/**
 * The `/login` wizard for interactive hosts: ask, don't make them read /help.
 * kv args from the command line prefill the steps, so `/login provider=google`
 * still lands in the wizard with that choice already made.
 *
 * Provider choices come from the models.dev catalog (cached, refreshed in the
 * background) plus local presets like tokenguard; picking one prefills the
 * endpoint, names the env var an empty key falls back to, and turns the model
 * step into a list of what that provider actually serves.
 */
function loginPrompt(state: HarnessState, pre: LoginFields = {}): PromptRequest {
  const p = state.provider;
  ensureFreshCatalog();
  const presets = providerPresets();
  // which preset does the current config most look like? An exact endpoint
  // match first (tokenguard's local URL, openrouter, …), then the canonical
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
  return {
    title: "login — leave a field empty to keep the current value",
    steps: [
      {
        key: "provider",
        label: "provider",
        kind: "select",
        options: [
          ...presets.map((x) => ({ value: x.id, label: x.api ? `${x.name} — ${x.api}` : x.name })),
          { value: "custom", label: "custom (any provider format fox-agent speaks)" },
        ],
        initial: pre.provider ?? currentPreset,
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
      },
      {
        key: "baseUrl",
        label: "base url",
        kind: "text",
        initial: (a) => pre.baseUrl ?? presetOf(a)?.api ?? p.baseUrl,
        hint: "empty = keep current",
      },
      {
        key: "model",
        label: "model",
        kind: "select",
        options: (a) => {
          const models = presetOf(a)?.models ?? [];
          const opts = models.map((m) => ({
            value: m.id,
            label: m.context ? `${m.id} (${Math.round(m.context / 1000)}k ctx)` : m.id,
          }));
          return [...opts, { value: "__custom", label: "✎ type a model id…" }];
        },
        initial: (a) => {
          const cur = pre.model ?? p.model;
          const models = presetOf(a)?.models ?? [];
          return models.some((m) => m.id === cur) ? cur : "__custom";
        },
      },
      {
        key: "modelCustom",
        label: "model id",
        kind: "text",
        allowEmpty: true,
        initial: pre.model ?? p.model,
        hint: "only if you picked “type a model id”",
      },
    ],
    run: (answers, s) => {
      // "custom" means an arbitrary openai-compatible endpoint; other formats
      // can still be named explicitly via kv args (/login provider=anthropic …)
      const fields: LoginFields = { provider: answers.provider === "custom" ? "openai-compatible" : answers.provider };
      for (const k of ["apiKey", "baseUrl"] as const) {
        const v = answers[k]?.trim();
        if (v) fields[k] = v;
      }
      const model = answers.model === "__custom" ? answers.modelCustom?.trim() : answers.model;
      if (model) fields.model = model;
      // kv args the user left untouched in the wizard still count as entered
      if (pre.apiKey && !fields.apiKey) fields.apiKey = pre.apiKey;
      if (pre.model && !fields.model) fields.model = pre.model;
      return applyLogin(fields, s);
    },
  };
}

export function runSlashCommand(input: string, state: HarnessState): CommandResult | null {
  if (!input.startsWith("/")) return null;
  const [word, ...rest] = input.trim().split(/\s+/);
  const spec = findCommand(word.toLowerCase());
  const arg = rest.join(" ").trim();

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
        const id = resolveSessionArg(arg);
        if (!id) {
          const n = Number(arg);
          return {
            handled: true,
            output: Number.isInteger(n) && n >= 1 ? `no session at index ${n}` : `unknown session ${arg}`,
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
            run: (a, s) => runSlashCommand(`/fork ${a.at?.trim() ?? ""}`, s) ?? { handled: true },
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
          const id = resolveSessionArg(arg);
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
      const id = resolveSessionArg(target);
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

    case "/todos": {
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
      if (!arg) return { handled: true, output: `model: ${state.provider.model} · provider ${state.provider.provider ?? "openai-compatible"}` };
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

    case "/reload":
      // the host owns the files: the TUI re-runs its boot config path, other
      // hosts just say where the config lives
      if (state.interactive) return { handled: true, reload: true };
      return { handled: true, output: `config reloads in the TUI (and on /new); file: ${state.configPath ?? "global config"}` };

    case "/exit":
      return { handled: true, exit: true };
    default:
      return { handled: true, output: `unknown command ${word} — try /help` };
  }
}

// convenience for plain mode
export function continueLatest(cwd: string): string | undefined {
  return latestSessionFor(cwd)?.id;
}

export { createSession };
