import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setConfiguredModels } from "../src/providers/models.ts";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "fox-compact-"));
  process.env.FOX_AGENT_HOME = dir;
  // afterEach clears registrations; re-arm the fixture model every test
  setConfiguredModels([{ id: MODEL, contextWindow: WINDOW }]);
});

afterEach(() => {
  setConfiguredModels([]); // a test-registered model must not outlive itself
  rmSync(dir, { recursive: true, force: true });
});

// The window is REGISTERED, not looked up: deepseek-chat's 65_536 used to come
// from a hardcoded table that no longer exists (cost/catalog rework), and the
// test must not depend on the models.dev cache. setConfiguredModels is the
// supported override path (re-armed in beforeEach, cleared in afterEach).
const MODEL = "deepseek-chat";
const WINDOW = 65_536;
const cfg = { baseUrl: "http://localhost:9", apiKey: "test", model: MODEL };

const summarizer = (text: string) =>
  async function* (): AsyncGenerator<any> {
    yield { type: "text", delta: text };
    yield { type: "done", reason: "stop" };
  };

/** Fill a session and record a provider usage report of `reported` prompt tokens.
 *  Compaction triggers on measured (report) + estimated (text appended since),
 *  never on the raw report alone — see budget.ts `sessionContextTokens`. */
async function fillSession(nodes: number, charsEach: number, reported = 0, cached = 0) {
  const { createSession, appendMessage, recordUsage } = await import("../src/store/db.ts");
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
  if (reported) recordUsage(s.id, null, reported, 100, cached);
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
    const { id } = await fillSession(60, 4_000, 60_000); // provider reports 60k > 0.85 * 65_536

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
    const { id } = await fillSession(60, 4_000, 60_000);
    const ev = (await compactIfNeeded(id, cfg as any, summarizer("THE SUMMARY") as any)) as any;
    const first = projectView(id).find((n) => n.msg.seq === ev.removed[0])!;
    expect(first.deleted).toBe(true);
    expect(first.summary).toBe("THE SUMMARY");
  });

  test("protects the newest span — the tail stays visible", async () => {
    const { compactIfNeeded } = await import("../src/context/compact.ts");
    const { projectView, visibleNodes } = await import("../src/context/view.ts");
    const { id } = await fillSession(60, 4_000, 60_000);
    await compactIfNeeded(id, cfg as any, summarizer("s") as any);
    const vis = visibleNodes(projectView(id));
    // whatever survives is the keep-budget, not a fraction of the window:
    // here it lands above a third of this tiny window and well under the
    // majority the old 55%-of-window floor left behind
    const { estimateTokens } = await import("../src/providers/models.ts");
    const tailTok = vis.reduce((a, n) => a + estimateTokens(n.content), 0);
    expect(vis.length).toBeGreaterThanOrEqual(6);
    expect(tailTok).toBeGreaterThan(WINDOW * 0.3);
    expect(tailTok).toBeLessThan(60_000 * 0.6);
  });

  test("a failing summarizer still compacts with a mechanical note", async () => {
    const { compactIfNeeded } = await import("../src/context/compact.ts");
    const { projectView } = await import("../src/context/view.ts");
    const { id } = await fillSession(60, 4_000, 60_000);
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
    const { id } = await fillSession(60, 4_000, 60_000);
    const beforeCount = visibleNodes(projectView(id)).length;
    await compactIfNeeded(id, cfg as any, summarizer("s") as any);
    expect(visibleNodes(projectView(id)).length).toBeLessThan(beforeCount);
    expect(undoLastOp(id)).not.toBeNull();
    expect(visibleNodes(projectView(id)).length).toBe(beforeCount);
  });

  test("a lower compactAt threshold triggers on a smaller view", async () => {
    const { compactIfNeeded } = await import("../src/context/compact.ts");
    // The trigger reads max(report, chars/4 estimate of the visible history).
    // These 80 nodes tally ~60k by chars/4 — over 0.85 * 65_536 (= 55_705)
    // even though the provider's report (40k) is under it, because the
    // endpoint tokenizes loosely (~1 token/word). The estimate is what
    // crosses the threshold.
    const { id } = await fillSession(80, 3_000, 40_000);
    expect(await compactIfNeeded(id, cfg as any, summarizer("s") as any)).not.toBeNull();
    const ev = await compactIfNeeded(id, cfg as any, summarizer("s") as any, { compactAt: 0.6 });
    expect(ev).not.toBeNull();
  });

  test("the absolute ceiling compacts a window the fraction would never reach, when set", async () => {
    // the shipped defect this guards: a registry can claim a 1M window the
    // endpoint does not actually serve, so `0.85 * window` is unreachable and
    // the context grows monotonically. The ceiling is now OPT-IN (default 0 =
    // window fraction only), so an overstated window must set `compactAtTokens`
    // in config to get the guard — but when set it still fires below the fraction.
    const { compactIfNeeded } = await import("../src/context/compact.ts");
    setConfiguredModels([{ id: "overstated-window", contextWindow: 1_000_000 }]);
    const big = { ...cfg, model: "overstated-window" };
    const { id } = await fillSession(60, 4_000, 150_000); // under the 850k fraction

    // default: fraction only, 150k is well under 850k -> no compaction
    expect(await compactIfNeeded(id, big as any, summarizer("s") as any)).toBeNull();
    // explicit ceiling 131072: 150k is over it -> compacts, guarding the overstated window
    expect(await compactIfNeeded(id, big as any, summarizer("s") as any, { compactAtTokens: 131_072 })).not.toBeNull();
  });

  test("the trigger is the smaller of the window fraction and the ceiling", async () => {
    const { triggerTokens } = await import("../src/context/budget.ts");
    // replaces (not merges) the registration — keep the fixture model in it
    setConfiguredModels([
      { id: MODEL, contextWindow: WINDOW },
      { id: "overstated-window", contextWindow: 1_000_000 },
    ]);
    expect(triggerTokens("overstated-window", 0.85, 131_072)).toBe(131_072);
    expect(triggerTokens("overstated-window", 0.85, 0)).toBe(850_000); // ceiling off -> fraction only
    expect(triggerTokens(MODEL, 0.85, 131_072)).toBe(55_705); // a small window still binds first
  });

  test("the provider's prompt_tokens is the total, not the uncached subset", async () => {
    // Probed on kimi-for-coding: a fully cache-hit call still reports the full
    // prompt in `prompt_tokens` and repeats it in `cached_tokens` (a subset
    // flag, not a third bucket). So lastPromptTokens must read `prompt_tokens`
    // alone — summing the two would double-count every cache hit.
    const { lastPromptTokens } = await import("../src/store/db.ts");
    const { id } = await fillSession(4, 100, 500, 9_500); // report 500 total, all cache-read
    expect(lastPromptTokens(id)).toBe(500);
  });

  test("the context size adds a chars/4 estimate of the text since the last report", async () => {
    const { sessionContextTokens } = await import("../src/context/budget.ts");
    const { createSession, appendMessage, recordUsage } = await import("../src/store/db.ts");
    const s = createSession("/w", MODEL);
    // A measurable prefix, a usage report, then new text the report cannot see.
    for (let i = 0; i < 20; i++) {
      appendMessage(s.id, { parent_id: null, role: i % 2 ? "assistant" : "user", content: `x`.padEnd(1_600, "x"), tokens: 400 });
    }
    recordUsage(s.id, null, 8_000, 100);
    for (let i = 0; i < 4; i++) {
      appendMessage(s.id, { parent_id: null, role: i % 2 ? "assistant" : "user", content: `y`.padEnd(400, "y"), tokens: 100 });
    }
    const total = sessionContextTokens(s.id);
    // strictly greater than the report alone (the appended text is estimated on top)
    expect(total).toBeGreaterThan(8_000);
  });
});
