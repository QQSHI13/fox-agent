import type { ToolDef } from "../providers/types.ts";
import type { Config, McpServerConfig } from "../core/config.ts";
import { allMessages } from "../store/db.ts";
import type { ToolContext, ToolResult } from "./types.ts";
import type { Tool } from "./types.ts";
import * as F from "./files.ts";
import { execDef, execRun } from "./exec.ts";
import { ptyDef, drivePty, cleanupPty } from "./pty.ts";
import { ctxEditDef, ctxEditRun } from "./ctxedit.ts";
import { todoDef, todoRun } from "./todo.ts";
import { taskDef, taskRun } from "./task.ts";
import { fetchDef, fetchRun } from "./fetch.ts";
import { mcpTools } from "./mcp.ts";

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
 * Full registry: built-ins + MCP servers from config. Cached per config
 * content; `exclude` lets the task tool build restricted registries.
 */
export async function buildRegistry(cfg: Config, exclude?: Set<string>): Promise<Map<string, Tool>> {
  const map = baseRegistry();
  if (Object.keys(cfg.mcpServers).length) {
    const { tools } = await mcpTools(cfg.mcpServers);
    for (const [name, tool] of tools) if (!exclude?.has(name)) map.set(name, tool);
  }
  if (exclude) {
    for (const name of exclude) {
      if (!name.startsWith("mcp__")) map.delete(name);
    }
  }
  return map;
}

/** Cleanup any live pty when a session ends. */
export async function shutdownTools(sessionId: string): Promise<void> {
  await cleanupPty(`fox-${sessionId.slice(0, 12)}`);
}

export function messageCount(sessionId: string): number {
  return allMessages(sessionId).length;
}
