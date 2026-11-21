/**
 * The display projection is `projectView` with the bodies dropped.
 *
 * Later TUI work renders settled history from it without hydrating content, so
 * the two projections must agree on every visibility decision (op-hidden,
 * orphan, restore, replace) while a display node must carry NO message body.
 * The second half of every test here is the cache claim: a dropped entry must
 * rebuild to the identical projection from the metadata index alone.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "fox-display-"));
  process.env.FOX_AGENT_HOME = join(dir, ".fox");
  process.env.FOX_AGENT_CONFIG = join(join(dir, ".fox"), "config.toml");
});

afterEach(async () => {
  try {
    const { dropDisplayCache } = await import("../src/context/display.ts");
    dropDisplayCache();
  } catch {}
  try {
    const { dropViewCache } = await import("../src/context/view.ts");
    dropViewCache();
  } catch {}
  rmSync(dir, { recursive: true, force: true });
});

interface Seeded {
  id: string;
  assistantSeq: number;
}

/** user, assistant with two calls, both results, a think; then ops replay over them. */
async function seed(ops: boolean): Promise<Seeded> {
  const db = await import("../src/store/db.ts");
  const s = db.createSession(dir, "m1");
  db.appendMessage(s.id, { role: "user", content: "a question that is long enough", tokens: 5 });
  const assistant = db.appendMessage(s.id, {
    role: "assistant",
    content: "the answer to the question",
    tokens: 5,
    tool_calls: JSON.stringify([
      { id: "call_a", name: "read", arguments: "{}" },
      { id: "call_b", name: "grep", arguments: "{}" },
    ]),
  });
  db.appendMessage(s.id, { role: "tool", tool_call_id: "call_a", content: "result a", tokens: 5 });
  db.appendMessage(s.id, { role: "tool", tool_call_id: "call_b", content: "result b", tokens: 5 });
  db.appendMessage(s.id, { role: "think", content: "a private thought", tokens: 5 });
  if (ops) {
    db.appendOps(s.id, [{ kind: "delete", ids: [assistant.seq], summary: "collapsed" }]);
    db.appendOps(s.id, [{ kind: "restore", ids: [assistant.seq] }]);
    db.appendOps(s.id, [{ kind: "replace", id: assistant.seq, content: "truncated answer", version: 1 }]);
  }
  return { id: s.id, assistantSeq: assistant.seq };
}

describe("display projection parity", () => {
  test("display projection matches projectView visibility and orphan state", async () => {
    const { projectView } = await import("../src/context/view.ts");
    const { projectDisplay } = await import("../src/context/display.ts");
    const { id } = await seed(true);
    const full = projectView(id).map((n) => [n.msg.seq, n.msg.role, n.deleted, !!n.orphan, n.replaceVersion ?? 0]);
    const display = projectDisplay(id).map((n) => [n.seq, n.role, n.deleted, !!n.orphan, n.replaceVersion ?? 0]);
    expect(display).toEqual(full);
    for (const n of projectDisplay(id)) {
      expect("content" in n).toBe(false);
      expect(n.contentLen).toBeGreaterThan(0);
    }
  });

  test("op-hidden assistants orphan their tool results identically", async () => {
    const db = await import("../src/store/db.ts");
    const { projectView } = await import("../src/context/view.ts");
    const { projectDisplay } = await import("../src/context/display.ts");
    const { id, assistantSeq } = await seed(false);
    db.appendOps(id, [{ kind: "delete", ids: [assistantSeq] }]);

    const full = projectView(id).map((n) => [n.msg.seq, n.deleted, !!n.orphan, n.summary ?? ""]);
    const display = projectDisplay(id).map((n) => [n.seq, n.deleted, !!n.orphan, n.summary ?? ""]);
    expect(display).toEqual(full);
    // the two results are hidden as orphans, the user and think rows are not
    expect(display.filter((r) => r[1])).toHaveLength(3);
  });

  test("malformed tool_calls contribute no calls and degrades like projectView", async () => {
    const db = await import("../src/store/db.ts");
    const { projectView } = await import("../src/context/view.ts");
    const { projectDisplay } = await import("../src/context/display.ts");
    const s = db.createSession(dir, "m1");
    db.appendMessage(s.id, { role: "user", content: "question", tokens: 5 });
    db.appendMessage(s.id, { role: "assistant", content: "answer", tokens: 5, tool_calls: "{not json" });
    db.appendMessage(s.id, { role: "tool", tool_call_id: "call_x", content: "detached result", tokens: 5 });

    const full = projectView(s.id).map((n) => [n.msg.seq, n.deleted, !!n.orphan]);
    const display = projectDisplay(s.id).map((n) => [n.seq, n.deleted, !!n.orphan]);
    expect(display).toEqual(full);
    expect(display[2]).toEqual([3, true, true]);
  });
});

