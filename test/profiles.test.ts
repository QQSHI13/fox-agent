import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig, resolveProfile, resolveValue } from "../src/core/config.ts";
import { lookupModel, setConfiguredModels } from "../src/providers/models.ts";
import { loadPlugins, resetPlugins } from "../src/plugins/load.ts";

const FIX_OK = join(import.meta.dir, "fixtures", "plugin-ok.ts");
const FIX_THROWS = join(import.meta.dir, "fixtures", "plugin-throws.ts");

function withConfig(toml: string) {
  const dir = mkdtempSync(join(tmpdir(), "fox-profiles-"));
  const path = join(dir, "config.toml");
  writeFileSync(path, toml);
  return { dir, path };
}

describe("provider profiles", () => {
  test("a [providers.x] table parses with its models", () => {
    const { dir, path } = withConfig(`
provider = "gw"
model = "kimi-k2"

[providers.gw]
format = "openai-compatible"
baseUrl = "https://gw.example.com/v1"
apiKey = "$GW_KEY"
defaultModel = "kimi-k2"

[[providers.gw.models]]
id = "kimi-k2"
contextWindow = 262144
maxOutput = 16384
reasoning = true
input = ["text", "image"]
sampling = { temperature = 1.0 }

[[providers.gw.models]]
id = "hidden"
disabled = true
`);
    try {
      const cfg = loadConfig({ configPath: path, cwd: dir }, {});
      expect(cfg.provider).toBe("gw");
      const p = cfg.providers.gw;
      expect(p.format).toBe("openai-compatible");
      expect(p.baseUrl).toBe("https://gw.example.com/v1");
      expect(p.models).toHaveLength(2);
      expect(p.models[0].contextWindow).toBe(262144);
      expect(p.models[0].sampling).toEqual({ temperature: 1.0 });
      expect(p.models[1].disabled).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("resolveProfile maps a named profile to its format and resolves the key", () => {
    const { dir, path } = withConfig(`
provider = "gw"
model = "kimi-k2"

[providers.gw]
format = "anthropic"
baseUrl = "https://proxy.example.com"
apiKey = "$GW_KEY"

[providers.gw.headers]
x-tenant = "t-1"
`);
    try {
      const cfg = loadConfig({ configPath: path, cwd: dir }, {});
      const r = resolveProfile(cfg, { GW_KEY: "sk-gw" });
      expect(r.format).toBe("anthropic");
      expect(r.baseUrl).toBe("https://proxy.example.com");
      expect(r.apiKey).toBe("sk-gw");
      expect(r.headers).toEqual({ "x-tenant": "t-1" });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("a provider naming no profile keeps the flat legacy meaning", () => {
    const { dir, path } = withConfig(`provider = "openai-compatible"\nmodel = "m"\nbaseUrl = "http://127.0.0.1:1/v1"\napiKey = "k"\n`);
    try {
      const r = resolveProfile(loadConfig({ configPath: path, cwd: dir }, {}));
      expect(r.format).toBe("openai-compatible");
      expect(r.apiKey).toBe("k");
      expect(r.modelConfig).toBeUndefined();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("resolveProfile exposes the active model's sampling + reports it to lookupModel", () => {
    const { dir, path } = withConfig(`
provider = "gw"
model = "weird-local-9b"

[providers.gw]
baseUrl = "http://127.0.0.1:8000/v1"

[[providers.gw.models]]
id = "weird-local-9b"
contextWindow = 99000
input = ["text", "image", "audio"]
sampling = { top_p = 0.9 }
`);
    try {
      const cfg = loadConfig({ configPath: path, cwd: dir }, {});
      const r = resolveProfile(cfg, {});
      expect(r.sampling).toEqual({ top_p: 0.9 });
      // loadConfig registered the entries: a model no catalog knows gets real figures
      const info = lookupModel("weird-local-9b");
      expect(info.contextWindow).toBe(99000);
      expect(info.vision).toBe(true);
      expect(info.audio).toBe(true);
    } finally {
      setConfiguredModels([]);
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("resolveValue", () => {
  test("$VAR and ${VAR} interpolate, missing vars resolve empty", () => {
    expect(resolveValue("$AAA/x", { AAA: "1" })).toBe("1/x");
    expect(resolveValue("${AAA}_tail", { AAA: "1" })).toBe("1_tail");
    expect(resolveValue("$NOPE", {})).toBe("");
  });
  test("$$ and $! escape", () => {
    expect(resolveValue("$$AAA", { AAA: "1" })).toBe("$AAA");
    expect(resolveValue("$!not-a-command")).toBe("!not-a-command");
  });
  test("!cmd runs the command and caches it", () => {
    expect(resolveValue("!echo hello")).toBe("hello");
  });
  test("undefined stays undefined", () => {
    expect(resolveValue(undefined)).toBeUndefined();
  });
});

describe("disabledPlugins", () => {
  test("a disabled entry is never imported — no warning, no failure", async () => {
    resetPlugins();
    // plugin-throws fails at import; if the disabled filter let it through, the
    // warnings array would name it
    const { plugins, warnings } = await loadPlugins([FIX_THROWS, FIX_OK], process.cwd(), ["plugin-throws"]);
    expect(plugins.map((p) => p.name)).toEqual(["fixture"]);
    expect(warnings).toEqual([]);
    resetPlugins();
  });

  test("disabledPlugins comes from the config file", () => {
    const { dir, path } = withConfig(`disabledPlugins = ["a", "b.ts"]\nplugins = ["./a.ts"]\n`);
    try {
      const cfg = loadConfig({ configPath: path, cwd: dir }, {});
      expect(cfg.disabledPlugins).toEqual(["a", "b.ts"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
