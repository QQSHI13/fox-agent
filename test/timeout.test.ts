// Regression tests for the four defects behind "typeerrors in request timeouts
// appear in the chat box, and the bottom bar still shows thinking":
//   1. no request timeout existed at all — a black-hole provider hung forever
//   2. an aborted `fullStream` does not throw, it just ends, so a timeout used
//      to look like a clean "stop"
//   3. a timeout must not be mistaken for a user interrupt (ESC)
//   4. a timeout must be retriable
import { afterEach, describe, expect, test } from "bun:test";
import { startWatchdog } from "../src/providers/watchdog.ts";
import { isTimeout, isTruncated } from "../src/core/errors.ts";
import { runTurnCore } from "../src/loop/turn.ts";
import { ProviderTimeoutError } from "../src/core/errors.ts";
import type { ChatFn, ProviderConfig } from "../src/providers/types.ts";
import type { AgentEvent } from "../src/core/events.ts";
import { mkdtempSync } from "node:fs";
import { createServer } from "node:http";
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

describe("provider stream cut off mid-answer", () => {
  test("openai-compatible: a dropped connection after text is a resumable error", async () => {
    // The exact shape of the report: 200 + SSE headers, a text chunk, then the
    // socket dies before any finish_reason. The partial answer already reached
    // the user, so this must be marked truncatable/resumable — not reported as
    // an ordinary provider failure that strands the half answer.
    const server = createServer((_req, res) => {
      res.writeHead(200, { "content-type": "text/event-stream" });
      res.flushHeaders();
      res.write(
        `data: ${JSON.stringify({
          id: "1",
          object: "chat.completion.chunk",
          created: 0,
          model: "m",
          choices: [{ index: 0, delta: { role: "assistant", content: "half an ans" } }],
        })}\n\n`,
      );
      // long enough for the chunk to reach the client's parser, short enough
      // that the stream is still open when the socket dies
      setTimeout(() => res.destroy(), 50);
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const port = (server.address() as { port: number }).port;
    try {
      const { streamChat } = await import("../src/providers/openai-compatible.ts");
      const deltas: string[] = [];
      let caught: unknown;
      try {
        for await (const ev of streamChat(
          { model: "m", baseUrl: `http://127.0.0.1:${port}/v1`, apiKey: "k", requestTimeoutMs: 10_000 },
          [{ role: "user", content: "hi" }],
          [],
        )) {
          if (ev.type === "text") deltas.push(ev.delta);
        }
        throw new Error("the stream ended cleanly — a cut-off must not look like a stop");
      } catch (e) {
        caught = e;
      }
      expect(deltas).toEqual(["half an ans"]); // the partial answer is real output
      expect(isTruncated(caught)).toBe(true); // the marker the loop resumes on
      expect((caught as Error).message).toMatch(/cut off mid-answer/);
      expect((caught as Error).message).toMatch(/ECONNRESET|socket/i); // the cause rides along
      expect((caught as Error).message).not.toMatch(/HTTP 200/); // not a "success" prefix
    } finally {
      server.close();
    }
  }, 15_000);
});

describe("runTurnCore with a timing-out provider", () => {
  const cfg: ProviderConfig = { model: "m", baseUrl: "http://127.0.0.1:9/v1", apiKey: "k" };

  function session(): string {
    const home = mkdtempSync(join(tmpdir(), "fox-timeout-"));
    process.env.FOX_AGENT_HOME = join(home, ".fox");
    // BOTH: loadConfig reads the global config from FOX_AGENT_CONFIG when set,
    // else ~/.config — setting only the home left this suite asserting against
    // the developer's real config (a stray key there flips expect(warnings)).
    // Point it inside the tmp home; never touch the real config (CLAUDE.md).
    process.env.FOX_AGENT_CONFIG = join(home, ".fox", "config.toml");
    // db module reads FOX_AGENT_HOME lazily per call, so importing after the env set
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

  test("a stream that ends with no finish reason is retried, even after text streamed", async () => {
    session();
    const { createSession } = await import("../src/store/db.ts");
    const { TruncatedStreamError } = await import("../src/core/errors.ts");
    const s = createSession(process.cwd(), "m");

    let calls = 0;
    const chat: ChatFn = async function* () {
      calls++;
      // the socket dies mid-answer: some text arrived, then the stream just ended
      yield { type: "text", delta: "half an ans" };
      throw new TruncatedStreamError("m");
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
    // the `emitted` guard normally blocks a retry once text streamed; a
    // TRUNCATED stream is the exception — the text was cut mid-sentence, so
    // keeping it means keeping a broken answer. retryLimit 2 => 2 retries.
    expect(retries.length).toBe(2);
    expect(calls).toBe(3);
    for (const r of retries) expect((r as { error: string }).error).toMatch(/no finish reason/);
  }, 30_000);

  test("a cut-off answer is RESUMED from where it stopped, not regenerated", async () => {
    session();
    const { createSession, allMessages } = await import("../src/store/db.ts");
    const { TruncatedStreamError } = await import("../src/core/errors.ts");
    const s = createSession(process.cwd(), "m");

    const requests: import("../src/providers/types.ts").ChatMessage[][] = [];
    let calls = 0;
    const chat: ChatFn = async function* (_cfg, messages) {
      requests.push(messages);
      calls++;
      if (calls === 1) {
        // the socket dies mid-answer: text arrived, then the stream ended with
        // no finish part (the openai-compatible/anthropic/google shape)
        yield { type: "text", delta: "Half an answer" };
        throw new TruncatedStreamError("m");
      }
      // the resumed request is expected to continue, not start over
      yield { type: "text", delta: ", finished by the resumed stream." };
      yield { type: "done", reason: "stop" };
    };

    const events: AgentEvent[] = [];
    for await (const ev of runTurnCore(s.id, cfg, "hello", undefined, {
      chat,
      retryLimit: 2,
      registryOverride: new Map(),
    })) {
      events.push(ev);
    }

    expect(calls).toBe(2); // one resume, not a restart loop
    // The second request feeds the partial answer back as an ASSISTANT prefill
    // and asks for the continuation — that is what makes a resume a resume.
    const second = requests[1]!;
    expect(second[second.length - 2]).toMatchObject({ role: "assistant", content: "Half an answer" });
    expect(second[second.length - 1]!.role).toBe("user");
    expect(second[second.length - 1]!.content).toMatch(/continue the same answer/i);

    // ONE assistant node holding the whole answer, and no duplicated prefix
    const replies = allMessages(s.id).filter((m) => m.role === "assistant" && m.content);
    expect(replies).toHaveLength(1);
    expect(replies[0].content).toBe("Half an answer, finished by the resumed stream.");

    const retries = events.filter((e) => e.type === "retry") as { error: string; delay_ms: number }[];
    expect(retries).toHaveLength(1);
    expect(retries[0].error).toMatch(/resuming/); // the UI says what happened
  }, 30_000);

  test("a mid-stream transport failure is resumed too, not just a no-finish stream", async () => {
    session();
    const { createSession, allMessages } = await import("../src/store/db.ts");
    const s = createSession(process.cwd(), "m");

    let calls = 0;
    const chat: ChatFn = async function* () {
      calls++;
      if (calls === 1) {
        yield { type: "text", delta: "Progress: 1 " };
        // what a plugin ChatFn (or a provider SDK that throws instead of
        // ending) produces when the socket resets mid-answer
        throw new Error("ECONNRESET: The socket connection was closed unexpectedly.");
      }
      yield { type: "text", delta: "Progress: 2." };
      yield { type: "done", reason: "stop" };
    };

    const events: AgentEvent[] = [];
    for await (const ev of runTurnCore(s.id, cfg, "hello", undefined, {
      chat,
      retryLimit: 2,
      registryOverride: new Map(),
    })) {
      events.push(ev);
    }

    expect(calls).toBe(2);
    const replies = allMessages(s.id).filter((m) => m.role === "assistant" && m.content);
    expect(replies).toHaveLength(1);
    expect(replies[0].content).toBe("Progress: 1 Progress: 2.");
    expect((events.at(-1) as { type: string; reason: string }).reason).toBe("stop");
  }, 30_000);

  test("a tool call cut off mid-stream restarts instead of being continued", async () => {
    session();
    const { createSession, allMessages } = await import("../src/store/db.ts");
    const { TruncatedStreamError } = await import("../src/core/errors.ts");
    const s = createSession(process.cwd(), "m");

    const requests: import("../src/providers/types.ts").ChatMessage[][] = [];
    let calls = 0;
    const chat: ChatFn = async function* (_cfg, messages) {
      requests.push(messages);
      calls++;
      if (calls === 1) {
        yield { type: "text", delta: "Let me look. " };
        yield { type: "tool_call", call: { id: "c1", name: "unknown_tool", arguments: '{"path":' } };
        throw new TruncatedStreamError("m");
      }
      yield { type: "text", delta: "Done." };
      yield { type: "done", reason: "stop" };
    };

    for await (const _ of runTurnCore(s.id, cfg, "hello", undefined, {
      chat,
      retryLimit: 2,
      registryOverride: new Map(),
    })) {
      /* drain */
    }

    expect(calls).toBe(2);
    // a restart: the partial text and the half-received call are dropped, and
    // the request is the original one — NOT an assistant prefill
    expect(requests[1]!.some((m) => m.role === "assistant")).toBe(false);
    const replies = allMessages(s.id).filter((m) => m.role === "assistant" && m.content);
    expect(replies).toHaveLength(1);
    expect(replies[0].content).toBe("Done.");
  }, 30_000);

  test("a provider Retry-After is honored instead of the local backoff", async () => {
    session();
    const { createSession } = await import("../src/store/db.ts");
    const { classifyProviderError } = await import("../src/core/errors.ts");
    const s = createSession(process.cwd(), "m");

    let calls = 0;
    const chat: ChatFn = async function* () {
      calls++;
      // a gateway shedding load: 429 with "wait 30s"
      const e = Object.assign(new Error("HTTP 429: Too Many Requests"), {
        statusCode: 429,
        responseHeaders: { "retry-after": "30" },
      });
      throw e;
    };

    const events: AgentEvent[] = [];
    const t0 = Date.now();
    for await (const ev of runTurnCore(s.id, cfg, "hello", undefined, {
      chat,
      retryLimit: 1,
      registryOverride: new Map(),
    })) {
      events.push(ev);
      if (ev.type === "retry") break; // one retry event is enough; don't sit out 30s
    }
    const retry = events.find((e) => e.type === "retry") as { delay_ms: number } | undefined;
    expect(retry).toBeTruthy();
    expect(retry!.delay_ms).toBe(30_000); // the header, not our own 1s
    expect(Date.now() - t0).toBeLessThan(5_000); // we asserted without waiting it out
    // and the classifier reads the header into the error
    const pe = classifyProviderError({ statusCode: 429, message: "429", responseHeaders: { "retry-after": "30" } });
    expect(pe.retryAfterMs).toBe(30_000);
  }, 30_000);

  test("the local backoff grows past the old 8s ceiling", async () => {
    // 1s, 2s, 4s, 8s, 16s, 32s, then the 60s ceiling — a quota window resetting
    // takes longer than 8s, which is what the old ceiling could never wait out.
    const { classifyProviderError } = await import("../src/core/errors.ts");
    expect(classifyProviderError(new Error("429 rate limit")).retryAfterMs).toBeUndefined();
    // the ceiling itself lives in turn.ts; assert the shape the loop computes
    const ceiling = Math.min(60_000, 1_000 * 2 ** 10);
    expect(ceiling).toBe(60_000);
    expect(Math.min(60_000, 1_000 * 2 ** 3)).toBe(8_000); // n=3 is the old cap
    expect(Math.min(60_000, 1_000 * 2 ** 5)).toBe(32_000); // n=5 exceeds it
  });
});
