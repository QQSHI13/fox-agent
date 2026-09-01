// The Plugin API: loader, global-only config rule, tool merging, and the three
// hook points.
//
// Split by what each part can actually prove:
//   - the loader and the config rule are unit-testable against real files on disk
//   - the hooks need a real turn, so those tests drive `runTurnCore` with a
//     scripted ChatFn — the same seam every other loop test uses
//   - `afterTool`'s placement is checked against the *database*, not the event
//     stream, because the whole point of running it before `appendMessage` is that
//     the stored copy is the patched one
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentEvent } from "../src/core/events.ts";
import type { ChatFn, ProviderConfig } from "../src/providers/types.ts";
import type { TurnOptions } from "../src/loop/turn.ts";
import { APPENDED_SYSTEM, AFTER_TOOL_PREFIX, PING_OUTPUT } from "./fixtures/plugin-ok.ts";

const FIX_OK = join(import.meta.dir, "fixtures", "plugin-ok.ts");
const FIX_THROWS = join(import.meta.dir, "fixtures", "plugin-throws.ts");
const FIX_INVALID = join(import.meta.dir, "fixtures", "plugin-invalid.ts");

let home: string;
let work: string;

beforeEach(async () => {
  home = mkdtempSync(join(tmpdir(), "fox-plugins-"));
  work = join(home, "work");
  mkdirSync(work, { recursive: true });
  process.env.FOX_AGENT_HOME = home;
  process.env.FOX_AGENT_PLUGIN_LOG = home;
  // the loader caches on the path list, and these tests deliberately reuse paths
  // with different expectations, so a stale cache would make them order-dependent
  (await import("../src/plugins/load.ts")).resetPlugins();
});

afterEach(async () => {
  (await import("../src/store/db.ts")).closeAll();
  delete process.env.FOX_AGENT_PLUGIN_LOG;
  rmSync(home, { recursive: true, force: true });
});

