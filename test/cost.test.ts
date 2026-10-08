// bundled:cost — cost as a derived view over stored tokens x models.dev rates.
// Hermetic: FOX_AGENT_MODELS_CACHE points at a fixture the test writes, so no
// test ever touches the real catalog cache.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

let home = "";

beforeEach(() => {
  home = join(tmpdir(), `fox-cost-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(join(home, "sessions"), { recursive: true });
  process.env.FOX_AGENT_HOME = home;
  // a tiny catalog: one priced model, one unpriced, to pin both branches
  writeFileSync(
    join(home, "models.dev.json"),
    JSON.stringify({
      at: Date.now(),
      providers: [
        {
          id: "testprov",
          name: "Test",
          env: ["X"],
          format: "openai-compatible",
          models: [
            { id: "priced-1", name: "Priced", context: 1000, output: 100, cost: { input: 1, output: 2, cache_read: 0.1 } },
            { id: "free-1", name: "Free", context: 1000, output: 100 },
          ],
        },
      ],
    }),
  );
});

afterEach(() => {
  delete process.env.FOX_AGENT_HOME;
  delete process.env.FOX_AGENT_MODELS_CACHE;
  rmSync(home, { recursive: true, force: true });
});

describe("bundled:cost", () => {
  test("rateFor reads the catalog; unpriced models get null, never a guess", async () => {
    const { rateFor } = await import("../src/plugins/cost.ts");
    expect(rateFor("priced-1")).toEqual({ input: 1, output: 2, cacheRead: 0.1, cacheWrite: undefined });
    expect(rateFor("free-1")).toBeNull();
    expect(rateFor("never-heard-of")).toBeNull();
  });

  test("sessionCost prices fresh input, cached input, and output from stored tokens", async () => {
    // import order matters: the store must see FOX_AGENT_HOME before first use
    const { createSession, recordUsage } = await import("../src/store/db.ts");
    const { sessionCost } = await import("../src/plugins/cost.ts");
    const s = createSession(home, "priced-1");
    // 1M cached in ($0.1) + 0.5M fresh in ($0.5) + 0.5M out ($1) = $1.60
    recordUsage(s.id, "m1", 1_500_000, 500_000, 1_000_000);
    const usd = sessionCost(s.id, "priced-1");
    expect(usd).toBeCloseTo(1.6, 5);
  });

  test("a model with no rate reports tokens without inventing dollars", async () => {
    const { createSession, recordUsage } = await import("../src/store/db.ts");
    const cost = await import("../src/plugins/cost.ts");
    const s = createSession(home, "priced-1");
    recordUsage(s.id, "m1", 1234, 567, 0);
    expect(cost.sessionCost(s.id, "free-1")).toBeNull();
    const plugin = cost.default;
    const cmd = plugin.commands!.find((c) => c.name === "/cost")!;
    const res = cmd.run("free-1", { sessionId: s.id, cwd: home });
    expect(res.output).toContain("no catalog rate");
    expect(res.output).toContain("tokens this session");
  });

  test("the /cost command prints rates and the session total", async () => {
    const { createSession, recordUsage } = await import("../src/store/db.ts");
    const cost = await import("../src/plugins/cost.ts");
    const s = createSession(home, "priced-1");
    recordUsage(s.id, "m1", 500_000, 250_000, 0);
    const cmd = cost.default.commands!.find((c) => c.name === "/cost")!;
    // arg-less: no turn has run, so the model is unknown — but an explicit
    // arg prices it
    const res2 = cmd.run("priced-1", { sessionId: s.id, cwd: home });
    expect(res2.output).toContain("$1/Mtok");
    // 0.5M in x $1 + 0.25M out x $2 = $1.00
    expect(res2.output).toContain("$1.00");
  });

  test("registry merges the plugin and disabledPlugins drops its segment", async () => {
    const { bundledPlugins, bundledDisabled } = await import("../src/plugins/bundled.ts");
    expect(bundledPlugins().map((p) => p.name)).toContain("bundled:cost");
    expect(bundledDisabled("bundled:cost", ["cost"])).toBe(true);
  });
});
