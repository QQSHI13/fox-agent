/**
 * Plugin manifests — a plugin is a DIRECTORY shipping `package.json` and plain,
 * readable source.
 *
 * ## Why a directory and not a bundle
 *
 * A plugin installs by being a normal package with normal dependencies, so bun
 * resolves them (`bun install` in the plugin's directory) and we never write a
 * resolver, a lockfile format, or a tar reader. Bun owns all of that.
 *
 * The other reason is the one fox-agent cares about more: shipping SOURCE means
 * the agent can read a plugin's code and docs with the ordinary `read` tool.
 * There is no build step, no minified blob, and no "go look at the source repo"
 * — the plugin is right there under `~/.config/fox-agent/plugins/`.
 *
 * ## Why the `fox` field
 *
 * `package.json` stays a valid npm package (name, version, dependencies), so a
 * plugin can be published and installed like anything else. The `fox` key is
 * namespaced, so unknown keys from other ecosystems are ignored, and a plugin
 * with no `fox` field at all is still loadable by convention (`index.ts`).
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

/** The `fox` key of a plugin's package.json. All fields optional. */
export interface FoxManifest {
  /**
   * Entry module, relative to the plugin directory. Defaults to `index.ts`,
   * then `index.js` — so the smallest possible plugin is a single file.
   */
  entry?: string;
  /**
   * Other fox plugins this one needs, by plugin NAME (not npm package name).
   * Declared so the manager can order activation, report a missing or disabled
   * dependency, and — once there is a catalog — fetch the closure. Access
   * itself stays a plain ESM import; this is bookkeeping, not an API.
   */
  dependencies?: string[];
  /** one-line summary, shown in /plugins */
  description?: string;
  /**
   * Plugin names this one intentionally TAKES OVER — a `replaceable` built-in
   * (pi's model) or another plugin. Without this, a name collision is
   * "warn, first wins", which means a user cannot actually install their own
   * version of a built-in.
   */
  replaces?: string[];
  /** minimum fox-agent version the plugin needs */
  requires?: string;
}

export interface PluginManifest {
  /** package.json `name`, or the directory basename when absent */
  name: string;
  version: string;
  /** absolute plugin directory */
  dir: string;
  /** the `fox` block, or null when the package.json has none */
  fox: FoxManifest | null;
  /** absolute path of the entry module, resolved and verified to exist */
  entry: string | null;
  /** declared dependencies, de-duplicated, in manifest order */
  dependencies: string[];
  /** absolute paths of the manifest + entry, for display */
  files: string[];
  /** why this directory is not loadable, when it is not */
  error?: string;
}

/** Strip a UTF-8 BOM, which JSON.parse rejects. */
function stripBom(s: string): string {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

function isDir(p: string): boolean {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function readJson(p: string): { value: unknown } | { error: string } {
  let raw: string;
  try {
    raw = readFileSync(p, "utf8");
  } catch (e) {
    return { error: `cannot read ${p}: ${(e as Error).message.split("\n")[0]}` };
  }
  try {
    return { value: JSON.parse(stripBom(raw)) };
  } catch (e) {
    return { error: `${p} is not valid JSON: ${(e as Error).message.split("\n")[0]}` };
  }
}

/** The conventional entry, when a plugin ships no `fox.entry`. */
function conventionalEntry(dir: string): string | null {
  for (const name of ["index.ts", "index.js", "index.mjs"]) {
    const p = join(dir, name);
    if (existsSync(p)) return p;
  }
  return null;
}

/**
 * Read a plugin directory's manifest. NEVER throws: a broken plugin must not
 * stop fox-agent from starting (see load.ts, where the same rule governs
 * import failure). A bad manifest comes back as `{ error }` for the caller to
 * report as a warning.
 *
 * Path traversal in `fox.entry` is refused — a manifest that names `../../..`
 * must not be able to pull in a file from outside its own directory.
 */
export function readPluginManifest(dir: string): PluginManifest {
  const abs = resolve(dir);
  const base = { name: abs.split("/").pop() ?? abs, version: "0.0.0", dir: abs, fox: null as FoxManifest | null, entry: null as string | null, dependencies: [] as string[], files: [] as string[] };

  if (!isDir(abs)) return { ...base, error: `plugin path is not a directory: ${abs}` };
  const pkgPath = join(abs, "package.json");
  if (!existsSync(pkgPath)) {
    // no package.json: still loadable by convention, but it can declare no
    // dependencies, so say so rather than failing later at bun install
    const entry = conventionalEntry(abs);
    if (!entry) return { ...base, error: `no package.json and no index.ts in ${abs}` };
    return { ...base, name: abs.split("/").pop() ?? abs, entry, files: [entry] };
  }

  const read = readJson(pkgPath);
  if ("error" in read) return { ...base, error: read.error };
  const pkg = (read.value ?? {}) as Record<string, unknown>;
  const name = typeof pkg.name === "string" && pkg.name.trim() ? pkg.name.trim() : (abs.split("/").pop() ?? abs);
  const version = typeof pkg.version === "string" ? pkg.version : "0.0.0";

  const rawFox = pkg.fox;
  let fox: FoxManifest | null = null;
  if (rawFox !== undefined && rawFox !== null) {
    if (typeof rawFox !== "object" || Array.isArray(rawFox)) return { ...base, name, version, error: "`fox` in package.json must be an object" };
    const f = rawFox as Record<string, unknown>;
    if (f.entry !== undefined && typeof f.entry !== "string") return { ...base, name, version, error: "`fox.entry` must be a string" };
    if (f.requires !== undefined && typeof f.requires !== "string") return { ...base, name, version, error: "`fox.requires` must be a string" };
    for (const key of ["dependencies", "replaces"] as const) {
      const v = f[key];
      if (v !== undefined && (!Array.isArray(v) || v.some((x) => typeof x !== "string"))) {
        return { ...base, name, version, error: `\`fox.${key}\` must be an array of strings` };
      }
    }
    fox = {
      ...(typeof f.entry === "string" ? { entry: f.entry } : {}),
      ...(Array.isArray(f.dependencies) ? { dependencies: f.dependencies as string[] } : {}),
      ...(typeof f.description === "string" ? { description: f.description } : {}),
      ...(Array.isArray(f.replaces) ? { replaces: f.replaces as string[] } : {}),
      ...(typeof f.requires === "string" ? { requires: f.requires } : {}),
    };
  }

  // entry: declared, else conventional
  let entry: string | null;
  if (fox?.entry) {
    if (fox.entry.startsWith("/") || fox.entry.split("/").includes("..")) {
      return { ...base, name, version, fox, error: `\`fox.entry\` must stay inside the plugin directory: ${fox.entry}` };
    }
    entry = join(abs, fox.entry);
  } else {
    entry = conventionalEntry(abs);
  }
  if (!entry) return { ...base, name, version, fox, error: `no \`fox.entry\` and no index.ts in ${abs}` };
  if (!existsSync(entry)) return { ...base, name, version, fox, error: `entry not found: ${entry}` };

  // de-dupe deps, keep manifest order
  const dependencies = [...new Set(fox?.dependencies ?? [])].filter((d) => d.trim());
  return { name, version, dir: abs, fox, entry, dependencies, files: [pkgPath, entry] };
}