/** What the fixture's hooks recorded, one line per firing. */
function hookLog(): string[] {
  try {
    return readFileSync(join(home, "hooks.log"), "utf8").trim().split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

function provider(): ProviderConfig {
  return { baseUrl: "http://127.0.0.1:1", apiKey: "sk-test", model: "test-model", provider: "openai-compatible", requestTimeoutMs: 0 };
}

/**
 * A ChatFn that replays scripted steps. Each step is either plain text or one
 * tool call; the last step must be text or the loop would never finish.
 */
function scripted(steps: ({ text: string } | { tool: string; args?: unknown })[]): { chat: ChatFn; seen: () => number } {
  let n = 0;
  const chat: ChatFn = async function* (_cfg, messages) {
    const step = steps[Math.min(n, steps.length - 1)];
    n++;
    // captured so a test can assert on the system prompt the hook patched
    lastMessages = messages.map((m) => ({ ...m }));
    if ("tool" in step) {
      yield { type: "tool_call", call: { id: `call_${n}`, name: step.tool, arguments: JSON.stringify(step.args ?? {}) } };
      yield { type: "done", reason: "tool_calls" };
    } else {
      yield { type: "text", delta: step.text };
      yield { type: "done", reason: "stop" };
    }
  };
  return { chat, seen: () => n };
}

let lastMessages: { role: string; content: string }[] = [];

/** Run a turn, optionally in an existing session so a second turn can reuse it. */
async function runTurn(prompt: string, opts: TurnOptions & { sessionId?: string }): Promise<AgentEvent[]> {
  const { runTurnCore } = await import("../src/loop/turn.ts");
  const { createSession } = await import("../src/store/db.ts");
  const sessionId = opts.sessionId ?? createSession(work, "test-model").id;
  const events: AgentEvent[] = [];
  for await (const ev of runTurnCore(sessionId, provider(), prompt, undefined, opts)) events.push(ev);
  return events;
}

/** A config with `plugins` set, without going through a TOML file. */
async function cfgWith(plugins: string[]) {
  const { loadConfig } = await import("../src/core/config.ts");
  const cfg = loadConfig({ cwd: work, model: "test-model", apiKey: "sk-test" }, {});
  cfg.plugins = plugins;
  cfg.diagnostics = false; // no tsserver spawn for a plugin test
  return cfg;
}

describe("plugin loader", () => {
  test("loads a plugin module and exposes its tools, hooks and providers", async () => {
    const { loadPlugins } = await import("../src/plugins/load.ts");
    const { plugins, warnings } = await loadPlugins([FIX_OK]);

    expect(warnings).toEqual([]);
    expect(plugins).toHaveLength(1);
    expect(plugins[0].name).toBe("fixture");
    expect(plugins[0].tools?.[0].def.name).toBe("ping");
    expect(typeof plugins[0].hooks?.beforeLLMCall).toBe("function");
    expect(Object.keys(plugins[0].providers ?? {})).toEqual(["fixture-echo"]);
  });

  test("a plugin that throws at import becomes a warning, not a throw", async () => {
    const { loadPlugins } = await import("../src/plugins/load.ts");
    // the assertion is as much that this call *returns* as what it returns: a
    // rejected promise here would abort fox-agent before the first turn
    const { plugins, warnings } = await loadPlugins([FIX_THROWS]);
    expect(plugins).toEqual([]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("failed to load");
    expect(warnings[0]).toContain("deliberate import-time failure");
  });

  test("one broken plugin does not cost the working ones", async () => {
    const { loadPlugins } = await import("../src/plugins/load.ts");
    const { plugins, warnings } = await loadPlugins([FIX_THROWS, FIX_OK]);
    // same property mcpTools has for servers: a typo in one entry must not
    // silently disable every other plugin the user configured
    expect(plugins.map((p) => p.name)).toEqual(["fixture"]);
    expect(warnings).toHaveLength(1);
  });

  test("a module that imports cleanly but is not a plugin is rejected by shape", async () => {
    const { loadPlugins } = await import("../src/plugins/load.ts");
    const { plugins, warnings } = await loadPlugins([FIX_INVALID]);
    expect(plugins).toEqual([]);
    expect(warnings[0]).toContain("invalid");
    // names the missing field, so the author can fix it without reading fox-agent's source
    expect(warnings[0]).toContain("name");
  });

  test("a nonexistent path warns and names the path the user wrote", async () => {
    const { loadPlugins } = await import("../src/plugins/load.ts");
    const missing = join(home, "no-such-plugin.ts");
    const { plugins, warnings } = await loadPlugins([missing]);
    expect(plugins).toEqual([]);
    expect(warnings[0]).toContain(missing);
  });

  test("the same path list is cached, so module state survives across turns", async () => {
    const { loadPlugins } = await import("../src/plugins/load.ts");
    const a = await loadPlugins([FIX_OK]);
    const b = await loadPlugins([FIX_OK]);
    // the identical array, not just equal contents: a plugin holding state in
    // module scope must not be re-imported between the repeated buildRegistry
    // calls a long session makes
    expect(b.plugins).toBe(a.plugins);
    expect(b.plugins[0]).toBe(a.plugins[0]);
  });

  test("two entries resolving to the same plugin name load once, with a warning", async () => {
    const { loadPlugins } = await import("../src/plugins/load.ts");
    // same file by two spellings — a relative path and an absolute one
    const rel = `./${join("test", "fixtures", "plugin-ok.ts")}`;
    const { plugins, warnings } = await loadPlugins([FIX_OK, rel], join(import.meta.dir, ".."));
    expect(plugins).toHaveLength(1);
    expect(warnings[0]).toContain("already loaded");
  });

  test("~ in a path expands to the home directory", async () => {
    const { loadPlugins } = await import("../src/plugins/load.ts");
    // it must not resolve to a literal directory named "~", which is what a bare
    // dynamic import would do — the message proves which path was attempted
    const { warnings } = await loadPlugins(["~/definitely-not-here.ts"]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).not.toContain("/~/");
  });
});

describe("global-only plugin config", () => {
  test("a global config may name plugins", async () => {
    const { loadConfig } = await import("../src/core/config.ts");
    const globalPath = join(home, "config.toml");
    writeFileSync(globalPath, `plugins = ["${FIX_OK}"]\n`);

    const cfg = loadConfig({ cwd: work, configPath: globalPath }, { FOX_AGENT_MODEL: "test-model" });
    expect(cfg.plugins).toEqual([FIX_OK]);
    expect(cfg.warnings).toEqual([]);
  });

  test("a project fox-agent.toml naming a plugin is skipped, with a warning that says why", async () => {
    const { loadConfig } = await import("../src/core/config.ts");
    writeFileSync(join(work, "fox-agent.toml"), `plugins = ["${FIX_OK}"]\nmaxSteps = 7\n`);

    const cfg = loadConfig({ cwd: work }, { FOX_AGENT_MODEL: "test-model" });
    // the decision this whole feature rests on: a repo cannot execute code in
    // fox-agent's process, where the API key lives
    expect(cfg.plugins).toEqual([]);
    expect(cfg.warnings).toHaveLength(1);
    expect(cfg.warnings[0]).toContain("plugins");
    expect(cfg.warnings[0]).toContain("config.toml");
    // skipped, not ignored — the rest of the project file still applies, so this
    // is not a blunt "refuse the file" rule
    expect(cfg.maxSteps).toBe(7);
  });

  test("a project file with no plugins key warns about nothing", async () => {
    const { loadConfig } = await import("../src/core/config.ts");
    writeFileSync(join(work, "fox-agent.toml"), `maxSteps = 5\n`);
    const cfg = loadConfig({ cwd: work }, { FOX_AGENT_MODEL: "test-model" });
    expect(cfg.warnings).toEqual([]);
  });

  test("plugins from two loads do not accumulate", async () => {
    const { loadConfig } = await import("../src/core/config.ts");
    const globalPath = join(home, "config.toml");
    writeFileSync(globalPath, `plugins = ["${FIX_OK}"]\n`);
    const a = loadConfig({ cwd: work, configPath: globalPath }, { FOX_AGENT_MODEL: "test-model" });
    const b = loadConfig({ cwd: work, configPath: globalPath }, { FOX_AGENT_MODEL: "test-model" });
    // DEFAULTS holds one array; without re-initialization the second load would
    // see two entries. The ACP server loads config per run, so this is reachable.
    expect(a.plugins).toHaveLength(1);
    expect(b.plugins).toHaveLength(1);
    expect(b.plugins).not.toBe(a.plugins);
  });
});

describe("plugin tools in the registry", () => {
  test("a plugin tool joins the registry and the prompt roster", async () => {
    const { buildRegistry } = await import("../src/tools/index.ts");
    const { tools, warnings, plugins } = await buildRegistry(await cfgWith([FIX_OK]));

    expect(warnings).toEqual([]);
    expect(plugins.map((p) => p.name)).toEqual(["bundled:pty", "bundled:todo", "bundled:fetch", "fixture"]);
    expect(tools.has("ping")).toBe(true);
    expect(tools.has("read")).toBe(true); // built-ins unaffected

    // no prompt-side work: buildSystemPrompt derives the roster from the registry
    const { buildSystemPrompt } = await import("../src/loop/prompt.ts");
    const prompt = buildSystemPrompt({ sessionId: "s", cwd: work, model: "test-model", tools: [...tools.values()].map((t) => t.def) });
    expect(prompt).toContain("ping");
  });

  test("a plugin tool that shadows a built-in wins, and the override is reported", async () => {
    const { buildRegistry } = await import("../src/tools/index.ts");
    const { resetPlugins } = await import("../src/plugins/load.ts");
    resetPlugins();

    const shadow = join(home, "shadow.ts");
    writeFileSync(
      shadow,
      `export default { name: "shadow", tools: [{ def: { name: "read", description: "shadowed", parameters: { type: "object" } }, run: async () => ({ ok: true, output: "shadowed read" }) }] };\n`,
    );

    const { tools, warnings } = await buildRegistry(await cfgWith([shadow]));
    const res = await tools.get("read")!.run({}, {} as never);
    expect(res).toEqual({ ok: true, output: "shadowed read" });
    // deliberate shadowing is allowed; silent shadowing is not
    expect(warnings.some((w) => w.includes("overrides existing tool 'read'"))).toBe(true);
  });

  test("config warnings reach the caller through buildRegistry", async () => {
    const { loadConfig } = await import("../src/core/config.ts");
    const { buildRegistry } = await import("../src/tools/index.ts");
    writeFileSync(join(work, "fox-agent.toml"), `plugins = ["${FIX_OK}"]\n`);
    const cfg = loadConfig({ cwd: work }, { FOX_AGENT_MODEL: "test-model", FOX_AGENT_API_KEY: "k" });
    cfg.diagnostics = false;

    const { warnings, tools } = await buildRegistry(cfg);
    // the project-config refusal has to travel from config load all the way to a
    // warn event, or the user never learns their plugin was skipped
    expect(warnings.some((w) => w.includes("plugins"))).toBe(true);
    expect(tools.has("ping")).toBe(false);
  });
});

describe("lifecycle hooks in a real turn", () => {
  test("onSessionStart fires once, on the session's first turn only", async () => {
    const { createSession } = await import("../src/store/db.ts");
    const { chat } = scripted([{ text: "hi" }]);
    const cfg = await cfgWith([FIX_OK]);
    const sessionId = createSession(work, "test-model").id;

    await runTurn("first", { chat, config: cfg, sessionId });
    expect(hookLog().filter((l) => l.startsWith("onSessionStart"))).toHaveLength(1);

    // second turn in the *same* session: seq is no longer 1
    await runTurn("second", { chat, config: cfg, sessionId });
    expect(hookLog().filter((l) => l.startsWith("onSessionStart"))).toHaveLength(1);
  }, 30_000);

  test("beforeLLMCall's text reaches the system prompt the provider receives", async () => {
    const { chat } = scripted([{ text: "hi" }]);
    await runTurn("go", { chat, config: await cfgWith([FIX_OK]) });

    // asserted on what the ChatFn was handed, not on the hook's return value —
    // a patch that never reaches the provider is not a feature
    expect(lastMessages[0].role).toBe("system");
    expect(lastMessages[0].content).toContain(APPENDED_SYSTEM);
    // appended, not replaced: the built-in prompt is still there
    expect(lastMessages[0].content).toContain("ping");
    expect(lastMessages[0].content.indexOf(APPENDED_SYSTEM)).toBeGreaterThan(0);
  }, 30_000);

  test("beforeLLMCall fires once per step, with the step number", async () => {
    const { chat } = scripted([{ tool: "ping" }, { text: "done" }]);
    await runTurn("go", { chat, config: await cfgWith([FIX_OK]) });
    const calls = hookLog().filter((l) => l.startsWith("beforeLLMCall"));
    expect(calls).toHaveLength(2);
    expect(calls[0]).toContain("step=1");
    expect(calls[1]).toContain("step=2");
    // step 2 sees more messages than step 1 — the assistant turn and tool result
    const n = (l: string) => Number(l.match(/messages=(\d+)/)![1]);
    expect(n(calls[1])).toBeGreaterThan(n(calls[0]));
  }, 30_000);

  test("afterTool's patch is what gets stored, shown, and reported", async () => {
    const { createSession, allMessages } = await import("../src/store/db.ts");
    const sessionId = createSession(work, "test-model").id;
    const { chat } = scripted([{ tool: "ping" }, { text: "done" }]);
    const events = await runTurn("go", { chat, config: await cfgWith([FIX_OK]), sessionId });

    const patched = `${AFTER_TOOL_PREFIX}${PING_OUTPUT}`;
    const end = events.find((e) => e.type === "tool_end") as Extract<AgentEvent, { type: "tool_end" }>;
    expect(end.output).toBe(patched);

    // The DB is the assertion that matters. `afterTool` runs before appendMessage
    // precisely so there is *one* version of the output; if it ran after, this row
    // would hold the unpatched text — the model would read that on every later
    // step while the UI showed the patched one.
    const toolRow = allMessages(sessionId).find((m) => m.role === "tool");
    expect(toolRow?.content).toBe(patched);
    expect(toolRow?.content).not.toBe(PING_OUTPUT);

    // and the model genuinely saw the patched text on the next step. `contains`,
    // not equality: renderContext prefixes each message with a seq marker.
    expect(lastMessages.some((m) => m.role === "tool" && m.content.includes(patched))).toBe(true);
    expect(lastMessages.some((m) => m.role === "tool" && m.content.includes(AFTER_TOOL_PREFIX))).toBe(true);
  }, 30_000);

  test("a hook that throws costs one warn event, not the turn", async () => {
    const { resetPlugins } = await import("../src/plugins/load.ts");
    resetPlugins();
    const bad = join(home, "bad-hook.ts");
    writeFileSync(
      bad,
      `export default { name: "badhook", hooks: { beforeLLMCall() { throw new Error("hook exploded"); }, afterTool() { throw new Error("after exploded"); } } };\n`,
    );

    const { chat } = scripted([{ tool: "read", args: { path: "nope.txt" } }, { text: "finished anyway" }]);
    const events = await runTurn("go", { chat, config: await cfgWith([bad]) });

    const warns = events.filter((e) => e.type === "warn") as Extract<AgentEvent, { type: "warn" }>[];
    expect(warns.some((w) => w.message.includes("hook exploded"))).toBe(true);
    expect(warns.some((w) => w.message.includes("after exploded"))).toBe(true);
    // every warning names the plugin, or the user cannot tell which one to remove
    for (const w of warns) expect(w.message).toContain("badhook");
    // and the turn still finished
    const done = events.find((e) => e.type === "done") as Extract<AgentEvent, { type: "done" }>;
    expect(done.reason).toBe("stop");
  }, 30_000);

  test("a broken plugin is reported once at the top of the turn", async () => {
    const events = await runTurn("go", { chat: scripted([{ text: "hi" }]).chat, config: await cfgWith([FIX_THROWS]) });
    const warns = events.filter((e) => e.type === "warn") as Extract<AgentEvent, { type: "warn" }>[];
    expect(warns).toHaveLength(1);
    expect(warns[0].message).toContain("failed to load");
    // the turn ran normally without the plugin
    expect(events.some((e) => e.type === "done" && e.reason === "stop")).toBe(true);
  }, 30_000);

  test("pluginsOverride injects hooks without touching disk", async () => {
    const seen: string[] = [];
    const events = await runTurn("go", {
      chat: scripted([{ tool: "ping" }, { text: "done" }]).chat,
      config: await cfgWith([]),
      registryOverride: new Map([
        [
          "ping",
          {
            def: { name: "ping", description: "injected", parameters: { type: "object" } },
            run: async () => ({ ok: true, output: "raw" }),
          },
        ],
      ]),
      pluginsOverride: [
        {
          name: "inline",
          hooks: {
            onSessionStart: () => void seen.push("start"),
            afterTool: (c) => {
              seen.push(`after:${c.name}`);
              return { output: `wrapped(${c.output})` };
            },
          },
        },
      ],
    });

    expect(seen).toEqual(["start", "after:ping"]);
    const end = events.find((e) => e.type === "tool_end") as Extract<AgentEvent, { type: "tool_end" }>;
    expect(end.output).toBe("wrapped(raw)");
  }, 30_000);

  test("no plugins configured means no hook machinery in the way", async () => {
    const { chat } = scripted([{ text: "plain" }]);
    const events = await runTurn("go", { chat, config: await cfgWith([]) });
    expect(events.filter((e) => e.type === "warn")).toEqual([]);
    expect(lastMessages[0].content).not.toContain(APPENDED_SYSTEM);
    expect(events.some((e) => e.type === "done" && e.reason === "stop")).toBe(true);
  }, 30_000);
});

describe("plugin providers", () => {
  test("a plugin provider is resolvable by the name a config would give", async () => {
    const { buildRegistry } = await import("../src/tools/index.ts");
    const { availableProviders, resolveChat } = await import("../src/providers/index.ts");

    // registration happens as part of building the registry, which is what the
    // turn loop does — so a config naming the provider works with no extra step
    await buildRegistry(await cfgWith([FIX_OK]));
    expect(availableProviders()).toContain("fixture-echo");

    const out: string[] = [];
    for await (const ev of resolveChat({ ...provider(), provider: "fixture-echo" }, [{ role: "user", content: "hi" }], [])) {
      if (ev.type === "text") out.push(ev.delta);
    }
    expect(out.join("")).toBe("echo(test-model)");
  });

  test("an unknown provider name says so, and lists what is available", async () => {
    const { resolveChat, availableProviders } = await import("../src/providers/index.ts");
    // previously this fell through to openai-compatible, so a typo produced a 401
    // from the wrong endpoint instead of naming the mistake
    const run = async () => {
      for await (const _ of resolveChat({ ...provider(), provider: "typo-provider" }, [], [])) void _;
    };
    await expect(run()).rejects.toThrow(/unknown provider 'typo-provider'/);
    expect(availableProviders()).toContain("openai-compatible");
    expect(availableProviders()).toContain("anthropic");
  });

  test("a plugin cannot shadow a built-in provider name", async () => {
    const { setCustomProviders, isAnthropic } = await import("../src/providers/index.ts");
    const hijack: ChatFn = async function* () {
      yield { type: "text", delta: "hijacked" };
    };
    setCustomProviders(new Map([["anthropic", hijack]]));
    // `provider = "anthropic"` must keep meaning Anthropic — no documentation
    // makes a silent redefinition of that safe
    expect(isAnthropic({ ...provider(), provider: "anthropic" })).toBe(true);
    setCustomProviders(new Map());
  });
});
