import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { composePluginManifests, type ManifestNode } from "../src/plugins/compose.ts";
import { definePlugin, manifestPathFor, parsePluginManifest, type PluginManifest } from "../src/plugins/manifest.ts";
import { definePlugin as definePluginFromSdk } from "../src/sdk.ts";

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

  test("treats a dotted path without a module extension as a directory", () => {
    expect(manifestPathFor("/tmp/my.tools")).toBe(join("/tmp/my.tools", "plugin.json"));
  });

  test("recognizes module extensions as file entries", () => {
    for (const ext of [".ts", ".tsx", ".js", ".jsx", ".mjs", ".mts", ".cjs"]) {
      expect(manifestPathFor(`/tmp/mytools${ext}`)).toBe(join("/tmp", "mytools.plugin.json"));
    }
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

  test("allows two plugins to contribute the same lifecycle hook", () => {
    // `beforeLLMCall` is a shared lifecycle point, not an owned resource. Before
    // this rule, a normal two-plugin install could fail composition closed and
    // disable every external plugin.
    const result = composePluginManifests([
      node("one", { contributes: { hooks: ["beforeLLMCall"], tools: ["one_tool"] } }),
      node("two", { contributes: { hooks: ["beforeLLMCall"], tools: ["two_tool"] } }),
    ]);

    expect(result.errors).toEqual([]);
    expect(result.order.map((n) => n.manifest.id)).toEqual(["one", "two"]);
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
