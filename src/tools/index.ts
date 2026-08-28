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
import { loadPlugins } from "../plugins/load.ts";
import type { FoxPlugin } from "../plugins/types.ts";
import { setCustomProviders } from "../providers/index.ts";
import type { ChatFn } from "../providers/types.ts";
import { shutdownLsp } from "../lsp/client.ts";

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
 * Full registry: built-ins + MCP servers + plugin tools, all from config.
 * `exclude` names tools to drop; nothing in fox-agent uses it now that delegation is a
 * separate process with its own full registry (`src/tools/task.ts`), and it is
 * kept only as a general facility for an embedder that wants a reduced tool set.
 * Note that a reduced registry is *safe* to build — `buildSystemPrompt` gates
 * every tool-specific section on what is actually present — but it is no longer
 * how subagents work.
 *
 * Returns MCP connection warnings, plugin load warnings and any config warnings
 * so the caller can surface them all as `warn` at the top of the turn.
 */
export async function buildRegistry(
  cfg: Config,
  exclude?: Set<string>,
): Promise<{ tools: Map<string, Tool>; warnings: string[]; plugins: FoxPlugin[] }> {
  const map = baseRegistry();
  // `?? []` on both: `Config` is public surface an embedder (or a test) may build
  // by hand, and a config written before these fields existed must degrade to
  // "no warnings, no plugins" rather than crash the registry build.
  const warnings: string[] = [...(cfg.warnings ?? [])];
  if (Object.keys(cfg.mcpServers).length) {
    const res = await mcpTools(cfg.mcpServers);
    warnings.push(...res.warnings);
    for (const [name, tool] of res.tools) map.set(name, tool);
  }

  let plugins: FoxPlugin[] = [];
  if (cfg.plugins?.length) {
    const res = await loadPlugins(cfg.plugins);
    warnings.push(...res.warnings);
    plugins = res.plugins;
    for (const p of plugins) {
      for (const tool of p.tools ?? []) {
        // Later registration wins, so a plugin can deliberately shadow a built-in
        // or an MCP tool. Reported either way: overriding `write` is a legitimate
        // thing to want and an accident that would otherwise be invisible.
        if (map.has(tool.def.name)) {
          warnings.push(`plugin '${p.name}' overrides existing tool '${tool.def.name}'`);
        }
        map.set(tool.def.name, tool);
      }
    }
    // providers are registered even when a plugin contributes no tools
    const providers = new Map<string, ChatFn>();
    for (const p of plugins) {
      for (const [name, fn] of Object.entries(p.providers ?? {})) {
        if (typeof fn === "function") providers.set(name, fn);
      }
    }
    setCustomProviders(providers);
  }

  if (exclude) for (const name of exclude) map.delete(name);
  return { tools: map, warnings, plugins };
}

/** Cleanup live pty + MCP children + language servers when a session ends. */
export async function shutdownTools(sessionId: string): Promise<void> {
  await cleanupPty(ptySessionName(sessionId));
  await closeMcp();
  // an idle tsserver holds a project's worth of memory; leaving one per fox-agent run
  // behind would accumulate across a day of sessions in the same shell
  await shutdownLsp();
}
