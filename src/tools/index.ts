import type { ToolDef } from "../providers/types.ts";
import type { Config, ExternalAgentConfig, McpServerConfig } from "../core/config.ts";
import type { ToolContext, ToolResult } from "./types.ts";
import type { Tool } from "./types.ts";
import { COMMANDS } from "../commands.ts";
import * as F from "./files.ts";
import { execDef, execRun } from "./exec.ts";
import { cleanupPty, ptySessionName } from "./pty.ts";
import { setOutputCap } from "./files.ts";
import { ctxEditDef, ctxEditRun } from "./ctxedit.ts";
import { taskDef, taskRun } from "./task.ts";
import { mcpTools, closeMcp } from "./mcp.ts";
import { loadPlugins, setActivePlugins } from "../plugins/load.ts";
import { bundledPlugins, bundledDisabled } from "../plugins/bundled.ts";
import { bundledProviderPlugin } from "../providers/bundled.ts";
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
): Promise<{ tools: Map<string, Tool>; warnings: string[]; plugins: FoxPlugin[]; agents: Record<string, ExternalAgentConfig> }> {
  const map = baseRegistry();
  setOutputCap(cfg.toolOutputCap ?? 30_000);
  // `?? []` on both: `Config` is public surface an embedder (or a test) may build
  // by hand, and a config written before these fields existed must degrade to
  // "no warnings, no plugins" rather than crash the registry build.
  const warnings: string[] = [...(cfg.warnings ?? [])];
  const disabled = cfg.disabledPlugins ?? [];

  // User plugins load before anything connects: a plugin may pack MCP servers
  // and delegation targets alongside its tools, and those merge before
  // mcpTools dials out. Bundled plugins first, through the exact merge path
  // user plugins take.
  const { globalConfigPath } = await import("../core/config.ts");
  const { dirname } = await import("node:path");
  const res = await loadPlugins(cfg.plugins ?? [], dirname(globalConfigPath()), disabled);
  warnings.push(...res.warnings);
  const plugins: FoxPlugin[] = [
    ...bundledPlugins().filter((p) => !bundledDisabled(p.name, disabled)),
    bundledProviderPlugin(),
    ...res.plugins,
  ];

  // Integration packs: plugin-contributed servers merge under explicit config —
  // a config file names what the user chose, a pack only suggests. Collisions
  // are reported, never silent.
  const packedServers = new Map<string, string>(); // server name -> plugin name
  for (const p of res.plugins) {
    for (const [name, s] of Object.entries(p.mcpServers ?? {})) {
      if (!s || typeof s !== "object" || typeof (s as { command?: unknown }).command !== "string") continue;
      if (!packedServers.has(name)) packedServers.set(name, p.name);
    }
  }
  const servers: Record<string, McpServerConfig> = {};
  for (const [name, pluginName] of packedServers) {
    const pack = res.plugins.find((p) => p.name === pluginName)!;
    servers[name] = (pack.mcpServers as Record<string, McpServerConfig>)[name];
  }
  for (const [name, s] of Object.entries(cfg.mcpServers ?? {})) {
    if (packedServers.has(name)) warnings.push(`mcp server '${name}' is configured explicitly — plugin-packed server ignored`);
    servers[name] = s;
  }

  // Same merge for delegation targets (ACP `command` or A2A `url` entries).
  // Returned for the turn loop: `task` reads the merged table, so a packed
  // remote agent is delegable with no config file.
  const agents: Record<string, ExternalAgentConfig> = {};
  for (const p of res.plugins) {
    for (const [name, a] of Object.entries(p.agents ?? {})) {
      if (!a || typeof a !== "object") continue;
      // "default" is fox-agent delegating to itself and is synthesized at call
      // time, so it is not a name a plugin may rebind either
      if (name === "default") {
        warnings.push(`plugin '${p.name}' agent 'default' ignored — that name is fox-agent itself`);
        continue;
      }
      if (agents[name]) continue; // first pack wins; reported below at the collision site
      agents[name] = a as ExternalAgentConfig;
    }
  }
  for (const [name, a] of Object.entries(cfg.agents ?? {})) {
    if (agents[name]) warnings.push(`agent '${name}' is configured explicitly — plugin-packed agent ignored`);
    agents[name] = a;
  }

  // MCP enters the registry as the bundled:mcp plugin — same merge path and
  // override warnings as every other tool source, and `disabledPlugins`
  // switches the whole bridge off. First in the list: least specific wins.
  const mcpPlugin: FoxPlugin = { name: "bundled:mcp", tools: [] };
  if (bundledDisabled("mcp", disabled)) {
    await closeMcp(); // an earlier config may have connected; don't leak the children
  } else {
    const mc = await mcpTools(servers);
    warnings.push(...mc.warnings);
    mcpPlugin.tools = [...mc.tools.values()];
  }
  plugins.unshift(mcpPlugin);

  const mergeTools = (owner: string, list: Tool[] | undefined) => {
    for (const t of list ?? []) {
      // Later registration wins, so a plugin can deliberately shadow a built-in
      // or an MCP tool. Reported either way: overriding `write` is a legitimate
      // thing to want and an accident that would otherwise be invisible.
      if (map.has(t.def.name)) warnings.push(`plugin '${owner}' overrides existing tool '${t.def.name}'`);
      map.set(t.def.name, t);
    }
  };
  // Precedence, least to most specific: MCP bridge, bundled plugins, user plugins.
  for (const p of plugins) mergeTools(p.name, p.tools);

  // A plugin command colliding with a built-in never fires (the built-in wins
  // in runSlashCommand), so the collision is reported here rather than failing
  // silently the first time it is typed.
  const builtinWords = new Set(COMMANDS.flatMap((c) => [c.name.toLowerCase(), ...(c.aliases ?? []).map((a) => a.toLowerCase())]));
  for (const p of plugins) {
    for (const c of p.commands ?? []) {
      if (builtinWords.has(c.name.toLowerCase())) warnings.push(`plugin '${p.name}' command '${c.name}' collides with a built-in and never fires`);
    }
  }

  // providers are registered even when a plugin contributes no tools
  const customProviders = new Map<string, ChatFn>();
  for (const p of plugins) {
    // bundled:providers seeds the registry at import; re-registering its names
    // here would only hit the reserved-name refusal, so it is skipped openly
    if (p.name === "bundled:providers") continue;
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
  return { tools: map, warnings, plugins, agents };
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
  const { killTasks } = await import("./task.ts");
  killTasks(sessionId);
  await closeMcp();
  // an idle tsserver holds a project's worth of memory; leaving one per fox-agent run
  // behind would accumulate across a day of sessions in the same shell
  await shutdownLsp();
}