describe("display cache", () => {
  test("a dropped entry rebuilds to the identical projection", async () => {
    const { projectDisplay, dropDisplayCache } = await import("../src/context/display.ts");
    const { id } = await seed(true);
    const warm = projectDisplay(id).map((n) => [n.seq, n.role, n.deleted, !!n.orphan, n.replaceVersion ?? 0]);
    dropDisplayCache(id);
    const cold = projectDisplay(id).map((n) => [n.seq, n.role, n.deleted, !!n.orphan, n.replaceVersion ?? 0]);
    expect(cold).toEqual(warm);
  });

  test("incremental growth and ops match a cold replay", async () => {
    const db = await import("../src/store/db.ts");
    const { projectDisplay, dropDisplayCache } = await import("../src/context/display.ts");
    const { id, assistantSeq } = await seed(false);
    projectDisplay(id); // warm the metadata cache before the tail arrives

    db.appendMessage(id, { role: "user", content: "a follow up", tokens: 5 });
    db.appendOps(id, [{ kind: "delete", ids: [assistantSeq] }]);
    const warm = projectDisplay(id).map((n) => [n.seq, n.deleted, !!n.orphan]);

    dropDisplayCache(id);
    const cold = projectDisplay(id).map((n) => [n.seq, n.deleted, !!n.orphan]);
    expect(cold).toEqual(warm);
    expect(cold[cold.length - 1]).toEqual([6, false, false]);
  });

  test("the same array is reused while the entry stays warm", async () => {
    const { projectDisplay } = await import("../src/context/display.ts");
    const { id } = await seed(false);
    expect(projectDisplay(id)).toBe(projectDisplay(id));
  });

  test("a missing stamp is 0:0 and stamps change with each log", async () => {
    const db = await import("../src/store/db.ts");
    const { displayStamp, projectDisplay, dropDisplayCache } = await import("../src/context/display.ts");
    const { id } = await seed(false);
    expect(displayStamp(id)).toBe("0:0");
    projectDisplay(id);
    expect(displayStamp(id)).toBe("5:0");
    db.appendOps(id, [{ kind: "delete", ids: [2] }]);
    projectDisplay(id);
    expect(displayStamp(id)).toBe("5:1");
    dropDisplayCache();
    expect(displayStamp(id)).toBe("0:0");
  });

  // Regression: the read-only mirror polled displayStamp() FIRST and only
  // rebuilt on a stamp that never moved, because a resident projection's
  // watermark advances only when projectDisplay() replays the new rows. The
  // viewer then froze on history. Polling must project before reading.
  test("pollDisplayStamp advances a warm projection so a viewer sees new rows", async () => {
    const db = await import("../src/store/db.ts");
    const { displayStamp, pollDisplayStamp } = await import("../src/context/display.ts");
    const { id } = await seed(false);
    expect(pollDisplayStamp(id)).toBe("5:0");

    db.appendMessage(id, { role: "user", content: "a later row", tokens: 5 });
    // Cached-first would stay on 5:0 until some other refresh happened to
    // project; the poll itself must observe the new settled row.
    expect(displayStamp(id)).toBe("5:0");
    expect(pollDisplayStamp(id)).toBe("6:0");
    expect(displayStamp(id)).toBe("6:0");
  });
});
