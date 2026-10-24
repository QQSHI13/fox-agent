/**
 * The per-session view projection is an LRU, and eviction must be INVISIBLE.
 *
 * `views` holds every message body of every visited session, so an unbounded map
 * is a leak that grows with how many sessions a process has ever touched. It is
 * bounded now — but a cache eviction is only safe if a miss rebuilds the same
 * answer from SQLite. That is the property worth testing: not "the map has N
 * entries", but "the view is identical before and after the entry was dropped".
 *
 * (The renderedItems LRU in render.ts is exercised through renderContext below
 * for the same reason: its correctness claim is that a cold cache produces the
 * same assembled history as a warm one.)
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "fox-views-"));
  process.env.FOX_AGENT_HOME = join(dir, ".fox");
  process.env.FOX_AGENT_CONFIG = join(join(dir, ".fox"), "config.toml");
});

afterEach(async () => {
  const { dropViewCache } = await import("../src/context/view.ts");
  dropViewCache();
  rmSync(dir, { recursive: true, force: true });
});

/** A session with `n` messages, one of which carries a tool call. */
async function seed(n = 4) {
  const db = await import("../src/store/db.ts");
  const s = db.createSession(dir, "m1");
  for (let i = 0; i < n; i++) {
    db.appendMessage(s.id, { parent_id: null, role: i % 2 ? "assistant" : "user", content: `message ${i} some words here`, tokens: 5 });
  }
  return s.id;
}

/** A stable fingerprint of a projected view: what a caller can actually observe. */
const fingerprint = (nodes: { msg: { seq: number; role: string }; content: string; deleted: boolean }[]) =>
  nodes.map((n) => `${n.msg.seq}:${n.msg.role}:${n.content}:${n.deleted ? "d" : "v"}`).join("|");

describe("view cache eviction", () => {
  test("an evicted session rebuilds to the identical view", async () => {
    const { projectView, dropViewCache } = await import("../src/context/view.ts");
    const id = await seed(6);
    const warm = fingerprint(projectView(id));

    dropViewCache(id); // force the cold path: a full re-read from SQLite
    const cold = fingerprint(projectView(id));

    expect(cold).toBe(warm);
    expect(cold).not.toBe(""); // and it did produce a view
  });

  test("ops replayed from cold still apply (a delete hides the same node)", async () => {
    const db = await import("../src/store/db.ts");
    const { projectView, dropViewCache, visibleNodes } = await import("../src/context/view.ts");
    const id = await seed(4);
    const all = projectView(id);
    const victim = all[1]!.msg.seq;
    db.appendOps(id, [{ kind: "delete", ids: [victim] }]);

    const warm = visibleNodes(projectView(id)).map((n) => n.msg.seq);
    dropViewCache(id);
    const cold = visibleNodes(projectView(id)).map((n) => n.msg.seq);

    expect(cold).toEqual(warm);
    expect(cold).not.toContain(victim);
  });

  test("many sessions past the cap keep working — the active view is never lost", async () => {
    const { projectView, visibleNodes } = await import("../src/context/view.ts");
    // more than MAX_VIEWS (8), so eviction definitely runs
    const ids: string[] = [];
    for (let i = 0; i < 12; i++) ids.push(await seed(3));

    // touch them all, then re-read each: an evicted one must rebuild, not throw
    for (const id of ids) expect(visibleNodes(projectView(id)).length).toBeGreaterThan(0);
    // and the most recent read is still correct after the churn
    const last = ids[ids.length - 1]!;
    const before = fingerprint(projectView(last));
    for (const id of ids) projectView(id);
    expect(fingerprint(projectView(last))).toBe(before);
  });

  test("the same session object is reused while it stays warm", async () => {
    const { projectView } = await import("../src/context/view.ts");
    const id = await seed(3);
    // the incremental path mutates and returns the SAME array; a rebuild would
    // return a new one. Identity is the observable proof that it stayed cached.
    expect(projectView(id)).toBe(projectView(id));
  });
});

describe("render cache", () => {
  test("a cold render cache assembles the same history as a warm one", async () => {
    const { projectView } = await import("../src/context/view.ts");
    const { renderContext, dropRenderCache } = await import("../src/context/render.ts");
    const id = await seed(8);

    const nodes = projectView(id);
    const warm = renderContext(id, "sys", {});
    dropRenderCache();
    const cold = renderContext(id, "sys", {});

    expect(nodes.length).toBeGreaterThan(0);
    expect(cold.map((m) => `${m.role}:${m.content}`)).toEqual(warm.map((m) => `${m.role}:${m.content}`));
  });
});
