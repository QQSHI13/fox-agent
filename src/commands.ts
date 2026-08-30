import {
  allOps,
  createSession,
  deleteSession,
  forkSession,
  getMessage,
  getSession,
  kvGet,
  latestSessionFor,
  listSessions,
  sessionUsage,
  setSessionModel,
  undoLastOp,
} from "./store/db.ts";
import { projectView } from "./context/view.ts";
import { formatPruneReport, pruneSession } from "./store/prune.ts";
import { viewTokenEstimate } from "./context/render.ts";
import { checkBudget } from "./context/budget.ts";
import type { ProviderConfig } from "./providers/types.ts";
import { renderTodos, getTodos } from "./tools/todo.ts";
import type { Config } from "./core/config.ts";
import { saveGlobalConfig } from "./core/config.ts";
import { availableProviders } from "./providers/index.ts";
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
  { name: "/model", desc: "show or switch model (persists to session)", usage: "[name]", arg: true },
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
  updatedAt: number;
  current: boolean;
}

/**
 * The session list, most recently worked in first, as data.
 *
 * `sessionUsage` opens each session's database, so this is the one call that
 * puts real pressure on the store's handle cache — see `pinSession`, which is
 * what keeps the live session's handle from being the one evicted here.
 */
export function sessionList(opts: { currentId?: string; cwd?: string; limit?: number } = {}): SessionListItem[] {
  return listSessions(opts.limit ?? 50, opts.cwd).map((s, i) => {
    const u = sessionUsage(s.id);
    return {
      index: i + 1,
      id: s.id,
      label: s.title ?? s.cwd,
      title: s.title,
      cwd: s.cwd,
      model: s.model,
      tokens: u.prompt + u.completion,
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
        } tok  ${it.model.padEnd(20)} ${it.label}`,
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

/**
 * Persist login fields to the global config and activate them on the live
 * state — shared by `/login key=value…` and the interactive wizard, so the two
 * cannot drift apart on what "save and apply" means.
 */
function applyLogin(fields: LoginFields, state: HarnessState): CommandResult {
  if (fields.provider && !availableProviders().includes(fields.provider)) {
    return { handled: true, output: `unknown provider "${fields.provider}" — available: ${availableProviders().join(", ")}` };
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
  return { handled: true, output: `saved to ${path} — active immediately` };
}

/**
 * The `/login` wizard for interactive hosts: ask, don't make them read /help.
 * kv args from the command line prefill the steps, so `/login provider=google`
 * still lands in the wizard with that choice already made.
 */
function loginPrompt(state: HarnessState, pre: LoginFields = {}): PromptRequest {
  const p = state.provider;
  return {
    title: "login — leave a field empty to keep the current value",
    steps: [
      {
        key: "provider",
        label: "provider",
        kind: "select",
        options: availableProviders().map((v) => ({ value: v, label: v })),
        initial: pre.provider ?? p.provider ?? "openai-compatible",
      },
      { key: "apiKey", label: "api key", kind: "text", secret: true, hint: "empty = keep current" },
      { key: "baseUrl", label: "base url", kind: "text", initial: pre.baseUrl ?? p.baseUrl, hint: "empty = keep current" },
      { key: "model", label: "model", kind: "text", initial: pre.model ?? p.model, hint: "empty = keep current" },
    ],
    run: (answers, s) => {
      // the select always yields a provider; empty text answers mean "keep"
      const fields: LoginFields = { provider: answers.provider };
      for (const k of ["apiKey", "baseUrl", "model"] as const) {
        const v = answers[k]?.trim();
        if (v) fields[k] = v;
      }
      // kv args the user left untouched in the wizard still count as entered
      if (pre.apiKey && !fields.apiKey) fields.apiKey = pre.apiKey;
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
      return { handled: true, newSessionId: s.id, output: `new session ${s.id}` };
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
      return { handled: true, output: formatSessionList(sessionList({ currentId: state.sessionId })) };
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
      // provider-reported only: totals accumulate from each call's usage event
      // (kv in the session file), and the live window figure is the last
      // request's billed prompt size. No estimates — a number we invented is
      // worse than no number.
      const t = kvGet<{ prompt: number; completion: number }>(state.sessionId, "usage") ?? { prompt: 0, completion: 0 };
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
      if (!arg && state.interactive) {
        return {
          handled: true,
          prompt: {
            title: "switch model (persists to this session)",
            steps: [{ key: "model", label: "model", kind: "text", initial: state.provider.model, allowEmpty: false }],
            run: (a, s) => runSlashCommand(`/model ${a.model.trim()}`, s) ?? { handled: true },
          },
        };
      }
      if (!arg) return { handled: true, output: `model: ${state.provider.model}` };
      state.provider.model = arg;
      // persist, or reopening the session would silently snap back to the old model
      setSessionModel(state.sessionId, arg);
      return { handled: true, output: `model switched to ${arg}` };
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
