# Microkernel Phase 0-1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish the phase 0 characterization baseline and implement the phase 1 static plugin manifest plus deterministic composition kernel without changing turn, provider, tool, command, or TUI behavior.

**Architecture:** Keep the existing `FoxPlugin` runtime contract. Add a static manifest layer that is read and validated before any external plugin code executes, then add a pure composition function that orders plugin manifests and rejects duplicate IDs, duplicate contribution IDs, missing dependencies, and dependency cycles. Integrate that layer into `loadPlugins` while preserving the current warning-not-throw loader behavior.

**Tech Stack:** Bun, TypeScript, `bun:test`, existing plugin loader and fixture suites.

**Spec:** `docs/superpowers/specs/2026-11-15-microkernel-extension-architecture-design.md`

## Global Constraints

- Scope is phase 0 and phase 1 only. Do not extract providers, tools, commands, regions, or turn stages in this plan.
- Preserve the existing uncommitted `src/context/render.ts` change. Do not stage or modify it.
- External plugins must have a static manifest that is read before importing plugin code.
- For a configured entry `/path/mytools.ts`, the manifest path is `/path/mytools.plugin.json`.
- For a configured plugin directory `/path/mytools`, the manifest path is `/path/mytools/plugin.json`.
- A plugin without a manifest is skipped with a warning. Plugin failures remain warnings, never startup failures.
- Plugins remain global-only. Project config must not load plugins.
- `src/core/events.ts`, context projection, system prompt stability, and TUI reactivity are not touched.
- No new runtime dependencies.
- No `any` unless an existing boundary already requires it.
- Match current file style: terse comments, ASCII UI, no decorative reformatting.
- Never run `tsc`; the typecheck gate is `bun run typecheck`.
- Never run the full suite for one changed test file; run `bun test test/<file>.test.ts` for iteration.
- Final gates are `bun run typecheck`, `bun test`, and `bun run build`.
- The current binary-size baseline is `116893872` bytes. The post-build binary must not exceed `122738565` bytes, a 5 percent increase.
- ACP acceptance is not required unless `src/acp/` changes.
- Stage explicit paths only. Never run `git add -A` or `git add .`.

---

### Task 1: Plugin Manifest Schema

**Files:**
- Create: `src/plugins/manifest.ts`
- Test: `test/plugin-manifest.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `PluginPermission`
  - `PluginContributions`
  - `PluginManifest`
  - `ManifestParseResult`
  - `parsePluginManifest(raw: unknown): ManifestParseResult`
  - `manifestPathFor(entryPath: string): string`
  - `definePlugin(manifest: PluginManifest): PluginManifest`

- [ ] **Step 1: Write the failing manifest tests**

Create `test/plugin-manifest.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { definePlugin, manifestPathFor, parsePluginManifest, type PluginManifest } from "../src/plugins/manifest.ts";

