import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "fox-turn-"));
  process.env.FOX_AGENT_HOME = dir;
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

// ---- mock provider plumbing ----

type Script = import("../src/providers/types.ts").StreamEvent[];
function mockChat(scripts: Script[] | ((n: number) => Script)) {
  const calls: { messages: unknown; tools: unknown }[] = [];
  let n = 0;
  const fn = async function* (_cfg: any, messages: any, tools: any): AsyncGenerator<import("../src/providers/types.ts").StreamEvent> {
    calls.push({ messages: structuredClone(messages), tools: structuredClone(tools) });
    const script = typeof scripts === "function" ? scripts(n) : scripts[n];
    if (!script) throw new Error("mock exhausted");
    n++;
    for (const ev of script) {
      if (typeof ev === "symbol") throw ev;
      yield ev;
    }
  };
  return { fn, calls, count: () => n };
}
const ABORT = Symbol("abort");

const textDone = (t: string): Script => [
  { type: "text", delta: t },
  { type: "done", reason: "stop" },
];

async function collect(gen: AsyncGenerator<import("../src/core/events.ts").AgentEvent>) {
  const events: import("../src/core/events.ts").AgentEvent[] = [];
  for await (const ev of gen) events.push(ev);
  return events;
}

async function setup() {
  const db = await import("../src/store/db.ts");
  const turn = await import("../src/loop/turn.ts");
  return { ...db, runTurnCore: turn.runTurnCore };
}

