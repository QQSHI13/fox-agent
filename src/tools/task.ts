/**
 * Delegation over ACP.
 *
 * A subagent used to be an in-process child session with a deliberately reduced
 * tool registry. It is now a separate ACP agent — by default another `fox --acp`
 * with the *full* registry, and optionally any agent the user named in
 * `fox.toml` under `[agents.<name>]`. There is no second code path left for
 * "subagent": a child is a real session in a real process, reached through the
 * same protocol an external editor would use, so anything fox can do for a user
 * it can do for its parent.
 *
 * The visible upgrade: the child's updates stream into the parent's event stream
 * as they happen, so the TUI shows the subagent's tool calls live instead of
 * nothing until it finishes.
 */
import { existsSync } from "node:fs";
import { kvGet, kvSet } from "../store/db.ts";
import type { ToolDef } from "../providers/types.ts";
import type { AcpAgentConfig } from "../core/config.ts";
import type { ToolContext, ToolResult } from "./types.ts";
import { fail, ok } from "./types.ts";
import { runAcpAgent } from "../acp/client.ts";

/**
 * How deep delegation may nest.
 *
 * The child is a full fox with `task` in its registry, so without a cap a
 * subagent can spawn a subagent forever — each one a real process burning real
 * requests. The depth travels in the child's environment rather than a closure,
 * because a closure cannot cross a process boundary.
 */
const MAX_DEPTH = 3;
const DEPTH_ENV = "FOX_DELEGATION_DEPTH";

export const taskDef: ToolDef = {
  name: "task",
  description:
    "Delegate a self-contained subtask to a subagent: a separate agent process with its own context window and session, driven over the Agent Client Protocol. It has the same full tool access you do and cannot see this conversation, so give it complete standalone instructions. Returns its final report.",
  parameters: {
    type: "object",
    properties: {
      description: { type: "string", description: "One-line label shown in the UI" },
      prompt: { type: "string", description: "Complete, standalone instructions for the subagent" },
      agent: {
        type: "string",
        description: 'Which agent to delegate to: "default" (another fox) or a name configured in fox.toml [agents.*]',
      },
    },
    required: ["description", "prompt"],
  },
};

/**
 * How to re-launch this fox as an ACP server.
 *
 * Compiled and from-source runs need opposite halves of the same pair. In a
 * `bun build --compile` binary `process.execPath` IS fox and `Bun.main` is a
 * virtual `/$bunfs/root/...` path that no process can execute; running from
 * source it is the other way around — `execPath` is bun and `Bun.main` is
 * `src/cli.ts`. Probed both, rather than assumed.
 */
export function selfAgent(): AcpAgentConfig {
  const main = Bun.main;
  const compiled = main.startsWith("/$bunfs/") || !existsSync(main);
  return compiled ? { command: process.execPath, args: ["--acp"] } : { command: process.execPath, args: [main, "--acp"] };
}

function resolveAgent(name: string | undefined, agents: Record<string, AcpAgentConfig>): AcpAgentConfig | string {
  if (!name || name === "default") return selfAgent();
  const hit = agents[name];
  if (hit) return hit;
  const known = ["default", ...Object.keys(agents)].join(", ");
  return `error: unknown agent "${name}" — configure it in fox.toml under [agents.${name}], or use one of: ${known}`;
}

export async function taskRun(
  args: { description?: string; prompt?: string; agent?: string },
  ctx: ToolContext,
): Promise<ToolResult> {
  if (!args.prompt?.trim()) return fail("error: task needs prompt");
  if (!args.description?.trim()) return fail("error: task needs description");

  const depth = Number(process.env[DEPTH_ENV] ?? 0) || 0;
  if (depth >= MAX_DEPTH) return fail(`error: delegation depth limit (${MAX_DEPTH}) reached — do this subtask yourself`);

  const spec = resolveAgent(args.agent, ctx.agents ?? {});
  if (typeof spec === "string") return fail(spec);

  const children = kvGet<string[]>(ctx.sessionId, "children") ?? [];
  const label = args.description.trim();
  // ACP sends the tool's name on `tool_call` and only the id on
  // `tool_call_update`, so the name has to be remembered across the two. Without
  // this the parent's UI reports raw call ids ("c1") for the child's work.
  const names = new Map<string, string>();
  try {
    const res = await runAcpAgent({
      ...spec,
      cwd: ctx.cwd,
      prompt: args.prompt,
      signal: ctx.signal,
      env: { ...spec.env, [DEPTH_ENV]: String(depth + 1) },
      // Forward the child's tool activity into the parent's stream so its work is
      // visible while it happens. Text is deliberately not forwarded: it is this
      // tool's return value, and echoing it live would report it twice.
      onUpdate: ctx.emit
        ? (u) => {
            if (u.sessionUpdate === "tool_call") {
              const name = u.name ?? u.title;
              names.set(u.toolCallId, name);
              ctx.emit?.({ type: "child_tool", session: label, name, done: false, ok: true });
            } else if (u.sessionUpdate === "tool_call_update" && (u.status === "completed" || u.status === "failed")) {
              ctx.emit?.({
                type: "child_tool",
                session: label,
                name: names.get(u.toolCallId) ?? u.title ?? u.toolCallId,
                done: true,
                ok: u.status === "completed",
              });
            }
          }
        : undefined,
    });

    kvSet(ctx.sessionId, "children", [...children, res.sessionId]);

    if (res.stopReason === "cancelled") return fail(`error: subagent cancelled${res.text ? `\n\n${res.text}` : ""}`);
    const text = res.text.trim();
    return ok(text ? `${text}\n\n[subagent session ${res.sessionId}]` : `[subagent ${res.sessionId} finished without a final message]`);
  } catch (e) {
    return fail(`error: subagent failed: ${(e as Error).message}`);
  }
}
