// The system prompt had no test coverage at all, which is how three separate
// defects lived in it: a formatter that cut every tool description at its first
// ". ", sections describing tools the registry didn't contain, and a git probe
// whose output changed on every file write — invalidating the prompt-cache
// breakpoint that sits on the whole system block.
//
// The prompt is now split in two and that split is the contract under test:
// buildSystemPrompt() is the cache prefix and must be byte-stable for the life
// of a step sequence, buildRuntimeHeader() is the message tail and is the ONLY
// place a per-step-changing value is allowed to live.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ToolDef } from "../src/providers/types.ts";

let home: string;

beforeEach(async () => {
  home = mkdtempSync(join(tmpdir(), "fox-prompt-"));
  process.env.FOX_AGENT_HOME = home;
  (await import("../src/store/db.ts")).closeAll();
});

afterEach(async () => {
  (await import("../src/store/db.ts")).closeAll();
  rmSync(home, { recursive: true, force: true });
});

async function toolDefs(tools?: ToolDef[]): Promise<ToolDef[]> {
  if (tools) return tools;
  const { defaultRegistry } = await import("../src/tools/index.ts");
  return [...defaultRegistry().values()].map((t) => t.def);
}

/** the cache prefix: everything that must be byte-stable across steps */
async function build(
  opts: {
    tools?: ToolDef[];
    projectInstructions?: string;
  } = {},
): Promise<string> {
  const { buildSystemPrompt } = await import("../src/loop/prompt.ts");
  return buildSystemPrompt({ tools: await toolDefs(opts.tools), projectInstructions: opts.projectInstructions });
}

/** the message tail: the only slot allowed to vary per step */
async function header(
  opts: {
    tools?: ToolDef[];
    sessionId?: string;
    cwd?: string;
    provider?: { name?: string; format?: string };
    budget?: { reported: number; limit: number; ratio: number; over: boolean };
  } = {},
): Promise<string> {
  const { buildRuntimeHeader } = await import("../src/loop/prompt.ts");
  return buildRuntimeHeader({
    sessionId: opts.sessionId ?? "s-prompt",
    cwd: opts.cwd ?? "/work",
    model: "gpt-4o-mini",
    provider: opts.provider,
    tools: await toolDefs(opts.tools),
    budget: opts.budget,
  });
}

/** what the agent actually reads: prefix + tail, in request order */
async function both(
  opts: {
    tools?: ToolDef[];
    projectInstructions?: string;
    sessionId?: string;
    cwd?: string;
    provider?: { name?: string; format?: string };
    budget?: { reported: number; limit: number; ratio: number; over: boolean };
  } = {},
): Promise<string> {
  return `${await build(opts)}\n\n${await header(opts)}`;
}

describe("no git anywhere in the prompt", () => {
  test("the runtime block carries no repo state", async () => {
    // built in the real repo, where a git probe would definitely have succeeded
    const h = await header({ cwd: process.cwd() });
    expect(h).not.toContain("git:");
    expect(h).not.toContain("dirty=");
    expect(h).not.toContain("repo=");
    expect(h).not.toContain("branch=");
    // the rest of the runtime block is still there
    expect(h).toContain(`cwd: ${process.cwd()}`);
    expect(h).toContain("model: gpt-4o-mini");
  });

  test("gitInfo and RuntimeCache are gone from the module, not just unused", async () => {
    const mod = (await import("../src/loop/prompt.ts")) as Record<string, unknown>;
    expect(mod.gitInfo).toBeUndefined();
    // toolLine was the truncating formatter; it is deleted rather than fixed
    expect(mod.toolLine).toBeUndefined();
  });

  test("writing a file does not change the prompt — the cache prefix survives", async () => {
    // This is the regression the git block caused: `dirty=N` moved on any edit,
    // and because the whole system block is one cache_control unit, the
    // breakpoint missed on every step where the agent had touched a file.
    //
    // The cwd must be a REAL repo WITH A COMMIT for this to bite, and both halves
    // were verified by re-injecting the probe. Pointed at a plain temp dir it
    // answers "repo=no" twice; pointed at a fresh `git init` with no commit,
    // `rev-parse --abbrev-ref HEAD` exits 128 and it *still* answers "repo=no"
    // twice. Only once HEAD resolves does `dirty=0` -> `dirty=1` on the write.
    const repo = join(home, "repo");
    mkdirSync(repo, { recursive: true });
    const git = (...a: string[]) =>
      Bun.spawnSync(["git", "-c", "user.email=t@t", "-c", "user.name=t", "-C", repo, ...a], { stdout: "ignore", stderr: "ignore" });
    Bun.spawnSync(["git", "init", "-q", repo], { stdout: "ignore", stderr: "ignore" });
    git("commit", "--allow-empty", "-q", "-m", "init");

    // the prefix is the claim: a file write must not move a byte of it. It no
    // longer takes a cwd at all — there is nothing a probe could feed it.
    const before = await build();
    const tailBefore = await header({ cwd: repo });
    writeFileSync(join(repo, "scratch.txt"), "a change a git probe would have seen");
    const after = await build();
    const tailAfter = await header({ cwd: repo });
    expect(after).toBe(before);
    // the tail is allowed to move — it now carries a clock, by design — but not
    // because of the write, which is what a probe would have reported
    const stripDate = (s: string) => s.split("\n").filter((l) => !l.startsWith("date: ")).join("\n");
    expect(stripDate(tailAfter)).toBe(stripDate(tailBefore));
  });

  test("no subprocess is spawned to build a prompt", async () => {
    // gitInfo cost two Bun.spawnSync calls per build. Guard it by construction:
    // spawnSync is replaced with a throw for the duration of the build.
    const realSpawnSync = Bun.spawnSync;
    let spawns = 0;
    (Bun as { spawnSync: unknown }).spawnSync = ((...a: unknown[]) => {
      spawns++;
      return (realSpawnSync as (...x: unknown[]) => unknown)(...a);
    }) as typeof Bun.spawnSync;
    try {
      await both({ cwd: process.cwd() });
    } finally {
      (Bun as { spawnSync: unknown }).spawnSync = realSpawnSync;
    }
    expect(spawns).toBe(0);
  });
});

