// Regression tests for the four defects behind "typeerrors in request timeouts
// appear in the chat box, and the bottom bar still shows thinking":
//   1. no request timeout existed at all — a black-hole provider hung forever
//   2. an aborted `fullStream` does not throw, it just ends, so a timeout used
//      to look like a clean "stop"
//   3. a timeout must not be mistaken for a user interrupt (ESC)
//   4. a timeout must be retriable
import { afterEach, describe, expect, test } from "bun:test";
import { startWatchdog } from "../src/providers/watchdog.ts";
import { isTimeout } from "../src/core/errors.ts";
import { runTurnCore } from "../src/loop/turn.ts";
import { ProviderTimeoutError } from "../src/core/errors.ts";
import type { ChatFn, ProviderConfig } from "../src/providers/types.ts";
import type { AgentEvent } from "../src/core/events.ts";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("idle watchdog", () => {
  test("fires when nothing makes progress", async () => {
    const wd = startWatchdog(120);
    expect(wd.timedOut).toBe(false);
    await sleep(300);
    expect(wd.timedOut).toBe(true);
    expect(wd.signal!.aborted).toBe(true);
    expect(isTimeout(wd.error())).toBe(true);
    wd.done();
  });

  test("progress() rearms — a slow but healthy stream is never killed", async () => {
    // total elapsed (600ms) far exceeds the 150ms window; only the *gaps* matter
    const wd = startWatchdog(150);
    for (let i = 0; i < 12; i++) {
      await sleep(50);
      wd.progress();
    }
    expect(wd.timedOut).toBe(false);
    expect(wd.signal!.aborted).toBe(false);
    wd.done();
  });

  test("done() disarms, so a finished stream cannot time out later", async () => {
    const wd = startWatchdog(100);
    wd.done();
    await sleep(250);
    expect(wd.timedOut).toBe(false);
    expect(wd.signal!.aborted).toBe(false);
  });

  test("the caller's abort still wins and is not reported as a timeout", async () => {
    const ac = new AbortController();
    const wd = startWatchdog(5_000, ac.signal);
    ac.abort();
    await sleep(10);
    expect(wd.signal!.aborted).toBe(true);
    // critical: ESC must not be misread as an idle timeout
    expect(wd.timedOut).toBe(false);
    wd.done();
  });

  test("an already-aborted caller signal propagates immediately", () => {
    const ac = new AbortController();
    ac.abort();
    const wd = startWatchdog(5_000, ac.signal);
    expect(wd.signal!.aborted).toBe(true);
    expect(wd.timedOut).toBe(false);
    wd.done();
  });

  test("timeout of 0 disables the clock but preserves the caller's signal", async () => {
    const ac = new AbortController();
    const wd = startWatchdog(0, ac.signal);
    expect(wd.signal).toBe(ac.signal);
    await sleep(50);
    expect(wd.timedOut).toBe(false);
    wd.done();
  });

  test("no timeout and no caller signal means no signal at all", () => {
    const wd = startWatchdog(undefined);
    expect(wd.signal).toBeUndefined();
    wd.done();
  });
});

describe("black-hole provider", () => {
  // a server that accepts the connection and then sends nothing — the exact
  // shape that used to hang the turn forever
  let stop: (() => void) | null = null;
  afterEach(() => {
    stop?.();
    stop = null;
  });

  test("streamChat fails on a bounded clock instead of hanging", async () => {
    const server = Bun.listen({
      hostname: "127.0.0.1",
      port: 0,
      socket: { data() {}, open() {} }, // accept, never respond
    });
    stop = () => server.stop(true);

    const { streamChat } = await import("../src/providers/openai-compatible.ts");
    const cfg: ProviderConfig = {
      model: "m",
      baseUrl: `http://127.0.0.1:${server.port}/v1`,
      apiKey: "k",
      requestTimeoutMs: 700,
    };

    const t0 = Bun.nanoseconds();
    let caught: unknown;
    try {
      for await (const _ of streamChat(cfg, [{ role: "user", content: "hi" }], [])) {
        // a black hole yields nothing; reaching here at all is a failure
      }
      throw new Error("streamChat ended with no error — the timeout did not fire");
    } catch (e) {
      caught = e;
    }
    const ms = (Bun.nanoseconds() - t0) / 1e6;

    expect(isTimeout(caught)).toBe(true);
    expect((caught as ProviderTimeoutError).retriable).toBe(true);
    // must not look like a user interrupt, or the turn ends instead of retrying
    expect((caught as Error).name).not.toBe("AbortError");
    expect((caught as Error).message).toMatch(/timed out/);
    // bounded: well under the pre-fix "forever"
    expect(ms).toBeLessThan(6_000);
  }, 15_000);

  test("ESC during a hang reports abort, not timeout", async () => {
    const server = Bun.listen({
      hostname: "127.0.0.1",
      port: 0,
      socket: { data() {}, open() {} },
    });
    stop = () => server.stop(true);

    const { streamChat } = await import("../src/providers/openai-compatible.ts");
    const cfg: ProviderConfig = {
      model: "m",
      baseUrl: `http://127.0.0.1:${server.port}/v1`,
      apiKey: "k",
      requestTimeoutMs: 30_000, // long: the abort must win the race
    };
    const ac = new AbortController();
    setTimeout(() => ac.abort(), 300);

    let caught: unknown;
    try {
      for await (const _ of streamChat(cfg, [{ role: "user", content: "hi" }], [], ac.signal)) {
        /* nothing arrives */
      }
      throw new Error("stream ended cleanly instead of aborting");
    } catch (e) {
      caught = e;
    }
    expect((caught as Error).name).toBe("AbortError");
    expect(isTimeout(caught)).toBe(false);
  }, 15_000);
});

