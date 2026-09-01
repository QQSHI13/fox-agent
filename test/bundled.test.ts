// Bundled plugins (pty/todo/fetch as FoxPlugins) and the newer hook points:
// beforeTool's veto/args patch, onTurnStart/onTurnEnd, and disabledPlugins
// applied to bundled names.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ChatFn, ProviderConfig } from "../src/providers/types.ts";
import type { AgentEvent } from "../src/core/events.ts";
import type { TurnOptions } from "../src/loop/turn.ts";
import type { FoxPlugin } from "../src/plugins/types.ts";

let home: string;
let work: string;

beforeEach(async () => {
  home = mkdtempSync(join(tmpdir(), "fox-bundled-"));
  work = join(home, "work");
  mkdirSync(work, { recursive: true });
  process.env.FOX_AGENT_HOME = home;
  (await import("../src/plugins/load.ts")).resetPlugins();
});

afterEach(async () => {
  (await import("../src/store/db.ts")).closeAll();
  rmSync(home, { recursive: true, force: true });
});

async function cfg() {
  const { loadConfig } = await import("../src/core/config.ts");
  const c = loadConfig({ cwd: work, model: "test-model", apiKey: "sk-test" }, {});
  c.diagnostics = false;
  return c;
}

function provider(): ProviderConfig {
  return { baseUrl: "http://127.0.0.1:1", apiKey: "sk-test", model: "test-model", provider: "openai-compatible", requestTimeoutMs: 0 };
}

function scripted(steps: ({ text: string } | { tool: string; args?: unknown })[]): ChatFn {
  let n = 0;
  return async function* () {
    const step = steps[Math.min(n, steps.length - 1)];
    n++;
    if ("tool" in step) {
      yield { type: "tool_call", call: { id: `call_${n}`, name: step.tool, arguments: JSON.stringify(step.args ?? {}) } };
      yield { type: "done", reason: "tool_calls" };
    } else {
      yield { type: "text", delta: step.text };
      yield { type: "done", reason: "stop" };
    }
  };
}

async function runTurn(prompt: string, opts: TurnOptions): Promise<AgentEvent[]> {
  const { runTurnCore } = await import("../src/loop/turn.ts");
  const { createSession } = await import("../src/store/db.ts");
  const sessionId = createSession(work, "test-model").id;
  const events: AgentEvent[] = [];
  for await (const ev of runTurnCore(sessionId, provider(), prompt, undefined, opts)) events.push(ev);
  return events;
}

describe("bundled plugins", () => {
  test("pty/todo/fetch come from bundled plugins in a default registry build", async () => {
    const { buildRegistry } = await import("../src/tools/index.ts");
    const { tools, plugins } = await buildRegistry(await cfg());
    for (const t of ["pty", "todowrite", "fetch"]) expect(tools.has(t)).toBe(true);
    expect(plugins.map((p) => p.name)).toContain("bundled:pty");
  });

  test("disabledPlugins = [\"pty\"] removes the tool without touching the rest", async () => {
    const { buildRegistry } = await import("../src/tools/index.ts");
    const c = await cfg();
    c.disabledPlugins = ["pty"];
    const { tools, plugins } = await buildRegistry(c);
    expect(tools.has("pty")).toBe(false);
    expect(tools.has("todowrite")).toBe(true);
    expect(plugins.map((p) => p.name)).not.toContain("bundled:pty");
  });

  test("the bundled pty plugin releases its tmux session from onSessionEnd", async () => {
    const { bundledPlugins } = await import("../src/plugins/bundled.ts");
    const pty = bundledPlugins().find((p) => p.name === "bundled:pty")!;
    expect(typeof pty.hooks?.onSessionEnd).toBe("function");
    // no tmux session by this name exists — the hook must swallow that, not throw
    await pty.hooks!.onSessionEnd!({ sessionId: "nosuchsession123", reason: "exit" });
  });
});

describe("beforeTool", () => {
  test("a patch output vetoes the run — tool never executes, transcript still pairs", async () => {
    const guard: FoxPlugin = {
      name: "guard",
      hooks: {
        beforeTool: (c) => (c.name === "exec" ? { output: "blocked by guard" } : undefined),
      },
    };
    const events = await runTurn("go", { chat: scripted([{ tool: "exec", args: { cmd: "echo hi" } }, { text: "done" }]), pluginsOverride: [guard] });
    const end = events.find((e) => e.type === "tool_end") as Extract<AgentEvent, { type: "tool_end" }>;
    expect(end.output).toBe("blocked by guard");
    expect(end.ok).toBe(true);
  }, 30_000);

  test("an args patch rewrites what the tool runs with", async () => {
    const rewriter: FoxPlugin = {
      name: "rewriter",
      hooks: {
        beforeTool: (c) => (c.name === "exec" ? { args: { cmd: "echo rewritten" } } : undefined),
      },
    };
    const events = await runTurn("go", { chat: scripted([{ tool: "exec", args: { cmd: "echo original" } }, { text: "done" }]), pluginsOverride: [rewriter] });
    const end = events.find((e) => e.type === "tool_end") as Extract<AgentEvent, { type: "tool_end" }>;
    expect(end.output).toContain("rewritten");
    expect(end.output).not.toContain("original");
  }, 30_000);
});

describe("onTurnStart / onTurnEnd", () => {
  test("both fire exactly once per turn, with the reason", async () => {
    const log: string[] = [];
    const probe: FoxPlugin = {
      name: "probe",
      hooks: {
        onTurnStart: (c) => void log.push(`start ${c.userText}`),
        onTurnEnd: (c) => void log.push(`end ${c.reason} steps=${c.steps}`),
      },
    };
    await runTurn("hello", { chat: scripted([{ text: "hi" }]), pluginsOverride: [probe] });
    expect(log).toEqual(["start hello", "end stop steps=1"]);
  }, 30_000);
});