describe("turn manager", () => {
  test("plain text turn persists user+assistant and stops", async () => {
    const t = await setup();
    const s = t.createSession("/w", "m1");
    const mock = mockChat([textDone("hello there")]);
    const events = await collect(
      t.runTurnCore(s.id, cfg(), "hi fox", undefined, { chat: mock.fn as any, quiet: true }),
    );
    expect(events.at(-1)?.type).toBe("done");
    expect((events.at(-1) as any).reason).toBe("stop");
    const msgs = t.allMessages(s.id);
    expect(msgs.map((m: any) => m.role)).toEqual(["user", "assistant"]);
    expect(msgs[1].content).toBe("hello there");
  });

  test("tool call round-trip executes and feeds result to next step", async () => {
    const t = await setup();
    const s = t.createSession("/w", "m1");
    const registry = new Map([
      echoTool(),
    ]);
    const script: Script[] = [
      [{ type: "tool_call", call: { id: "t1", name: "echo", arguments: '{"say":"yo"}' } }, { type: "done", reason: "tool_calls" }],
      textDone("the tool said yo"),
    ];
    const mock = mockChat(script);
    const events = await collect(
      t.runTurnCore(s.id, cfg(), "use the tool", undefined, { chat: mock.fn as any, registryOverride: registry, quiet: true }),
    );
    expect(events.filter((e) => e.type === "tool_end")).toHaveLength(1);
    // second request must include the tool result message
    const secondCall: any = mock.calls[1].messages;
    expect(secondCall.some((m: any) => m.role === "tool" && m.content.includes("yo"))).toBe(true);
  });

  test("malformed JSON args produce an error result, not silent {}", async () => {
    const t = await setup();
    const s = t.createSession("/w", "m1");
    const registry = new Map([echoTool()]);
    const mock = mockChat([
      [{ type: "tool_call", call: { id: "t1", name: "echo", arguments: "{broken json" } }, { type: "done", reason: "tool_calls" }],
      textDone("recovered"),
    ]);
    const events = await collect(
      t.runTurnCore(s.id, cfg(), "go", undefined, { chat: mock.fn as any, registryOverride: registry, quiet: true }),
    );
    const te = events.find((e): e is Extract<typeof e, { type: "tool_end" }> => e.type === "tool_end")!;
    expect(te.ok).toBe(false);
    expect(te.output).toMatch(/invalid JSON/);
  });

  test("missing required args are rejected before running the tool", async () => {
    const t = await setup();
    const s = t.createSession("/w", "m1");
    let ran = false;
    const registry = new Map([
      [
        "strict",
        {
          def: {
            name: "strict",
            description: "",
            parameters: { type: "object", properties: { x: { type: "string" } }, required: ["x"] },
          },
          run: async () => {
            ran = true;
            return "ran";
          },
        },
      ] as any,
    ]);
    const mock = mockChat([
      [{ type: "tool_call", call: { id: "t1", name: "strict", arguments: "{}" } }, { type: "done", reason: "tool_calls" }],
      textDone("ok"),
    ]);
    await collect(t.runTurnCore(s.id, cfg(), "go", undefined, { chat: mock.fn as any, registryOverride: registry as any, quiet: true }));
    expect(ran).toBe(false);
  });

  test("step cap stops runaway loops", async () => {
    const t = await setup();
    const s = t.createSession("/w", "m1");
    const registry = new Map([echoTool()]);
    const mock = mockChat(() => [
      { type: "tool_call", call: { id: `t${Math.random()}`, name: "echo", arguments: "{}" } },
      { type: "done", reason: "tool_calls" },
    ]);
    const events = await collect(
      t.runTurnCore(s.id, cfg(), "loop forever", undefined, { chat: mock.fn as any, registryOverride: registry, maxSteps: 3, quiet: true }),
    );
    expect((events.at(-1) as any).reason).toBe("max_steps");
    expect(mock.count()).toBeLessThanOrEqual(4); // 3 steps + final check
  });

  test("retriable provider error retries and succeeds pre-output", async () => {
    const t = await setup();
    const s = t.createSession("/w", "m1");
    let attempts = 0;
    const flaky = async function* (): AsyncGenerator<any> {
      attempts++;
      if (attempts === 1) throw Object.assign(new Error("rate limited"), { statusCode: 429 });
      for (const ev of textDone("finally")) yield ev;
    };
    const events = await collect(t.runTurnCore(s.id, cfg(), "hi", undefined, { chat: flaky as any, retryLimit: 3, quiet: false }));
    expect(attempts).toBe(2);
    expect(events.some((e) => e.type === "retry")).toBe(true);
    expect(events.some((e) => e.type === "text" && (e as any).delta === "finally")).toBe(true);
  });

  test("non-retriable provider error ends turn with error reason", async () => {
    const t = await setup();
    const s = t.createSession("/w", "m1");
    const badKey = async function* (): AsyncGenerator<any> {
      throw Object.assign(new Error("invalid api key"), { statusCode: 401 });
    };
    const events = await collect(t.runTurnCore(s.id, cfg(), "hi", undefined, { chat: badKey as any, quiet: true }));
    const done = events.at(-1) as any;
    expect(done.reason).toContain("error");
  });

  test("mid-stream abort persists partial text and finishes aborted", async () => {
    const t = await setup();
    const s = t.createSession("/w", "m1");
    const ac = new AbortController();
    const partial = async function* (): AsyncGenerator<any> {
      yield { type: "text", delta: "partial answ" };
      ac.abort();
      const e = new Error("aborted");
      e.name = "AbortError";
      throw e;
    };
    const events = await collect(t.runTurnCore(s.id, cfg(), "hi", ac.signal, { chat: partial as any, quiet: true }));
    expect((events.at(-1) as any).reason).toBe("aborted");
    const msgs = t.allMessages(s.id);
    expect(msgs.some((m: any) => m.role === "assistant" && m.content === "partial answ")).toBe(true);
  });

  test("a steer parked mid-call persists as a user message when the turn is interrupted", async () => {
    const t = await setup();
    const s = t.createSession("/w", "m1");
    const ac = new AbortController();
    const { steer } = await import("../src/loop/steer.ts");
    const slow = async function* (): AsyncGenerator<any> {
      steer(s.id, "wait, also do this");
      ac.abort();
      const e = new Error("aborted");
      e.name = "AbortError";
      throw e;
    };
    const events = await collect(t.runTurnCore(s.id, cfg(), "hi", ac.signal, { chat: slow as any, quiet: true }));
    expect((events.at(-1) as any).reason).toBe("aborted");
    // the parked steer must NOT vanish — it persists as a user node so the next
    // turn answers it, instead of being dropped by the abort exit path
    const msgs = t.allMessages(s.id);
    expect(msgs.some((m: any) => m.role === "user" && m.content === "wait, also do this")).toBe(true);
    const { peekSteer } = await import("../src/loop/steer.ts");
    expect(peekSteer(s.id)).toHaveLength(0); // drained, not leaked
  });

  test("parallel tool failures are isolated — one throwing tool does not kill siblings", async () => {
    const t = await setup();
    const s = t.createSession("/w", "m1");
    const boom = {
      def: { name: "boom", description: "", parameters: { type: "object" } },
      run: async () => {
        throw new Error("exploded");
      },
    } as any;
    const registry = new Map([["boom", boom], echoTool()]);
    const mock = mockChat([
      [
        { type: "tool_call", call: { id: "a", name: "boom", arguments: "{}" } },
        { type: "tool_call", call: { id: "b", name: "echo", arguments: '{"say":"alive"}' } },
        { type: "done", reason: "tool_calls" },
      ],
      textDone("handled"),
    ]);
    const events = await collect(
      t.runTurnCore(s.id, cfg(), "go", undefined, { chat: mock.fn as any, registryOverride: registry, quiet: true }),
    );
    const ends = events.filter((e): e is Extract<typeof e, { type: "tool_end" }> => e.type === "tool_end");
    expect(ends.map((e) => e.ok).sort()).toEqual([false, true]);
    expect(ends.find((e) => e.name === "echo")!.output).toContain("alive");
    expect(ends.find((e) => e.name === "boom")!.output).toContain("exploded");
  });

  test("unknown tool gets an error result the model can recover from", async () => {
    const t = await setup();
    const s = t.createSession("/w", "m1");
    const mock = mockChat([
      [{ type: "tool_call", call: { id: "x", name: "nonexistent", arguments: "{}" } }, { type: "done", reason: "tool_calls" }],
      textDone("sorry"),
    ]);
    const events = await collect(
      t.runTurnCore(s.id, cfg(), "go", undefined, { chat: mock.fn as any, registryOverride: new Map(), quiet: true }),
    );
    const te = events.find((e): e is Extract<typeof e, { type: "tool_end" }> => e.type === "tool_end")!;
    expect(te.ok).toBe(false);
    expect(te.output).toContain("unknown tool");
  });

  test("tool_start and tool_end carry the same full args (streaming/settled parity)", async () => {
    const t = await setup();
    const s = t.createSession("/w", "m1");
    const registry = new Map([echoTool()]);
    // 500 chars: the old 200-char event cap would have truncated this mid-JSON
    const args = JSON.stringify({ say: "yo".repeat(250) });
    const mock = mockChat([
      [{ type: "tool_call", call: { id: "t1", name: "echo", arguments: args } }, { type: "done", reason: "tool_calls" }],
      textDone("done"),
    ]);
    const events = await collect(
      t.runTurnCore(s.id, cfg(), "go", undefined, { chat: mock.fn as any, registryOverride: registry, quiet: true }),
    );
    const start = events.find((e): e is Extract<typeof e, { type: "tool_start" }> => e.type === "tool_start")!;
    const end = events.find((e): e is Extract<typeof e, { type: "tool_end" }> => e.type === "tool_end")!;
    expect(start.args).toBe(args);
    expect(end.args).toBe(args);
  });

  test("usage events are recorded per assistant node", async () => {
    const t = await setup();
    const s = t.createSession("/w", "m1");
    const mock = mockChat([[...textDone("x"), { type: "usage", prompt_tokens: 10, completion_tokens: 5 }] as Script]);
    await collect(t.runTurnCore(s.id, cfg(), "q", undefined, { chat: mock.fn as any, quiet: true }));
    const u = t.sessionUsage(s.id);
    expect(u.prompt).toBe(10);
    expect(u.completion).toBe(5);
    expect(u.cached).toBe(0); // the event said nothing about caches — not a hole
  });

  test("cached input rides the usage event through to storage", async () => {
    const t = await setup();
    const s = t.createSession("/w", "m1");
    const mock = mockChat([[...textDone("x"), { type: "usage", prompt_tokens: 100, completion_tokens: 5, cached_tokens: 70 }] as Script]);
    const events = await collect(t.runTurnCore(s.id, cfg(), "q", undefined, { chat: mock.fn as any }));
    expect(events.find((e) => e.type === "usage")).toMatchObject({ prompt_tokens: 100, cached_tokens: 70 });
    expect(t.sessionUsage(s.id)).toEqual({ prompt: 100, completion: 5, cached: 70 });
    // both stores must carry it: /usage reads the index row, the status bar too
    expect(t.getSession(s.id)!.cached_tokens).toBe(70);
  });
});

