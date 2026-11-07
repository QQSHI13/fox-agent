/**
 * The plugin-facing repaint door, and the queue-height fix it also serves.
 *
 * Two things share this slot and must not drift apart:
 *
 *   1. `requestRepaint(region)` — what a plugin calls through `foxHost.repaint`
 *      when it changed something a region it does not own renders.
 *   2. The built-in writer (`bumpQueue` in app.ts) for the queued/steering stack,
 *      which shrinks the transcript viewport. That stack is plain closure state,
 *      not a signal, so the transcript cannot subscribe to it — the writer has to
 *      say "re-derive", which is the same act a plugin performs.
 *
 * The bug behind (2): `steer()` (ctrl+s) changed the stack and bumped only
 * `flashV`, which the transcript does not read, so the bottom rows kept the old
 * height until an unrelated event repainted them.
 */
import { beforeEach, describe, expect, test } from "bun:test";
import { requestRepaint, setRepaintHandler, type RepaintRegion } from "../src/plugins/load.ts";

beforeEach(() => {
  setRepaintHandler(null);
});

describe("requestRepaint", () => {
  test("is a polite no-op with no TUI attached", () => {
    // a headless run has nothing to paint; false says so without throwing, which
    // is what lets a plugin call it unconditionally
    expect(requestRepaint()).toBe(false);
    expect(requestRepaint("transcript")).toBe(false);
  });

  test("forwards the named region", () => {
    const seen: (RepaintRegion | undefined)[] = [];
    setRepaintHandler((r) => void seen.push(r));
    expect(requestRepaint("transcript")).toBe(true);
    expect(requestRepaint("status")).toBe(true);
    expect(seen).toEqual(["transcript", "status"]);
  });

  test("an omitted region means everything, not an empty string", () => {
    // the handler must be able to tell "all regions" from "none named"
    const seen: (RepaintRegion | undefined)[] = [];
    setRepaintHandler((r) => void seen.push(r));
    requestRepaint();
    expect(seen).toEqual([undefined]);
  });

  test("clearing the handler turns it back into a no-op", () => {
    // teardown must not leave a closure pointing at a dead screen
    setRepaintHandler(() => {});
    expect(requestRepaint()).toBe(true);
    setRepaintHandler(null);
    expect(requestRepaint()).toBe(false);
  });

  test("a throwing handler propagates — containment is the caller's job", () => {
    // Deliberately NOT swallowed here. A plugin calls `repaint` from its own
    // `paint`, and the region effect already catches and warns once per region —
    // so the throw lands in a handler that reports which plugin broke. Catching
    // it here instead would turn a plugin bug into a silent no-op.
    setRepaintHandler(() => {
      throw new Error("boom");
    });
    expect(() => requestRepaint("transcript")).toThrow("boom");
  });
});
