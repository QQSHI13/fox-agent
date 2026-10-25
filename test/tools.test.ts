import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as F from "../src/tools/files.ts";
import { execRun } from "../src/tools/exec.ts";
import { baseRegistry, buildRegistry, defaultRegistry } from "../src/tools/index.ts";
import { childEnv } from "../src/core/childenv.ts";
import type { ToolContext } from "../src/tools/types.ts";

let dir: string;
let ctx: ToolContext;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "fox-tools-"));
  process.env.FOX_AGENT_HOME = join(dir, ".fox");
  // BOTH: loadConfig reads the global config from FOX_AGENT_CONFIG when set,
  // else ~/.config — setting only the home left this suite asserting against
  // the developer's real config (a stray key there flips expect(warnings)).
  // Point it inside the tmp home; never touch the real config (CLAUDE.md).
  process.env.FOX_AGENT_CONFIG = join(join(dir, ".fox"), "config.toml");
  let pty: unknown;
  ctx = {
    sessionId: "s1",
    cwd: dir,
    
    get pty() {
      return pty;
    },
    set pty(v: unknown) {
      pty = v;
    },
  } as unknown as ToolContext;
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const write = (rel: string, body: string) => {
  const p = join(dir, rel);
  mkdirSync(join(p, ".."), { recursive: true });
  writeFileSync(p, body);
  return p;
};

describe("read", () => {
  test("returns line-numbered content", async () => {
    write("a.txt", "one\ntwo\nthree\n");
    const r = await F.readRun({ path: "a.txt" }, ctx);
    expect(r.ok).toBe(true);
    expect(r.output).toContain("1:");
    expect(r.output).toContain("two");
  });

  test("offset and limit window the file", async () => {
    write("b.txt", Array.from({ length: 50 }, (_, i) => `line${i + 1}`).join("\n"));
    const r = await F.readRun({ path: "b.txt", offset: 10, limit: 3 }, ctx);
    expect(r.output).toContain("line10");
    expect(r.output).toContain("line12");
    expect(r.output).not.toContain("line13");
    // a cut listing must say how to continue, not read as the whole file
    expect(r.output).toContain("offset: 13");
  });

  test("a limit above the internal 2000-line guard says what was withheld", async () => {
    // limit used to be re-capped at 2000 with no notice: `limit: 5000` returned
    // 2000 lines and looked like the complete file
    write("big.txt", Array.from({ length: 2500 }, (_, i) => `row${i + 1}`).join("\n"));
    const r = await F.readRun({ path: "big.txt", limit: 5000 }, ctx);
    expect(r.ok).toBe(true);
    expect(r.output).toContain("row2000");
    expect(r.output).not.toContain("2001:");
    expect(r.output).toContain("500 more line(s)");
    expect(r.output).toContain("offset/limit");
  });

  test("an offset past the end reports the real line count, not an empty file", async () => {
    write("e.txt", "one\ntwo\nthree\n");
    const r = await F.readRun({ path: "e.txt", offset: 10 }, ctx);
    expect(r.ok).toBe(true);
    expect(r.output).toContain("past the end");
    expect(r.output).toContain("3 lines");
    expect(r.output).not.toContain("(empty file)");
  });

  test("a trailing newline is not counted as an extra line", async () => {
    // split("\n") on "one\ntwo\nthree\n" yields a final empty element; the old
    // count said 4 lines and offered "offset: 4" for a 3-line file
    write("f.txt", "one\ntwo\nthree\n");
    const r = await F.readRun({ path: "f.txt" }, ctx);
    expect(r.output).not.toContain("4 lines");
    expect(r.output).not.toContain("offset: 4");
  });

  test("missing file is a failure, not a throw", async () => {
    const r = await F.readRun({ path: "nope.txt" }, ctx);
    expect(r.ok).toBe(false);
  });

  test("binary files are refused", async () => {
    writeFileSync(join(dir, "bin.dat"), Buffer.from([0x41, 0x00, 0x42, 0x00]));
    const r = await F.readRun({ path: "bin.dat" }, ctx);
    expect(r.ok).toBe(false);
    expect(r.output).toMatch(/binary/i);
  });

  test("reading a directory fails cleanly", async () => {
    mkdirSync(join(dir, "sub"));
    const r = await F.readRun({ path: "sub" }, ctx);
    expect(r.ok).toBe(false);
  });

  test("a pdf attaches as media only when the model accepts the pdf modality", async () => {
    writeFileSync(join(dir, "doc.pdf"), Buffer.from("%PDF-1.4\n%fake\n"));
    // `pdf` is its own catalog modality, not a flavour of vision — a model with
    // vision but no pdf must refuse it rather than attach a file the endpoint
    // then rejects with an opaque 400.
    const { setConfiguredModels } = await import("../src/providers/models.ts");
    setConfiguredModels([{ id: "with-pdf", input: ["pdf"] }, { id: "image-only", input: ["image"] }]);

    const yes = await F.readRun({ path: "doc.pdf" }, { ...ctx, providerCfg: { model: "with-pdf" } as any });
    expect(yes.ok).toBe(true);
    expect(yes.media?.[0]?.mimeType).toBe("application/pdf");
    expect(yes.output).toContain("attached as pdf");

    const no = await F.readRun({ path: "doc.pdf" }, { ...ctx, providerCfg: { model: "image-only" } as any });
    expect(no.ok).toBe(false);
    expect(no.output).toContain("does not accept pdf");

    setConfiguredModels([]);
  });
});

