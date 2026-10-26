// fd 2 redirection: the layer BELOW the JS-property patches.
//
// The bug this pins: the TUI's stray-output quarantine replaces
// `process.stderr.write`, `console.error` and `Bun.stderr.write`. A child
// spawned with `stderr: "inherit"` — which `src/acp/client.ts` used to do for
// delegated agents — writes to the descriptor itself and touches none of them,
// so it painted over the grid. Worse, the scribble persisted: the alternate
// screen has no scrollback and `Screen.flush` compares row hashes, finds the
// buffer "already correct", and writes nothing.
//
// These cases assert the descriptor-level capture sees what the JS patches miss.
import { describe, expect, test } from "bun:test";
import { canQuietStderr, quietStderr } from "../src/tui/quiet.ts";

// Everything here manipulates the process's real fd 2, so each case restores it
// in a finally — a leaked redirect would swallow the rest of the suite's output.
const hasLibc = canQuietStderr();

describe("quietStderr: fd 2 capture", () => {
  test.if(hasLibc)("a child that INHERITS stderr is captured, not printed", async () => {
    const q = quietStderr();
    expect(q).not.toBeNull();
    try {
      // the exact shape that defeated every JS patch
      await Bun.spawn(["bash", "-c", "printf 'INHERITED-MARKER\\n' >&2"], { stderr: "inherit" }).exited;
      await Bun.sleep(60);
      expect(q!.drain()).toContain("INHERITED-MARKER");
    } finally {
      q!.restore();
    }
  });

  test.if(hasLibc)("a grandchild's write is captured too", async () => {
    const q = quietStderr();
    try {
      await Bun.spawn(["bash", "-c", "bash -c 'printf \"GRANDCHILD-MARKER\\n\" >&2'"], { stderr: "inherit" }).exited;
      await Bun.sleep(60);
      expect(q!.drain()).toContain("GRANDCHILD-MARKER");
    } finally {
      q!.restore();
    }
  });

  test.if(hasLibc)("restore() puts the real descriptor back, and is idempotent", async () => {
    const q = quietStderr()!;
    await Bun.spawn(["bash", "-c", "printf 'PRE-RESTORE\\n' >&2"], { stderr: "inherit" }).exited;
    await Bun.sleep(50);
    // restore returns what had not been drained yet — nothing may be lost
    expect(q.restore()).toContain("PRE-RESTORE");
    // a second restore must not throw or return stale content
    expect(q.restore()).toBe("");
  });

  test.if(hasLibc)("a child writing AFTER restore reaches the terminal again", async () => {
    const q = quietStderr()!;
    q.restore();
    // Nothing to assert about the bytes (they go to the test runner's stderr),
    // but the spawn must not fail — a broken fd would make that throw.
    const p = Bun.spawn(["bash", "-c", "echo post-restore >&2"], { stderr: "inherit" });
    expect(await p.exited).toBe(0);
  });

  test("an unsupported platform degrades to null instead of throwing", () => {
    // canQuietStderr() false ⇒ quietStderr() must be null, not an exception —
    // the TUI keeps its JS patches as the only defence and still runs.
    if (!hasLibc) expect(quietStderr()).toBeNull();
    else expect(typeof quietStderr).toBe("function");
  });
});
