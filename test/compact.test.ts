import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "fox-compact-"));
  process.env.FOX_HOME = dir;
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

// deepseek-chat has the smallest window in the registry (65_536), which keeps
// the fixtures small enough to build quickly.
const MODEL = "deepseek-chat";
const WINDOW = 65_536;
const cfg = { baseUrl: "http://localhost:9", apiKey: "test", model: MODEL };

const summarizer = (text: string) =>
  async function* (): AsyncGenerator<any> {
    yield { type: "text", delta: text };
    yield { type: "done", reason: "stop" };
  };

/** Fill a session past the compaction threshold. Returns the seqs added. */
async function fillSession(nodes: number, charsEach: number) {
  const { createSession, appendMessage } = await import("../src/store/db.ts");
  const s = createSession("/w", MODEL);
  const seqs: number[] = [];
  for (let i = 0; i < nodes; i++) {
    const role = i % 2 === 0 ? "user" : "assistant";
    const m = appendMessage(s.id, {
      parent_id: null,
      role: role as any,
      content: `msg${i} `.padEnd(charsEach, "x"),
      tokens: Math.ceil(charsEach / 4),
    });
    seqs.push(m.seq);
  }
  return { id: s.id, seqs };
}

describe("auto-compaction", () => {
  test("does nothing when the view is well under the threshold", async () => {
    const { compactIfNeeded } = await import("../src/context/compact.ts");
    const { createSession, appendMessage } = await import("../src/store/db.ts");
    const s = createSession("/w", MODEL);
    appendMessage(s.id, { parent_id: null, role: "user", content: "short", tokens: 1 });
    const ev = await compactIfNeeded(s.id, cfg as any, summarizer("nope") as any);
    expect(ev).toBeNull();
  });

  test("compacts the oldest span and emits a compacted event", async () => {
    const { compactIfNeeded } = await import("../src/context/compact.ts");
    const { projectView } = await import("../src/context/view.ts");
    const { id } = await fillSession(60, 4_000); // ~60k est tokens > 0.85 * 65_536

    const ev = (await compactIfNeeded(id, cfg as any, summarizer("THE SUMMARY") as any)) as any;
    expect(ev).not.toBeNull();
    expect(ev.type).toBe("compacted");
    expect(ev.removed.length).toBeGreaterThan(0);
    expect(ev.tokens_after).toBeLessThan(ev.tokens_before);

    // removed nodes are the OLDEST ones, contiguous from the start
    const nodes = projectView(id);
    const removed = new Set<number>(ev.removed);
    const seqs = nodes.map((n) => n.msg.seq);
    const lastRemovedIdx = seqs.findLastIndex((q) => removed.has(q));
    expect(seqs.slice(0, lastRemovedIdx + 1).every((q) => removed.has(q))).toBe(true);
  });

  test("the model's summary is attached to the first hidden node", async () => {
    const { compactIfNeeded } = await import("../src/context/compact.ts");
    const { projectView } = await import("../src/context/view.ts");
    const { id } = await fillSession(60, 4_000);
    const ev = (await compactIfNeeded(id, cfg as any, summarizer("THE SUMMARY") as any)) as any;
    const first = projectView(id).find((n) => n.msg.seq === ev.removed[0])!;
    expect(first.deleted).toBe(true);
    expect(first.summary).toBe("THE SUMMARY");
  });

  test("protects the newest span — the tail stays visible", async () => {
    const { compactIfNeeded } = await import("../src/context/compact.ts");
    const { projectView, visibleNodes } = await import("../src/context/view.ts");
    const { id } = await fillSession(60, 4_000);
    await compactIfNeeded(id, cfg as any, summarizer("s") as any);
    const vis = visibleNodes(projectView(id));
    // at least the protected fraction of the window survives
    const { estimateTokens } = await import("../src/providers/models.ts");
    const tailTok = vis.reduce((a, n) => a + estimateTokens(n.content), 0);
    expect(vis.length).toBeGreaterThanOrEqual(6);
    expect(tailTok).toBeGreaterThan(WINDOW * 0.3);
  });

  test("a failing summarizer still compacts with a mechanical note", async () => {
    const { compactIfNeeded } = await import("../src/context/compact.ts");
    const { projectView } = await import("../src/context/view.ts");
    const { id } = await fillSession(60, 4_000);
    const boom = async function* (): AsyncGenerator<any> {
      throw new Error("summarizer down");
    };
    const ev = (await compactIfNeeded(id, cfg as any, boom as any)) as any;
    expect(ev).not.toBeNull();
    const first = projectView(id).find((n) => n.msg.seq === ev.removed[0])!;
    expect(first.summary).toMatch(/auto-compacted/);
  });

  test("compaction is a plain delete op, so /undo reverts it", async () => {
    const { compactIfNeeded } = await import("../src/context/compact.ts");
    const { projectView, visibleNodes } = await import("../src/context/view.ts");
    const { undoLastOp } = await import("../src/store/db.ts");
    const { id } = await fillSession(60, 4_000);
    const beforeCount = visibleNodes(projectView(id)).length;
    await compactIfNeeded(id, cfg as any, summarizer("s") as any);
    expect(visibleNodes(projectView(id)).length).toBeLessThan(beforeCount);
    expect(undoLastOp(id)).not.toBeNull();
    expect(visibleNodes(projectView(id)).length).toBe(beforeCount);
  });

  test("a lower compactAt threshold triggers on a smaller view", async () => {
    const { compactIfNeeded } = await import("../src/context/compact.ts");
    const { id } = await fillSession(60, 3_000); // ~45k est tok: under 0.85, over 0.6
    expect(await compactIfNeeded(id, cfg as any, summarizer("s") as any)).toBeNull();
    const ev = await compactIfNeeded(id, cfg as any, summarizer("s") as any, { compactAt: 0.6 });
    expect(ev).not.toBeNull();
  });
});
