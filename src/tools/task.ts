/**
 * Delegation: a subagent is a real agent reached over a real protocol.
 *
 * A subagent used to be an in-process child session with a deliberately reduced
 * tool registry. It is now a separate agent — by default another `fox --acp`
 * child with the *full* registry, and optionally any agent the user named in
 * `fox-agent.toml` under `[agents.<name>]`. The protocol follows the entry's
 * shape: `command` spawns a child and speaks ACP, `url` reaches a running agent
 * over HTTP and speaks A2A. There is no second code path left for "subagent":
 * a child is a real session in a real process (or a real service), reached
 * through the same protocols external tools use, so anything fox-agent can do
 * for a user it can do for its parent.
 *
 * The visible upgrade on ACP: the child's updates stream into the parent's
 * event stream as they happen, so the TUI shows the subagent's tool calls live
 * instead of nothing until it finishes. A2A agents that implement
 * `message/stream` (SSE) report state transitions the same way; servers
 * without it fall back to polling and only the final report arrives.
 */
import { existsSync } from "node:fs";
import { kvGet, kvSet } from "../store/db.ts";
import type { ToolDef } from "../providers/types.ts";
import type { ExternalAgentConfig } from "../core/config.ts";
import type { ToolContext, ToolResult } from "./types.ts";
import { fail, ok } from "./types.ts";

/**
 * How deep delegation may nest.
 *
 * The child is a full fox-agent with `task` in its registry, so without a cap a
 * subagent can spawn a subagent forever — each one a real process burning real
 * requests. The depth travels in the child's environment rather than a closure,
 * because a closure cannot cross a process boundary.
 */
const MAX_DEPTH = 3;
const DEPTH_ENV = "FOX_AGENT_DELEGATION_DEPTH";

export const taskDef: ToolDef = {
  name: "task",
  description:
    "Delegate a self-contained subtask to a subagent: a separate agent with its own context window and session — a spawned child process spoken to over ACP, or a remote agent at a configured url spoken to over A2A. It has the same full tool access you do and cannot see this conversation, so give it complete standalone instructions. Returns its final report.",
  parameters: {
    type: "object",
    properties: {
      description: { type: "string", description: "One-line label shown in the UI" },
      prompt: { type: "string", description: "Complete, standalone instructions for the subagent" },
      agent: {
        type: "string",
        description: 'Which agent to delegate to: "default" (another fox-agent) or a name configured in fox-agent.toml [agents.*] (an ACP command or an A2A url)',
      },
    },
    required: ["description", "prompt"],
  },
};

/**
 * How to re-launch this fox-agent as an ACP server.
 *
 * Compiled and from-source runs need opposite halves of the same pair. In a
 * `bun build --compile` binary `process.execPath` IS fox-agent and `Bun.main` is a
 * virtual `/$bunfs/root/...` path that no process can execute; running from
 * source it is the other way around — `execPath` is bun and `Bun.main` is
 * `src/cli.ts`. Probed both, rather than assumed.
 */
export function selfAgent(): ExternalAgentConfig {
  const main = Bun.main;
  const compiled = main.startsWith("/$bunfs/") || !existsSync(main);
  return compiled ? { command: process.execPath, args: ["--acp"] } : { command: process.execPath, args: [main, "--acp"] };
}

function resolveAgent(name: string | undefined, agents: Record<string, ExternalAgentConfig>): ExternalAgentConfig | string {
  if (!name || name === "default") return selfAgent();
  const hit = agents[name];
  if (hit) return hit;
  const known = ["default", ...Object.keys(agents)].join(", ");
  return `error: unknown agent "${name}" — configure it in fox-agent.toml under [agents.${name}], or use one of: ${known}`;
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
  try {
    // A2A: the entry points at a running agent over HTTP. Streams when the
    // server speaks message/stream (SSE), polls otherwise.
    if (spec.url) {
      const { runA2aAgent } = await import("../a2a/client.ts");
      const TERMINAL = new Set(["completed", "failed", "canceled", "rejected", "input-required"]);
      const text = (
        await runA2aAgent(spec.url, args.prompt, {
          signal: ctx.signal,
          headers: spec.headers,
          // forward remote state transitions the way an ACP child's tool calls
          // are forwarded — the TUI shows only completions, --json shows all
          onEvent: ctx.emit
            ? (ev) => {
                if (!ev.state) return;
                ctx.emit?.({ type: "child_tool", session: label, name: `remote ${ev.state}`, done: TERMINAL.has(ev.state), ok: ev.state !== "failed" });
              }
            : undefined,
        })
      ).trim();
      return ok(text ? `${text}\n\n[a2a task on ${args.agent ?? spec.url}]` : `[a2a agent ${args.agent ?? spec.url} finished without a final message]`);
    }

    // ACP: spawn a child process and stream its tool activity into the parent's
    // stream as it happens. Lazy-imported so the ACP SDK stays off TUI startup.
    if (!spec.command) return fail(`error: agent "${args.agent ?? "default"}" has neither command nor url — fix fox-agent.toml [agents.${args.agent}]`);
    const { runAcpAgent } = await import("../acp/client.ts");
    // ACP sends the tool's name on `tool_call` and only the id on
    // `tool_call_update`, so the name has to be remembered across the two. Without
    // this the parent's UI reports raw call ids ("c1") for the child's work.
    const names = new Map<string, string>();
    const res = await runAcpAgent({
      command: spec.command,
      args: spec.args,
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
