/**
 * `jobs` — list and kill tool calls that outlived their turn step.
 *
 * A call is not waited on past `autoBackgroundMs`; its tool result says so and
 * names an id. This tool is the other half: see what is still running, stop it.
 *
 * Deliberately NOT a poll for output. A backgrounded call's result row is
 * replaced with the real output when the work finishes, so the agent reads it on
 * a later turn without asking. `list` answers "what is still out there";
 * `id` answers "stop it".
 */
import { listBackground, killBackground } from "../../loop/background.ts";
import { ok, fail, type Tool } from "../../core/tool.ts";

export const jobsDef = {
  name: "jobs",
  description:
    "List or kill tool calls that became background because they exceeded autoBackgroundMs. A backgrounded call replaces its own result with the real output when it finishes, so you will read that on a later turn WITHOUT polling — use `list` only to see what is still running, and `id` only when the work is no longer wanted.",
  parameters: {
    type: "object",
    properties: {
      list: { type: "boolean", description: "Show live background jobs (id, tool, age). Default when no `id` is given." },
      id: { type: "string", description: "Kill this job id (the `bgN` the tool result named)." },
    },
  },
} as const;

export const jobsRun: Tool["run"] = async (args, ctx) => {
  const a = (args ?? {}) as { list?: boolean; id?: string };
  if (a.id) {
    const line = killBackground(a.id);
    return /^no live job/.test(line) ? fail(line) : ok(line);
  }
  const live = listBackground(ctx.sessionId);
  if (!live.length) return ok("no background jobs running");
  const now = Date.now();
  const lines = live.map((j) => `${j.id}  ${j.name}  ${Math.round((now - j.startedAt) / 1000)}s`);
  return ok(`${live.length} background job${live.length === 1 ? "" : "s"}:\n${lines.join("\n")}`);
};

export const jobsTool: Tool = { def: jobsDef, run: jobsRun };