describe("write", () => {
  test("creates parent directories", async () => {
    const r = await F.writeRun({ path: "deep/nested/x.txt", content: "hi" }, ctx);
    expect(r.ok).toBe(true);
    expect(await Bun.file(join(dir, "deep/nested/x.txt")).text()).toBe("hi");
  });

  test("overwriting an existing file works without a prior read", async () => {
    write("o.txt", "old");
    const r = await F.writeRun({ path: "o.txt", content: "new" }, ctx);
    expect(r.ok).toBe(true);
    expect(await Bun.file(join(dir, "o.txt")).text()).toBe("new");
  });
});

describe("edit", () => {
  test("replaces a unique string", async () => {
    write("c.ts", "const a = 1;\nconst b = 2;\n");
    const r = await F.editRun({ path: "c.ts", oldString: "const a = 1;", newString: "const a = 99;" }, ctx);
    expect(r.ok).toBe(true);
    expect(await Bun.file(join(dir, "c.ts")).text()).toContain("const a = 99;");
  });

  test("ambiguous match is rejected without touching the file", async () => {
    write("d.ts", "aa\naa\n");
    const before = await Bun.file(join(dir, "d.ts")).text();
    const r = await F.editRun({ path: "d.ts", edits: [{ oldString: "aa", newString: "y" }] }, ctx);
    expect(r.ok).toBe(false);
    expect(r.output).toMatch(/matches 2 times/);
    expect(await Bun.file(join(dir, "d.ts")).text()).toBe(before);
  });

  test("missing match is rejected", async () => {
    write("e.ts", "hello\n");
    const r = await F.editRun({ path: "e.ts", oldString: "absent", newString: "z" }, ctx);
    expect(r.ok).toBe(false);
    expect(r.output).toMatch(/not found/);
  });
});

describe("glob", () => {
  test("finds files by pattern", async () => {
    write("src/a.ts", "");
    write("src/b.ts", "");
    write("src/c.md", "");
    const r = await F.globRun({ pattern: "src/*.ts" }, ctx);
    expect(r.ok).toBe(true);
    expect(r.output).toContain("a.ts");
    expect(r.output).toContain("b.ts");
    expect(r.output).not.toContain("c.md");
  });

  test("no matches reports plainly rather than failing", async () => {
    const r = await F.globRun({ pattern: "*.nothing" }, ctx);
    expect(r.output).toMatch(/no (files|matches)/i);
  });

  test("limit caps results and says so instead of truncating silently", async () => {
    for (let i = 0; i < 12; i++) write(`many/f${i}.ts`, "");
    const capped = await F.globRun({ pattern: "many/*.ts", limit: 5 }, ctx);
    const lines = capped.output.split("\n").filter((l) => l.endsWith(".ts"));
    expect(lines).toHaveLength(5);
    // the cut is announced — an unannounced one reads as "that was all of them"
    expect(capped.output).toContain("truncated at 5");

    const whole = await F.globRun({ pattern: "many/*.ts", limit: 100 }, ctx);
    expect(whole.output.split("\n")).toHaveLength(12);
    expect(whole.output).not.toContain("truncated");
  });
});

