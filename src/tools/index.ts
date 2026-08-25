import type { ToolDef } from "../providers/types.ts";
import type { Config } from "../core/config.ts";
import type { ToolContext, ToolResult } from "./types.ts";
import type { Tool } from "./types.ts";
import * as F from "./files.ts";
import { execDef, execRun } from "./exec.ts";
import { ptyDef, drivePty, cleanupPty, ptySessionName } from "./pty.ts";
import { ctxEditDef, ctxEditRun } from "./ctxedit.ts";
import { todoDef, todoRun } from "./todo.ts";
import { taskDef, taskRun } from "./task.ts";
import { fetchDef, fetchRun } from "./fetch.ts";
import { mcpTools, closeMcp } from "./mcp.ts";

export type { Tool, ToolContext, ToolResult } from "./types.ts";

export function baseRegistry(): Map<string, Tool> {
  const map = new Map<string, Tool>();
  const add = (def: ToolDef, run: (args: any, ctx: ToolContext) => Promise<ToolResult | string>) => map.set(def.name, { def, run });
  add(F.readDef, F.readRun);
  add(F.writeDef, F.writeRun);
  add(F.editDef, F.editRun);
  add(F.globDef, F.globRun);
  add(F.grepDef, F.grepRun);
  add(execDef, execRun);
  add(ptyDef, drivePty);
  add(ctxEditDef, ctxEditRun);
  add(todoDef, todoRun);
  add(taskDef, taskRun);
  add(fetchDef, fetchRun);
  return map;
}

/**
 * Full registry: built-ins + MCP servers from config. `exclude` names tools to
 * drop; nothing in fox uses it now that delegation is a separate process with its
 * own full registry (`src/tools/task.ts`), and it is kept only as a general
 * facility for an embedder that wants a reduced tool set. Note that a reduced
 * registry is *safe* to build — `buildSystemPrompt` gates every tool-specific
 * section on what is actually present — but it is no longer how subagents work.
 * Returns any MCP connection warnings so the caller can surface them as `warn`.
 */
export async function buildRegistry(
  cfg: Config,
  exclude?: Set<string>,
): Promise<{ tools: Map<string, Tool>; warnings: string[] }> {
  const map = baseRegistry();
  let warnings: string[] = [];
  if (Object.keys(cfg.mcpServers).length) {
    const res = await mcpTools(cfg.mcpServers);
    warnings = res.warnings;
    for (const [name, tool] of res.tools) map.set(name, tool);
  }
  if (exclude) for (const name of exclude) map.delete(name);
  return { tools: map, warnings };
}

/** Cleanup live pty + MCP children when a session ends. */
export async function shutdownTools(sessionId: string): Promise<void> {
  await cleanupPty(ptySessionName(sessionId));
  await closeMcp();
}
