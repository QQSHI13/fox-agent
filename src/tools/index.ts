import type { ToolDef } from "../providers/types.ts";
import type { Config } from "../core/config.ts";
import type { ToolContext, ToolResult } from "./types.ts";
import type { Tool } from "./types.ts";
import * as F from "./files.ts";
import { execDef, execRun } from "./exec.ts";
import { cleanupPty, ptySessionName } from "./pty.ts";
import { setOutputCap } from "./files.ts";
import { ctxEditDef, ctxEditRun } from "./ctxedit.ts";
import { taskDef, taskRun } from "./task.ts";
import { mcpTools, closeMcp } from "./mcp.ts";
import { loadPlugins, setActivePlugins } from "../plugins/load.ts";
import { bundledPlugins, bundledDisabled } from "../plugins/bundled.ts";
import type { FoxPlugin } from "../plugins/types.ts";
import { setCustomProviders } from "../providers/index.ts";
import type { ChatFn } from "../providers/types.ts";
import { shutdownLsp } from "../lsp/client.ts";

export type { Tool, ToolContext, ToolResult } from "./types.ts";

/**
 * The core tool set — the ones that are the harness itself (files, exec,
 * context editing, delegation). pty, todo and fetch ship as bundled plugins
 * instead (see src/plugins/bundled.ts), so they can be shadowed or disabled.
 */
export function baseRegistry(): Map<string, Tool> {
  const map = new Map<string, Tool>();
  const add = (def: ToolDef, run: (args: any, ctx: ToolContext) => Promise<ToolResult | string>) => map.set(def.name, { def, run });
  add(F.readDef, F.readRun);
  add(F.writeDef, F.writeRun);
  add(F.editDef, F.editRun);
  add(F.globDef, F.globRun);
  add(F.grepDef, F.grepRun);
  add(execDef, execRun);
  add(ctxEditDef, ctxEditRun);
  add(taskDef, taskRun);
  return map;
}

/**
 * base + bundled plugin tools — the full built-in set with no config in play.
 * Tests and embedders that want "everything fox-agent ships" without a config
 * file use this; `buildRegistry` is the real path.
 */
export function defaultRegistry(): Map<string, Tool> {
  const map = baseRegistry();
  for (const p of bundledPlugins()) for (const t of p.tools ?? []) map.set(t.def.name, t);
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
  setOutputCap(cfg.toolOutputCap ?? 30_000);
  // `?? []` on both: `Config` is public surface an embedder (or a test) may build
  // by hand, and a config written before these fields existed must degrade to
  // "no warnings, no plugins" rather than crash the registry build.
  const warnings: string[] = [...(cfg.warnings ?? [])];
  if (Object.keys(cfg.mcpServers).length) {
    const res = await mcpTools(cfg.mcpServers);
    warnings.push(...res.warnings);
    for (const [name, tool] of res.tools) map.set(name, tool);
  }

  // Bundled plugins first, through the exact merge path user plugins take —
  // they are how pty/todo/fetch ship, and disabledPlugins applies to them too.
  const disabled = cfg.disabledPlugins ?? [];
  const plugins: FoxPlugin[] = bundledPlugins().filter((p) => !bundledDisabled(p.name, disabled));
  for (const p of plugins) for (const tool of p.tools ?? []) map.set(tool.def.name, tool);

  if (cfg.plugins?.length) {
    const res = await loadPlugins(cfg.plugins, process.cwd(), disabled);
    warnings.push(...res.warnings);
    plugins.push(...res.plugins);
    for (const p of res.plugins) {
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
  }
  // providers are registered even when a plugin contributes no tools
  const customProviders = new Map<string, ChatFn>();
  for (const p of plugins) {
    for (const [name, fn] of Object.entries(p.providers ?? {})) {
      if (typeof fn === "function") customProviders.set(name, fn);
    }
  }
  setCustomProviders(customProviders);
  // plugin themes become selectable via `/theme` / the `theme` config key
  const { registerThemes } = await import("../tui/themes.ts");
  for (const p of plugins) if (p.themes) registerThemes(p.themes);
  // lifecycle events outside the turn loop (session switch/exit) fire on this set
  setActivePlugins(plugins);

  if (exclude) for (const name of exclude) map.delete(name);
  return { tools: map, warnings, plugins };
}

/** Cleanup live pty + MCP children + language servers when a session ends. */
export async function shutdownTools(sessionId: string): Promise<void> {
  const { fireSessionEnd } = await import("../plugins/load.ts");
  // plugin cleanup hooks first (the bundled pty plugin kills its tmux session
  // here), then the harness's own children
  await fireSessionEnd(sessionId, "exit");
  await cleanupPty(ptySessionName(sessionId)); // belt and braces when no registry was ever built
  const { killExecJobs } = await import("./exec.ts");
  killExecJobs(sessionId);
  await closeMcp();
  // an idle tsserver holds a project's worth of memory; leaving one per fox-agent run
  // behind would accumulate across a day of sessions in the same shell
  await shutdownLsp();
}
