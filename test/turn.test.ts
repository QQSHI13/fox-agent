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

  test("usage events are recorded per assistant node", async () => {
    const t = await setup();
    const s = t.createSession("/w", "m1");
    const mock = mockChat([[...textDone("x"), { type: "usage", prompt_tokens: 10, completion_tokens: 5 }] as Script]);
    await collect(t.runTurnCore(s.id, cfg(), "q", undefined, { chat: mock.fn as any, quiet: true }));
    const u = t.sessionUsage(s.id);
    expect(u.prompt).toBe(10);
    expect(u.completion).toBe(5);
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