describe("the system prompt is a stable cache prefix", () => {
  test("a moving budget figure never reaches it", async () => {
    // the figure changed on EVERY step, so when it sat inside the prefix the
    // whole block re-billed 5,157 times running
    const under = await build({ budget: { reported: 10, limit: 100, ratio: 0.1, over: false } } as any);
    const over = await build({ budget: { reported: 99, limit: 100, ratio: 0.99, over: true } } as any);
    expect(under).toBe(over);
    expect(under).not.toContain("Context used at your last step");
    expect(under).not.toContain("over the compaction threshold");
  });

  test("the todo list, cwd, model, provider and clock never reach it", async () => {
    const { kvSet, createSession } = await import("../src/store/db.ts");
    const s = createSession("/work", "gpt-4o-mini");
    kvSet(s.id, "todos", [{ content: "wire ACP", status: "in_progress" }]);

    const plain = await build();
    const noisy = await build({
      sessionId: s.id,
      cwd: "/somewhere/else",
      model: "kimi-k2",
      provider: { name: "zhipuai-coding-plan", format: "openai-compatible" },
    } as any);
    expect(noisy).toBe(plain);
    expect(plain).not.toContain("<runtime>");
    expect(plain).not.toContain("cwd:");
    expect(plain).not.toContain("provider:");
    expect(plain).not.toContain("tz:");
    expect(plain).not.toContain("wire ACP");
  });

  test("it changes only when the toolset or the project instructions do", async () => {
    const { buildSystemPrompt } = await import("../src/loop/prompt.ts");
    const { defaultRegistry } = await import("../src/tools/index.ts");
    const full = [...defaultRegistry().values()].map((t) => t.def);
    const def = (name: string): ToolDef => ({ name, description: `does ${name}.`, parameters: { type: "object", properties: {} } });

    const a = buildSystemPrompt({ tools: full });
    const b = buildSystemPrompt({ tools: full });
    expect(a).toBe(b);

    const fewer = buildSystemPrompt({ tools: [def("read")] });
    expect(fewer).not.toBe(a);

    const instructed = buildSystemPrompt({ tools: full, projectInstructions: "be terse" });
    expect(instructed).not.toBe(a);
  });
});

describe("tools are presented honestly", () => {
  test("every registry tool is named", async () => {
    const { baseRegistry } = await import("../src/tools/index.ts");
    const names = [...baseRegistry().keys()];
    const p = await build();
    for (const n of names) expect(p).toContain(n);
  });

  test("no description is truncated at a sentence boundary", async () => {
    // `glob`'s description contains "(e.g. …)", which the old formatter cut to
    // "Find files by wildcard pattern (e.g" — a fragment ending mid-abbreviation.
    const p = await build();
    expect(p).not.toContain("(e.g");
    // and the prompt does not carry a prefix of any description at all: it points
    // at the API tool block instead, which ships the full text
    const { globDef } = await import("../src/tools/files.ts");
    const firstSentence = globDef.description.split(". ")[0];
    expect(globDef.description.length).toBeGreaterThan(firstSentence.length); // fixture is meaningful
    expect(p).not.toContain(firstSentence);
    expect(p).toContain("API tool definitions");
  });

  test("the two contracts no schema can express are stated", async () => {
    const p = await build();
    expect(p).toMatch(/exec never drifts/);
    expect(p).toMatch(/pty is one persistent shell/);
  });
});