describe("grep", () => {
  test("finds a pattern and reports the file", async () => {
    write("g.ts", "const needle = 1;\n");
    const r = await F.grepRun({ pattern: "needle" }, ctx);
    expect(r.output).toContain("g.ts");
  });

  test("no match is reported, not an error", async () => {
    write("g.ts", "nothing here\n");
    const r = await F.grepRun({ pattern: "zzzznomatch" }, ctx);
    expect(r.output).toMatch(/no match/i);
  });

  test("limit caps matches and reports how many were withheld", async () => {
    write("many.txt", "needle\nneedle\nneedle\nneedle\n");
    const capped = await F.grepRun({ pattern: "needle", limit: 2 }, ctx);
    expect(capped.output.split("\n").filter((l) => l.includes("needle"))).toHaveLength(2);
    expect(capped.output).toContain("truncated at 2");
    const whole = await F.grepRun({ pattern: "needle", limit: 50 }, ctx);
    expect(whole.output.split("\n").filter((l) => l.includes("needle"))).toHaveLength(4);
    expect(whole.output).not.toContain("truncated");
  });

  test("include globs match the path relative to the search root, and basenames", async () => {
    write("nest/deep/a.ts", "needle a");
    write("nest/b.ts", "needle b");
    write("root.ts", "needle root");
    // the walker is the offline fallback; rg's globs are passed through, so the
    // matching rule is pinned here
    const { walkGrep } = await import("../src/tools/files.ts");
    const re = /needle/;
    const nested = walkGrep(re, dir, "nest/**/*.ts", 50);
    expect(nested).toContain("nest/deep/a.ts");
    expect(nested).toContain("nest/b.ts"); // ** matches zero directories too
    expect(nested).not.toContain("root.ts");

    // a glob without ** still means "this basename at any depth"
    const base = walkGrep(re, dir, "*.ts", 50);
    expect(base).toContain("root.ts");
    expect(base).toContain("nest/b.ts");
    expect(base).toContain("nest/deep/a.ts"); // basename fallback, any depth
  });
});

describe("exec", () => {
  test("captures stdout on success", async () => {
    const r = await execRun({ cmd: "echo hello-exec" }, ctx);
    expect(r.ok).toBe(true);
    expect(r.output).toContain("hello-exec");
  });

  test("a non-zero exit is reported as a failure", async () => {
    const r = await execRun({ cmd: "exit 3" }, ctx);
    expect(r.ok).toBe(false);
    expect(r.output).toMatch(/^exit 3/);
  });

  test("stderr is captured", async () => {
    const r = await execRun({ cmd: "echo oops >&2; exit 1" }, ctx);
    expect(r.output).toContain("oops");
  });

  test("timeout kills the command and reports it", async () => {
    const r = await execRun({ cmd: "sleep 30", timeout_ms: 1_000 }, ctx);
    expect(r.ok).toBe(false);
    expect(r.output).toMatch(/timeout \d+ms/);
  }, 10_000);

  test("a budget above the old 10-minute cap is honoured, not clamped", async () => {
    // used to be Math.min(600_000, …): asking for an hour silently got 10 min
    const r = await execRun({ cmd: "echo ok", timeout_ms: 3_600_000 }, ctx);
    expect(r.ok).toBe(true);
    expect(r.output).toContain("ok");
  });

  test("a budget past the 32-bit timer wall does not kill the command instantly", async () => {
    // setTimeout(3e9) fires after 1ms — before the fix this reported a timeout
    // kill and a SIGTERM for a command that had barely started
    const r = await execRun({ cmd: "sleep 0.3; echo survived", timeout_ms: 3_000_000_000 }, ctx);
    expect(r.ok).toBe(true);
    expect(r.output).toContain("survived");
    expect(r.output).not.toMatch(/timeout/);
  });

  test("timeout_ms: 0 disables the timeout", async () => {
    const r = await execRun({ cmd: "sleep 0.3; echo no-timeout", timeout_ms: 0 }, ctx);
    expect(r.ok).toBe(true);
    expect(r.output).toContain("no-timeout");
  });

  test("a negative timeout_ms is rejected, not clamped", async () => {
    const r = await execRun({ cmd: "echo hi", timeout_ms: -1 }, ctx);
    expect(r.ok).toBe(false);
    expect(r.output).toContain("timeout_ms");
  });

  test("runs in ctx.cwd", async () => {
    write("marker.txt", "");
    const r = await execRun({ cmd: "ls" }, ctx);
    expect(r.output).toContain("marker.txt");
  });

  test("foreground output streams to the UI via tool_output, not to the model", async () => {
    const events: { type: string; delta?: string }[] = [];
    const c = { ...ctx, callId: "c1", emit: (ev: any) => events.push(ev) };
    const r = await execRun({ cmd: "echo a; echo b" }, c);
    expect(r.ok).toBe(true);
    const streamed = events.filter((e) => e.type === "tool_output").map((e) => e.delta).join("");
    expect(streamed).toContain("a");
    expect(streamed).toContain("b");
    // ...while the tool result is still the single merged payload
    expect(r.output).toContain("a");
  });
});

