import type { ToolDef } from "../providers/types.ts";
import type { Config, ExternalAgentConfig, McpServerConfig } from "../core/config.ts";
import type { ToolContext, ToolResult } from "./types.ts";
import type { Tool } from "./types.ts";
import { COMMANDS } from "../commands.ts";
import * as F from "./files.ts";
import { execDef, execRun } from "./exec.ts";
import { cleanupPty, ptySessionName } from "./pty.ts";
import { setOutputCap, setReadCap } from "./files.ts";
import { ctxDef, ctxRun } from "./ctx.ts";
import { mcpTools, closeMcp } from "./mcp.ts";
import { loadPlugins, setActivePlugins } from "../plugins/load.ts";
import { debugInfo } from "../core/debuglog.ts";
import { bundledPlugins, bundledDisabled } from "../plugins/bundled.ts";
import { BUNDLED_PROVIDER_PLUGIN_NAMES, bundledProviderPlugins } from "../providers/bundled.ts";
import type { FoxPlugin } from "../plugins/types.ts";
import { setCustomProviders, setDisabledBundledProviders } from "../providers/index.ts";
import type { ChatFn } from "../providers/types.ts";
import { shutdownLsp } from "../lsp/client.ts";

export type { Tool, ToolContext, ToolResult } from "./types.ts";

/**
 * The core tool set — the ones that are the harness itself (files, exec,
 * context editing). pty, todo, fetch, repl and task ship as bundled plugins
 * instead (see src/plugins/bundled.ts), so they can be shadowed or disabled.
 * task's ACP/A2A delegation lives behind that plugin: the clients stay in
 * src/acp/client.ts + src/a2a/client.ts, but the tool that reaches them is a
 * plugin like any other, and the ACP *server* (fox acp) stays in core.
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
  add(ctxDef, ctxRun);
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
 * Collect the custom (plugin-registered) providers from a set of plugins and
 * register them. One copy of the rule — `buildRegistry` and the turn loop's
 * registry-override path both used to hand-roll this loop, able to drift.
 * `setCustomProviders` already refuses the reserved bundled names, so the
 * only filter here is "is it actually a function".
 */
export function registerPluginProviders(plugins: FoxPlugin[]): void {
  const custom = new Map<string, ChatFn>();
  for (const p of plugins) {
    for (const [name, fn] of Object.entries(p.providers ?? {})) {
      if (typeof fn === "function") custom.set(name, fn);
    }
  }
  setCustomProviders(custom);
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
  setReadCap(cfg.readCap ?? 50_000);
  // `?? []` on both: `Config` is public surface an embedder (or a test) may build
  // by hand, and a config written before these fields existed must degrade to
  // "no warnings, no plugins" rather than crash the registry build.
  const warnings: string[] = [...(cfg.warnings ?? [])];
  const disabled = cfg.disabledPlugins ?? [];

  // User plugins load before anything connects: a plugin may pack MCP servers
  // and delegation targets alongside its tools, and those merge before
  // mcpTools dials out. Bundled plugins first, through the exact merge path
  // user plugins take.
  const { effectiveConfigPath } = await import("../core/config.ts");
  const { dirname } = await import("node:path");
  const res = await loadPlugins(cfg.plugins ?? [], dirname(effectiveConfigPath()), disabled);
  warnings.push(...res.warnings);
  const plugins: FoxPlugin[] = [
    ...bundledPlugins().filter((p) => !bundledDisabled(p.name, disabled)),
    ...bundledProviderPlugins(),
    ...res.plugins,
  ];
  // which plugins are live, and which were skipped and why — the question
  // "why isn't my plugin doing anything" is answered here
  debugInfo(
    "plugin",
    `registry: ${plugins.length} plugin(s)`,
    `active=${plugins.map((p) => p.name).join(", ") || "(none)"}\n` +
      `configured=${(cfg.plugins ?? []).join(", ") || "(none)"}\n` +
      `disabled=${disabled.join(", ") || "(none)"}\n` +
      (res.warnings.length ? `warnings:\n${res.warnings.join("\n")}` : ""),
  );

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
    closeMcp(); // an earlier config may have connected; detached reap, don't leak the children
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
  registerPluginProviders(plugins);
  // a switched-off bundled format stops resolving — /plugins off anthropic
  // means provider=anthropic no longer exists, honestly listed as missing
  setDisabledBundledProviders(
    BUNDLED_PROVIDER_PLUGIN_NAMES.filter((n) => bundledDisabled(n, disabled)).map((n) => n.replace(/^bundled:/, "")),
  );
  // plugin themes become selectable via `/theme` / the `theme` config key
  const { registerThemes } = await import("../tui/themes.ts");
  for (const p of plugins) if (p.themes) registerThemes(p.themes);
  // lifecycle events outside the turn loop (session switch/exit) fire on this set
  setActivePlugins(plugins);

  if (exclude) for (const name of exclude) map.delete(name);
  return { tools: map, warnings, plugins, agents };
}

/**
 * Exit-path concurrency: the slow closers (plugin session-end hooks, MCP
 * children, the polite per-server LSP exit window) used to run strictly after
 * the TUI had torn down its screen and printed the resume hint — serially that
 * read as a hang after exit. beginShutdown starts the work the moment exit is
 * requested so it overlaps the terminal teardown; the caller's awaited
 * shutdownTools then joins the same in-flight promise instead of running a
 * second pass. Idempotent: the first caller's sessionId wins, which is the
 * live one. Test seams reset it via resetShutdownForTests.
 */
let shutdownInFlight: Promise<void> | null = null;
export function beginShutdown(sessionId: string): Promise<void> {
  if (!shutdownInFlight) shutdownInFlight = shutdownTools(sessionId).catch(() => {});
  return shutdownInFlight;
}

/** Test seam: drop the in-flight handle so suites start from a clean slate. */
export function resetShutdownForTests(): void {
  shutdownInFlight = null;
}

/** Cleanup live pty + MCP children + language servers when a session ends. */
export async function shutdownTools(sessionId: string): Promise<void> {
  if (shutdownInFlight) return shutdownInFlight;
  const { fireSessionEnd } = await import("../plugins/load.ts");
  // plugin cleanup hooks first (the bundled pty plugin kills its tmux session
  // here), then the harness's own children
  await fireSessionEnd(sessionId, "exit");
  // pty calls in a step run chained; join the chain so a queued call cannot
  // re-spawn the tmux session after the kill below
  const { joinPtyChain } = await import("./pty.ts");
  await joinPtyChain().catch(() => {});
  await cleanupPty(ptySessionName(sessionId)); // belt and braces when no registry was ever built
  const { cleanupRepl } = await import("./repl.ts");
  cleanupRepl(sessionId); // drops the scratchpad AND any repl jobs still running under it
  closeMcp(); // detached: hands the terminal back while children reap in the background
  // an idle tsserver holds a project's worth of memory; leaving one per fox-agent run
  // behind would accumulate across a day of sessions in the same shell
  await shutdownLsp();
}
