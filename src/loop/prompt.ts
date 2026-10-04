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

/** Provider-reported context size, see checkBudget. */
export interface RuntimeBudget {
  reported: number;
  limit: number;
  ratio: number;
  over: boolean;
}

/**
 * The cache prefix: identity, project instructions, tool roster, doctrine,
 * style — and nothing else.
 *
 * A provider's automatic prefix cache (and our Anthropic cache_control
 * breakpoints) match from byte 0 forward, so a single changed byte in this
 * string re-bills the system block AND every message behind it. That makes
 * step-stability a correctness requirement, not an optimization: the only
 * things allowed in here are those that change when the toolset or the project
 * instructions change. The clock, the todo list, cwd, the model name and the
 * live budget figure used to live here — the last one moves on *every* step —
 * which is why a 1.6k system prompt cost a fresh 1.6k re-read 5,157 times in a
 * row. Those all travel in buildRuntimeHeader() at the message tail instead.
 */
export function buildSystemPrompt(
  opts: {
    tools: ToolDef[];
    projectInstructions?: string;
  },
): string {
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
  if (have.has("repl")) roster.push(`- repl is an in-process JS scratchpad with persistent vars; reach tools from code as tools.call(name, args) — direct calls bypass beforeTool/afterTool hooks.`);
  sections.push(roster.join("\n"));

  if (have.has("ctx")) {
    sections.push(
      [
        `## Context window management (your core ability)\n` +
          `Every message in your view carries a stable marker [N]. Large old tool outputs are dead weight — query, don't re-read:\n` +
          `- find nodes first: {"op":"search","pattern":"error"} shows snippets, never bodies\n` +
          `- after using a big result, hide it: {"op":"delete","ids":[3,5],"summary":"ran build; fixed 2 errors"}\n` +
          `- rewrite stale/wrong nodes: {"op":"replace","id":7,"content":"…"}\n` +
          `Batch multiple ops in one ctx call. Any node is editable, including ones from the current turn. Edits apply from your NEXT step; storage is permanent — nothing is ever lost, ops are revertible (/undo).`,
      ].join("\n"),
    );
  }

  const style = [
    `## Style`,
    `Short, direct answers — markdown renders in the UI.`,
    ...(have.has("exec") ? [`Verify code changes by running tests/builds via exec.`] : []),
    ...(have.has("task") ? [`Delegate self-contained subtasks to task to protect this context window.`] : []),
  ];
  sections.push(style.join(" "));

  return sections.join("\n\n");
}

/**
 * The step-varying facts, sent as the LAST message of every request.
 *
 * Position is the whole point. Prefix caches match from the start forward, so
 * volatile content may only live where nothing follows it: the system prompt is
 * followed by the entire conversation (one changed byte there invalidates all
 * of it), while the tail is followed by nothing at all. This block is rebuilt
 * each step and re-appended after the history — it is deliberately NOT
 * persisted, so each request keeps [system … history] byte-identical and only
 * pays for the handful of tokens that actually changed.
 *
 * It rides as a `user` message rather than a second `system` one because the
 * Anthropic adapter hoists every system message into the leading `system`
 * parameter — a trailing system block would land back at position 0 and break
 * exactly the prefix it exists to protect.
 */
export function buildRuntimeHeader(opts: {
  sessionId: string;
  cwd: string;
  model: string;
  tools: ToolDef[];
  budget?: RuntimeBudget;
}): string {
  const info = lookupModel(opts.model);
  const have = toolNames(opts.tools);
  const todos = renderTodos(getTodos(opts.sessionId));

  const lines = [
    `[harness metadata — refreshed every step, not something the person typed]`,
    `<runtime>`,
    `cwd: ${opts.cwd}`,
    `os: ${process.platform} shell=/bin/bash`,
    `date: ${new Date().toISOString().slice(0, 10)}`,
    `model: ${opts.model} ctx=${info.contextWindow} out=${info.maxOutput}`,
    `fox-agent: v${VERSION}`,
    ...(todos ? [`todos:\n${todos}`] : []),
    `</runtime>`,
  ];

  // gated on ctx exactly like the doctrine above: a figure the agent has no
  // tool to act on is noise, and this one costs real tokens every step
  if (have.has("ctx") && opts.budget && opts.budget.reported > 0) {
    const pct = Math.round(opts.budget.ratio * 100);
    lines.push(
      `Context used at your last step: ${opts.budget.reported}/${opts.budget.limit} tokens (${pct}%), provider-reported. This figure updates every step — check it before starting another large read.`,
    );
    if (opts.budget.over) {
      lines.push(
        `You are over the compaction threshold. Before doing anything else, use ctx to hide or rewrite the stale nodes you no longer need — that is cheaper and lossless compared to the automatic compaction that otherwise fires.`,
      );
    }
  }

  return lines.join("\n");
}
