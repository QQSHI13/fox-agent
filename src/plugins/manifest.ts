import { join } from "node:path";

/**
 * Static plugin manifest: the metadata fox-agent reads BEFORE importing plugin code.
 *
 * The manifest is data, not the runtime FoxPlugin. Keeping it static lets the
 * kernel validate identity, contributions, dependencies, and permissions before
 * executing a plugin module. A file entry `/x/mytools.ts` carries its manifest
 * beside it as `/x/mytools.plugin.json`; a directory entry uses `/x/plugin.json`.
 */

export const PLUGIN_PERMISSIONS = [
  "env",
  "network",
  "shell",
  "fs.read",
  "fs.write",
  "sessions",
  "provider",
] as const;

export type PluginPermission = (typeof PLUGIN_PERMISSIONS)[number];

const CONTRIBUTION_KEYS = [
  "tools",
  "commands",
  "providers",
  "hooks",
  "themes",
  "mcpServers",
  "agents",
  "regions",
  "statusSegments",
  "keybindings",
  "gatewayMethods",
  "gatewayRoutes",
  "gatewayPanels",
] as const;

export type PluginContributionKind = (typeof CONTRIBUTION_KEYS)[number];

export interface PluginContributions {
  tools?: string[];
  commands?: string[];
  providers?: string[];
  hooks?: string[];
  themes?: string[];
  mcpServers?: string[];
  agents?: string[];
  regions?: string[];
  statusSegments?: string[];
  keybindings?: string[];
  gatewayMethods?: string[];
  gatewayRoutes?: string[];
  gatewayPanels?: string[];
}

export interface PluginManifest {
  id: string;
  version: string;
  entry?: string;
  manifestOnly?: boolean;
  permissions: PluginPermission[];
  contributes: PluginContributions;
  dependencies?: string[];
  activation?: "startup" | "session" | "turn" | "tool" | "lazy";
  api?: string;
  configSchema?: Record<string, unknown>;
}

export type ManifestParseResult =
  | { ok: true; manifest: PluginManifest; warnings: string[] }
  | { ok: false; error: string };

const KNOWN_KEYS = new Set([
  "id",
  "version",
  "entry",
  "manifestOnly",
  "permissions",
  "contributes",
  "dependencies",
  "activation",
  "api",
  "configSchema",
]);

const KNOWN_CONTRIBUTION_KEYS = new Set<string>(CONTRIBUTION_KEYS);
const KNOWN_PERMISSIONS = new Set<string>(PLUGIN_PERMISSIONS);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fail(error: string): ManifestParseResult {
  return { ok: false, error };
}

function parseStringArray(value: unknown, field: string): string[] | { error: string } {
  if (!Array.isArray(value)) return { error: `${field} must be an array of strings` };
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== "string" || !item.trim()) return { error: `${field} must be an array of strings` };
    out.push(item.trim());
  }
  return out;
}

/** Parse and validate static plugin manifest data. Unknown fields warn, bad shapes fail. */
export function parsePluginManifest(raw: unknown): ManifestParseResult {
  if (!isRecord(raw)) return fail("manifest must be an object");
  const warnings: string[] = [];
  for (const key of Object.keys(raw)) {
    if (!KNOWN_KEYS.has(key)) warnings.push(`unknown manifest field '${key}' - ignored`);
  }

  if (typeof raw.id !== "string" || !/^[A-Za-z0-9][A-Za-z0-9:_-]*$/.test(raw.id)) {
    return fail("id must be a non-empty string using letters, numbers, ':', '_' or '-'");
  }
  if (typeof raw.version !== "string" || !/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(raw.version)) {
    return fail("version must be a semantic version string");
  }

  const manifestOnly = raw.manifestOnly === true;
  let entry: string | undefined;
  if (raw.entry !== undefined) {
    if (typeof raw.entry !== "string" || !raw.entry.trim()) return fail("entry must be a non-empty string");
    entry = raw.entry.trim();
  }
  if (!manifestOnly && !entry) return fail("entry is required unless manifestOnly is true");

  if (!Array.isArray(raw.permissions)) return fail("permissions must be an array");
  const permissions: PluginPermission[] = [];
  for (const permission of raw.permissions) {
    if (typeof permission !== "string" || !KNOWN_PERMISSIONS.has(permission)) {
      return fail(`unknown permission '${String(permission)}'`);
    }
    if (!permissions.includes(permission as PluginPermission)) permissions.push(permission as PluginPermission);
  }

  if (!isRecord(raw.contributes)) return fail("contributes must be an object");
  const contributes: PluginContributions = {};
  for (const [key, value] of Object.entries(raw.contributes)) {
    if (!KNOWN_CONTRIBUTION_KEYS.has(key)) {
      warnings.push(`unknown contribution kind '${key}' - ignored`);
      continue;
    }
    const parsed = parseStringArray(value, `contributes.${key}`);
    if ("error" in parsed) return fail(parsed.error);
    (contributes as Record<string, string[]>)[key] = parsed;
  }

  let dependencies: string[] | undefined;
  if (raw.dependencies !== undefined) {
    const parsed = parseStringArray(raw.dependencies, "dependencies");
    if ("error" in parsed) return fail(parsed.error);
    dependencies = parsed;
  }

  let activation: PluginManifest["activation"];
  if (raw.activation !== undefined) {
    if (raw.activation !== "startup" && raw.activation !== "session" && raw.activation !== "turn" && raw.activation !== "tool" && raw.activation !== "lazy") {
      return fail("activation must be startup, session, turn, tool, or lazy");
    }
    activation = raw.activation;
  }

  if (raw.api !== undefined && (typeof raw.api !== "string" || !raw.api.trim())) return fail("api must be a non-empty string");
  if (raw.configSchema !== undefined && !isRecord(raw.configSchema)) return fail("configSchema must be an object");

  return {
    ok: true,
    warnings,
    manifest: {
      id: raw.id,
      version: raw.version,
      ...(entry === undefined ? {} : { entry }),
      ...(manifestOnly ? { manifestOnly: true } : {}),
      permissions,
      contributes,
      ...(dependencies === undefined ? {} : { dependencies }),
      ...(activation === undefined ? {} : { activation }),
      ...(raw.api === undefined ? {} : { api: (raw.api as string).trim() }),
      ...(raw.configSchema === undefined ? {} : { configSchema: raw.configSchema }),
    },
  };
}

/** Resolve the static manifest path for a configured plugin file or directory. */
export function manifestPathFor(entryPath: string): string {
  const ext = entryPath.split("/").pop()?.includes(".") ? entryPath.slice(entryPath.lastIndexOf(".")) : "";
  if (!ext) return join(entryPath, "plugin.json");
  const dir = entryPath.slice(0, entryPath.length - entryPath.split("/").pop()!.length);
  const base = entryPath.split("/").pop()!;
  return `${dir}${base.slice(0, base.length - ext.length)}.plugin.json`;
}

/** Typed helper for in-repo manifests. External manifests remain plain JSON. */
export function definePlugin(manifest: PluginManifest): PluginManifest {
  return manifest;
}
