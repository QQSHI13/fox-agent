// Turn-scoped locking, at the level callers actually depend on.
//
// `lock.test.ts` covers the marker API in isolation. What matters here is the
// CONTRACT around it: a turn claims the marker for exactly as long as it runs —
// including every way a turn can end, which is the part that is easy to get
// wrong and invisible until two front ends interleave one transcript.
//
// The cases that would each have been a separate bug report:
//   - a turn that throws must still release (or the session is bricked forever)
//   - a turn a client ABANDONS mid-stream must release (esc / cancel — the
//     `for await` → `return()` path, which is not the same as running to `done`)
//   - an idle session must carry no marker at all, so a second opener can write
//   - a nested turn (a host wrapping `runTurnCore`) must not clear the outer
//     turn's marker on its way out
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "fox-turnlock-"));
  process.env.FOX_AGENT_HOME = dir;
  // BOTH: loadConfig reads the global config from FOX_AGENT_CONFIG when set,
  // else ~/.config — setting only the home leaves assertions exposed to the
  // developer's real config (see CLAUDE.md).
  process.env.FOX_AGENT_CONFIG = join(dir, "config.toml");
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  delete process.env.FOX_AGENT_HOME;
  delete process.env.FOX_AGENT_CONFIG;
});

type AgentEvent = import("../src/core/events.ts").AgentEvent;
type Script = import("../src/providers/types.ts").StreamEvent[];

const cfg = () => ({ baseUrl: "http://localhost:9", apiKey: "test", model: "test-model" });
const textDone = (t: string): Script => [
  { type: "text", delta: t },
  { type: "done", reason: "stop" },
];

/** A scripted chat whose generator body runs while the turn is in flight. */
function mockChat(scripts: Script[] | ((n: number) => Script), onCall?: (n: number) => void) {
  let n = 0;
  const fn = async function* (): AsyncGenerator<import("../src/providers/types.ts").StreamEvent> {
    onCall?.(n);
    const script = typeof scripts === "function" ? scripts(n) : scripts[n];
    if (!script) throw new Error("mock exhausted");
    n++;
    for (const ev of script) yield ev;
  };
  return { fn, count: () => n };
}

async function setup() {
  const db = await import("../src/store/db.ts");
  const turn = await import("../src/loop/turn.ts");
  const lock = await import("../src/store/lock.ts");
  const { steer, attachHost, detachHost, turnRunning } = await import("../src/loop/steer.ts");
  return { ...db, ...turn, ...lock, steer, attachHost, detachHost, turnRunning };
}

async function collect(gen: AsyncGenerator<AgentEvent>) {
  const events: AgentEvent[] = [];
  for await (const ev of gen) events.push(ev);
  return events;
}

