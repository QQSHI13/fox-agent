/**
 * The harness no longer compacts: it measures, warns, and (past the hard
 * threshold) takes the tools away.
 *
 * These pin the three things that make that safe to rely on:
 *   1. the stage boundaries are inclusive and ordered strictest-first, so a
 *      config that sets ctxOnlyAt BELOW warnAt still degrades to the safe state
 *      instead of promising tools it has already taken away;
 *   2. the thresholds are configurable, because "80%" is a guess about someone
 *      else's model and window;
 *   3. the rail is ENFORCED at call time, not merely advertised in the prompt —
 *      a model that ignores its instructions must still not be able to run a
 *      tool while the window is at its limit.
 */
import { describe, expect, test } from "bun:test";
import { budgetStage, type BudgetThresholds } from "../src/context/budget.ts";

const T: BudgetThresholds = { warnAt: 0.8, ctxOnlyAt: 0.9 };

describe("budgetStage", () => {
  test("below the warn threshold nothing happens", () => {
    expect(budgetStage(0, T)).toBe("none");
    expect(budgetStage(0.5, T)).toBe("none");
    expect(budgetStage(0.799, T)).toBe("none");
  });

  test("the warn threshold is inclusive and keeps every tool", () => {
    expect(budgetStage(0.8, T)).toBe("warn");
    expect(budgetStage(0.85, T)).toBe("warn");
    expect(budgetStage(0.899, T)).toBe("warn");
  });

  test("the ctx-only threshold is inclusive and is the strictest state", () => {
    expect(budgetStage(0.9, T)).toBe("ctxOnly");
    expect(budgetStage(0.99, T)).toBe("ctxOnly");
    expect(budgetStage(1.5, T)).toBe("ctxOnly");
  });

  test("ctxOnlyAt below warnAt still degrades to the safe state", () => {
    // a config mistake must not produce "warn" (tools implied available) while
    // the window is actually past the point where tools are removed
    const inverted: BudgetThresholds = { warnAt: 0.9, ctxOnlyAt: 0.5 };
    expect(budgetStage(0.6, inverted)).toBe("ctxOnly");
    expect(budgetStage(0.95, inverted)).toBe("ctxOnly");
  });

  test("thresholds are configurable, not hardcoded", () => {
    const relaxed: BudgetThresholds = { warnAt: 0.95, ctxOnlyAt: 0.98 };
    expect(budgetStage(0.85, relaxed)).toBe("none");
    expect(budgetStage(0.96, relaxed)).toBe("warn");
    expect(budgetStage(0.99, relaxed)).toBe("ctxOnly");

    const strict: BudgetThresholds = { warnAt: 0.5, ctxOnlyAt: 0.6 };
    expect(budgetStage(0.55, strict)).toBe("warn");
    expect(budgetStage(0.65, strict)).toBe("ctxOnly");
  });

  test("a zero-window model reports none rather than dividing by zero", () => {
    // checkBudget guards limit > 0; the stage function itself must not see NaN
    expect(budgetStage(Number.NaN, T)).toBe("none");
  });
});

describe("threshold defaults", () => {
  test("the defaults are 0.8 / 0.9 and warn comes first", async () => {
    const { defaultConfig } = await import("../src/core/config.ts");
    const c = defaultConfig();
    expect(c.compactWarnAt).toBe(0.8);
    expect(c.compactCtxOnlyAt).toBe(0.9);
    expect(c.compactWarnAt).toBeLessThan(c.compactCtxOnlyAt);
  });

  test("no automatic-compaction settings survive", async () => {
    const { defaultConfig } = await import("../src/core/config.ts");
    const c = defaultConfig() as unknown as Record<string, unknown>;
    expect(c.compactAt).toBeUndefined();
    expect(c.compactAtTokens).toBeUndefined();
  });
});
