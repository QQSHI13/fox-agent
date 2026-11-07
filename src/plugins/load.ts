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
import { isAbsolute, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { ok, fail } from "../core/tool.ts";
import { signal } from "../tui/reactive.ts";
import type { FoxPlugin } from "./types.ts";

export type { FoxPlugin } from "./types.ts";

/**
 * The runtime half of the `fox-agent/sdk` surface, handed to a plugin through a
 * global so it can import the SDK without a `node_modules` beside it.
 *
 * Type-only imports (`import type { FoxPlugin }`) erase at compile time and need
 * nothing. This exists for the VALUE imports — `ok`, `fail`, `createAgent` —
 * which a plugin genuinely calls.
 */
function sdkRuntime(): Record<string, unknown> {
  // `regionSignal` is the host's OWN signal, not a copy: writing it must
  // schedule a frame through the same scheduler every built-in region uses.
  // A separate implementation would accept the write and never repaint.
  return { ok, fail, regionSignal: signal, repaint: requestRepaint };
}

const SDK_SHIM = `
const s = globalThis.__FOX_SDK__;
if (!s) throw new Error("fox-agent: the SDK runtime is not installed (plugin loaded outside the host)");
export const ok = s.ok;
export const fail = s.fail;
export const createAgent = s.createAgent;
export const regionSignal = s.regionSignal;
export const repaint = s.repaint;
`;

/**
 * Ask the host to re-derive a region.
 *
 * ## Why this exists at all
 *
 * The transcript's frame is O(rows in view): it re-wraps, re-marks and
 * re-composites. What it reacts to is therefore an explicit list of causes, not
 * a scan of everything that could matter. Anything that CHANGES one of those
 * causes has to say so — and that includes a plugin, which could otherwise only
 * repaint its own band.
 *
 * Concrete case this closes: the transcript's viewport height is
 * `pendingCount` (the queued/steering stack above the dock). `steer()` changed
 * that stack and bumped nothing the transcript read, so the bottom rows stayed
 * at the old height until some unrelated event repainted. The same door is what
 * a plugin needs to say "I changed something the transcript renders".
 *
 * ## Shape
 *
 * Registered from inside the TUI, exactly like `clearKeyRef`/`frameArmRef` in
 * app.ts: a module-level slot assigned by `setRepaintHandler`, invoked from
 * anywhere, and a no-op before a TUI exists. A headless host leaves it null —
 * there is nothing to paint, and `requestRepaint` returning false is the honest
 * answer rather than an error.
 */
export type RepaintRegion = "transcript" | "dock" | "floats" | "overlay" | "status";

let repaintHandler: ((region?: RepaintRegion) => void) | null = null;

/** Installed by the TUI once its regions exist; cleared on teardown. */
export function setRepaintHandler(fn: ((region?: RepaintRegion) => void) | null): void {
  repaintHandler = fn;
}

/**
 * Re-derive `region` (or everything when omitted). Returns whether a TUI was
 * attached to take the request — false on a headless host, which is not an
 * error.
 */
export function requestRepaint(region?: RepaintRegion): boolean {
  if (!repaintHandler) return false;
  repaintHandler(region);
  return true;
}

/**
 * Import a plugin module, resolving `fox-agent/sdk` even where it is not
 * installed.
 *
 * A plugin is one file the user dropped somewhere — `~/my-fox-plugin.ts` — with
 * no `node_modules` beside it. A bare `import("…")` therefore resolves nothing
 * for `fox-agent/sdk`, so a plugin that VALUE-imports the SDK (`ok`/`fail`)
 * failed outright with "Cannot find package 'fox-agent'". Worse, it did so only
 * in the shipped binary: in a repo checkout the path sometimes resolved off the
 * repo's own `node_modules`, so the failure was invisible during development
 * and total after `fox install`. That is the one gap that stopped "add a feature
 * by adding a plugin" from being true for the packaged product.
 *
 * So: try the plain import first (a plugin inside a project that DOES have
 * fox-agent installed keeps working exactly as before), and on a resolution
 * failure re-bundle the single file with the SDK aliased to a shim that reads a
 * global. `Bun.build` is available in the compiled binary — verified — so this
 * needs no toolchain on the user's machine.
 */
async function importPlugin(href: string, fresh: boolean, raw: string): Promise<unknown> {
  const spec = fresh ? `${href}?foxreload=${Date.now()}` : href;
  try {
    return await import(spec);
  } catch (e) {
    // Only a module RESOLUTION failure is retried. A plugin that throws on its
    // own line 3 is a real bug in the plugin and must report as one.
    if (!/Cannot find (package|module) 'fox-agent/i.test((e as Error).message)) throw e;
    (globalThis as { __FOX_SDK__?: unknown }).__FOX_SDK__ = sdkRuntime();
    const dir = mkdtempSync(join(tmpdir(), "fox-plugin-"));
    try {
      const res = await Bun.build({
        entrypoints: [decodeURIComponent(new URL(href).pathname)],
        target: "bun",
        format: "esm",
        plugins: [{
          name: "fox-sdk-shim",
          setup(build) {
            build.onResolve({ filter: /^fox-agent(\/sdk)?$/ }, () => ({ path: "fox-sdk", namespace: "foxsdk" }));
            build.onLoad({ filter: /.*/, namespace: "foxsdk" }, () => ({ contents: SDK_SHIM, loader: "js" }));
          },
        }],
      });
      if (!res.success) throw new Error(res.logs.map(String).join("; ") || "could not bundle");
      const out = join(dir, "plugin.mjs");
      await Bun.write(out, await res.outputs[0]!.text());
      // imported, not copied into memory: the module keeps its own state, and
      // the temp dir is removed once the import has been evaluated
      return await import(`${pathToFileURL(out).href}${fresh ? `?foxreload=${Date.now()}` : ""}`);
    } catch (inner) {
      throw new Error(`${(e as Error).message} (and the SDK-shim fallback failed: ${(inner as Error).message}) for '${raw}'`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
}

let cache: { key: string; plugins: FoxPlugin[]; warnings: string[]; files: { path: string; name: string | null; disabled: boolean }[] } | null = null;

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
  if (p.themes !== undefined && (typeof p.themes !== "object" || p.themes === null)) return { error: "`themes` must be an object" };
  if (p.mcpServers !== undefined && (typeof p.mcpServers !== "object" || p.mcpServers === null)) return { error: "`mcpServers` must be an object" };
  if (p.agents !== undefined && (typeof p.agents !== "object" || p.agents === null)) return { error: "`agents` must be an object" };
  if (p.commands !== undefined && !Array.isArray(p.commands)) return { error: "`commands` must be an array" };
  // a tool that is not shaped like a Tool would fail deep inside the turn loop
  // with no mention of the plugin, so it is rejected here where the path is known
  for (const t of p.tools ?? []) {
    if (typeof (t as { def?: { name?: unknown } })?.def?.name !== "string" || typeof (t as { run?: unknown })?.run !== "function") {
      return { error: "a tool is not { def: { name, ... }, run }" };
    }
  }
  // same for commands: a nameless or unrunnable command would only fail when typed
  for (const c of p.commands ?? []) {
    const name = (c as { name?: unknown })?.name;
    if (typeof name !== "string" || !name.startsWith("/") || name.includes(" ") || typeof (c as { run?: unknown })?.run !== "function") {
      return { error: "a command is not { name: '/word', run }" };
    }
  }
  return { plugin: p as FoxPlugin };
}

/**
 * Import each path and collect the valid plugins. Cached on the path list, so the
 * repeated `buildRegistry` calls a long session makes do not re-import — and, more
 * importantly, so `onSessionStart` state a plugin holds in module scope survives
 * the way an author would expect. `reloadPlugins()` breaks both caches on purpose:
 * /reload exists so editing a plugin file takes effect without a restart.
 *
 * `disabled` entries never reach `import()` at all: matched against the path as
 * written, its basename, and the basename without extension, so
 * `disabledPlugins = ["experimental"]` kills `./experimental.ts` without its
 * code ever running.
 */
let forceFresh = false;
/** /reload: the next loadPlugins re-imports every module, ignoring both caches. */
export function reloadPlugins(): void {
  cache = null;
  forceFresh = true;
}

/**
 * Does a `disabledPlugins` entry match this configured path? Shared by the
 * loader's skip and `/plugins` management, so the two can never disagree
 * about what "off" means: the entry as written, its basename, or its stem.
 */
export function isPluginPathDisabled(raw: string, disabled: string[]): boolean {
  const base = raw.split("/").pop() ?? raw;
  const stem = base.replace(/\.(ts|js|mjs|mts)$/, "");
  return disabled.some((d) => d === raw || d === base || d === stem);
}

export async function loadPlugins(
  paths: string[],
  // Relative plugin paths resolve against the GLOBAL config dir, never the
  // repo cwd: plugins are global-only, and resolving against cwd would let
  // "cd repo && fox" load that repo's code despite the global-only rule.
  cwd = join(homedir(), ".config", "fox-agent"),
  disabled: string[] = [],
): Promise<{ plugins: FoxPlugin[]; warnings: string[]; files: { path: string; name: string | null; disabled: boolean }[] }> {
  const fresh = forceFresh;
  forceFresh = false;
  const key = JSON.stringify([paths, cwd, disabled]);
  if (!fresh && cache?.key === key) return { plugins: cache.plugins, warnings: cache.warnings, files: cache.files };

  const plugins: FoxPlugin[] = [];
  const warnings: string[] = [];
  const files: { path: string; name: string | null; disabled: boolean }[] = [];
  const seen = new Set<string>();
  const isDisabled = (raw: string) => isPluginPathDisabled(raw, disabled);

  for (const raw of paths) {
    if (isDisabled(raw)) {
      files.push({ path: raw, name: null, disabled: true });
      continue;
    }
    const path = expand(raw, cwd);
    let mod: unknown;
    try {
      // a file URL, not a bare path: an absolute POSIX path happens to work as a
      // specifier but a Windows one does not, and the URL form is correct on both.
      // A /reload import gets a cache-busting query so edited plugin code lands.
      const href = pathToFileURL(path).href;
      mod = await importPlugin(href, fresh, raw);
    } catch (e) {
      const w = `plugin '${raw}' failed to load: ${(e as Error).message.slice(0, 200)}`;
      warnings.push(w);
      console.error(`fox-agent: ${w}`);
      files.push({ path: raw, name: null, disabled: false });
      continue;
    }
    const res = validate(mod, path);
    if ("error" in res) {
      const w = `plugin '${raw}' invalid: ${res.error}`;
      warnings.push(w);
      console.error(`fox-agent: ${w}`);
      files.push({ path: raw, name: null, disabled: false });
      continue;
    }
    // two config entries resolving to the same plugin name would register its
    // tools twice and fire its hooks twice per point, which reads as a fox-agent bug
    if (seen.has(res.plugin.name)) {
      const w = `plugin '${raw}' skipped: name '${res.plugin.name}' is already loaded`;
      warnings.push(w);
      console.error(`fox-agent: ${w}`);
      files.push({ path: raw, name: res.plugin.name, disabled: false });
      continue;
    }
    seen.add(res.plugin.name);
    plugins.push(res.plugin);
    files.push({ path: raw, name: res.plugin.name, disabled: false });
  }

  cache = { key, plugins, warnings, files };
  return { plugins, warnings, files };
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
/**
 * How long all plugin cleanup hooks get, together, before shutdown stops
 * waiting for them.
 *
 * A plugin is third-party code, and `onSessionEnd` is its last chance to hang
 * the harness: the return value is `await`ed, so a promise that never settles
 * blocks the exit forever — the TUI tears down, prints the resume hint, and the
 * shell never comes back. That is an unbounded wait on someone else's code, so
 * it gets a deadline like every other cross-boundary call here.
 *
 * Generous, because a legitimate hook may kill a tmux session or flush a file.
 */
const SESSION_END_TIMEOUT_MS = 2_000;

export async function fireSessionEnd(sessionId: string, reason: "exit" | "switch" | "delete"): Promise<void> {
  for (const p of active) {
    if (!p.hooks?.onSessionEnd) continue;
    try {
      // Raced, not merely awaited: a hook that never resolves must cost one
      // warn line, not the process.
      let timer: ReturnType<typeof setTimeout> | undefined;
      await Promise.race([
        p.hooks.onSessionEnd({ sessionId, reason }),
        new Promise<void>((resolve) => {
          timer = setTimeout(() => {
            console.error(`fox-agent: plugin '${p.name}' onSessionEnd timed out after ${SESSION_END_TIMEOUT_MS}ms — continuing shutdown`);
            resolve();
          }, SESSION_END_TIMEOUT_MS);
          (timer as { unref?: () => void }).unref?.();
        }),
      ]);
      if (timer) clearTimeout(timer);
    } catch (e) {
      console.error(`fox-agent: plugin '${p.name}' onSessionEnd failed: ${(e as Error).message}`);
    }
  }
}