describe("a turn holds the marker only while it runs", () => {
  test("the marker is live DURING the turn and gone immediately after", async () => {
    const t = await setup();
    const s = t.createSession("/w", "m1");
    let seenDuringTurn: unknown = "unset";
    // The provider body runs mid-turn, which is the only place the marker can
    // be observed from inside an in-process test.
    const mock = mockChat([textDone("ok")], () => {
      seenDuringTurn = t.lockHolder(s.id);
    });
    const events = await collect(t.runTurnCore(s.id, cfg(), "hi", undefined, { chat: mock.fn as any, quiet: true }));
    expect(events.at(-1)?.type).toBe("done");
    expect(seenDuringTurn).toMatchObject({ pid: process.pid, kind: "fox" });
    // released: an idle session carries NO lock, which is the whole point —
    // any client may send the next message
    expect(t.lockHolder(s.id)).toBeNull();
  });

  test("the marker names the surface that claimed it", async () => {
    const t = await setup();
    const s = t.createSession("/w", "m1");
    let kind: string | undefined;
    const mock = mockChat([textDone("ok")], () => {
      kind = t.lockHolder(s.id)?.kind;
    });
    await collect(t.runTurnCore(s.id, cfg(), "hi", undefined, { chat: mock.fn as any, quiet: true, lockKind: "acp" }));
    expect(kind).toBe("acp");
  });

  // A turn's failure modes are not the same thing, and it matters which is
  // which: a PROVIDER error is caught inside turnBody and reported as
  // `done(error …)`, while a failure before the loop (an unknown session) really
  // does reject. Both paths must release, or the session is bricked forever.
  test("a provider error ends the turn as done(error) and still releases", async () => {
    const t = await setup();
    const s = t.createSession("/w", "m1");
    const boom = async function* (): AsyncGenerator<never> {
      throw new Error("provider exploded");
    };
    const events = await collect(t.runTurnCore(s.id, cfg(), "hi", undefined, { chat: boom as any, quiet: true }));
    // turnBody catches provider failures and reports them as a stop reason
    expect(events.at(-1)).toMatchObject({ type: "done" });
    expect((events.at(-1) as { reason: string }).reason).toMatch(/^error/);
    expect(t.lockHolder(s.id)).toBeNull();
  });

  test("a turn that rejects before the loop still releases the marker", async () => {
    const t = await setup();
    // no such session: turnBody throws before any work, so this genuinely
    // rejects rather than ending as done — the `finally` is the only release
    await expect(
      collect(t.runTurnCore("no-such-session", cfg(), "hi", undefined, { chat: mockChat([textDone("x")]).fn as any, quiet: true })),
    ).rejects.toThrow(/no session/);
    expect(t.lockHolder("no-such-session")).toBeNull();
  });

  test("an ABANDONED turn releases the marker (consumer breaks mid-stream)", async () => {
    // The esc / session-cancel path: the client stops iterating rather than
    // running the turn to `done`. `for await` then calls `.return()` on the
    // generator, so the release must live in a `finally`, not after the loop.
    const t = await setup();
    const s = t.createSession("/w", "m1");
    const slow = async function* (): AsyncGenerator<import("../src/providers/types.ts").StreamEvent> {
      yield { type: "text", delta: "first" };
      yield { type: "text", delta: "second" };
      yield { type: "done", reason: "stop" };
    };
    for await (const ev of t.runTurnCore(s.id, cfg(), "hi", undefined, { chat: slow as any, quiet: true })) {
      if (ev.type === "text") break; // walk away mid-turn
    }
    expect(t.lockHolder(s.id)).toBeNull();
  });

  test("an aborted turn releases the marker", async () => {
    const t = await setup();
    const s = t.createSession("/w", "m1");
    const ac = new AbortController();
    const hanging = async function* (): AsyncGenerator<any> {
      yield { type: "text", delta: "partial" };
      await new Promise((_, rej) =>
        ac.signal.addEventListener("abort", () => rej(new DOMException("aborted", "AbortError")), { once: true }),
      );
      yield { type: "done", reason: "stop" };
    };
    setTimeout(() => ac.abort(), 20);
    await collect(t.runTurnCore(s.id, cfg(), "hi", ac.signal, { chat: hanging as any, quiet: true }));
    expect(t.lockHolder(s.id)).toBeNull();
  });

  test("back-to-back turns each claim and release cleanly", async () => {
    // Sequential reuse is the common shape (turn, idle, turn). A stale depth
    // count or a leaked marker turns the second turn into a refusal.
    const t = await setup();
    const s = t.createSession("/w", "m1");
    for (const said of ["one", "two", "three"]) {
      const mock = mockChat([textDone(said)]);
      await collect(t.runTurnCore(s.id, cfg(), said, undefined, { chat: mock.fn as any, quiet: true }));
      expect(t.lockHolder(s.id)).toBeNull();
    }
    expect(t.allMessages(s.id).filter((m: any) => m.role === "user")).toHaveLength(3);
  });
});

describe("a second writer is refused only while a turn is really running", () => {
  test("a foreign marker refuses the turn, and writes nothing", async () => {
    const t = await setup();
    const s = t.createSession("/w", "m1");
    // pid 1: alive but unsignalable, which lock.ts reads as a live holder
    t.acquireLock(s.id, "tui");
    const { writeFileSync } = await import("node:fs");
    writeFileSync(join(dir, "locks", `${s.id}.json`), JSON.stringify({ pid: 1, kind: "tui", ts: Date.now() }));

    const mock = mockChat([textDone("should not happen")]);
    await expect(
      collect(t.runTurnCore(s.id, cfg(), "hi", undefined, { chat: mock.fn as any, quiet: true })),
    ).rejects.toThrow(/turn is already running in another fox-agent process.*tui/);
    // the refusal happened BEFORE any write: no user node was persisted
    expect(t.allMessages(s.id)).toHaveLength(0);
    expect(mock.count()).toBe(0); // the provider was never called
    t.releaseLock(s.id);
  });

  test("the refusal names the holder and its pid, so it is actionable", async () => {
    const t = await setup();
    const s = t.createSession("/w", "m1");
    const { writeFileSync, mkdirSync } = await import("node:fs");
    mkdirSync(join(dir, "locks"), { recursive: true });
    writeFileSync(join(dir, "locks", `${s.id}.json`), JSON.stringify({ pid: 1, kind: "acp", ts: Date.now() }));
    const mock = mockChat([textDone("x")]);
    let msg = "";
    try {
      await collect(t.runTurnCore(s.id, cfg(), "hi", undefined, { chat: mock.fn as any, quiet: true }));
    } catch (e) {
      msg = (e as Error).message;
    }
    expect(msg).toContain("acp");
    expect(msg).toContain("pid 1");
    expect(msg).toContain("wait for it to finish");
  });

  test("once that foreign turn ends, the next turn is accepted", async () => {
    // The behaviour the whole change is for: refusal is transient, not sticky.
    const t = await setup();
    const s = t.createSession("/w", "m1");
    const { writeFileSync, mkdirSync, rmSync } = await import("node:fs");
    mkdirSync(join(dir, "locks"), { recursive: true });
    const marker = join(dir, "locks", `${s.id}.json`);
    writeFileSync(marker, JSON.stringify({ pid: 1, kind: "tui", ts: Date.now() }));

    const first = mockChat([textDone("x")]);
    await expect(
      collect(t.runTurnCore(s.id, cfg(), "one", undefined, { chat: first.fn as any, quiet: true })),
    ).rejects.toThrow();

    rmSync(marker, { force: true }); // the other process's turn finished
    const second = mockChat([textDone("accepted")]);
    const events = await collect(
      t.runTurnCore(s.id, cfg(), "two", undefined, { chat: second.fn as any, quiet: true }),
    );
    expect(events.at(-1)).toMatchObject({ type: "done", reason: "stop" });
    expect(t.allMessages(s.id).map((m: any) => m.content)).toContain("two");
  });

  test("a stale marker from a dead process does not block the turn", async () => {
    const t = await setup();
    const s = t.createSession("/w", "m1");
    const { writeFileSync, mkdirSync, existsSync } = await import("node:fs");
    mkdirSync(join(dir, "locks"), { recursive: true });
    // a crash leaves the file behind; pid 0xffffff is not running
    writeFileSync(join(dir, "locks", `${s.id}.json`), JSON.stringify({ pid: 0xffffff, kind: "tui", ts: Date.now() }));
    const mock = mockChat([textDone("ok")]);
    const events = await collect(t.runTurnCore(s.id, cfg(), "hi", undefined, { chat: mock.fn as any, quiet: true }));
    expect(events.at(-1)?.type).toBe("done");
    // and the turn did not leave our own marker behind either
    expect(t.lockHolder(s.id)).toBeNull();
    expect(existsSync(join(dir, "locks", `${s.id}.json`))).toBe(false);
  });
});

