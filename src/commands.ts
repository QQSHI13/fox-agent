import {
  allOps,
  createSession,
  forkSession,
  getMessage,
  getSession,
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

export interface HarnessState {
  sessionId: string;
  cwd: string;
  provider: ProviderConfig;
  config?: Config;
}

export interface CommandResult {
  handled: true;
  output?: string;
  newSessionId?: string;
  exit?: boolean;
}

export const COMMANDS = [
  { name: "/help", desc: "show commands" },
  { name: "/new", desc: "start a fresh session" },
  { name: "/sessions", desc: "list sessions" },
  { name: "/resume", desc: "resume session by id or index" },
  { name: "/fork", desc: "fork current session at [mN] (default: tip)" },
  { name: "/undo", desc: "revert last ctx_edit op (append-only)" },
  { name: "/prune", desc: "delete hidden context for good + VACUUM (needs 'yes')" },
  { name: "/ops", desc: "show context surgery ops" },
  { name: "/view", desc: "preview visible nodes" },
  { name: "/todos", desc: "show agent todo list" },
  { name: "/usage", desc: "token totals + budget" },
  { name: "/model", desc: "show or switch model (persists to session)" },
  { name: "/exit", desc: "quit fox" },
];

export const SLASH_HELP = `/help              this list
/new               start a fresh session
/sessions          list sessions
/resume <id|n>     resume session by id or list index
/fork [mN]         fork this session up to marker mN into a new one
/undo              revert the last ctx_edit op (log stays append-only)
/prune [yes]       report reclaimable disk; "/prune yes" deletes hidden context + VACUUM
/ops               show pending context surgery ops
/view              show visible nodes ([mN] role preview)
/todos             show the agent todo list
/usage             token totals for this session
/model [name]      show or switch model (persists to the session row)
/exit              quit`;

export function runSlashCommand(input: string, state: HarnessState): CommandResult | null {
  if (!input.startsWith("/")) return null;
  const [cmd, ...rest] = input.slice(1).split(/\s+/);
  const arg = rest.join(" ").trim();

  switch (cmd) {
    case "help":
    case "?":
      return { handled: true, output: SLASH_HELP };

    case "new": {
      const s = createSession(state.cwd, state.provider.model);
      return { handled: true, newSessionId: s.id, output: `new session ${s.id}` };
    }

    case "sessions":
    case "ls": {
      const rows = listSessions().map((s, i) => {
        const u = sessionUsage(s.id);
        return `${String(i + 1).padStart(2)}  ${s.id}  ${new Date(s.created_at).toLocaleString()}  ${u.prompt + u.completion} tok  ${s.title ?? s.cwd}`;
      });
      return { handled: true, output: rows.join("\n") || "(no sessions)" };
    }

    case "resume": {
      let id = arg;
      if (!arg) return { handled: true, output: "usage: /resume <id|list-index>" };
      const n = Number(arg);
      if (Number.isInteger(n) && n >= 1) {
        const rows = listSessions();
        if (!rows[n - 1]) return { handled: true, output: `no session at index ${n}` };
        id = rows[n - 1].id;
      }
      if (!getSession(id)) return { handled: true, output: `unknown session ${id}` };
      return { handled: true, newSessionId: id, output: `resumed ${id}` };
    }

    case "fork": {
      let upto: number | undefined;
      if (arg) {
        const m = /^m?(\d+)$/.exec(arg);
        if (!m) return { handled: true, output: "usage: /fork [mN]" };
        upto = Number(m[1]);
        if (!getMessage(state.sessionId, upto)) return { handled: true, output: `no message m${upto}` };
      }
      const fork = forkSession(state.sessionId, upto);
      if (!fork) return { handled: true, output: "fork failed" };
      return { handled: true, newSessionId: fork.id, output: `forked -> ${fork.id}` };
    }

    case "undo": {
      const msg = undoLastOp(state.sessionId);
      return { handled: true, output: msg ? `undid: ${msg}` : "nothing to undo" };
    }

    case "prune": {
      // two-step rather than an interactive prompt: this runs identically in the
      // TUI, plain mode and -p, none of which can block on a keypress here
      if (arg && arg !== "yes") return { handled: true, output: 'usage: /prune  (report only)  |  /prune yes  (do it)' };
      const report = pruneSession(state.sessionId, { dryRun: arg !== "yes" });
      return { handled: true, output: formatPruneReport(report) };
    }

    case "ops": {
      const ops = allOps(state.sessionId);
      return {
        handled: true,
        output: ops.length ? ops.map((o, i) => `${i + 1}. ${o.kind} ${o.payload.slice(0, 110)}`).join("\n") : "(no ops)",
      };
    }

    case "view": {
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

    case "todos": {
      const todos = getTodos(state.sessionId);
      return { handled: true, output: todos?.length ? renderTodos(todos) : "(no todos)" };
    }

    case "usage": {
      const u = sessionUsage(state.sessionId);
      const nodes = projectView(state.sessionId);
      const b = checkBudget(state.sessionId, state.provider.model, 0, state.config?.compactAt);
      const pct = Math.round(b.ratio * 100);
      return {
        handled: true,
        output: `prompt ${u.prompt} + completion ${u.completion} = ${u.prompt + u.completion} tok billed\nview: ${
          nodes.filter((n) => !n.deleted).length
        }/${nodes.length} nodes visible, ~${b.estimated}/${b.limit} est tok (${pct}%)${b.over ? " — over compaction threshold" : ""}`,
      };
    }

    case "model": {
      if (!arg) return { handled: true, output: `model: ${state.provider.model}` };
      state.provider.model = arg;
      // persist, or /resume would silently snap back to the old model
      setSessionModel(state.sessionId, arg);
      return { handled: true, output: `model switched to ${arg}` };
    }

    case "exit":
    case "quit":
      return { handled: true, exit: true };

    default:
      return { handled: true, output: `unknown command /${cmd} — try /help` };
  }
}

// convenience for plain mode
export function continueLatest(cwd: string): string | undefined {
  return latestSessionFor(cwd)?.id;
}

export { createSession };