describe("ctx is the one context tool", () => {
  test("no retired alias sits beside it in the registry", async () => {
    const { baseRegistry } = await import("../src/tools/index.ts");
    const tools = baseRegistry();
    expect(tools.has("ctx")).toBe(true);
    expect(tools.has("ctx_edit")).toBe(false);
  });
});

describe("ctx search, stats and query ops", () => {
  async function seeded() {
    const { createSession, appendMessage } = await import("../src/store/db.ts");
    const { ctxRun } = await import("../src/tools/ctx.ts");
    const s = createSession(dir, "m1");
    const mine = { ...ctx, sessionId: s.id };
    const run = (ops: any[]) => ctxRun({ ops }, mine);
    const a = appendMessage(s.id, { parent_id: null, role: "user", content: "how do I paginate?", tokens: 5 });
    const b = appendMessage(s.id, { parent_id: null, role: "assistant", content: "use cursor pagination", tokens: 5 });
    const c = appendMessage(s.id, { parent_id: null, role: "tool", content: "Error: timeout after 30s\nat fetch (x:1)", tokens: 10 });
    return { s, mine, run, a, b, c };
  }

  test("search returns snippets, never bodies", async () => {
    const { run, b } = await seeded();
    const r = await run([{ op: "search", pattern: "cursor" }]);
    expect(r.ok).toBe(true);
    expect(r.output).toContain(`[${b.seq}]`);
    expect(r.output).toContain("cursor pagination".slice(0, 20));
    const miss = await run([{ op: "search", pattern: "zzz-no-match" }]);
    expect(miss.output).toContain("no matches");
    const bad = await run([{ op: "search", pattern: "(" }]);
    expect(bad.ok).toBe(false);
  });

  test("search honors role filter and limit", async () => {
    const { run } = await seeded();
    const r = await run([{ op: "search", pattern: ".", role: "tool", limit: 1 }]);
    expect(r.output).toContain("1 match");
    expect(r.output).toContain("tool Error");
  });

  test("a truncated search says how many it withheld", async () => {
    // the count used to be the number RETURNED, so a capped listing read as
    // "that is all of them"
    const { run } = await seeded();
    const r = await run([{ op: "search", pattern: ".", limit: 2 }]);
    expect(r.ok).toBe(true);
    expect(r.output).toContain("3 match(es)");
    expect(r.output).toContain("showing 2, 1 withheld");
  });

  test("delete_by_query sees every match, not the first 100", async () => {
    // the all:true guard compares matches against visible nodes. A fixed cap of
    // 100 matches meant a pattern hitting 150 of 150 nodes deleted 100 of them
    // and skipped the confirmation entirely.
    const { createSession, appendMessage } = await import("../src/store/db.ts");
    const { ctxRun } = await import("../src/tools/ctx.ts");
    const s = createSession(dir, "m1");
    const mine = { ...ctx, sessionId: s.id };
    for (let i = 0; i < 150; i++) {
      appendMessage(s.id, { parent_id: null, role: "user", content: `alpha ${i}`, tokens: 2 });
    }
    const unconfirmed = await ctxRun({ ops: [{ op: "delete_by_query", pattern: "alpha" }] }, mine);
    expect(unconfirmed.ok).toBe(false);
    expect(unconfirmed.output).toContain("all:true");
    // and nothing was hidden by the refusal
    const stats = await ctxRun({ ops: [{ op: "stats" }] }, mine);
    expect(stats.output).toContain("150 visible of 150 stored (0 hidden)");
    // with confirmation, ALL 150 go — not the first 100
    const confirmed = await ctxRun({ ops: [{ op: "delete_by_query", pattern: "alpha", all: true }] }, mine);
    expect(confirmed.ok).toBe(true);
    const after = await ctxRun({ ops: [{ op: "stats" }] }, mine);
    expect(after.output).toContain("0 visible of 150 stored (150 hidden)");
  });

  test("stats reports visible/stored and the biggest nodes", async () => {
    const { run, c } = await seeded();
    const r = await run([{ op: "stats" }]);
    expect(r.ok).toBe(true);
    expect(r.output).toContain("3 visible of 3 stored (0 hidden)");
    expect(r.output).toContain(`[${c.seq}] tool`);
  });

  test("delete_by_query hides matches; matching everything needs all:true", async () => {
    const { run, c } = await seeded();
    const r = await run([{ op: "delete_by_query", pattern: "timeout" }]);
    expect(r.ok).toBe(true);
    expect(r.output).toContain(`${c.seq}`);
    const after = await run([{ op: "stats" }]);
    expect(after.output).toContain("2 visible of 3 stored (1 hidden)");
    const all = await run([{ op: "delete_by_query", pattern: "." }]);
    expect(all.ok).toBe(false);
    expect(all.output).toContain("all:true");
    const confirmed = await run([{ op: "delete_by_query", pattern: ".", all: true }]);
    expect(confirmed.ok).toBe(true);
  });

  test("restore un-hides nodes", async () => {
    const { run, a } = await seeded();
    await run([{ op: "delete", ids: [a.seq] }]);
    const r = await run([{ op: "restore", ids: [a.seq] }]);
    expect(r.ok).toBe(true);
    const after = await run([{ op: "stats" }]);
    expect(after.output).toContain("3 visible of 3 stored (0 hidden)");
  });

  test("query and mutation batch in one call", async () => {
    const { run, c } = await seeded();
    const r = await run([{ op: "search", pattern: "timeout" }, { op: "delete", ids: [c.seq], reason: "done" }]);
    expect(r.ok).toBe(true);
    expect(r.output).toContain("match");
    expect(r.output).toContain("ctx ok: 1 hidden");
  });
});

