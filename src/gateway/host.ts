/**
 * The host API an ON-DISK plugin talks to.
 *
 * A plugin is a separate program on disk: it cannot `import` fox-agent's
 * internals (a compiled binary has no `src/` beside it), so the host publishes
 * the capabilities a plugin may use on `globalThis.foxHost` before any plugin
 * runs. A plugin reads what it needs from there — the session store, the turn
 * engine, the provider config — and stays independent of the harness's file
 * layout.
 *
 * This is the plugin/host boundary in one place: everything a plugin can reach
 * is listed in `FoxHostApi` below.
 */
import { listSessions, getSession, allMessagesLite, createSession, appendMessage } from "../store/db.ts";
import { runTurnCore } from "../loop/turn.ts";
import { resolveChat } from "../providers/index.ts";
import { VERSION } from "../core/version.ts";
import { debugAt, debugLogPath, type DebugCategory, type DebugLevel } from "../core/debuglog.ts";
import { readFileSync } from "node:fs";
import { COMMANDS, runSlashCommand, type HarnessState } from "../commands.ts";
import type { Config } from "../core/config.ts";
import type { ProviderConfig } from "../providers/types.ts";
import type { AgentEvent } from "../core/events.ts";

export interface FoxHostApi {
  version: string;
  /** the host's config and provider (what the plugin would otherwise build) */
  config: Config;
  provider: ProviderConfig;
  /** the session store */
  sessions: {
    list(limit?: number): { id: string; title: string | null; cwd: string; model: string; updated_at: number }[];
    get(id: string): { id: string; title: string | null; cwd: string; model: string; updated_at: number } | null;
    messages(id: string): { role: string; content: string; seq: number }[];
    create(cwd?: string): { id: string };
  };
  /** run one turn, yielding the same events the TUI renders */
  turn(sessionId: string, prompt: string, signal?: AbortSignal): AsyncGenerator<AgentEvent>;
  /**
   * The slash-command surface — the SAME commands the TUI offers (/model,
   * /sessions, /delete, /prune, /undo, /ops, /todo, /usage, /view, …). A plugin
   * (the gateway) gets the whole surface for free instead of reimplementing it.
   */
  commands: {
    /** the command list, for hints and autocomplete */
    list(): { name: string; desc: string; usage?: string; arg?: boolean }[];
    /** run one against a session; returns what the TUI would show */
    run(sessionId: string, input: string): Promise<{ output?: string; newSessionId?: string; handled: boolean }>;
  };
  /** the chat function the host would use (so a plugin can talk to the model) */
  chat: typeof resolveChat;
  /**
   * The host's debug log — a plugin writes through the host so its entries land
   * in the same file, with the same levels and categories, and honour the same
   * verbosity the user set (-d/-dd/-ddd).
   */
  debug: {
    at(level: DebugLevel, category: DebugCategory, message: string, detail?: unknown): void;
    info(category: DebugCategory, message: string, detail?: unknown): void;
    warn(category: DebugCategory, message: string, detail?: unknown): void;
    error(category: DebugCategory, message: string, detail?: unknown): void;
    /** where the log lives — a plugin shows it so the user can find it */
    path(): string;
    /** the last N lines of the log (a debug panel's content) */
    tail(lines?: number): string;
  };
}

declare global {
  // eslint-disable-next-line no-var
  var foxHost: FoxHostApi | undefined;
}

/**
 * Publish the host API. Called once by the CLI before any plugin can run, so
 * an on-disk plugin has the same access a bundled one gets.
 */
export function installHostApi(config: Config, provider: ProviderConfig): FoxHostApi {
  const api: FoxHostApi = {
    version: VERSION,
    config,
    provider,
    sessions: {
      list: (limit = 100) =>
        listSessions(limit).map((s) => ({ id: s.id, title: s.title, cwd: s.cwd, model: s.model, updated_at: s.updated_at })),
      get: (id) => {
        const s = getSession(id);
        return s ? { id: s.id, title: s.title, cwd: s.cwd, model: s.model, updated_at: s.updated_at } : null;
      },
      messages: (id) => (getSession(id) ? allMessagesLite(id).map((m) => ({ role: m.role, content: m.content, seq: m.seq })) : []),
      create: (cwd) => {
        const s = createSession(cwd ?? process.cwd(), provider.model);
        return { id: s.id };
      },
    },
    turn: (sessionId, prompt, signal) =>
      runTurnCore(sessionId, provider, prompt, signal, {
        maxSteps: config.maxSteps,
        retryLimit: config.retryLimit,
        compactAt: config.compactAt,
        projectInstructions: config.projectInstructions,
        config,
        chat: resolveChat,
      }),
    commands: {
      list: () => COMMANDS.map((c) => ({ name: c.name, desc: c.desc, usage: c.usage, arg: c.arg })),
      run: async (sessionId, input) => {
        // The TUI's OWN command runner, against a state scoped to this session.
        // A plugin (the gateway) therefore gets /model, /sessions, /delete,
        // /prune, /undo, /ops, /todo, /usage, /view … for free — the same code
        // the TUI runs, not a reimplementation that can drift.
        const s = getSession(sessionId);
        const state: HarnessState = {
          sessionId,
          cwd: s?.cwd ?? process.cwd(),
          provider,
          config,
          configPath: undefined,
          // NOT interactive: a picker/prompt would block a headless host, so
          // those commands take their printed/argument form instead.
          interactive: false,
        };
        const res = runSlashCommand(input, state);
        if (!res) return { handled: false };
        return { handled: true, output: res.output, newSessionId: res.newSessionId };
      },
    },
    chat: resolveChat,
    debug: {
      at: (level, category, message, detail) => debugAt(level, category, message, detail),
      info: (category, message, detail) => debugAt("info", category, message, detail),
      warn: (category, message, detail) => debugAt("warn", category, message, detail),
      error: (category, message, detail) => debugAt("error", category, message, detail),
      path: () => debugLogPath(),
      tail: (n = 60) => {
        try {
          const lines = readFileSync(debugLogPath(), "utf8").trimEnd().split("\n");
          return lines.slice(-n).join("\n");
        } catch {
          return "(no log yet)";
        }
      },
    },
  };
  globalThis.foxHost = api;
  return api;
}
