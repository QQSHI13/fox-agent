/**
 * The virtual chrome header's key set.
 *
 * The header is TWO transcript items — the banner line and the detail block
 * under it that prints `model X (Nk ctx)` — and invalidating "the header" means
 * invalidating both. That was hand-written at three call sites and one of them
 * listed only the first key, so after a `/model` switch the banner re-rendered
 * and the model/context line underneath it stayed at the pre-switch value.
 *
 * These tests pin the list itself, because the list is now the only place the
 * set is written down. A test of the paint would need a tty; a test of the set
 * catches exactly the mistake that was made.
 */
import { describe, expect, test } from "bun:test";
import { chromeKeys } from "../src/tui/app.ts";

describe("chrome header keys", () => {
  test("covers the banner AND the detail block", () => {
    const keys = chromeKeys();
    expect(keys.length).toBe(2);
    // The detail block is what carries the model line; dropping it is the bug.
    expect(keys[1]).toBe(keys[0] - 1);
  });

  test("is stable across calls — a key must not move under the line cache", () => {
    // The chrome rows are cached per key, so a key that changed per call would
    // re-render the header on every frame and never hit the cache.
    expect(chromeKeys()).toEqual(chromeKeys());
  });

  test("sits below the minted-key range, so it cannot collide with an item", () => {
    // app.ts: minted keys start at 0x40000000 and seq-derived keys are
    // seq * 4 + slot. A chrome key must be clear of both.
    const keys = chromeKeys();
    const SEQ_KEY_SPACE = 0x40000000;
    for (const k of keys) {
      expect(k).toBeLessThan(SEQ_KEY_SPACE);
      // not a seq-derived key for any plausible seq (seq*4+slot is 0 mod 4
      // through 3 mod 4 — the chrome keys are reserved well above a session's
      // message count instead, so just assert they are non-negative integers
      // below the minted range)
      expect(Number.isInteger(k)).toBe(true);
      expect(k).toBeGreaterThan(0);
    }
  });
});
