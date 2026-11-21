/**
 * `setTuiCaps` is the one entry point for live cap changes (/settings and
 * /reload both reach it). It must notify the registered hook exactly once per
 * actual change so startTui can drop its row memo and bump transcript counts.
 */
import { afterEach, expect, test } from "bun:test";
import { onTuiCapsChange, setTuiCaps } from "../src/tui/app.ts";

afterEach(() => {
  onTuiCapsChange(null);
  // Restore the production defaults; this file owns no other cap state.
  setTuiCaps(240, 4_000);
});

test("setTuiCaps notifies once only when the caps actually move", () => {
  setTuiCaps(240, 4_000); // canonical starting state, before any hook exists
  let calls = 0;
  onTuiCapsChange(() => {
    calls++;
  });

  setTuiCaps(240, 4_000);
  expect(calls).toBe(0);

  setTuiCaps(240, 4_100);
  expect(calls).toBe(1);

  setTuiCaps(240, 4_100);
  expect(calls).toBe(1);

  setTuiCaps(250, 4_100);
  expect(calls).toBe(2);
});

test("resetting the hook stops later notifications", () => {
  setTuiCaps(240, 4_000);
  let calls = 0;
  onTuiCapsChange(() => {
    calls++;
  });
  setTuiCaps(300, 5_000);
  expect(calls).toBe(1);

  onTuiCapsChange(null);
  setTuiCaps(400, 6_000);
  expect(calls).toBe(1);
});