// ---- helpers ----

const cfg = () => ({ baseUrl: "http://localhost:9", apiKey: "test", model: "test-model" });

describe("ui bridge", () => {
  test("a tool can ask the host a question mid-run via ctx.ui", async () => {
    const t = await setup();
    const s = t.createSession("/w", "m1");
    const asker: [string, any] = [
      "ask",
      {
        def: { name: "ask", description: "ask the user", parameters: { type: "object", properties: {} } },
        run: async (_args: any, ctx: any) => {
          if (!ctx.ui) return "no ui";
          const v = await ctx.ui.select("pick one", [{ value: "a" }, { value: "b", label: "B" }]);
          return `picked: ${v}`;
        },
      },
    ];
    const registry = new Map([asker]);
    const mock = mockChat([
      [{ type: "tool_call", call: { id: "t1", name: "ask", arguments: "{}" } }, { type: "done", reason: "tool_calls" }],
      textDone("done"),
    ]);
    const events = await collect(
      t.runTurnCore(s.id, cfg(), "go", undefined, {
        chat: mock.fn as any,
        registryOverride: registry,
        quiet: true,
        ui: { select: async () => "b", input: async () => "x", wizard: async () => ({}) },
      }),
    );
    const te = events.find((e): e is Extract<typeof e, { type: "tool_end" }> => e.type === "tool_end")!;
    expect(te.output).toBe("picked: b");
  });

  test("ctx.ui is absent when the host provides none", async () => {
    const t = await setup();
    const s = t.createSession("/w", "m1");
    const asker: [string, any] = [
      "ask",
      {
        def: { name: "ask", description: "ask the user", parameters: { type: "object", properties: {} } },
        run: async (_args: any, ctx: any) => (ctx.ui ? "has ui" : "no ui"),
      },
    ];
    const mock = mockChat([
      [{ type: "tool_call", call: { id: "t1", name: "ask", arguments: "{}" } }, { type: "done", reason: "tool_calls" }],
      textDone("done"),
    ]);
    const events = await collect(
      t.runTurnCore(s.id, cfg(), "go", undefined, { chat: mock.fn as any, registryOverride: new Map([asker]), quiet: true }),
    );
    expect(events.find((e) => e.type === "tool_end")!.output).toBe("no ui");
  });
});