describe("registry", () => {
  test("base registry exposes the built-in tools", () => {
    const reg = defaultRegistry();
    for (const name of ["read", "write", "edit", "glob", "grep", "exec", "pty", "ctx", "todo", "task", "fetch", "repl"]) {
      expect(reg.has(name)).toBe(true);
    }
  });

  test("every tool def has a name, description and object params", () => {
    for (const [name, tool] of baseRegistry()) {
      expect(tool.def.name).toBe(name);
      expect(tool.def.description.length).toBeGreaterThan(10);
      expect(tool.def.parameters.type).toBe("object");
    }
  });

  test("buildRegistry with no MCP servers returns built-ins and no warnings", async () => {
    const { tools, warnings } = await buildRegistry({ mcpServers: {} } as any);
    expect(warnings).toEqual([]);
    expect(tools.has("read")).toBe(true);
  });

  test("exclude drops the named tools", async () => {
    const { tools } = await buildRegistry({ mcpServers: {} } as any, new Set(["task", "pty", "ctx"]));
    expect(tools.has("task")).toBe(false);
    expect(tools.has("pty")).toBe(false);
    expect(tools.has("ctx")).toBe(false);
    expect(tools.has("read")).toBe(true);
  });

  test("a delegated agent gets the full registry, ctx/pty/task included", async () => {
    // The inverse of a measured defect: subagents used to be built with
    // RESTRICTED = {task, ctx, pty} removed while the system prompt still
    // described all three, so a child was told about tools it could not call.
    // Delegation is now a separate `fox --acp` process (src/tools/task.ts), which
    // reaches this same unexcluded path — nothing in fox-agent passes `exclude` at all;
    // it survives only as a facility for an embedder that wants a reduced set.
    const { tools } = await buildRegistry({ mcpServers: {} } as any);
    for (const name of ["task", "ctx", "pty"]) expect(tools.has(name)).toBe(true);
    expect([...tools.keys()].sort()).toEqual([...defaultRegistry().keys()].sort());
  });
});

