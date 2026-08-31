// models.dev catalog: cache parsing, merged lookup (a sparse reseller record
// must not beat the source provider's), and the login presets (tokenguard
// always present, network or not).
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "fox-mdev-"));
  process.env.FOX_AGENT_MODELS_CACHE = join(dir, "models.dev.json");
  process.env.FOX_AGENT_MODELS_OFFLINE = "1";
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  delete process.env.FOX_AGENT_MODELS_CACHE;
  delete process.env.FOX_AGENT_MODELS_OFFLINE;
});

const cache = (providers: unknown) =>
  writeFileSync(join(dir, "models.dev.json"), JSON.stringify({ at: Date.now(), providers }));

describe("models.dev catalog", () => {
  test("no cache means static presets, and tokenguard is always offered", async () => {
    const { providerPresets, loadCatalog } = await import("../src/providers/modelsdev.ts");
    expect(loadCatalog()).toBeNull();
    const ids = providerPresets().map((p) => p.id);
    expect(ids[0]).toBe("tokenguard");
    expect(ids).toContain("openai");
    expect(ids).toContain("openai-responses");
    expect(ids).toContain("anthropic");
  });

  test("lookupModel merges every provider's record for the same model", async () => {
    cache([
      { id: "aaa-reseller", name: "A", api: "http://a/v1", env: [], format: "openai-compatible",
        models: [{ id: "foo-1", name: "foo", context: 100_000, output: 8_000, inputs: ["image"] }] },
      { id: "zzz-source", name: "Z", api: "http://z/v1", env: [], format: "openai-compatible",
        models: [{ id: "foo-1", name: "foo", context: 200_000, output: 16_000, reasoning: true, inputs: ["image", "audio"] }] },
    ]);
    const { lookupModel } = await import("../src/providers/models.ts");
    const info = lookupModel("foo-1");
    expect(info.contextWindow).toBe(200_000);
    expect(info.maxOutput).toBe(16_000);
    expect(info.vision).toBe(true);
    expect(info.audio).toBe(true);
    expect(info.reasoning).toBe(true);
  });

  test("an unknown model still falls back to the static table, then UNKNOWN", async () => {
    const { lookupModel } = await import("../src/providers/models.ts");
    expect(lookupModel("gpt-4o").contextWindow).toBe(128_000);
    expect(lookupModel("never-heard-of-this").contextWindow).toBe(131_072);
  });

  test("refreshCatalog honors the offline switch", async () => {
    const { refreshCatalog } = await import("../src/providers/modelsdev.ts");
    expect(await refreshCatalog()).toBe(false);
  });
});

describe("openai-responses provider", () => {
  test("is a built-in name with a lazy resolution branch", async () => {
    const { availableProviders } = await import("../src/providers/index.ts");
    expect(availableProviders()).toContain("openai-responses");
  });
});
