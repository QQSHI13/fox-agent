/**
 * `jobs` — list and kill tool calls that outlived their turn step.
 *
 * A call is not waited on past `autoBackgroundMs`; its tool result says so and
 * names a NODE (`[N]`, the same marker the agent already reads on every
 * message). This tool is the other half: see what is still running, stop it.
 *
 * Deliberately NOT a poll for output. When the work finishes its result arrives
 * as a NEW message at the end of the log — never a rewrite of an earlier one,
 * because rewriting a node invalidates the provider's cached prefix from that
 * point on and re-bills the whole history behind it.
 */
import { listBackground, killBackground } from "../../loop/background.ts";
import { ok, fail, type Tool } from "../../core/tool.ts";

export const jobsDef = {
  name: "jobs",
  description:
    "List or kill tool calls that became background because they exceeded autoBackgroundMs. A backgrounded call reports its result as a new message when it finishes, so you will read that on a later turn WITHOUT polling — use `list` only to see what is still running, and `id` only when the work is no longer wanted.",
  parameters: {
    type: "object",
    properties: {
      list: { type: "boolean", description: "Show live background jobs (node, tool, age). Default when no `id` is given." },
      id: { type: "number", description: "Kill the job at this node — the [N] its tool result named." },
    },
  },
} as const;

export const jobsRun: Tool["run"] = async (args, ctx) => {
  const a = (args ?? {}) as { list?: boolean; id?: number };
  if (typeof a.id === "number" && Number.isFinite(a.id)) {
    const line = killBackground(Math.floor(a.id));
    return /^no live job/.test(line) ? fail(line) : ok(line);
  }
  const live = listBackground(ctx.sessionId);
  if (!live.length) return ok("no background jobs running");
  const now = Date.now();
  const lines = live.map((j) => `[${j.node}]  ${j.name}  ${Math.round((now - j.startedAt) / 1000)}s`);
  return ok(`${live.length} background job${live.length === 1 ? "" : "s"}:\n${lines.join("\n")}`);
};

export const jobsTool: Tool = { def: jobsDef, run: jobsRun };