function echoTool(): [string, any] {
  return [
    "echo",
    {
      def: { name: "echo", description: "echo back", parameters: { type: "object", properties: { say: { type: "string" } }, required: ["say"] } },
      run: async (args: any) => `echo: ${args.say}`,
    },
  ];
}

describe("steering", () => {
  test("steered text lands as a user message at the next step boundary", async () => {
    const t = await setup();
    const s = t.createSession("/w", "m1");
    const { steer } = await import("../src/loop/steer.ts");
    // queued before the first step: delivered at the top of the turn
    steer(s.id, "also do this");
    const mock = mockChat([textDone("ok")]);
    const events = await collect(t.runTurnCore(s.id, cfg(), "hi", undefined, { chat: mock.fn as any }));
    expect(events.some((e) => e.type === "steered")).toBe(true);
    const msgs = t.allMessages(s.id);
    expect(msgs.map((m: any) => m.role)).toEqual(["user", "user", "assistant"]);
    expect(msgs[1].content).toBe("also do this");
    // and the model saw it in this turn's request
    const sent = JSON.stringify(mock.calls[0].messages);
    expect(sent).toContain("also do this");
  });

  test("peek shows undelivered steers oldest-first without consuming them", async () => {
    const t = await setup();
    const s = t.createSession("/w", "m1");
    const { steer, peekSteer, drainSteer } = await import("../src/loop/steer.ts");
    expect(peekSteer(s.id)).toEqual([]);
    steer(s.id, "first");
    steer(s.id, "second");
    expect(peekSteer(s.id)).toEqual(["first", "second"]);
    // peeking consumes nothing — the turn still drains both in order
    expect(drainSteer(s.id)).toEqual(["first", "second"]);
    expect(peekSteer(s.id)).toEqual([]);
  });

  test("withdraw pops the back of the queue so it can go back to the editor", async () => {
    const t = await setup();
    const s = t.createSession("/w", "m1");
    const { steer, peekSteer, withdrawSteer, drainSteer } = await import("../src/loop/steer.ts");
    steer(s.id, "first");
    steer(s.id, "second");
    expect(withdrawSteer(s.id)).toBe("second");
    expect(peekSteer(s.id)).toEqual(["first"]);
    // the remainder still delivers normally
    expect(drainSteer(s.id)).toEqual(["first"]);
    // empty, and drained-away queues both withdraw to undefined
    expect(withdrawSteer(s.id)).toBeUndefined();
    steer(s.id, "gone");
    drainSteer(s.id);
    expect(withdrawSteer(s.id)).toBeUndefined();
  });

  test("a steer parked in the final call under a step cap persists instead of stranding", async () => {
    const t = await setup();
    const s = t.createSession("/w", "m1");
    const { steer, peekSteer } = await import("../src/loop/steer.ts");
    // The steer lands while the only permitted step's provider call is in
    // flight, so the top-of-loop drain cannot reach it and the cap refuses the
    // extra step that would have. It used to be dropped on the floor entirely —
    // left in the queue under a turn that had already ended.
    const chat = async function* (): AsyncGenerator<any> {
      steer(s.id, "also do this");
      yield { type: "text", delta: "only" };
      yield { type: "done", reason: "stop" };
    };
    await collect(t.runTurnCore(s.id, cfg(), "hi", undefined, { chat: chat as any, maxSteps: 1 }));
    expect(peekSteer(s.id)).toEqual([]); // drained, not stranded
    const msgs = t.allMessages(s.id);
    expect(msgs.map((m: any) => m.role)).toEqual(["user", "assistant", "user"]);
    expect(msgs[2].content).toBe("also do this"); // answered next turn
  });

  test("no parked steer leaves a spurious extra user node", async () => {
    const t = await setup();
    const s = t.createSession("/w", "m1");
    const mock = mockChat([textDone("done")]);
    await collect(t.runTurnCore(s.id, cfg(), "hi", undefined, { chat: mock.fn as any, quiet: true }));
    // the unconditional persist must be a no-op when the queue is empty
    expect(t.allMessages(s.id).map((m: any) => m.role)).toEqual(["user", "assistant"]);
  });

  test("a steer parked in the LAST tool call is persisted when the step cap ends the turn", async () => {
    const t = await setup();
    const s = t.createSession("/w", "m1");
    const { steer, peekSteer } = await import("../src/loop/steer.ts");
    // The steering block drains only when there IS a next step. Here the tool in
    // the only permitted step parks a steer and the cap then ends the turn, so
    // the message used to be stranded in the queue forever — the TUI kept
    // rendering "steering 1/1" under a finished turn and some later turn
    // answered it, or nobody did. A sibling fix covers the provider-call path;
    // this is the tool-call path.
    const registry = new Map<string, any>([
      [
        "steerer",
        {
          def: { name: "steerer", description: "parks a steer mid-call", parameters: { type: "object", properties: {} } },
          run: async () => {
            steer(s.id, "IMPORTANT-STUFF");
            return "ok";
          },
        },
      ],
    ]);
    const mock = mockChat([
      [{ type: "tool_call", call: { id: "c1", name: "steerer", arguments: "{}" } }, { type: "done", reason: "tool_calls" }],
    ]);
    const events = await collect(
      t.runTurnCore(s.id, cfg(), "hi", undefined, { chat: mock.fn as any, registryOverride: registry, maxSteps: 1, quiet: true }),
    );
    expect((events.at(-1) as any).reason).toBe("max_steps");
    expect(peekSteer(s.id)).toEqual([]); // drained, not stranded
    const msgs = t.allMessages(s.id);
    expect(msgs.some((m: any) => m.content === "IMPORTANT-STUFF")).toBe(true);
    // the cap notice comes last, and the steer precedes it
    expect(msgs[msgs.length - 1].content).toContain("step limit");
  });
});

