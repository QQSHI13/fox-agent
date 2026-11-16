// A relocated config file is the config, not just a file the loader happened to
// read: relative plugin entries beside it must resolve against ITS directory.
//
// The bug this pins: the turn fallback path called `loadPlugins(plugins)` with
// no base, so it always resolved against ~/.config/fox-agent. A user running
// `FOX_AGENT_CONFIG=/somewhere/else/config.toml` got every relative plugin
// silently skipped there, while `bun test test/plugins.test.ts` stayed green
// because it always writes its plugins beside the default home directory.
//
// Kept separate from plugins.test.ts so the relocation lane owns its own file.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentEvent } from "../src/core/events.ts";
import type { ChatFn, ProviderConfig } from "../src/providers/types.ts";

let root: string;
let configDir: string;
let configPath: string;
let marker: string;

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), "fox-config-path-"));
  configDir = join(root, "relocated");
  mkdirSync(configDir, { recursive: true });
  configPath = join(configDir, "custom-config.toml");
  marker = join(root, "plugin-loaded.marker");
  process.env.FOX_AGENT_HOME = join(root, "home");
  process.env.FOX_AGENT_CONFIG = configPath;
  // the loader caches on the path list; a stale entry would hide a resolution bug
  (await import("../src/plugins/load.ts")).resetPlugins();
});

afterEach(async () => {
  (await import("../src/store/db.ts")).closeAll();
  delete process.env.FOX_AGENT_CONFIG;
  rmSync(root, { recursive: true, force: true });
});

function provider(): ProviderConfig {
  return { baseUrl: "http://127.0.0.1:1", apiKey: "sk-test", model: "test-model", provider: "openai-compatible", requestTimeoutMs: 0 };
}

function scripted(): ChatFn {
  return async function* () {
    yield { type: "text", delta: "ok" };
    yield { type: "done", reason: "stop" };
  };
}

describe("relocated config plugin paths", () => {
  test("the turn fallback resolves relative plugins against the effective config directory", async () => {
    // A plugin and its sidecar manifest live BESIDE the relocated config, and
    // the config names it relatively — the shape a user writes.
    writeFileSync(
      join(configDir, "relocated-plugin.ts"),
      `import { writeFileSync } from "node:fs";\n` +
        `export default {\n` +
        `  name: "relocated",\n` +
        `  hooks: { onSessionStart: () => writeFileSync(${JSON.stringify(marker)}, "yes") },\n` +
        `};\n`,
    );
    writeFileSync(
      join(configDir, "relocated-plugin.plugin.json"),
      JSON.stringify({ id: "relocated", version: "1.0.0", entry: "relocated-plugin.ts", permissions: [], contributes: {} }),
    );
    writeFileSync(configPath, `plugins = ["./relocated-plugin.ts"]\n`);

    const { loadConfig } = await import("../src/core/config.ts");
    const config = loadConfig({ cwd: root, configPath });
    config.diagnostics = false;

    const { runTurnCore } = await import("../src/loop/turn.ts");
    const { createSession } = await import("../src/store/db.ts");
    const sessionId = createSession(root, "test-model").id;
    const events: AgentEvent[] = [];
    // registryOverride with no pluginsOverride is the fallback path that loads
    // config-named plugins itself (see turnBody).
    for await (const ev of runTurnCore(sessionId, provider(), "go", undefined, {
      chat: scripted(),
      config,
      registryOverride: new Map(),
    })) {
      events.push(ev);
    }

    const warns = events.filter((e) => e.type === "warn") as Extract<AgentEvent, { type: "warn" }>[];
    expect(warns.map((w) => w.message).join("\n")).not.toContain("relocated-plugin");
    expect(existsSync(marker)).toBe(true);
    expect(readFileSync(marker, "utf8")).toBe("yes");
  }, 30_000);
});
