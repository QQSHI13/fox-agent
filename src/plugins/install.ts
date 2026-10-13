/**
 * Plugin dependency installation.
 *
 * A plugin is a directory with a `package.json` and plain source. Its npm
 * dependencies are installed with npm's own resolver, embedded:
 *
 *   `import("@npmcli/arborist")` → `new Arborist(...).reify()`
 *
 * ## Why embed npm's resolver instead of shelling out
 *
 * The obvious move is to shell out to a system `bun install` (pi's approach).
 * That needs a language toolchain on the user's machine, and our install path
 * is `curl | bash` — most users have no bun. Bun 1.4.3 has no `Bun.install`, and
 * a compiled binary does not expose the package manager (`fox add` →
 * `unknown command`), so the binary cannot cover for it. A cloud VM provisioned
 * for an agent would need a toolchain installed before a plugin could have any
 * dependency at all, which is the wrong shape for that use.
 *
 * The alternatives were measured, not assumed:
 *   - `nypm` (51 KB) is a process launcher, not a resolver — it shells out to
 *     npm/pnpm/yarn/bun/deno and has no semver logic of its own.
 *   - `pacote-install` (39 KB) pulls `pacote` (17 direct deps) and handles ONE
 *     spec — it has no tree resolution, which is the actual problem — and drags
 *     in `@npmcli/run-script`, the lifecycle-script surface we are removing.
 *   - `@pnpm/core` is pnpm's monorepo internals and wants pnpm's runtime.
 * There is no lighter embeddable tree resolver: the ecosystem deliberately has
 * one, it is first-party npm's, and opencode made the same call.
 *
 * Measured cost of embedding: 94.4 MB -> 94.8 MB.
 *
 * ## Why `ignoreScripts: true`
 *
 * A dependency's `postinstall` runs arbitrary code at install time, in the
 * user's home, with the user's credentials. A plugin the user chose must not be
 * able to execute code on behalf of its own dependencies without saying so.
 * Lifecycle scripts are not run, and the `preinstall`/`install`/`postinstall`
 * hooks of packages that need them are therefore unsupported — a plugin that
 * needs one should say so in its manifest rather than have it happen silently.
 *
 * ## The central store
 *
 * One directory holds every plugin plus a single shared `node_modules`, so a
 * dependency used by three plugins is fetched once. Resolution walks up from
 * each plugin's own directory and finds that shared root, so a plugin needs no
 * `node_modules` of its own. This is a bun/npm workspace layout, and it works
 * from the compiled binary with the cwd anywhere (verified).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { readPluginManifest } from "./manifest.ts";

/** Where the central store lives: every plugin, plus one shared node_modules. */
export function pluginsRoot(home = homedir()): string {
  return join(home, ".config", "fox-agent", "plugins");
}

/** How long a `reify` may run before we give up on it. */
const INSTALL_TIMEOUT_MS = 300_000;

export interface InstallResult {
  ok: boolean;
  /** the plugin dir installed into */
  dir: string;
  /** the dependency names that were installed/updated */
  installed: string[];
  /** the file id (e.g. `pg@8.11.3`) of each resolved dependency */
  resolved: { name: string; version: string }[];
  /** why it failed, or why nothing needed doing */
  note?: string;
}

/** The store's own package.json — the workspace root deps are installed into. */
function storeManifestPath(root: string): string {
  return join(root, "package.json");
}