describe("interrupt", () => {
  /** A tool that never checks ctx.signal — an LSP cold start, a wizard, a plugin. */
  const stubborn = (ms = 3000): any => ({
    def: { name: "stubborn", description: "ignores the abort signal", parameters: { type: "object", properties: {} } },
    run: async () => {
      await new Promise<void>((r) => setTimeout(r, ms));
      return "stubborn done";
    },
  });

  test("esc ends the turn even when a running tool ignores ctx.signal", async () => {
    const t = await setup();
    const s = t.createSession("/w", "m1");
    const ac = new AbortController();
    const registry = new Map<string, any>([["stubborn", stubborn()]]);
    const mock = mockChat([
      [{ type: "tool_call", call: { id: "c1", name: "stubborn", arguments: "{}" } }, { type: "done", reason: "tool_calls" }],
    ]);
    // The user hits esc ~150ms in, while the tool is mid-flight.
    const timer = setTimeout(() => ac.abort(), 150);
    const t0 = Date.now();
    const events = await collect(
      t.runTurnCore(s.id, cfg(), "hi", ac.signal, { chat: mock.fn as any, registryOverride: registry, quiet: true }),
    );
    clearTimeout(timer);
    const elapsed = Date.now() - t0;
    // The bug: the loop awaited the tool batch, so a 3s tool pinned the turn to
    // its full runtime and ESC looked broken — the call stayed in flight and
    // nothing was appended.
    expect(elapsed).toBeLessThan(1000);
    expect((events.at(-1) as any).reason).toBe("aborted");
    // and nothing from the abandoned tool was written into the transcript
    expect(t.allMessages(s.id).some((m: any) => m.role === "tool")).toBe(false);
  }, 5000);

  test("an already-aborted signal ends the turn without waiting for the batch", async () => {
    const t = await setup();
    const s = t.createSession("/w", "m1");
    const ac = new AbortController();
    ac.abort();
    const registry = new Map<string, any>([["stubborn", stubborn(3000)]]);
    const mock = mockChat([[{ type: "tool_call", call: { id: "c1", name: "stubborn", arguments: "{}" } }, { type: "done", reason: "tool_calls" }]]);
    const t0 = Date.now();
    const events = await collect(
      t.runTurnCore(s.id, cfg(), "hi", ac.signal, { chat: mock.fn as any, registryOverride: registry, quiet: true }),
    );
    expect(Date.now() - t0).toBeLessThan(1000);
    expect((events.at(-1) as any).reason).toBe("aborted");
  }, 5000);
});