describe("plugin manifest schema", () => {
  test("parses a valid manifest and warns on unknown fields", () => {
    const parsed = parsePluginManifest({
      id: "fixture",
      version: "1.0.0",
      entry: "./plugin-ok.ts",
      permissions: ["provider"],
      contributes: { tools: ["ping"], providers: ["fixture-echo"] },
      futureField: true,
    });

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.manifest.id).toBe("fixture");
    expect(parsed.manifest.version).toBe("1.0.0");
    expect(parsed.manifest.entry).toBe("./plugin-ok.ts");
    expect(parsed.manifest.permissions).toEqual(["provider"]);
    expect(parsed.manifest.contributes.tools).toEqual(["ping"]);
    expect(parsed.warnings).toEqual(["unknown manifest field 'futureField' - ignored"]);
  });

  test("manifestOnly does not require an entry", () => {
    const parsed = parsePluginManifest({
      id: "metadata-only",
      version: "0.1.0",
      manifestOnly: true,
      permissions: [],
      contributes: {},
    });

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.manifest.manifestOnly).toBe(true);
    expect(parsed.manifest.entry).toBeUndefined();
  });

  test("rejects a non-object manifest", () => {
    const parsed = parsePluginManifest("nope");
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.error).toContain("manifest must be an object");
  });

  test("rejects an unknown permission", () => {
    const parsed = parsePluginManifest({
      id: "fixture",
      version: "1.0.0",
      entry: "./x.ts",
      permissions: ["everything"],
      contributes: {},
    });

    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.error).toContain("unknown permission 'everything'");
  });

  test("rejects non-string contribution IDs", () => {
    const parsed = parsePluginManifest({
      id: "fixture",
      version: "1.0.0",
      entry: "./x.ts",
      permissions: [],
      contributes: { tools: ["ok", 4] },
    });

    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.error).toContain("contributes.tools must be an array of strings");
  });

  test("rejects a missing entry on a code plugin", () => {
    const parsed = parsePluginManifest({
      id: "fixture",
      version: "1.0.0",
      permissions: [],
      contributes: {},
    });

    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.error).toContain("entry is required");
  });

  test("resolves file and directory manifest paths", () => {
    expect(manifestPathFor("/tmp/mytools.ts")).toBe(join("/tmp", "mytools.plugin.json"));
    expect(manifestPathFor("/tmp/mytools")).toBe(join("/tmp", "mytools", "plugin.json"));
  });

  test("definePlugin returns a typed manifest unchanged", () => {
    const manifest = definePlugin({
      id: "fixture",
      version: "1.0.0",
      permissions: [],
      contributes: { tools: ["ping"] },
    });
    expect(manifest.contributes.tools).toEqual(["ping"]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test test/plugin-manifest.test.ts`
Expected: FAIL because `src/plugins/manifest.ts` does not exist.

- [ ] **Step 3: Implement the manifest schema**

Create `src/plugins/manifest.ts`:

```ts
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
```

Add this import at the top of `src/plugins/manifest.ts`:

```ts
import { join } from "node:path";
```

- [ ] **Step 4: Run the manifest tests**

Run: `bun test test/plugin-manifest.test.ts`
Expected: PASS.

- [ ] **Step 5: Run typecheck**

Run: `bun run typecheck`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/plugins/manifest.ts test/plugin-manifest.test.ts
git commit -m "plugins: add static manifest schema"
```

---

### Task 2: Deterministic Manifest Composition

**Files:**
- Create: `src/plugins/compose.ts`
- Test: `test/plugin-manifest.test.ts`

**Interfaces:**
- Consumes: `PluginManifest` and `parsePluginManifest` from Task 1.
- Produces:
  - `ManifestNode`
  - `ComposeResult`
  - `composePluginManifests(nodes: ManifestNode[]): ComposeResult`

- [ ] **Step 1: Write the failing composition tests**

Append to `test/plugin-manifest.test.ts`:

```ts
import { composePluginManifests, type ManifestNode } from "../src/plugins/compose.ts";

function node(id: string, extra: Partial<PluginManifest> = {}, bundled = false): ManifestNode {
  const parsed = parsePluginManifest({
    id,
    version: "1.0.0",
    entry: `./${id}.ts`,
    permissions: [],
    contributes: {},
    ...extra,
  });
  if (!parsed.ok) throw new Error(parsed.error);
  return { manifest: parsed.manifest, source: `./${id}.ts`, bundled };
}

describe("plugin manifest composition", () => {
  test("orders dependencies before dependents and keeps bundled plugins first", () => {
    const result = composePluginManifests([
      node("external-b", { dependencies: ["external-a"] }),
      node("bundled-a", {}, true),
      node("external-a"),
    ]);

    expect(result.errors).toEqual([]);
    expect(result.order.map((n) => n.manifest.id)).toEqual(["bundled-a", "external-a", "external-b"]);
  });

  test("rejects duplicate plugin IDs", () => {
    const result = composePluginManifests([node("same"), node("same")]);
    expect(result.order).toEqual([]);
    expect(result.errors.some((e) => e.includes("duplicate plugin id 'same'"))).toBe(true);
  });

  test("rejects duplicate contribution IDs", () => {
    const result = composePluginManifests([
      node("one", { contributes: { tools: ["ping"] } }),
      node("two", { contributes: { tools: ["ping"] } }),
    ]);

    expect(result.order).toEqual([]);
    expect(result.errors.some((e) => e.includes("duplicate contribution 'tools:ping'"))).toBe(true);
  });

  test("rejects missing dependencies and self dependencies", () => {
    const missing = composePluginManifests([node("a", { dependencies: ["ghost"] })]);
    expect(missing.errors.some((e) => e.includes("unknown dependency 'ghost'"))).toBe(true);

    const self = composePluginManifests([node("a", { dependencies: ["a"] })]);
    expect(self.errors.some((e) => e.includes("plugin 'a' cannot depend on itself"))).toBe(true);
  });

  test("rejects dependency cycles and emits no load order", () => {
    const result = composePluginManifests([
      node("a", { dependencies: ["b"] }),
      node("b", { dependencies: ["a"] }),
    ]);

    expect(result.order).toEqual([]);
    expect(result.errors.some((e) => e.includes("dependency cycle"))).toBe(true);
  });

  test("stable order preserves config order among unrelated external plugins", () => {
    const result = composePluginManifests([node("z"), node("a"), node("m")]);
    expect(result.errors).toEqual([]);
    expect(result.order.map((n) => n.manifest.id)).toEqual(["z", "a", "m"]);
  });
});
```

- [ ] **Step 2: Run the composition tests to verify they fail**

Run: `bun test test/plugin-manifest.test.ts`
Expected: FAIL because `src/plugins/compose.ts` does not exist.

- [ ] **Step 3: Implement manifest composition**

Create `src/plugins/compose.ts`:

```ts
import type { PluginContributionKind, PluginManifest } from "./manifest.ts";

export interface ManifestNode {
  manifest: PluginManifest;
  /** the configured path this manifest came from, used in diagnostics */
  source: string;
  /** bundled plugins sort before external plugins unless a dependency says otherwise */
  bundled: boolean;
}

export interface ComposeResult {
  /** empty when any error exists: composition fails closed */
  order: ManifestNode[];
  warnings: string[];
  errors: string[];
}

function contributionPairs(manifest: PluginManifest): string[] {
  const out: string[] = [];
  const contributions = manifest.contributes as Partial<Record<PluginContributionKind, string[]>>;
  for (const [kind, ids] of Object.entries(contributions)) {
    for (const id of ids ?? []) out.push(`${kind}:${id}`);
  }
  return out;
}

/**
 * Deterministically order plugin manifests and reject compositions that cannot
 * be loaded safely. Any error returns an empty order so the caller can fail
 * closed without guessing which half of a bad graph was safe.
 */
export function composePluginManifests(nodes: ManifestNode[]): ComposeResult {
  const warnings: string[] = [];
  const errors: string[] = [];
  const byId = new Map<string, ManifestNode>();
  const contributionOwner = new Map<string, string>();

  for (const node of nodes) {
    const id = node.manifest.id;
    if (byId.has(id)) {
      errors.push(`duplicate plugin id '${id}' (${byId.get(id)!.source} and ${node.source})`);
      continue;
    }
    byId.set(id, node);
    for (const contribution of contributionPairs(node.manifest)) {
      const owner = contributionOwner.get(contribution);
      if (owner) errors.push(`duplicate contribution '${contribution}' from '${owner}' and '${id}'`);
      else contributionOwner.set(contribution, id);
    }
  }

  const incoming = new Map<string, number>();
  const dependents = new Map<string, string[]>();
  for (const node of byId.values()) {
    incoming.set(node.manifest.id, 0);
  }
  for (const node of byId.values()) {
    for (const dependency of node.manifest.dependencies ?? []) {
      if (dependency === node.manifest.id) {
        errors.push(`plugin '${node.manifest.id}' cannot depend on itself`);
        continue;
      }
      if (!byId.has(dependency)) {
        errors.push(`plugin '${node.manifest.id}' has unknown dependency '${dependency}'`);
        continue;
      }
      incoming.set(node.manifest.id, incoming.get(node.manifest.id)! + 1);
      const list = dependents.get(dependency) ?? [];
      list.push(node.manifest.id);
      dependents.set(dependency, list);
    }
  }

  const stable = [...nodes].sort((a, b) => Number(b.bundled) - Number(a.bundled));
  const ready = stable.filter((node) => byId.has(node.manifest.id) && incoming.get(node.manifest.id) === 0);
  const order: ManifestNode[] = [];
  const placed = new Set<string>();

  while (ready.length) {
    const node = ready.shift()!;
    const id = node.manifest.id;
    if (placed.has(id)) continue;
    placed.add(id);
    order.push(node);
    for (const dependent of dependents.get(id) ?? []) {
      const remaining = incoming.get(dependent)! - 1;
      incoming.set(dependent, remaining);
      if (remaining === 0) {
        const dependentNode = byId.get(dependent)!;
        if (!placed.has(dependent)) ready.push(dependentNode);
      }
    }
  }

  if (placed.size !== byId.size) {
    const unresolved = [...byId.keys()].filter((id) => !placed.has(id));
    errors.push(`dependency cycle among plugins: ${unresolved.join(", ")}`);
  }

  return { order: errors.length ? [] : order, warnings, errors };
}
```

- [ ] **Step 4: Run the tests**

Run: `bun test test/plugin-manifest.test.ts`
Expected: PASS.

- [ ] **Step 5: Run typecheck**

Run: `bun run typecheck`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/plugins/compose.ts test/plugin-manifest.test.ts
git commit -m "plugins: add deterministic manifest composition"
```

---

### Task 3: Static Manifest Gate in the Plugin Loader

**Files:**
- Modify: `src/plugins/load.ts`
- Test: `test/plugins.test.ts`
- Create: `test/fixtures/plugin-ok.plugin.json`
- Create: `test/fixtures/plugin-sdk-import.plugin.json`
- Create: `test/fixtures/plugin-pack.plugin.json`
- Create: `test/fixtures/plugin-throws.plugin.json`
- Create: `test/fixtures/plugin-invalid.plugin.json`

**Interfaces:**
- Consumes:
  - `manifestPathFor`, `parsePluginManifest`, `PluginManifest` from `src/plugins/manifest.ts`
  - `composePluginManifests` from `src/plugins/compose.ts`
- Produces:
  - `LoadedPluginFile`
  - `loadPlugins` return shape unchanged except `files` entries may include `manifest?: PluginManifest` and `skipReason?: string`

- [ ] **Step 1: Add static manifests to existing fixtures**

Create `test/fixtures/plugin-ok.plugin.json`:

```json
{
  "id": "fixture",
  "version": "1.0.0",
  "entry": "plugin-ok.ts",
  "permissions": ["provider"],
  "contributes": {
    "tools": ["ping"],
    "providers": ["fixture-echo"],
    "hooks": ["onSessionStart", "beforeLLMCall", "afterTool"]
  }
}
```

Create `test/fixtures/plugin-sdk-import.plugin.json`:

```json
{
  "id": "sdk-importer",
  "version": "1.0.0",
  "entry": "plugin-sdk-import.ts",
  "permissions": [],
  "contributes": { "tools": ["sdk_ping"] }
}
```

Create `test/fixtures/plugin-pack.plugin.json`:

```json
{
  "id": "pack",
  "version": "1.0.0",
  "entry": "plugin-pack.ts",
  "permissions": ["network", "shell"],
  "contributes": {
    "commands": ["/packed"],
    "mcpServers": ["packed"],
    "agents": ["packedreviewer"]
  }
}
```

Create `test/fixtures/plugin-throws.plugin.json`:

```json
{
  "id": "thrower",
  "version": "1.0.0",
  "entry": "plugin-throws.ts",
  "permissions": [],
  "contributes": {}
}
```

Create `test/fixtures/plugin-invalid.plugin.json`:

```json
{
  "id": "invalid",
  "version": "1.0.0",
  "entry": "plugin-invalid.ts",
  "permissions": [],
  "contributes": {}
}
```

- [ ] **Step 2: Update dynamic fixture tests to write manifests**

In `test/plugins.test.ts`, import `existsSync` from `node:fs`:

```ts
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
```

In the `a plugin tool that shadows a built-in wins` test, immediately after writing `shadow.ts`, add:

```ts
writeFileSync(
  join(home, "shadow.plugin.json"),
  JSON.stringify({
    id: "shadow",
    version: "1.0.0",
    entry: "shadow.ts",
    permissions: [],
    contributes: { tools: ["read"] },
  }),
);
```

In the `a plugin that value-imports fox-agent/sdk` test, immediately after writing `isolated`, add:

```ts
writeFileSync(
  join(home, "isolated-plugin.plugin.json"),
  JSON.stringify({
    id: "sdk-importer",
    version: "1.0.0",
    entry: "isolated-plugin.ts",
    permissions: [],
    contributes: { tools: ["sdk_ping"] },
  }),
);
```

Update the nonexistent path test expectation:

```ts
expect(warnings[0]).toContain(missing);
expect(warnings[0]).toContain("missing manifest");
```

- [ ] **Step 3: Add loader gate regression tests**

Append these tests inside `describe("plugin loader", () => { ... })`:

```ts
test("a plugin without a manifest is skipped before its code is imported", async () => {
  const { loadPlugins } = await import("../src/plugins/load.ts");
  const entry = join(home, "no-manifest.ts");
  const marker = join(home, "imported.marker");
  writeFileSync(entry, `import { writeFileSync } from "node:fs"; writeFileSync(${JSON.stringify(marker)}, "yes"); export default { name: "no-manifest" };\n`);

  const { plugins, warnings } = await loadPlugins([entry]);
  expect(plugins).toEqual([]);
  expect(existsSync(marker)).toBe(false);
  expect(warnings).toHaveLength(1);
  expect(warnings[0]).toContain("missing manifest");
  expect(warnings[0]).toContain("no-manifest.plugin.json");
});

test("invalid manifest JSON is skipped before plugin code is imported", async () => {
  const { loadPlugins } = await import("../src/plugins/load.ts");
  const entry = join(home, "bad-json.ts");
  const marker = join(home, "bad-json.marker");
  writeFileSync(entry, `import { writeFileSync } from "node:fs"; writeFileSync(${JSON.stringify(marker)}, "yes"); export default { name: "bad-json" };\n`);
  writeFileSync(join(home, "bad-json.plugin.json"), "{ not json");

  const { plugins, warnings } = await loadPlugins([entry]);
  expect(plugins).toEqual([]);
  expect(existsSync(marker)).toBe(false);
  expect(warnings[0]).toContain("invalid manifest JSON");
});

test("a runtime plugin name must match its manifest id", async () => {
  const { loadPlugins } = await import("../src/plugins/load.ts");
  const entry = join(home, "mismatch.ts");
  writeFileSync(entry, `export default { name: "actual-name" };\n`);
  writeFileSync(
    join(home, "mismatch.plugin.json"),
    JSON.stringify({
      id: "declared-id",
      version: "1.0.0",
      entry: "mismatch.ts",
      permissions: [],
      contributes: {},
    }),
  );

  const { plugins, warnings } = await loadPlugins([entry]);
  expect(plugins).toEqual([]);
  expect(warnings[0]).toContain("manifest id 'declared-id' does not match plugin name 'actual-name'");
});
```

- [ ] **Step 4: Run plugin tests to verify the new gate fails**

Run: `bun test test/plugins.test.ts`
Expected: the new manifest-gate tests fail because `loadPlugins` does not yet read manifests.

- [ ] **Step 5: Implement the manifest gate in `loadPlugins`**

In `src/plugins/load.ts`, add these imports:

```ts
import { readFileSync } from "node:fs";
import { composePluginManifests, type ManifestNode } from "./compose.ts";
import { manifestPathFor, parsePluginManifest, type PluginManifest } from "./manifest.ts";
```

Replace the inline file type with an exported interface near the cache:

```ts
export interface LoadedPluginFile {
  path: string;
  name: string | null;
  disabled: boolean;
  manifest?: PluginManifest;
  skipReason?: string;
}
```

Replace the cache declaration with:

```ts
let cache: { key: string; plugins: FoxPlugin[]; warnings: string[]; files: LoadedPluginFile[] } | null = null;
```

Change the `loadPlugins` return type to use the exported file interface:

```ts
): Promise<{ plugins: FoxPlugin[]; warnings: string[]; files: LoadedPluginFile[] }> {
```

Add this helper above `loadPlugins`:

```ts
interface PendingExternalPlugin {
  raw: string;
  path: string;
  manifest: PluginManifest;
}

function readManifestForEntry(raw: string, path: string): { pending: PendingExternalPlugin; warnings: string[] } | { error: string } {
  const manifestPath = manifestPathFor(path);
  let text: string;
  try {
    text = readFileSync(manifestPath, "utf8");
  } catch {
    return { error: `missing manifest '${manifestPath}'` };
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { error: `invalid manifest JSON in '${manifestPath}'` };
  }
  const parsed = parsePluginManifest(json);
  if (!parsed.ok) return { error: `invalid manifest '${manifestPath}': ${parsed.error}` };
  return { pending: { raw, path, manifest: parsed.manifest }, warnings: parsed.warnings };
}
```

Replace the body of `loadPlugins` after the cache hit with this structure, preserving the existing comments where they still apply:

```ts
const plugins: FoxPlugin[] = [];
const warnings: string[] = [];
const files: LoadedPluginFile[] = [];
const pending: PendingExternalPlugin[] = [];

for (const raw of paths) {
  if (isDisabled(raw)) {
    files.push({ path: raw, name: null, disabled: true });
    continue;
  }
  const path = expand(raw, cwd);
  const manifest = readManifestForEntry(raw, path);
  if ("error" in manifest) {
    const w = `plugin '${raw}' skipped: ${manifest.error}`;
    warnings.push(w);
    console.error(`fox-agent: ${w}`);
    files.push({ path: raw, name: null, disabled: false, skipReason: manifest.error });
    continue;
  }
  warnings.push(...manifest.warnings);
  pending.push(manifest.pending);
  files.push({ path: raw, name: null, disabled: false, manifest: manifest.pending.manifest });
}

const composed = composePluginManifests(
  pending.map((p): ManifestNode => ({ manifest: p.manifest, source: p.raw, bundled: false })),
);
warnings.push(...composed.warnings);

if (composed.errors.length) {
  for (const error of composed.errors) {
    const w = `plugin composition failed: ${error}`;
    warnings.push(w);
    console.error(`fox-agent: ${w}`);
  }
  const pendingByPath = new Map(pending.map((p) => [p.raw, p]));
  for (const file of files) {
    if (pendingByPath.has(file.path)) file.skipReason = "composition failed";
  }
  cache = { key, plugins, warnings, files };
  return { plugins, warnings, files };
}

const fileByPath = new Map(files.map((f) => [f.path, f]));
for (const node of composed.order) {
  const p = pending.find((candidate) => candidate.raw === node.source);
  if (!p) continue;
  const file = fileByPath.get(p.raw)!;
  if (p.manifest.manifestOnly) {
    file.name = p.manifest.id;
    continue;
  }
  let mod: unknown;
  try {
    const href = pathToFileURL(p.path).href;
    mod = await importPlugin(href, fresh, p.raw);
  } catch (e) {
    const w = `plugin '${p.raw}' failed to load: ${(e as Error).message.slice(0, 200)}`;
    warnings.push(w);
    console.error(`fox-agent: ${w}`);
    file.skipReason = w;
    continue;
  }
  const res = validate(mod, p.path);
  if ("error" in res) {
    const w = `plugin '${p.raw}' invalid: ${res.error}`;
    warnings.push(w);
    console.error(`fox-agent: ${w}`);
    file.skipReason = w;
    continue;
  }
  if (res.plugin.name !== p.manifest.id) {
    const w = `plugin '${p.raw}' skipped: manifest id '${p.manifest.id}' does not match plugin name '${res.plugin.name}'`;
    warnings.push(w);
    console.error(`fox-agent: ${w}`);
    file.skipReason = w;
    continue;
  }
  plugins.push(res.plugin);
  file.name = res.plugin.name;
}

cache = { key, plugins, warnings, files };
return { plugins, warnings, files };
```

- [ ] **Step 6: Run plugin tests**

Run: `bun test test/plugins.test.ts`
Expected: PASS. If the SDK-import fallback test fails because the copied manifest still references source types, keep the copied plugin source rewrite unchanged; the manifest does not affect TypeScript resolution.

- [ ] **Step 7: Run typecheck**

Run: `bun run typecheck`
Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add src/plugins/load.ts test/plugins.test.ts test/fixtures/plugin-ok.plugin.json test/fixtures/plugin-sdk-import.plugin.json test/fixtures/plugin-pack.plugin.json test/fixtures/plugin-throws.plugin.json test/fixtures/plugin-invalid.plugin.json
git commit -m "plugins: require static manifests before import"
```

---

### Task 4: Composition Integration Coverage in the Loader

**Files:**
- Test: `test/plugins.test.ts`

**Interfaces:**
- Consumes: `LoadedPluginFile` with `manifest` from Task 3.
- Produces: integration coverage that proves `loadPlugins` honors dependency order and fails closed on bad composition.

- [ ] **Step 1: Add loader composition tests**

Append inside `describe("plugin loader", () => { ... })`:

```ts
function writeTmpPlugin(id: string, dependencies: string[] = [], tools: string[] = []) {
  const entry = join(home, `${id}.ts`);
  writeFileSync(entry, `export default { name: ${JSON.stringify(id)} };\n`);
  writeFileSync(
    join(home, `${id}.plugin.json`),
    JSON.stringify({
      id,
      version: "1.0.0",
      entry: `${id}.ts`,
      permissions: [],
      contributes: { tools },
      ...(dependencies.length ? { dependencies } : {}),
    }),
  );
  return entry;
}

test("dependency order controls import order", async () => {
  const { loadPlugins } = await import("../src/plugins/load.ts");
  const b = writeTmpPlugin("dep-b", ["dep-a"]);
  const a = writeTmpPlugin("dep-a");

  const { plugins, warnings } = await loadPlugins([b, a]);
  expect(warnings).toEqual([]);
  expect(plugins.map((p) => p.name)).toEqual(["dep-a", "dep-b"]);
  const files = (await import("../src/plugins/load.ts")).loadPlugins([b, a]);
  expect((await files).files.map((f) => f.manifest?.id ?? f.path)).toContain("dep-a");
});

test("duplicate contribution IDs fail closed for the whole configured set", async () => {
  const { loadPlugins } = await import("../src/plugins/load.ts");
  const one = writeTmpPlugin("dup-one", [], ["same-tool"]);
  const two = writeTmpPlugin("dup-two", [], ["same-tool"]);

  const { plugins, warnings } = await loadPlugins([one, two]);
  expect(plugins).toEqual([]);
  expect(warnings.some((w) => w.includes("duplicate contribution 'tools:same-tool'"))).toBe(true);
});

test("dependency cycles fail closed with a clear warning", async () => {
  const { loadPlugins } = await import("../src/plugins/load.ts");
  const a = writeTmpPlugin("cycle-a", ["cycle-b"]);
  const b = writeTmpPlugin("cycle-b", ["cycle-a"]);

  const { plugins, warnings } = await loadPlugins([a, b]);
  expect(plugins).toEqual([]);
  expect(warnings.some((w) => w.includes("dependency cycle"))).toBe(true);
});
```

- [ ] **Step 2: Run plugin tests**

Run: `bun test test/plugins.test.ts`
Expected: PASS. Fix `src/plugins/compose.ts` or `src/plugins/load.ts` if integration disagrees with the pure composition tests.

- [ ] **Step 3: Run typecheck**

Run: `bun run typecheck`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add test/plugins.test.ts
git commit -m "plugins: cover loader composition behavior"
```

---

### Task 5: Public Types, Helper Export, and Authoring Docs

**Files:**
- Modify: `src/sdk.ts`
- Test: `test/plugin-manifest.test.ts`
- Modify: `docs/agent/plugins.md`

**Interfaces:**
- Consumes: `definePlugin` and manifest types from `src/plugins/manifest.ts`.
- Produces: public `fox-agent/sdk` exports for manifest authoring.

- [ ] **Step 1: Add SDK export test**

Append to `test/plugin-manifest.test.ts`:

```ts
import { definePlugin as definePluginFromSdk } from "../src/sdk.ts";

test("sdk exports the manifest helper and types for plugin authors", () => {
  const manifest = definePluginFromSdk({
    id: "sdk-fixture",
    version: "1.0.0",
    entry: "./index.ts",
    permissions: [],
    contributes: { tools: ["ping"] },
  });
  expect(manifest.id).toBe("sdk-fixture");
});
```

- [ ] **Step 2: Run SDK export test to verify it fails**

Run: `bun test test/plugin-manifest.test.ts`
Expected: FAIL because `src/sdk.ts` does not export `definePlugin`.

- [ ] **Step 3: Export the manifest API from `src/sdk.ts`**

In the plugin type export block of `src/sdk.ts`, add:

```ts
export { definePlugin } from "./plugins/manifest.ts";
export type { PluginContributions, PluginManifest, PluginPermission } from "./plugins/manifest.ts";
```

- [ ] **Step 4: Run SDK export test and typecheck**

Run: `bun test test/plugin-manifest.test.ts`
Expected: PASS.

Run: `bun run typecheck`
Expected: clean.

- [ ] **Step 5: Update plugin authoring docs**

Replace lines 3 through 13 of `docs/agent/plugins.md` with:

`````md
A plugin is one TypeScript module that default-exports a `FoxPlugin`, plus a static manifest that fox-agent reads BEFORE importing that module. It runs inside fox-agent's own process with the user's credentials, which is why plugins load from the **GLOBAL config only**. A project `fox-agent.toml` cannot introduce one. A project `plugins` array is ignored with a warning; that rule is a security boundary, not a taste choice.

```toml
# ~/.config/fox-agent/config.toml
plugins = ["/abs/path/mytools.ts"]    # ARRAY of paths; ~ expands, relative resolves against cwd
disabledPlugins = ["pty"]             # names switched off entirely
```

For `/abs/path/mytools.ts`, the manifest is `/abs/path/mytools.plugin.json`. For a plugin directory, use `plugin.json` inside that directory.

```json
{
  "id": "mytools",
  "version": "1.0.0",
  "entry": "mytools.ts",
  "permissions": ["fs.read", "fs.write", "shell"],
  "contributes": { "tools": ["deploy", "logs"] }
}
```

The manifest names the plugin, its entry point, its permissions, and the contribution IDs it provides. A plugin without a manifest is skipped with a warning; plugin code must never run before its manifest is read.

There is no `[plugins]` table form: `plugins` is a plain array of file paths. A broken plugin (missing manifest, invalid manifest, throws on import, bad shape) costs a warning, never the run. Editing a plugin file takes effect after `/reload` (plugins re-import on the next turn's registry build).
`````

- [ ] **Step 6: Commit**

```bash
git add src/sdk.ts test/plugin-manifest.test.ts docs/agent/plugins.md
git commit -m "plugins: document and export static manifests"
```

---

### Task 6: Full Gates and Phase Baseline

**Files:**
- No planned source changes.

**Interfaces:**
- Consumes: Tasks 1 through 5.
- Produces: verified phase 0-1 baseline.

- [ ] **Step 1: Run typecheck**

Run: `bun run typecheck`
Expected: clean.

- [ ] **Step 2: Run the full test suite**

Run: `bun test`
Expected: 0 failures.

- [ ] **Step 3: Build the binary**

Run: `bun run build`
Expected: build succeeds.

- [ ] **Step 4: Verify binary size gate**

Run: `stat -c '%s' bin/fox`
Expected: a byte count less than or equal to `122738565`. If it is larger, stop and report the size regression instead of relaxing the gate.

- [ ] **Step 5: Verify diff hygiene**

Run: `git diff --check`
Expected: clean.

Run: `git status --short`
Expected: only the pre-existing `M src/context/render.ts` remains unstaged. There should be no untracked implementation leftovers.

- [ ] **Step 6: Report phase result**

Record in the final implementation report:
- typecheck result
- full test result
- binary size before and after
- whether ACP files changed, and therefore whether ACP acceptance was required
- any warnings or skipped plugin behavior changes observed during tests