function readJson(p: string): Record<string, unknown> {
  try {
    return JSON.parse(readFileSync(p, "utf8")) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/**
 * Register a plugin's npm dependencies in the store's manifest.
 *
 * The store is one workspace: every plugin contributes its `dependencies` here
 * and a single install resolves them together, deduped. A plugin declares what
 * it imports; the store decides one version, so two plugins needing different
 * versions of one library is a conflict the resolver reports rather than
 * something that silently breaks at load time.
 */
export function registerDeps(root: string, dir: string): { added: string[]; conflict: string[] } {
  const pkgPath = join(dir, "package.json");
  const pkg = readJson(pkgPath);
  const deps = (pkg.dependencies ?? {}) as Record<string, string>;
  const added: string[] = [];
  const conflict: string[] = [];
  if (Object.keys(deps).length === 0) return { added, conflict };

  mkdirSync(root, { recursive: true });
  const storePath = storeManifestPath(root);
  const store = readJson(storePath);
  const current = (store.dependencies ?? {}) as Record<string, string>;

  for (const [name, range] of Object.entries(deps)) {
    const have = current[name];
    if (have === undefined) {
      current[name] = range;
      added.push(name);
    } else if (have !== range) {
      // NOT an error: the store is shared, so two plugins may legitimately want
      // different ranges. It is recorded so /plugins can show it, because the
      // loser of a range conflict gets whichever version resolves.
      conflict.push(`${name}: store has ${have}, ${String(readJson(pkgPath).name ?? name)} wants ${range}`);
    }
  }

  writeFileSync(
    storePath,
    JSON.stringify({ name: "fox-agent-plugin-store", private: true, version: "0.0.0", dependencies: current }, null, 2) + "\n",
  );
  return { added, conflict };
}

/**
 * Install the store's dependencies.
 *
 * No-op (and no error) when the store declares none — the common case, where a
 * plugin is pure source and needs nothing but the binary.
 */
export async function installStoreDeps(root: string): Promise<InstallResult> {
  const empty: InstallResult = { ok: true, dir: root, installed: [], resolved: [], note: "no npm dependencies" };
  const storePath = storeManifestPath(root);
  if (!existsSync(storePath)) return empty;
  const store = readJson(storePath);
  const deps = (store.dependencies ?? {}) as Record<string, string>;
  if (Object.keys(deps).length === 0) return empty;

  const { Arborist } = (await import("@npmcli/arborist")) as unknown as {
    Arborist: new (opts: Record<string, unknown>) => {
      reify(opts: Record<string, unknown>): Promise<{ inventory?: { values(): Iterable<{ name?: string; version?: string; location?: string }> } }>;
    };
  };

  const arb = new Arborist({
    path: root,
    // a dependency's install/postinstall would run code in the user's home with
    // the user's credentials; a plugin must not get that without saying so
    ignoreScripts: true,
    // audit reports are unused here, but Arborist waits for them before it
    // reports an install complete
    audit: false,
    binLinks: true,
    progress: false,
  });

  const tree = await withTimeout(
    arb.reify({ audit: false, save: true, saveType: "prod" }),
    INSTALL_TIMEOUT_MS,
    `dependency install exceeded ${INSTALL_TIMEOUT_MS / 1000}s`,
  );

  // report what actually landed, so the caller can show it and a test can assert
  // on it without re-reading node_modules
  const resolved: { name: string; version: string }[] = [];
  for (const node of tree.inventory?.values() ?? []) {
    if (!node.name || !node.version) continue;
    // the store itself appears in the inventory; it is not a dependency
    if (node.name === "fox-agent-plugin-store") continue;
    resolved.push({ name: node.name, version: node.version });
  }
  return { ok: true, dir: root, installed: resolved.map((r) => `${r.name}@${r.version}`), resolved };
}

/**
 * Install one plugin directory: register its deps in the shared store, resolve
 * the store, and report. The plugin's own source is already on disk — this only
 * resolves what it imports.
 */
export async function installPlugin(dir: string, root = pluginsRoot()): Promise<InstallResult> {
  const manifest = readPluginManifest(dir);
  if (manifest.error) return { ok: false, dir, installed: [], resolved: [], note: manifest.error };

  const { added, conflict } = registerDeps(root, dir);
  if (conflict.length) {
    // surfaced, not fatal: the store resolves one version and /plugins shows
    // the conflict so it is visible rather than a load-time mystery
    console.error(`fox-agent: plugin '${manifest.name}' dependency conflicts:\n  ${conflict.join("\n  ")}`);
  }
  const res = await installStoreDeps(root);
  return { ...res, dir, note: added.length ? undefined : res.note };
}

/** Reject rather than hang: a resolver stuck on a dead network is a hung CLI. */
function withTimeout<T>(p: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(message)), ms);
    t.unref?.();
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}
