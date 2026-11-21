/**
 * Full-content model projections are TURN-SCOPED.
 *
 * The TUI now renders settled history from the lightweight display list (see
 * src/context/display.ts), so the resident `projectView` is only needed while a
 * turn is assembling requests. Keeping it forever means every settled message
 * body of every visited session stays in memory for display that no longer
 * reads it.
 *
 * The contract is therefore: a turn retains its projection for its whole
 * lifetime, and releases it when the turn ends. Release is COUNTED (a host may
 * nest turns) and correctness-safe: the next projection rebuilds identically
 * from SQLite. These tests pin both halves — that a retained view is never
 * evicted out from under an active turn, and that release really frees it.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "fox-modelview-"));
  process.env.FOX_AGENT_HOME = dir;
  process.env.FOX_AGENT_CONFIG = join(dir, "config.toml");
});

afterEach(async () => {
  const { dropViewCache } = await import("../src/context/view.ts");
  dropViewCache();
  rmSync(dir, { recursive: true, force: true });
  delete process.env.FOX_AGENT_HOME;
  delete process.env.FOX_AGENT_CONFIG;
});

async function seed(n = 4) {
  const db = await import("../src/store/db.ts");
  const s = db.createSession(dir, "m1");
  for (let i = 0; i < n; i++) {
    db.appendMessage(s.id, { parent_id: null, role: i % 2 ? "assistant" : "user", content: `message ${i} some words here`, tokens: 5 });
  }
  return s.id;
}

/** Observable fingerprint, as in viewcache.test.ts. */
const fingerprint = (nodes: { msg: { seq: number }; content: string; deleted: boolean }[]) =>
  nodes.map((n) => `${n.msg.seq}:${n.content}:${n.deleted}`);

const cfg = () => ({ baseUrl: "http://localhost:9", apiKey: "test", model: "test-model" });

type Script = import("../src/providers/types.ts").StreamEvent[];
const textDone = (t: string): Script => [
  { type: "text", delta: t },
  { type: "done", reason: "stop" },
];

/** A scripted provider that runs `onCall` while the turn is genuinely in flight. */
function mockChat(scripts: Script[], onCall?: (n: number) => void) {
  let n = 0;
  const fn = async function* (): AsyncGenerator<import("../src/providers/types.ts").StreamEvent> {
    onCall?.(n);
    const script = scripts[n];
    if (!script) throw new Error("mock exhausted");
    n++;
    for (const ev of script) yield ev;
  };
  return { fn, count: () => n };
}

async function collect(gen: AsyncGenerator<import("../src/core/events.ts").AgentEvent>) {
  const events: import("../src/core/events.ts").AgentEvent[] = [];
  for await (const ev of gen) events.push(ev);
  return events;
}

describe("model view lifetime", () => {
  test("a released model view rebuilds identically instead of staying resident", async () => {
    const { projectView, retainModelView, releaseModelView } = await import("../src/context/view.ts");
    const id = await seed(6);
    const before = fingerprint(projectView(id));
    const warm = projectView(id);

    retainModelView(id);
    releaseModelView(id);

    const cold = projectView(id);
    // a rebuild returns a new array; surviving as the same object would mean
    // the release did nothing and the bodies are still resident
    expect(cold).not.toBe(warm);
    expect(fingerprint(cold)).toEqual(before);
  });

  test("retention is counted: one release does not drop a view another holder retains", async () => {
    const { projectView, retainModelView, releaseModelView } = await import("../src/context/view.ts");
    const id = await seed(3);
    projectView(id);

    retainModelView(id); // an outer turn
    retainModelView(id); // a nested turn
    const warm = projectView(id);

    releaseModelView(id); // the inner turn ends
    expect(projectView(id)).toBe(warm); // still retained by the outer turn

    releaseModelView(id); // the outer turn ends
    expect(projectView(id)).not.toBe(warm);
  });

  test("release is idempotent: an unmatched release never evicts a fresh view", async () => {
    const { projectView, releaseModelView } = await import("../src/context/view.ts");
    const id = await seed(3);
    const warm = projectView(id);
    // no matching retain — this must be a no-op, not a way to drop someone
    // else's active projection
    releaseModelView(id);
    expect(projectView(id)).toBe(warm);
  });

  test("LRU eviction skips a retained session", async () => {
    const { projectView, retainModelView, releaseModelView } = await import("../src/context/view.ts");
    const retained = await seed(4);
    const warm = projectView(retained);
    retainModelView(retained);

    // force well past MAX_VIEWS (8) so the LRU definitely runs
    for (let i = 0; i < 12; i++) projectView(await seed(2));

    // identity proves the entry was never dropped: a rebuild would be a new array
    expect(projectView(retained)).toBe(warm);

    releaseModelView(retained);
    expect(projectView(retained)).not.toBe(warm);
  });

  test("a completed turn releases its model view", async () => {
    const { projectView, visibleNodes } = await import("../src/context/view.ts");
    const { createSession, allMessages } = await import("../src/store/db.ts");
    const { runTurnCore } = await import("../src/loop/turn.ts");

    const s = createSession(dir, "m1");
    let during: ReturnType<typeof projectView> | undefined;
    const mock = mockChat([textDone("hello")], () => {
      during = projectView(s.id);
      // the in-flight projection must survive even if the cache churns
      for (let i = 0; i < 12; i++) {
        const other = createSession(dir, "m1");
        projectView(other.id);
      }
      expect(projectView(s.id)).toBe(during);
    });

    await collect(runTurnCore(s.id, cfg(), "hi", undefined, { chat: mock.fn as any, quiet: true }));

    expect(allMessages(s.id).length).toBeGreaterThan(0);
    expect(visibleNodes(during!).length).toBeGreaterThan(0);
    // after the turn the projection is gone: the next read rebuilds it
    expect(projectView(s.id)).not.toBe(during);
  });
});
