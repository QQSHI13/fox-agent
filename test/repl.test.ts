import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { replRun, cleanupRepl } from "../src/tools/repl.ts";
import { defaultRegistry } from "../src/tools/index.ts";
import type { ToolContext } from "../src/tools/types.ts";

let dir: string;
let ctx: ToolContext;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "fox-repl-"));
  process.env.FOX_AGENT_HOME = join(dir, ".fox");
  let pty: unknown;
  ctx = {
    sessionId: "repl-s1",
    cwd: dir,
    tools: defaultRegistry(),
    get pty() {
      return pty;
    },
    set pty(v: unknown) {
      pty = v;
    },
  } as unknown as ToolContext;
});

afterEach(() => {
  cleanupRepl("repl-s1");
  rmSync(dir, { recursive: true, force: true });
});

describe("repl scratchpad", () => {
  test("evaluates and returns values", async () => {
    const r = await replRun({ code: "40 + 2" }, ctx);
    expect(r).toEqual({ ok: true, output: "42" });
  });

  test("top-level return and await work", async () => {
    const r = await replRun({ code: "const x = await Promise.resolve(7);\nreturn x * 6;" }, ctx);
    expect(r).toEqual({ ok: true, output: "42" });
  });

  test("state persists across calls in the session", async () => {
    // typeof-guard: reading a never-assigned name throws (as in node),
    // assigning creates it on the session context
    await replRun({ code: "if (typeof counter === 'undefined') counter = 0; counter += 1;" }, ctx);
    await replRun({ code: "if (typeof counter === 'undefined') counter = 0; counter += 1;" }, ctx);
    const r = await replRun({ code: "counter" }, ctx);
    expect(r).toEqual({ ok: true, output: "2" });
  });

  test("reset drops the scratchpad", async () => {
    await replRun({ code: "v = 99;" }, ctx);
    const r = await replRun({ code: "typeof v", reset: true }, ctx);
    expect(r).toEqual({ ok: true, output: expect.stringContaining("undefined") });
  });

  test("console lines are captured alongside the result", async () => {
    const r = await replRun({ code: 'console.log("a", 1);\nreturn "done";' }, ctx);
    expect(r).toEqual({ ok: true, output: "a 1\ndone" });
  });

  test("errors fail with the message, killing nothing", async () => {
    const r = await replRun({ code: "noSuchFn(1)" }, ctx);
    expect(r.ok).toBe(false);
    expect(r.output).toContain("noSuchFn");
    // the session survives the error
    expect(await replRun({ code: "1 + 1" }, ctx)).toEqual({ ok: true, output: "2" });
  });

  test("a hanging eval is killed at timeout_ms", async () => {
    const t0 = Date.now();
    const r = await replRun({ code: "while (true) {}", timeout_ms: 1000 }, ctx);
    expect(r.ok).toBe(false);
    expect(r.output).toMatch(/timed out/i);
    expect(Date.now() - t0).toBeLessThan(5000);
  }, 30_000);

  test("no timers in the sandbox (documented constraint)", async () => {
    const r = await replRun({ code: "setTimeout(() => {}, 1)" }, ctx);
    expect(r.ok).toBe(false);
  });

  test("needs code and a registry", async () => {
    expect((await replRun({}, ctx)).ok).toBe(false);
    expect((await replRun({ code: "1" }, { ...ctx, tools: undefined })).ok).toBe(false);
  });
});

describe("repl tool bridge", () => {
  test("list and search discover tools", async () => {
    const names = await replRun({ code: 'tools.list().map((t) => t.name).join(",")' }, ctx);
    expect(names.output).toContain("exec");
    const found = await replRun({ code: 'tools.search("shell").map((t) => t.name).join(",")' }, ctx);
    expect(found.output).toContain("exec");
  });

  test("call runs a real tool in-process (shell included, no subprocess of its own)", async () => {
    const r = await replRun({ code: 'await tools.call("exec", { cmd: "echo hi-from-repl" })' }, ctx);
    expect(r.ok).toBe(true);
    expect(r.output).toContain("hi-from-repl");
  });

  test("unknown tools and bad args fail loudly", async () => {
    const r = await replRun({ code: 'await tools.call("nope", {})' }, ctx);
    expect(r.ok).toBe(false);
    expect(r.output).toContain("unknown tool");
    const r2 = await replRun({ code: 'await tools.call("exec", "not-an-object")' }, ctx);
    expect(r2.ok).toBe(false);
  });

  test("repl-in-repl nesting is capped", async () => {
    let code = "1";
    for (let i = 0; i < 5; i++) code = `await tools.call("repl", { code: ${JSON.stringify(code)} })`;
    const r = await replRun({ code }, ctx);
    expect(r.ok).toBe(false);
    expect(r.output).toContain("too deep");
  }, 30_000);
});
