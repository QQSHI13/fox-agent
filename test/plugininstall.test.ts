import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { installStoreDeps, pluginsRoot, registerDeps } from "../src/plugins/install.ts";

let tmp: string;
let store: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "fox-install-"));
  store = join(tmp, "store");
  mkdirSync(store, { recursive: true });
});

afterEach(() => rmSync(tmp, { recursive: true, force: true }));

/** a plugin dir with the given npm dependencies */
function plugin(name: string, dependencies: Record<string, string>): string {
  const dir = join(tmp, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify({ name, version: "1.0.0", dependencies, fox: { entry: "./index.ts" } }),
  );
  writeFileSync(join(dir, "index.ts"), `export default { name: '${name}' };\n`);
  return dir;
}

const storeDeps = (): Record<string, string> =>
  (JSON.parse(readFileSync(join(store, "package.json"), "utf8")) as { dependencies: Record<string, string> }).dependencies;

describe("registerDeps: one shared store", () => {
  test("a dependency from the first plugin is registered", () => {
    const dir = plugin("alpha", { zod: "^3.0.0" });
    const r = registerDeps(store, dir);
    expect(r.added).toEqual(["zod"]);
    expect(r.conflict).toEqual([]);
    expect(storeDeps()).toEqual({ zod: "^3.0.0" });
  });

  test("a dependency a SECOND plugin shares is deduplicated, not re-added", () => {
    registerDeps(store, plugin("alpha", { zod: "^3.0.0" }));
    const r = registerDeps(store, plugin("beta", { zod: "^3.0.0" }));
    // already present at the SAME range: not a conflict, nothing new
    expect(r.added).toEqual([]);
    expect(r.conflict).toEqual([]);
    expect(Object.keys(storeDeps())).toEqual(["zod"]);
  });

  test("two plugins wanting different ranges is REPORTED, not silently last-wins", () => {
    registerDeps(store, plugin("alpha", { zod: "^3.0.0" }));
    const r = registerDeps(store, plugin("beta", { zod: "^4.0.0" }));
    // the store keeps the first range; the disagreement must be visible, because
    // the loser silently gets whichever version the resolver picks
    expect(r.added).toEqual([]);
    expect(r.conflict).toHaveLength(1);
    expect(r.conflict[0]).toContain("zod");
    expect(r.conflict[0]).toContain("^3.0.0");
    expect(r.conflict[0]).toContain("^4.0.0");
    expect(storeDeps()).toEqual({ zod: "^3.0.0" });
  });

  test("a plugin with no dependencies writes no store manifest at all", () => {
    const r = registerDeps(store, plugin("bare", {}));
    expect(r.added).toEqual([]);
    // nothing to install, so we do not create a package.json for the store
    expect(() => readFileSync(join(store, "package.json"), "utf8")).toThrow();
  });

  test("the store manifest is a valid private package", () => {
    registerDeps(store, plugin("alpha", { zod: "^3.0.0" }));
    const m = JSON.parse(readFileSync(join(store, "package.json"), "utf8")) as Record<string, unknown>;
    expect(m.name).toBe("fox-agent-plugin-store");
    // private matters: this package must never be published by accident
    expect(m.private).toBe(true);
  });

  test("registration is additive across many plugins", () => {
    registerDeps(store, plugin("a", { zod: "^3.0.0" }));
    registerDeps(store, plugin("b", { pg: "^8.0.0" }));
    registerDeps(store, plugin("c", { "is-odd": "3.0.1" }));
    expect(storeDeps()).toEqual({ zod: "^3.0.0", pg: "^8.0.0", "is-odd": "3.0.1" });
  });
});

describe("installStoreDeps: the no-op path needs no network and no toolchain", () => {
  test("an empty store resolves to a no-op without importing the resolver", async () => {
    const r = await installStoreDeps(store);
    expect(r.ok).toBe(true);
    expect(r.installed).toEqual([]);
    expect(r.resolved).toEqual([]);
    expect(r.note).toBe("no npm dependencies");
  });

  test("a store with no manifest at all is a no-op, not an error", async () => {
    const r = await installStoreDeps(join(tmp, "does-not-exist"));
    expect(r.ok).toBe(true);
    expect(r.note).toBe("no npm dependencies");
  });
});

describe("pluginsRoot", () => {
  test("lives under the global config dir, never the project", () => {
    // plugins are global-only by policy (they run in-process with the user's
    // credentials), so the store must not be project-relative
    expect(pluginsRoot("/home/someone")).toBe(join("/home/someone", ".config", "fox-agent", "plugins"));
  });
});
