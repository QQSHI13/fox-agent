/**
 * Load plugin modules named in the global config.
 *
 * Modeled on `src/tools/mcp.ts`, deliberately: same cache-by-config-key shape,
 * and the same rule that **every failure is a warning, never a throw**. A broken
 * plugin must not be able to stop fox-agent from starting — the user would be left with
 * a harness that refuses to run and a stack trace pointing into someone else's
 * code. `mcpTools` set that precedent for MCP servers and it applies with more
 * force here, since a plugin failure happens at import time and would otherwise
 * take out the process.
 */
import { homedir } from "node:os";
import { isAbsolute, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { FoxPlugin } from "./types.ts";

export type { FoxPlugin } from "./types.ts";

let cache: { key: string; plugins: FoxPlugin[]; warnings: string[] } | null = null;

/**
 * `~/plugin.ts` in a config file should mean what it means in a shell. Node's
 * loader has no notion of `~`, so it would otherwise resolve to a literal
 * directory named `~` relative to cwd — a "cannot find module" for a path the
 * user can see is right.
 */
function expand(p: string, cwd: string): string {
  let out = p;
  if (out === "~") out = homedir();
  else if (out.startsWith("~/")) out = `${homedir()}/${out.slice(2)}`;
  return isAbsolute(out) ? out : resolve(cwd, out);
}

/**
 * A plugin must have a string `name`. Checked because the name is what every
 * warning about this plugin is keyed on: an unnamed export would produce
 * diagnostics that cannot be traced back to a file.
 */
function validate(mod: unknown, path: string): { plugin: FoxPlugin } | { error: string } {
  const candidate = (mod as { default?: unknown })?.default ?? mod;
  if (!candidate || typeof candidate !== "object") return { error: "module has no default export object" };
  const p = candidate as Partial<FoxPlugin>;
  if (typeof p.name !== "string" || !p.name.trim()) return { error: "default export has no string `name`" };
  if (p.tools !== undefined && !Array.isArray(p.tools)) return { error: "`tools` must be an array" };
  if (p.hooks !== undefined && (typeof p.hooks !== "object" || p.hooks === null)) return { error: "`hooks` must be an object" };
  if (p.providers !== undefined && (typeof p.providers !== "object" || p.providers === null)) return { error: "`providers` must be an object" };
  // a tool that is not shaped like a Tool would fail deep inside the turn loop
  // with no mention of the plugin, so it is rejected here where the path is known
  for (const t of p.tools ?? []) {
    if (typeof (t as { def?: { name?: unknown } })?.def?.name !== "string" || typeof (t as { run?: unknown })?.run !== "function") {
      return { error: "a tool is not { def: { name, ... }, run }" };
    }
  }
  return { plugin: p as FoxPlugin };
}

/**
 * Import each path and collect the valid plugins. Cached on the path list, so the
 * repeated `buildRegistry` calls a long session makes do not re-import — and, more
 * importantly, so `onSessionStart` state a plugin holds in module scope survives
 * the way an author would expect.
 *
 * `disabled` entries never reach `import()` at all: matched against the path as
 * written, its basename, and the basename without extension, so
 * `disabledPlugins = ["experimental"]` kills `./experimental.ts` without its
 * code ever running.
 */
export async function loadPlugins(
  paths: string[],
  cwd = process.cwd(),
  disabled: string[] = [],
): Promise<{ plugins: FoxPlugin[]; warnings: string[] }> {
  const key = JSON.stringify([paths, cwd, disabled]);
  if (cache?.key === key) return { plugins: cache.plugins, warnings: cache.warnings };

  const plugins: FoxPlugin[] = [];
  const warnings: string[] = [];
  const seen = new Set<string>();
  const isDisabled = (raw: string) => {
    const base = raw.split("/").pop() ?? raw;
    const stem = base.replace(/\.(ts|js|mjs|mts)$/, "");
    return disabled.some((d) => d === raw || d === base || d === stem);
  };

  for (const raw of paths) {
    if (isDisabled(raw)) continue;
    const path = expand(raw, cwd);
    let mod: unknown;
    try {
      // a file URL, not a bare path: an absolute POSIX path happens to work as a
      // specifier but a Windows one does not, and the URL form is correct on both
      mod = await import(pathToFileURL(path).href);
    } catch (e) {
      const w = `plugin '${raw}' failed to load: ${(e as Error).message.slice(0, 200)}`;
      warnings.push(w);
      console.error(`fox-agent: ${w}`);
      continue;
    }
    const res = validate(mod, path);
    if ("error" in res) {
      const w = `plugin '${raw}' invalid: ${res.error}`;
      warnings.push(w);
      console.error(`fox-agent: ${w}`);
      continue;
    }
    // two config entries resolving to the same plugin name would register its
    // tools twice and fire its hooks twice per point, which reads as a fox-agent bug
    if (seen.has(res.plugin.name)) {
      const w = `plugin '${raw}' skipped: name '${res.plugin.name}' is already loaded`;
      warnings.push(w);
      console.error(`fox-agent: ${w}`);
      continue;
    }
    seen.add(res.plugin.name);
    plugins.push(res.plugin);
  }

  cache = { key, plugins, warnings };
  return { plugins, warnings };
}

/** Drop the cache so the next `loadPlugins` re-imports. Tests need this. */
export function resetPlugins(): void {
  cache = null;
}

/**
 * The plugins of the most recent `buildRegistry` — bundled ones included.
 * Module-level because lifecycle events (session end on exit/switch/delete)
 * happen far from the turn loop that built the registry.
 */
let active: FoxPlugin[] = [];
export function setActivePlugins(plugins: FoxPlugin[]): void {
  active = plugins;
}
export function activePlugins(): FoxPlugin[] {
  return active;
}

/**
 * Fire `onSessionEnd` on every active plugin. Failures are logged, never
 * thrown — cleanup is no place to take the harness down with a plugin.
 */
export async function fireSessionEnd(sessionId: string, reason: "exit" | "switch" | "delete"): Promise<void> {
  for (const p of active) {
    if (!p.hooks?.onSessionEnd) continue;
    try {
      await p.hooks.onSessionEnd({ sessionId, reason });
    } catch (e) {
      console.error(`fox-agent: plugin '${p.name}' onSessionEnd failed: ${(e as Error).message}`);
    }
  }
}