describe("nothing describes a tool the registry lacks", () => {
  const def = (name: string): ToolDef => ({ name, description: `does ${name}. Second sentence.`, parameters: { type: "object", properties: {} } });

  test("a registry without ctx_edit gets no context-surgery doctrine", async () => {
    // this is exactly what subagents used to receive: the whole "your core
    // ability" section, describing a tool excluded from their registry
    const p = await build({ tools: [def("read"), def("write")] });
    expect(p).not.toContain("ctx_edit");
    expect(p).not.toContain("Context window management");
    expect(p).not.toContain("[mN]");
  });

  test("a registry without task never tells the model to delegate", async () => {
    const p = await build({ tools: [def("read")] });
    expect(p).not.toContain("task");
    expect(p).not.toContain("Delegate");
  });

  test("a registry without exec or pty makes no cwd promises", async () => {
    const p = await build({ tools: [def("read")] });
    expect(p).not.toContain("exec never drifts");
    expect(p).not.toContain("persistent shell");
  });

  test("the full registry does get all of it", async () => {
    const p = await build();
    expect(p).toContain("Context window management");
    expect(p).toContain("Delegate self-contained subtasks");
  });
});

describe("the rest of the prompt still assembles", () => {
  test("project instructions appear when present and are absent otherwise", async () => {
    expect(await build({ projectInstructions: "be terse" })).toContain("be terse");
    expect(await build()).not.toContain("## Project instructions");
  });

  test("todos render into the runtime block", async () => {
    const { kvSet } = await import("../src/store/db.ts");
    const { createSession } = await import("../src/store/db.ts");
    const s = createSession("/work", "gpt-4o-mini");
    kvSet(s.id, "todos", [{ content: "wire ACP", status: "in_progress" }]);
    const h = await header({ sessionId: s.id });
    expect(h).toContain("todos:");
    expect(h).toContain("wire ACP");
    // and nowhere near the prefix
    expect(await build()).not.toContain("wire ACP");
  });

  test("the tail announces itself so a model never reads it as user speech", async () => {
    const h = await header();
    expect(h).toContain("[harness metadata");
    expect(h).toContain("<runtime>");
    expect(h).toContain("</runtime>");
  });

  test("the tail carries provider, machine and clock facts", async () => {
    const h = await header({ provider: { name: "zhipuai-coding-plan", format: "openai-compatible" } });
    expect(h).toContain("provider: zhipuai-coding-plan (openai-compatible)");
    expect(h).toMatch(/^host: \S+/m);
    expect(h).toMatch(/^os: \S+ \S+ \S+ · \d+ cpu · shell=\S+/m);
    expect(h).toMatch(/^runtime: (bun|node) /m);
    expect(h).toMatch(/^fox-agent: v/m);

    // profile name alone (a bare format with no name is the honest fallback)
    expect(await header({ provider: { format: "anthropic" } })).toContain("provider: anthropic");
    expect(await header({ provider: { name: "openrouter" } })).toContain("provider: openrouter");
    expect(await header()).toContain("provider: unknown");
  });

  test("the clock is local and the offset reads as a zone, not a timestamp", async () => {
    const h = await header();
    expect(h).toMatch(/^date: \d{4}-\d{2}-\d{2} \d{2}:\d{2}$/m);
    // UTC+8 / UTC-5:30 / plain UTC (a machine at offset 0 has no zone name to
    // disambiguate) — never the raw +08:00 timestamp form, which would read as
    // part of the date and needs a lookup to convert
    expect(h).toMatch(/^tz: (\S+ )?UTC([+-]\d{1,2}(:\d{2})?)?$/m);
    expect(h).not.toMatch(/[+-]\d{2}:\d{2}/);
  });
});

describe("live context figure in the prompt", () => {
  test("no report yet -> no figure; a report -> the figure, no nudge below threshold", async () => {
    const none = await header();
    expect(none).not.toContain("Context used at your last step");

    const under = await header({ budget: { reported: 10_000, limit: 128_000, ratio: 10_000 / 128_000, over: false } });
    expect(under).toContain("Context used at your last step: 10000/128000 tokens (8%)");
    expect(under).not.toContain("over the compaction threshold");
  });

  test("past the threshold the agent is told to prune before continuing", async () => {
    // the nudge lives in the tail; the two contracts it points back at live in
    // the doctrine section of the prefix — the agent reads both
    const over = await both({ budget: { reported: 120_000, limit: 128_000, ratio: 120_000 / 128_000, over: true } });
    expect(over).toContain("over the compaction threshold");
    expect(over).toContain('"op":"search"');
    expect(over).toContain("one ctx call");
  });

  test("without ctx_edit the figure is omitted — nothing to act on it with", async () => {
    const h = await header({
      tools: [{ name: "read", description: "reads", parameters: { type: "object", properties: {} } }],
      budget: { reported: 120_000, limit: 128_000, ratio: 0.94, over: true },
    });
    expect(h).not.toContain("Context used at your last step");
  });
});
