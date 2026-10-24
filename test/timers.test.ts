import { describe, expect, test } from "bun:test";
import { MAX_DELAY_MS, safeDelay, setLongTimeout } from "../src/core/timers.ts";

describe("setLongTimeout", () => {
  test("a short delay fires once, close to its deadline", async () => {
    const t0 = Date.now();
    let fired = 0;
    const t = setLongTimeout(() => fired++, 40);
    t.unref();
    await Bun.sleep(120);
    expect(fired).toBe(1);
    expect(Date.now() - t0).toBeGreaterThanOrEqual(30);
  });

  test("a delay past the 32-bit wall is NOT collapsed to 1ms", async () => {
    // the bug this exists to prevent: setTimeout(3e9) fires after 1ms, so a
    // caller asking for a huge budget got an immediate failure instead
    expect(MAX_DELAY_MS).toBeLessThan(3_000_000_000);
    let fired = false;
    const t = setLongTimeout(() => (fired = true), 3_000_000_000);
    t.unref();
    await Bun.sleep(120);
    expect(fired).toBe(false);
    t.clear();
  });

  test("clear cancels a pending deadline", async () => {
    let fired = false;
    const t = setLongTimeout(() => (fired = true), 30);
    t.clear();
    await Bun.sleep(100);
    expect(fired).toBe(false);
  });

  test("clear after firing is safe", async () => {
    let fired = 0;
    const t = setLongTimeout(() => fired++, 5);
    t.unref();
    await Bun.sleep(50);
    expect(() => t.clear()).not.toThrow();
    expect(fired).toBe(1);
  });

  test("a zero delay still fires (next tick), not never", async () => {
    let fired = false;
    const t = setLongTimeout(() => (fired = true), 0);
    t.unref();
    await Bun.sleep(30);
    expect(fired).toBe(true);
  });
});

describe("safeDelay", () => {
  test("clamps to the largest delay setTimeout honours", () => {
    expect(safeDelay(3_000_000_000)).toBe(MAX_DELAY_MS);
    expect(safeDelay(1_000)).toBe(1_000);
    expect(safeDelay(-5)).toBe(0);
  });
});