describe("childEnv", () => {
  test("passes provider credentials through (no stripping)", () => {
    process.env.FOX_AGENT_API_KEY = "secret1";
    process.env.ANTHROPIC_API_KEY = "secret2";
    process.env.SOME_OTHER_API_KEY = "secret3";
    process.env.FOX_AGENT_KEEP_ME = "fine";
    try {
      const env = childEnv();
      expect(env.FOX_AGENT_API_KEY).toBe("secret1");
      expect(env.ANTHROPIC_API_KEY).toBe("secret2");
      expect(env.SOME_OTHER_API_KEY).toBe("secret3");
      expect(env.FOX_AGENT_KEEP_ME).toBe("fine");
      expect(env.PATH).toBe(process.env.PATH!);
    } finally {
      delete process.env.FOX_AGENT_API_KEY;
      delete process.env.ANTHROPIC_API_KEY;
      delete process.env.SOME_OTHER_API_KEY;
      delete process.env.FOX_AGENT_KEEP_ME;
    }
  });

  test("extra vars are merged and win over the inherited set", () => {
    process.env.FOX_AGENT_OVERRIDE_ME = "before";
    try {
      const env = childEnv({ FOX_AGENT_OVERRIDE_ME: "after", EXTRA: "x" });
      expect(env.FOX_AGENT_OVERRIDE_ME).toBe("after");
      expect(env.EXTRA).toBe("x");
    } finally {
      delete process.env.FOX_AGENT_OVERRIDE_ME;
    }
  });
});

describe("todo", () => {
  test("result is a markdown task list, no emoji markers", async () => {
    const { todoRun, renderTodosMd, renderTodos } = await import("../src/tools/todo.ts");
    const r = await todoRun(
      {
        todos: [
          { content: "done thing", status: "done" },
          { content: "active thing", status: "in_progress" },
          { content: "later thing", status: "pending" },
        ],
      },
      ctx,
    );
    expect(r.ok).toBe(true);
    // the list is already in the tool CALL's args and in the runtime header, so
    // the result is only an acknowledgement — restating it burned context
    expect(r.output).toBe("updated");
    // the plain (model-facing) renderer is ASCII too
    expect(renderTodos([{ content: "x", status: "done" }])).toBe("[x] x");
    expect(renderTodos([{ content: "x", status: "in_progress" }])).toBe("[~] x");
    expect(renderTodos([{ content: "x", status: "pending" }])).toBe("[ ] x");
    // markdown helper matches
    expect(renderTodosMd([{ content: "x", status: "done" }])).toBe("- [x] x");
  });

  test("validation still rejects junk", async () => {
    const { todoRun } = await import("../src/tools/todo.ts");
    expect((await todoRun({}, ctx)).ok).toBe(false);
    expect((await todoRun({ todos: [{ content: "", status: "done" }] }, ctx)).ok).toBe(false);
    expect((await todoRun({ todos: [{ content: "x", status: "paused" as "done" }] }, ctx)).ok).toBe(false);
  });
});