describe("nested turns keep the marker for the outermost one", () => {
  // Depth-counted on purpose: `SessionHost.turn` is documented as a WRAPPER
  // around runTurnCore, so one logical turn can reach the lock twice. Without
  // the count the inner release deletes the marker mid-turn and the session
  // looks idle to every other process — the interleaving this module prevents.
  // No bundled surface nests today (verified: one acquire per turn), so this
  // guards the contract a host is allowed to use.
  test("the inner release keeps the marker; the outer one clears it", async () => {
    const t = await setup();
    const s = t.createSession("/w", "m1");
    expect(t.acquireTurnLock(s.id, "tui")).toBe(true); // outer
    expect(t.acquireTurnLock(s.id, "tui")).toBe(true); // inner
    t.releaseTurnLock(s.id); // inner returns
    // still claimed: this is the assertion the whole counter exists for
    expect(t.lockHolder(s.id)?.pid).toBe(process.pid);
    t.releaseTurnLock(s.id); // outer returns
    expect(t.lockHolder(s.id)).toBeNull();
  });

  test("a host that wraps runTurnCore does not clear the outer marker", async () => {
    const t = await setup();
    const s = t.createSession("/w", "m1");
    const cfgv = cfg();
    const chat = async function* (): AsyncGenerator<any> {
      yield { type: "text", delta: "x" };
      yield { type: "done", reason: "stop" };
    };
    // outer turn claims the session, then delegates to a wrapper that runs an
    // INNER turn on the same id — the shape `SessionHost.turn` permits
    let markerAfterInner: unknown = "unset";
    expect(t.acquireTurnLock(s.id, "tui")).toBe(true);
    for await (const _ev of t.runTurnCore(s.id, cfgv, "inner", undefined, { chat: chat as any, quiet: true })) {
      // the inner turn runs to completion here
    }
    markerAfterInner = t.lockHolder(s.id);
    t.releaseTurnLock(s.id);

    expect(markerAfterInner).toMatchObject({ pid: process.pid }); // survived
    expect(t.lockHolder(s.id)).toBeNull(); // and the outer release cleared it
  });

  test("a steered turn started by core claims and releases its own marker", async () => {
    // The steer path is the one place core starts a turn without a client
    // asking, so the marker is claimed from inside the dispatch rather than
    // from a request handler.
    const t = await setup();
    const s = t.createSession("/w", "m1");
    t.attachHost(s.id, {
      provider: () => cfg() as never,
      config: () => undefined,
      turn: (text: string) =>
        t.runTurnCore(s.id, cfg(), text, undefined, { chat: mockChat([textDone("steered")]).fn as any, quiet: true }),
      sink: () => {},
    });
    t.steer(s.id, "a steered message");
    // Wait for the OUTCOME, not for `turnRunning`: the dispatch runs on a
    // macrotask, so the flag is still false at this instant and polling it
    // returned immediately. A bounded poll keeps the test honest without a
    // guessed sleep.
    const answered = async () => t.allMessages(s.id).some((m: any) => m.role === "assistant");
    for (let i = 0; i < 200 && !(await answered()); i++) await new Promise((r) => setTimeout(r, 25));
    expect(await answered()).toBe(true);
    // and with the turn finished, the marker is gone
    for (let i = 0; i < 200 && t.turnRunning(s.id); i++) await new Promise((r) => setTimeout(r, 25));
    expect(t.turnRunning(s.id)).toBe(false);
    expect(t.lockHolder(s.id)).toBeNull();
    t.detachHost(s.id);
  });
});