describe("request identity", () => {
  test("provider requests carry fox-agent UA and a stable session header", async () => {
    const t = await setup();
    const s = t.createSession("/w", "m1");
    let seen: any;
    const chat = async function* (c: any): AsyncGenerator<import("../src/providers/types.ts").StreamEvent> {
      seen = c;
      yield { type: "text", delta: "hi" };
      yield { type: "done", reason: "stop" };
    };
    await collect(t.runTurnCore(s.id, cfg(), "hi", undefined, { chat: chat as any, quiet: true }));
    expect(seen.headers["user-agent"]).toMatch(/^fox-agent\//);
    expect(seen.headers["x-opencode-session"]).toBe(s.id);
  });
});

describe("tool argument validation", () => {
  const unknownArgTool = (): any => ({
    def: { name: "echo", description: "echo back", parameters: { type: "object", properties: { say: { type: "string" } }, required: ["say"] } },
    run: async (args: any) => `echo: ${args.say}`,
  });

  /** Stored content of one tool result, keyed by call id — fails loudly if absent. */
  function toolOut(t: any, s: any, callId: string): string {
    const m = t.allMessages(s.id).find((x: any) => x.role === "tool" && x.tool_call_id === callId);
    if (!m) throw new Error(`no tool result for ${callId}`);
    return m.content;
  }

  test("an unknown argument is refused instead of silently dropped", async () => {
    const t = await setup();
    const s = t.createSession("/w", "m1");
    const registry = new Map<string, any>([["echo", unknownArgTool()]]);
    const mock = mockChat([
      [{ type: "tool_call", call: { id: "c1", name: "echo", arguments: '{"say":"x","signal":"kill"}' } }, { type: "done", reason: "tool_calls" }],
      textDone("ok"),
    ]);
    await collect(t.runTurnCore(s.id, cfg(), "hi", undefined, { chat: mock.fn as any, registryOverride: registry, quiet: true }));
    const out = toolOut(t, s, "c1");
    // the tell-tale typo: a field copied from `exec`, which does take `signal`
    expect(out).toContain('unknown argument "signal"');
    expect(out).toContain("say"); // and says what IS accepted
  });

  test("a missing required argument is still refused", async () => {
    const t = await setup();
    const s = t.createSession("/w", "m1");
    const registry = new Map<string, any>([["echo", unknownArgTool()]]);
    const mock = mockChat([
      [{ type: "tool_call", call: { id: "c1", name: "echo", arguments: "{}" } }, { type: "done", reason: "tool_calls" }],
      textDone("ok"),
    ]);
    await collect(t.runTurnCore(s.id, cfg(), "hi", undefined, { chat: mock.fn as any, registryOverride: registry, quiet: true }));
    expect(toolOut(t, s, "c1")).toContain('missing required argument "say"');
  });

  test("declared arguments still run, and a no-arg tool takes none", async () => {
    const t = await setup();
    const s = t.createSession("/w", "m1");
    const bare: any = { def: { name: "ping", description: "", parameters: { type: "object" } }, run: async () => "pong" };
    const registry = new Map<string, any>([["echo", unknownArgTool()], ["ping", bare]]);
    const mock = mockChat([
      [
        { type: "tool_call", call: { id: "c1", name: "echo", arguments: '{"say":"x"}' } },
        { type: "tool_call", call: { id: "c2", name: "ping", arguments: "{}" } },
        { type: "tool_call", call: { id: "c3", name: "ping", arguments: '{"loud":true}' } },
        { type: "done", reason: "tool_calls" },
      ],
      textDone("ok"),
    ]);
    await collect(t.runTurnCore(s.id, cfg(), "hi", undefined, { chat: mock.fn as any, registryOverride: registry, quiet: true }));
    // keyed by tool_call_id, not by order: the calls run in parallel, so a
    // result is appended when its tool finishes, not when it was called
    expect(toolOut(t, s, "c1")).toBe("echo: x");
    expect(toolOut(t, s, "c2")).toBe("pong");
    expect(toolOut(t, s, "c3")).toContain("takes no arguments");
  });

  test("a schema that opts into additionalProperties still accepts extras", async () => {
    const t = await setup();
    const s = t.createSession("/w", "m1");
    const open: any = {
      def: { name: "open", description: "", parameters: { type: "object", properties: { base: { type: "string" } }, additionalProperties: true } },
      run: async (args: any) => `got ${JSON.stringify(args)}`,
    };
    const registry = new Map<string, any>([["open", open]]);
    const mock = mockChat([
      [{ type: "tool_call", call: { id: "c1", name: "open", arguments: '{"base":"b","whatever":1}' } }, { type: "done", reason: "tool_calls" }],
      textDone("ok"),
    ]);
    await collect(t.runTurnCore(s.id, cfg(), "hi", undefined, { chat: mock.fn as any, registryOverride: registry, quiet: true }));
    expect(toolOut(t, s, "c1")).toBe('got {"base":"b","whatever":1}');
  });
});

describe("prompt cache prefix", () => {
  test("the system message does not move and the runtime tail rides last", async () => {
    const t = await setup();
    const s = t.createSession("/w", "m1");
    const registry = new Map([echoTool()]);
    const mock = mockChat([
      [{ type: "tool_call", call: { id: "t1", name: "echo", arguments: '{"say":"yo"}' } }, { type: "done", reason: "tool_calls" }],
      textDone("done"),
    ]);
    await collect(
      t.runTurnCore(s.id, cfg(), "use the tool", undefined, { chat: mock.fn as any, registryOverride: registry, quiet: true }),
    );
    expect(mock.count()).toBe(2);
    const first = mock.calls[0].messages as any[];
    const second = mock.calls[1].messages as any[];

    // position 0, byte-identical between steps
    expect(first[0].role).toBe("system");
    expect(second[0]).toEqual(first[0]);
    expect(first[0].content).not.toContain("<runtime>");
    expect(first[0].content).not.toContain("ctx:");

    // everything step 1 sent ahead of its tail is still at the head of step 2,
    // unchanged — that shared run is what a provider prefix cache hits on, and
    // a volatile byte anywhere inside it would have missed the whole thing
    expect(second.slice(0, first.length - 1)).toEqual(first.slice(0, -1));

    // the tail is last, and it is the runtime header
    expect(first.at(-1)).toEqual({
      role: "user",
      content: expect.stringContaining("<runtime>"),
    });
    expect(second.at(-1)).toEqual({
      role: "user",
      content: expect.stringContaining("<runtime>"),
    });

    // ephemeral: it is rebuilt per request and never written to storage, so it
    // cannot become a stale middle-of-history message later
    const stored = t.allMessages(s.id);
    expect(stored.some((m: any) => typeof m.content === "string" && m.content.includes("<runtime>"))).toBe(false);
  });
});
