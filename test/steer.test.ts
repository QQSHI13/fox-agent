import { afterEach, describe, expect, test } from "bun:test";
import {
  attachHost,
  backgroundEnded,
  backgroundStarted,
  backgroundCount,
  detachHost,
  drainSteer,
  hasSteer,
  isQuiescent,
  peekSteer,
  releaseSteer,
  requeueSteer,
  steer,
  turnRunning,
  waitQuiescent,
} from "../src/loop/steer.ts";
import type { AgentEvent } from "../src/core/events.ts";

/**
 * These tests drive the steer layer with a fake `turn` in the host, so no
 * session, store or provider is involved: what is under test is exactly the
 * ownership question that broke six times — does text that arrives while
 * nothing is running become a turn, and does it survive every failure path.
 */

const SID = "s-test";
const sleeps: string[] = [];

/** Drain the macrotask the dispatch pump runs on. */
const settle = () => new Promise((r) => setTimeout(r, 5));

function hostThat(opts: {
  onText?: (t: string) => void;
  fail?: boolean;
  events?: AgentEvent[];
  hold?: () => Promise<void>;
}) {
  const started: string[] = [];
  return {
    started,
    host: {
      provider: () => ({ model: "m", provider: "openai-compatible", apiKey: "k" }) as never,
      config: () => undefined,
      turn: (text: string) => {
        started.push(text);
        return (async function* (): AsyncGenerator<AgentEvent> {
          if (opts.fail) throw new Error("provider down");
          opts.onText?.(text);
          for (const ev of opts.events ?? []) yield ev;
          yield { type: "text", delta: `answer:${text}` } as AgentEvent;
          if (opts.hold) await opts.hold();
          yield { type: "done", reason: "stop" } as AgentEvent;
        })();
      },
    },
  };
}

afterEach(() => {
  releaseSteer(SID);
  sleeps.length = 0;
});

describe("steer: core owns the turn", () => {
  test("a steer with nothing running starts a turn", async () => {
    const { host, started } = hostThat({});
    attachHost(SID, host);
    steer(SID, "job finished");
    expect(hasSteer(SID)).toBe(true); // queued synchronously, not lost
    await settle();
    expect(started).toEqual(["job finished"]);
    expect(peekSteer(SID)).toEqual([]); // claimed by the turn
  });

  test("several steers before the pump coalesce into one turn, in order", async () => {
    const { host, started } = hostThat({});
    attachHost(SID, host);
    steer(SID, "one");
    steer(SID, "two");
    await settle();
    expect(started).toEqual(["one\ntwo"]);
  });

  test("a steer never starts a second turn while one is running", async () => {
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    const { host, started } = hostThat({ hold: () => held });
    attachHost(SID, host);
    steer(SID, "first");
    await settle();
    expect(started).toEqual(["first"]);
    // the turn is now running; this must queue, not dispatch
    steer(SID, "second");
    await settle();
    expect(started).toEqual(["first"]);
    expect(peekSteer(SID)).toEqual(["second"]);
    release();
    await settle();
    // and once the first turn ends, the queued one gets its own turn
    expect(started).toEqual(["first", "second"]);
  });

  test("the regression: a steer arriving just as a turn ends still becomes a turn", async () => {
    const { host, started } = hostThat({});
    attachHost(SID, host);
    steer(SID, "during");
    await settle();
    expect(started).toEqual(["during"]);
    // the turn ended; this is the window that stranded messages: the turn's
    // final peeks had already run, so nothing was left to consume it
    steer(SID, "after the last step");
    await settle();
    expect(started).toEqual(["during", "after the last step"]);
  });

  test("a steer with no host attached stays queued, and attaching one dispatches it", async () => {
    steer(SID, "early");
    await settle();
    expect(hasSteer(SID)).toBe(true); // nowhere to render it: kept, not dropped
    const { host, started } = hostThat({});
    attachHost(SID, host);
    await settle();
    expect(started).toEqual(["early"]);
  });

  test("a failed turn requeues the text instead of losing it", async () => {
    const { host, started } = hostThat({ fail: true });
    attachHost(SID, host);
    steer(SID, "keep me");
    await settle();
    expect(started).toEqual(["keep me"]);
    expect(peekSteer(SID)).toEqual(["keep me"]); // put back
    // and it does not spin: the session is blocked until something changes
    await settle();
    expect(started).toEqual(["keep me"]);
    // a new message clears the block and retries with the whole queue intact
    steer(SID, "try again");
    await settle();
    expect(started).toEqual(["keep me", "keep me\ntry again"]);
  });

  test("detaching the host stops dispatch but keeps the queue", async () => {
    const { host, started } = hostThat({});
    attachHost(SID, host);
    detachHost(SID);
    steer(SID, "queued while detached");
    await settle();
    expect(started).toEqual([]);
    expect(peekSteer(SID)).toEqual(["queued while detached"]);
  });
});

describe("steer: quiescence", () => {
  test("idle, empty and unqueued is quiescent", () => {
    expect(isQuiescent(SID)).toBe(true);
  });

  test("a queued steer or a live background job is not quiescent", async () => {
    steer(SID, "pending");
    expect(isQuiescent(SID)).toBe(false);
    drainSteer(SID);
    expect(isQuiescent(SID)).toBe(true);

    backgroundStarted(SID);
    expect(backgroundCount(SID)).toBe(1);
    expect(isQuiescent(SID)).toBe(false);
    backgroundEnded(SID);
    expect(isQuiescent(SID)).toBe(true);
  });

  test("waitQuiescent resolves when the last background job ends", async () => {
    backgroundStarted(SID);
    backgroundStarted(SID);
    let done = false;
    const p = waitQuiescent(SID).then(() => (done = true));
    await settle();
    expect(done).toBe(false);
    backgroundEnded(SID);
    await settle();
    expect(done).toBe(false); // one job still live
    backgroundEnded(SID);
    await p;
    expect(done).toBe(true);
  });

  test("waitQuiescent resolves immediately when already idle", async () => {
    await waitQuiescent(SID); // would hang the test if it did not
    expect(isQuiescent(SID)).toBe(true);
  });

  test("a steered turn keeps the session non-quiescent until it finishes", async () => {
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    const { host } = hostThat({ hold: () => held });
    attachHost(SID, host);
    steer(SID, "work");
    await settle();
    expect(turnRunning(SID)).toBe(true);
    expect(isQuiescent(SID)).toBe(false);
    let done = false;
    const p = waitQuiescent(SID).then(() => (done = true));
    release();
    await p;
    expect(done).toBe(true);
    expect(turnRunning(SID)).toBe(false);
  });
});

describe("steer: queue primitives", () => {
  test("requeueSteer puts text at the front, oldest first", () => {
    steer(SID, "later");
    requeueSteer(SID, ["first", "second"]);
    expect(peekSteer(SID)).toEqual(["first", "second", "later"]);
  });

  test("releaseSteer returns undelivered text rather than discarding it", () => {
    steer(SID, "unsent");
    expect(releaseSteer(SID)).toEqual(["unsent"]);
    expect(peekSteer(SID)).toEqual([]);
  });
});
