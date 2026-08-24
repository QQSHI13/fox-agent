// Subagent: a fresh child session with a restricted tool registry, quiet
// event stream, and its own step budget. Returns the child's final message.
import { createSession, kvSet } from "../store/db.ts";
import type { ToolDef } from "../providers/types.ts";
import type { ToolContext, ToolResult } from "./types.ts";
import { fail, ok } from "./types.ts";
import { runTurnCore } from "../loop/turn.ts";
import { resolveChat } from "../providers/index.ts";

const RESTRICTED = new Set(["task", "ctx_edit", "pty"]);

export const taskDef: ToolDef = {
  name: "task",
  description:
    "Delegate a self-contained subtask to a subagent with its own context window and fresh session. Give it complete instructions; it cannot see this conversation. Returns its final report.",
  parameters: {
    type: "object",
    properties: {
      description: { type: "string", description: "One-line label shown in the UI" },
      prompt: { type: "string", description: "Complete, standalone instructions for the subagent" },
      max_steps: { type: "number", description: "Step cap for the child (default 15)" },
    },
    required: ["description", "prompt"],
  },
};

export async function taskRun(
  args: { description?: string; prompt?: string; max_steps?: number },
  ctx: ToolContext,
): Promise<ToolResult> {
  if (!ctx.providerCfg) return fail("error: no provider available for subagent");
  if (!args.prompt?.trim()) return fail("error: task needs prompt");
  if (!args.description?.trim()) return fail("error: task needs description");

  const registry = await ctx.registryFactory?.(RESTRICTED);
  const child = createSession(ctx.cwd, ctx.providerCfg.model);
  kvSet(child.id, "parent", ctx.sessionId);

  // Track the last non-empty text run rather than only text after the final
  // tool_end: a subagent that ends on a tool call would otherwise report
  // nothing at all.
  let current = "";
  let lastNonEmpty = "";
  try {
    for await (const ev of runTurnCore(child.id, ctx.providerCfg, args.prompt, ctx.signal, {
      maxSteps: Math.min(40, Math.max(1, args.max_steps ?? 15)),
      quiet: true,
      chat: resolveChat,
      registryOverride: registry,
    })) {
      if (ev.type === "text") current += ev.delta;
      else if (ev.type === "tool_end") {
        if (current.trim()) lastNonEmpty = current;
        current = "";
      } else if (ev.type === "done") break;
    }
  } catch (e) {
    return fail(`error: subagent failed: ${(e as Error).message}`);
  }

  const finalText = (current.trim() ? current : lastNonEmpty).trim();
  return ok(finalText ? `${finalText}\n\n[subagent session ${child.id}]` : `[subagent ${child.id} finished without a final message]`);
}