describe("runTurnCore with a timing-out provider", () => {
  const cfg: ProviderConfig = { model: "m", baseUrl: "http://127.0.0.1:9/v1", apiKey: "k" };

  function session(): string {
    const home = mkdtempSync(join(tmpdir(), "fox-timeout-"));
    process.env.FOX_HOME = join(home, ".fox");
    // db module reads FOX_HOME lazily per call, so importing after the env set
    // is not required — but the session must be created through the store
    return home;
  }

  test("a timeout is retried and the loop terminates", async () => {
    session();
    const { createSession } = await import("../src/store/db.ts");
    const s = createSession(process.cwd(), "m");

    let calls = 0;
    const chat: ChatFn = async function* () {
      calls++;
      throw new ProviderTimeoutError(3_000);
    };

    const events: AgentEvent[] = [];
    for await (const ev of runTurnCore(s.id, cfg, "hello", undefined, {
      chat,
      retryLimit: 2,
      registryOverride: new Map(),
    })) {
      events.push(ev);
    }

    const retries = events.filter((e) => e.type === "retry");
    // retryLimit 2 => attempts at n=0,1 retry, n=2 gives up: 2 retry events
    expect(retries.length).toBe(2);
    expect(calls).toBe(3);
    for (const r of retries) {
      expect((r as { error: string }).error).toMatch(/timed out/);
      expect((r as { delay_ms: number }).delay_ms).toBeGreaterThan(0);
    }

    // it must END, not spin: last event is a done carrying the readable reason
    const last = events[events.length - 1]!;
    expect(last.type).toBe("done");
    expect((last as { reason: string }).reason).toMatch(/timed out/);
    expect((last as { reason: string }).reason).not.toMatch(/TypeError/);
  }, 30_000);

  test("a code bug is not retried and never leaks raw text into the transcript", async () => {
    session();
    const { createSession, allMessages } = await import("../src/store/db.ts");
    const s = createSession(process.cwd(), "m");

    let calls = 0;
    const chat: ChatFn = async function* () {
      calls++;
      (undefined as unknown as { foo: { bar: number } }).foo.bar; // genuine bug
    };

    const events: AgentEvent[] = [];
    for await (const ev of runTurnCore(s.id, cfg, "hello", undefined, {
      chat,
      retryLimit: 3,
      registryOverride: new Map(),
    })) {
      events.push(ev);
    }

    expect(calls).toBe(1); // deterministic bug: retrying is pointless
    const last = events[events.length - 1]!;
    expect((last as { reason: string }).reason).toMatch(/internal error/);
    expect((last as { reason: string }).reason).not.toMatch(/undefined is not an object/);

    // ...but the detail is durable on the message row for a bug report
    const sys = allMessages(s.id).filter((m) => m.role === "system");
    const withDetail = sys.find((m) => (m.error ?? "").includes("TypeError"));
    expect(withDetail).toBeTruthy();
    expect(withDetail!.error).toMatch(/undefined is not an object/);
  }, 15_000);

  test("a user abort still ends the turn as aborted", async () => {
    session();
    const { createSession } = await import("../src/store/db.ts");
    const s = createSession(process.cwd(), "m");

    const ac = new AbortController();
    const chat: ChatFn = async function* () {
      ac.abort();
      const err = new Error("aborted");
      err.name = "AbortError";
      throw err;
    };

    const events: AgentEvent[] = [];
    for await (const ev of runTurnCore(s.id, cfg, "hello", ac.signal, {
      chat,
      retryLimit: 3,
      registryOverride: new Map(),
    })) {
      events.push(ev);
    }
    expect(events.filter((e) => e.type === "retry").length).toBe(0);
    expect((events[events.length - 1] as { reason: string }).reason).toBe("aborted");
  }, 15_000);
});
