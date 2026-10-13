import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readPluginManifest } from "../src/plugins/manifest.ts";

let root: string;
const dirs: string[] = [];

function plugin(name: string, files: Record<string, string>): string {
  const dir = join(root, name);
  mkdirSync(dir, { recursive: true });
  dirs.push(dir);
  for (const [rel, body] of Object.entries(files)) {
    const p = join(dir, rel);
    mkdirSync(join(p, ".."), { recursive: true });
    writeFileSync(p, body);
  }
  return dir;
}

afterEach(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
  dirs.length = 0;
  rmSync(root, { recursive: true, force: true });
});

const setRoot = () => (root = mkdtempSync(join(tmpdir(), "fox-manifest-")));

describe("readPluginManifest: a directory plugin", () => {
  test("reads name, version, entry and dependencies from package.json", () => {
    setRoot();
    const dir = plugin("pg-admin", {
      "package.json": JSON.stringify({
        name: "pg-admin",
        version: "1.2.0",
        dependencies: { pg: "^8.0.0" },
        fox: { entry: "./src/main.ts", dependencies: ["sql-runner"], description: "postgres tools" },
      }),
      "src/main.ts": "export default { name: 'pg-admin' };",
    });
    const m = readPluginManifest(dir);
    expect(m.error).toBeUndefined();
    expect(m.name).toBe("pg-admin");
    expect(m.version).toBe("1.2.0");
    expect(m.entry).toBe(join(dir, "src/main.ts"));
    expect(m.dependencies).toEqual(["sql-runner"]);
    expect(m.fox?.description).toBe("postgres tools");
    // npm deps are bun's business; we only record that the manifest parsed
    expect(m.files).toContain(join(dir, "package.json"));
  });

  test("a plugin with no fox field loads by convention", () => {
    setRoot();
    const dir = plugin("bare", {
      "package.json": JSON.stringify({ name: "bare", version: "0.1.0" }),
      "index.ts": "export default { name: 'bare' };",
    });
    const m = readPluginManifest(dir);
    expect(m.error).toBeUndefined();
    expect(m.entry).toBe(join(dir, "index.ts"));
    expect(m.dependencies).toEqual([]);
    expect(m.fox).toBeNull();
  });

  test("no package.json at all still works via index.ts", () => {
    setRoot();
    const dir = plugin("naked", { "index.ts": "export default { name: 'naked' };" });
    const m = readPluginManifest(dir);
    expect(m.error).toBeUndefined();
    expect(m.entry).toBe(join(dir, "index.ts"));
    expect(m.name).toBe("naked");
  });

  test("dependencies de-duplicate but keep manifest order", () => {
    setRoot();
    const dir = plugin("dup", {
      "package.json": JSON.stringify({ name: "dup", fox: { dependencies: ["b", "a", "b", "c"] } }),
      "index.ts": "export default { name: 'dup' };",
    });
    expect(readPluginManifest(dir).dependencies).toEqual(["b", "a", "c"]);
  });
});

describe("readPluginManifest: never throws, always explains", () => {
  test("a missing directory is an error, not a crash", () => {
    setRoot();
    const m = readPluginManifest(join(root, "nope"));
    expect(m.error).toMatch(/not a directory/);
  });

  test("malformed package.json reports the parse failure", () => {
    setRoot();
    const dir = plugin("bad", { "package.json": "{ not json", "index.ts": "export default {}" });
    const m = readPluginManifest(dir);
    expect(m.error).toMatch(/not valid JSON/);
  });

  test("a UTF-8 BOM does not break the parse", () => {
    setRoot();
    const dir = plugin("bom", {
      "package.json": `\uFEFF${JSON.stringify({ name: "bom", fox: { entry: "./index.ts" } })}`,
      "index.ts": "export default { name: 'bom' };",
    });
    const m = readPluginManifest(dir);
    expect(m.error).toBeUndefined();
    expect(m.name).toBe("bom");
  });

  test("a declared entry that does not exist is reported", () => {
    setRoot();
    const dir = plugin("ghost", { "package.json": JSON.stringify({ name: "ghost", fox: { entry: "./gone.ts" } }) });
    expect(readPluginManifest(dir).error).toMatch(/entry not found/);
  });

  test("a plugin with neither a manifest entry nor an index is reported", () => {
    setRoot();
    const dir = plugin("empty", { "package.json": JSON.stringify({ name: "empty" }) });
    expect(readPluginManifest(dir).error).toMatch(/no `fox.entry` and no index.ts/);
  });

  test("path traversal in fox.entry is refused", () => {
    setRoot();
    // a manifest must not be able to pull in a file from outside its own dir
    for (const entry of ["../../etc/passwd", "/etc/passwd", "./../../secret.ts"]) {
      const dir = plugin(`trav${Math.random().toString(36).slice(2, 7)}`, {
        "package.json": JSON.stringify({ name: "trav", fox: { entry } }),
        "index.ts": "export default { name: 'trav' };",
      });
      expect(readPluginManifest(dir).error).toMatch(/entry not found|stay inside/);
    }
  });

  test("wrongly-typed fox fields are named in the error", () => {
    setRoot();
    const cases: [string, unknown, RegExp][] = [
      ["notobj", [1, 2], /must be an object/],
      ["badentry", { entry: 7 }, /fox.entry.*string/],
      ["baddeps", { dependencies: "sql" }, /fox.dependencies.*array/],
      ["badreplaces", { replaces: [1] }, /fox.replaces.*array/],
      ["badrequires", { requires: 9 }, /fox.requires.*string/],
    ];
    for (const [name, fox, re] of cases) {
      const dir = plugin(name, {
        "package.json": JSON.stringify({ name, fox }),
        "index.ts": `export default { name: '${name}' };`,
      });
      expect(readPluginManifest(dir).error).toMatch(re);
    }
  });
});
