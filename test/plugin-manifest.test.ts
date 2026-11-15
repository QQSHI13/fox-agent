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
