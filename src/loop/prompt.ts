import { lookupModel } from "../providers/models.ts";
import type { ToolDef } from "../providers/types.ts";
import { renderTodos, getTodos } from "../tools/todo.ts";
import { VERSION } from "../core/version.ts";

export { VERSION };

/**
 * Names of the tools that are actually callable this step.
 *
 * Every section below is gated on this rather than written as prose, because a
 * prompt that describes a tool the registry doesn't have is worse than saying
 * nothing: a subagent used to be handed the whole "context window management"
 * doctrine while `ctx_edit` was excluded from its registry, so its only possible
 * move was to call a tool that did not exist.
 */
function toolNames(tools: ToolDef[]): Set<string> {
  return new Set(tools.map((t) => t.name));
}

export function buildSystemPrompt(
  opts: {
    sessionId: string;
    cwd: string;
    model: string;
    tools: ToolDef[];
    projectInstructions?: string;
    /**
     * Provider-reported context size (see checkBudget). When present and the
     * agent has ctx_edit, the context section reports the live figure and, past
     * the compactAt threshold, tells the agent to prune before its next step.
     */
    budget?: { reported: number; limit: number; ratio: number; over: boolean };
  },
): string {
  const info = lookupModel(opts.model);
  const have = toolNames(opts.tools);
  const sections: string[] = [];

  sections.push(`You are fox-agent, a light coding harness with full machine control — no permission prompts. Work directly and verify your changes.`);

  if (opts.projectInstructions) sections.push(`## Project instructions\n${opts.projectInstructions}`);

  // Names only. The provider already sends every tool's full description and
  // JSON schema in the API tool block, so restating them here bought nothing —
  // and the old formatter cut each one at its first ". ", which silently dropped
  // load-bearing clauses (exec's "working directory never carries over" among
  // them) and truncated `glob` mid-abbreviation at "(e.g". What is left is the
  // roster plus the two contracts no JSON schema can express.
  const roster = [`## Tools`, `Full descriptions and JSON schemas arrive with the API tool definitions — read them there.`];
  roster.push(`Available now: ${opts.tools.map((t) => t.name).join(", ")}`);
  if (have.has("exec")) roster.push(`- exec never drifts: every call starts in the session directory, and \`workdir\` is per-call, never sticky.`);
  if (have.has("pty")) roster.push(`- pty is one persistent shell that KEEPS its working directory, environment and processes between calls.`);
  sections.push(roster.join("\n"));

  if (have.has("ctx_edit")) {
    const lines = [
      `## Context window management (your core ability)\n` +
        `Every message in your view carries a stable marker [mN]. Large old tool outputs are dead weight:\n` +
        `- after using a big result, hide it: {"op":"delete","ids":[3,5],"summary":"ran build; fixed 2 errors"}\n` +
        `- rewrite stale/wrong nodes: {"op":"replace","id":7,"content":"…"}\n` +
        `Batch multiple ops in one ctx_edit call. Any node is editable, including ones from the current turn. Edits apply from your NEXT step; storage is permanent — nothing is ever lost, ops are revertible (/undo).`,
    ];
    if (opts.budget && opts.budget.reported > 0) {
      const pct = Math.round(opts.budget.ratio * 100);
      lines.push(
        `Context used at your last step: ${opts.budget.reported}/${opts.budget.limit} tokens (${pct}%), provider-reported. This figure updates every step — check it before starting another large read.`,
      );
      if (opts.budget.over) {
        lines.push(
          `You are over the compaction threshold. Before doing anything else, use ctx_edit to hide or rewrite the stale nodes you no longer need — that is cheaper and lossless compared to the automatic compaction that otherwise fires.`,
        );
      }
    }
    sections.push(lines.join("\n"));
  }

  const style = [
    `## Style`,
    `Short, direct answers — markdown renders in the UI.`,
    ...(have.has("exec") ? [`Verify code changes by running tests/builds via exec.`] : []),
    ...(have.has("task") ? [`Delegate self-contained subtasks to task to protect this context window.`] : []),
  ];
  sections.push(style.join(" "));

  // runtime header stays at the BOTTOM of the system prompt (locked decision)
  const todos = renderTodos(getTodos(opts.sessionId));
  sections.push(
    [
      "<runtime>",
      `cwd: ${opts.cwd}`,
      `os: ${process.platform} shell=/bin/bash`,
      `date: ${new Date().toISOString().slice(0, 10)}`,
      `model: ${opts.model} ctx=${info.contextWindow} out=${info.maxOutput}`,
      `fox-agent: v${VERSION}`,
      ...(todos ? [`todos:\n${todos}`] : []),
      "</runtime>",
    ].join("\n"),
  );

  return sections.join("\n\n");
}
