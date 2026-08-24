import { lookupModel } from "../providers/models.ts";
import type { ToolDef } from "../providers/types.ts";
import { renderTodos, getTodos } from "../tools/todo.ts";
import { VERSION } from "../core/version.ts";

export { VERSION };

/**
 * Per-turn memo for the expensive parts of the runtime block. Probing git
 * costs two subprocesses, and it can't change under us mid-turn in any way
 * the model needs to see. Todos are deliberately NOT cached — the model
 * updates them with todowrite and must see the result on its next step.
 */
export interface RuntimeCache {
  git?: string;
}

function gitInfo(cwd: string): string {
  try {
    const branch = Bun.spawnSync(["git", "-C", cwd, "rev-parse", "--abbrev-ref", "HEAD"], { stdout: "pipe", stderr: "ignore" });
    if (branch.exitCode !== 0) return "repo=no";
    const dirty = Bun.spawnSync(["git", "-C", cwd, "status", "--porcelain"], { stdout: "pipe" });
    const n = dirty.stdout.toString().trim().split("\n").filter(Boolean).length;
    return `repo=yes branch=${branch.stdout.toString().trim()} dirty=${n}`;
  } catch {
    return "repo=no";
  }
}

export function toolLine(def: ToolDef): string {
  const params = Object.keys((def.parameters?.properties as Record<string, unknown>) ?? {}).join(", ");
  const desc = def.description.split(". ")[0];
  return `- ${def.name} {${params}} — ${desc}`;
}

export function buildSystemPrompt(
  opts: {
    sessionId: string;
    cwd: string;
    model: string;
    tools: ToolDef[];
    projectInstructions?: string;
    /** pass the same object across a turn's steps to keep the prefix cacheable */
    cache?: RuntimeCache;
  },
): string {
  const info = lookupModel(opts.model);
  const sections: string[] = [];

  sections.push(`You are fox, a light coding harness with full machine control — no permission prompts. Work directly and verify your changes.`);

  if (opts.projectInstructions) sections.push(`## Project instructions\n${opts.projectInstructions}`);

  sections.push(`## Tools\n${opts.tools.map(toolLine).join("\n")}\nFull JSON schemas arrive via the API tool definitions.`);

  sections.push(
    `## Context window management (your core ability)\n` +
      `Every message in your view carries a stable marker [mN]. Large old tool outputs are dead weight:\n` +
      `- after using a big result, hide it: {"op":"delete","ids":[3,5],"summary":"ran build; fixed 2 errors"}\n` +
      `- rewrite stale/wrong nodes: {"op":"replace","id":7,"content":"…"}\n` +
      `Batch multiple ops in one ctx_edit call. Never edit nodes from the current turn. Edits apply from your NEXT step; storage is permanent — nothing is ever lost, ops are revertible (/undo).`,
  );

  sections.push(
    `## Style\n` +
      `Short, direct answers — markdown renders in the UI. Verify code changes by running tests/builds via exec. ` +
      `Delegate self-contained subtasks to task to protect this context window.`,
  );

  // runtime header stays at the BOTTOM of the system prompt (locked decision)
  const todos = renderTodos(getTodos(opts.sessionId));
  let git = opts.cache?.git;
  if (git === undefined) {
    git = gitInfo(opts.cwd);
    if (opts.cache) opts.cache.git = git;
  }
  sections.push(
    [
      "<runtime>",
      `cwd: ${opts.cwd}`,
      `git: ${git}`,
      `os: ${process.platform} shell=/bin/bash`,
      `date: ${new Date().toISOString().slice(0, 10)}`,
      `model: ${opts.model} ctx=${info.contextWindow} out=${info.maxOutput}`,
      `fox: v${VERSION}`,
      ...(todos ? [`todos:\n${todos}`] : []),
      "</runtime>",
    ].join("\n"),
  );

  return sections.join("\n\n");
}
