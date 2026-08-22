import {
  allOps,
  appendMessage,
  createSession,
  getSession,
  latestSessionFor,
  listSessions,
  sessionUsage,
  undoLastOp,
} from "./store/db.ts";
import { projectView, viewTokenEstimate } from "./loop/context.ts";
import type { ProviderConfig } from "./provider/openai.ts";

export interface HarnessState {
  sessionId: string;
  cwd: string;
  provider: ProviderConfig;
}

export interface CommandResult {
  handled: true;
  output?: string;
  newSessionId?: string;
  exit?: boolean;
}

export const SLASH_HELP = `/help              this list
/new               start a fresh session
/sessions          list sessions
/resume <id|n>     resume session by id or list index
/undo              revert the last ctx_edit op
/ops               show pending context surgery ops
/view              show visible nodes ([mN] role preview)
/usage             token totals for this session
/model [name]      show or switch model (runtime only)
/exit              quit`;

export function runSlashCommand(
  input: string,
  state: HarnessState,
): CommandResult | null {
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
      const n = Number(arg);
      if (!arg && !Number.isNaN(n)) return { handled: true, output: "usage: /resume <id|list-index>" };
      if (Number.isInteger(n) && n >= 1) {
        const rows = listSessions();
        if (!rows[n - 1]) return { handled: true, output: `no session at index ${n}` };
        id = rows[n - 1].id;
      }
      if (!getSession(id)) return { handled: true, output: `unknown session ${id}` };
      return { handled: true, newSessionId: id, output: `resumed ${id}` };
    }

    case "undo":
      return { handled: true, output: undoLastOp(state.sessionId) ? "undid last op" : "nothing to undo" };

    case "ops": {
      const ops = allOps(state.sessionId);
      return { handled: true, output: ops.length ? ops.map((o, i) => `${i + 1}. ${JSON.stringify(o).slice(0, 120)}`).join("\n") : "(no ops)" };
    }

    case "view": {
      const nodes = projectView(state.sessionId);
      const lines = nodes
        .filter((n) => !n.deleted)
        .slice(-30)
        .map((n) => `[m${n.msg.seq}] ${n.msg.role.padEnd(9)} ${n.content.replace(/\n/g, " ").slice(0, 70)}`);
      const est = viewTokenEstimate(nodes);
      return { handled: true, output: `(last 30 visible of ${nodes.filter((n) => !n.deleted).length}; ~${est} est tok)\n${lines.join("\n")}` };
    }

    case "usage": {
      const u = sessionUsage(state.sessionId);
      const nodes = projectView(state.sessionId);
      return {
        handled: true,
        output: `prompt ${u.prompt} + completion ${u.completion} = ${u.prompt + u.completion} tok\nview: ${nodes.filter((n) => !n.deleted).length}/${nodes.length} nodes visible, ~${viewTokenEstimate(nodes)} est tok in window`,
      };
    }

    case "model": {
      if (!arg) return { handled: true, output: `model: ${state.provider.model}` };
      state.provider.model = arg;
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
