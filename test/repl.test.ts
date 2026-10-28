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
  // BOTH: loadConfig reads the global config from FOX_AGENT_CONFIG when set,
  // else ~/.config — setting only the home left this suite asserting against
  // the developer's real config (a stray key there flips expect(warnings)).
  // Point it inside the tmp home; never touch the real config (CLAUDE.md).
  process.env.FOX_AGENT_CONFIG = join(join(dir, ".fox"), "config.toml");
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

  test("timeout_ms is the agent's call: above the old 5-minute cap", async () => {
    // used to be clamped to 300_000; a 10-minute budget must survive a short
    // eval untouched (the clamp was silent, so assert on the accepted value)
    const r = await replRun({ code: "(await new Promise((res) => setTimeout(() => res('slow-ok'), 20)))", timeout_ms: 600_000 }, ctx);
    expect(r.ok).toBe(true);
    expect(r.output).toContain("slow-ok");
  });

  test("timeout_ms: 0 is the same as omitting it — both mean no bound", async () => {
    const t0 = Date.now();
    // would be killed at any positive timeout, but a no-timeout eval must run
    const r = await replRun({ code: 'await new Promise((res) => setTimeout(() => res("no-timeout-ok"), 1200))', timeout_ms: 0 }, ctx);
    expect(r.ok).toBe(true);
    expect(r.output).toContain("no-timeout-ok");
    expect(Date.now() - t0).toBeGreaterThanOrEqual(1000);
  }, 30_000);

  test("there is no default timeout: an omitted timeout_ms is unbounded", async () => {
    // The default used to be 30s, which killed legitimate long computations.
    // A 3.5s eval with no timeout_ms must NOT be cut — proving the deadline is
    // absent rather than merely generous, since 3.5s would outlive a small one.
    const t0 = Date.now();
    const r = await replRun({ code: 'await new Promise((res) => setTimeout(() => res("ran-to-completion"), 3500))' }, ctx);
    expect(r.ok).toBe(true);
    expect(r.output).toContain("ran-to-completion");
    expect(Date.now() - t0).toBeGreaterThanOrEqual(3400);
  }, 30_000);

  test("a negative timeout_ms is rejected, not silently clamped", async () => {
    const r = await replRun({ code: "1", timeout_ms: -5 }, ctx);
    expect(r.ok).toBe(false);
    expect(r.output).toContain("timeout_ms");
  });

  test("full environment: process, timers, fetch, and dynamic import all work", async () => {
    // no sandbox anywhere else in fox-agent (exec runs anything), so the
    // scratchpad is a full environment too — process, timers, fetch, and a
    // working dynamic import() all resolve against the host
    // a single expression (no declaration) so the expression-first path
    // wraps it cleanly: `await import()` + array literal + join
    const r = await replRun(
      { code: '(await import("node:fs")).existsSync("/") ? [typeof process, typeof setTimeout, typeof fetch, "fs-ok"].join(",") : "fs-no"' },
      ctx,
    );
    expect(r.ok).toBe(true);
    expect(r.output).toContain("object,function,function,fs-ok");
  });

  test("timers actually fire (not just present)", async () => {
    const r = await replRun({ code: 'await new Promise((res) => setTimeout(() => res("timer-fired"), 5))' }, ctx);
    expect(r.ok).toBe(true);
    expect(r.output).toContain("timer-fired");
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

  test("an argument the tool does not declare is refused here too", async () => {
    // the same refusal a step's call gets — this path skips the turn loop, so
    // without it a typo'd field would silently do nothing from the scratchpad.
    // `signal` is NOT the probe: exec really does declare it (and would kill a
    // job), so a typo of `cmd` is what must be caught.
    const r = await replRun({ code: 'await tools.call("exec", { cmo: "echo hi" })' }, ctx);
    expect(r.ok).toBe(false);
    expect(r.output).toContain('unknown argument "cmo"');
  });

  test("a declared argument still passes through the bridge", async () => {
    const r = await replRun({ code: 'await tools.call("exec", { cmd: "echo declared-arg-ok" })' }, ctx);
    expect(r.ok).toBe(true);
    expect(r.output).toContain("declared-arg-ok");
  });

  test("repl-in-repl nesting is capped", async () => {
    let code = "1";
    for (let i = 0; i < 5; i++) code = `await tools.call("repl", { code: ${JSON.stringify(code)} })`;
    const r = await replRun({ code }, ctx);
    expect(r.ok).toBe(false);
    expect(r.output).toContain("too deep");
  }, 30_000);
});

describe("repl background jobs", () => {
  test("background returns an id immediately; poll reads the result", async () => {
    const r0 = await replRun({ code: '"hello-bg"', background: true, label: "compute" }, ctx);
    expect(r0.ok).toBe(true);
    expect(r0.output).toMatch(/^job r\d+ started \(compute\)/);
    const id = /job (r\d+) started/.exec(r0.output)![1];
    await new Promise((r) => setTimeout(r, 200)); // let the eval finish
    const p = await replRun({ job: id }, ctx);
    expect(p.ok).toBe(true);
    expect(p.output).toContain("finished");
    expect(p.output).toContain("hello-bg");
  }, 30_000);

  test("poll returns incremental console output while running", async () => {
    const r0 = await replRun({ code: 'console.log("part-a"); await new Promise(r => setTimeout(r, 300)); console.log("part-b"); "done"', background: true }, ctx);
    const id = /job (r\d+) started/.exec(r0.output)![1];
    // poll mid-run: sees part-a, not part-b yet
    const p1 = await replRun({ job: id }, ctx);
    expect(p1.output).toContain("running");
    expect(p1.output).toContain("part-a");
    expect(p1.output).not.toContain("part-b");
    await new Promise((r) => setTimeout(r, 400)); // let it finish
    // settled poll: delivers the console output produced since the last poll
    const p2 = await replRun({ job: id }, ctx);
    expect(p2.ok).toBe(true);
    expect(p2.output).toContain("finished");
    expect(p2.output).toContain("part-b");
  }, 30_000);

  test("kill a running job stops it; polling a killed job errors", async () => {
    const r0 = await replRun({ code: 'await new Promise(r => setTimeout(r, 60000)); "never"', background: true }, ctx);
    const id = /job (r\d+) started/.exec(r0.output)![1];
    const k = await replRun({ job: id, signal: "kill" }, ctx);
    expect(k.ok).toBe(true);
    expect(k.output).toContain("killed");
    // a killed job is reaped — polling it is an error
    const after = await replRun({ job: id }, ctx);
    expect(after.ok).toBe(false);
    expect(after.output).toContain("no job");
  }, 30_000);

  test("jobs survive across repl calls in the session", async () => {
    const r0 = await replRun({ code: '"cross-call-value"', background: true, label: "xcall" }, ctx);
    const id = /job (r\d+) started/.exec(r0.output)![1];
    await new Promise((r) => setTimeout(r, 200));
    // a fresh repl call (no code) polls the job started by a previous call
    const p = await replRun({ job: id }, ctx);
    expect(p.ok).toBe(true);
    expect(p.output).toContain("cross-call-value");
  }, 30_000);

  test("a live background job does not steal a foreground eval's console lines", async () => {
    // The job is parked on an await, so it is still "active" while the next
    // call runs. Console capture used to route through one module-global
    // activeJob: the foreground line went into the JOB's log (and vanished
    // from the foreground result), and the job's own line was later reported
    // as the foreground's.
    const r0 = await replRun(
      { code: 'globalThis.go = new Promise((r) => (globalThis.release = r)); await go; console.log("JOB_LINE"); "job done"', background: true, label: "console" },
      ctx,
    );
    const id = /job (r\d+) started/.exec(r0.output)![1];

    const fg = await replRun({ code: 'console.log("FOREGROUND"); return "fg-done";' }, ctx);
    expect(fg.output).toBe("FOREGROUND\nfg-done");

    await replRun({ code: "release()" }, ctx);
    let poll = await replRun({ job: id }, ctx);
    for (let i = 0; i < 50 && poll.output.includes("running"); i++) {
      await new Promise((r) => setTimeout(r, 20));
      poll = await replRun({ job: id }, ctx);
    }
    expect(poll.output).toContain("JOB_LINE");
    expect(poll.output).not.toContain("FOREGROUND"); // it belongs to the other eval
  }, 30_000);

  test("a chatty job keeps its newest lines and reports what it dropped", async () => {
    // 2500 lines against a 2000-line cap: the oldest 500 are gone before the
    // first poll, and the poll has to SAY so rather than silently skipping
    const r0 = await replRun(
      { code: 'for (let i = 0; i < 2500; i++) console.log("LINE" + i); return "done";', background: true, label: "chatty" },
      ctx,
    );
    const id = /job (r\d+) started/.exec(r0.output)![1];
    // a poll consumes what it returns, so a job that finishes between two
    // polls has its log in the FIRST one: accumulate rather than assert on the
    // last response only
    let seen = "";
    for (let i = 0; i < 100; i++) {
      const poll = await replRun({ job: id }, ctx);
      seen += `\n${poll.output}`;
      if (!poll.output.includes("running")) break;
      await new Promise((r) => setTimeout(r, 20));
    }
    const lines = seen.split("\n");
    expect(seen).toContain("earlier line(s) dropped");
    expect(lines).toContain("LINE500"); // first retained
    expect(lines).toContain("LINE2499");
    expect(lines).not.toContain("LINE0");
    expect(lines).not.toContain("LINE499");
  }, 30_000);

  test("a single gigantic console line is capped too", async () => {
    const r0 = await replRun({ code: 'console.log("X".repeat(5000)); return "done";', background: true, label: "wide" }, ctx);
    const id = /job (r\d+) started/.exec(r0.output)![1];
    let seen = "";
    for (let i = 0; i < 100; i++) {
      const poll = await replRun({ job: id }, ctx);
      seen += `\n${poll.output}`;
      if (!poll.output.includes("running")) break;
      await new Promise((r) => setTimeout(r, 20));
    }
    const wide = seen.split("\n").find((l) => l.startsWith("XXX"))!;
    expect(wide).toBeTruthy();
    expect(wide.length).toBeLessThan(2_100);
    expect(wide.endsWith("…")).toBe(true);
  }, 30_000);

  test("poll with no code but no job errors cleanly", async () => {
    const r = await replRun({ job: "r999" }, ctx);
    expect(r.ok).toBe(false);
    expect(r.output).toContain("no job r999");
  }, 30_000);

  test("a background job's tool calls outlive the turn that started it", async () => {
    // esc aborts the TURN. A job's lifetime is the session's, so its `tools.call`
    // must run under the JOB's signal: the bridge used to close over ctx.signal,
    // so the first subprocess a job started after an interrupt was killed with
    // `exit 143 (interrupted)` and the job died with the turn it had outlived.
    const turn = new AbortController();
    const bgCtx = { ...ctx, signal: turn.signal } as unknown as ToolContext;
    const r0 = await replRun(
      {
        code: 'await new Promise((r) => setTimeout(r, 150));\nconst out = await tools.call("exec", { cmd: "echo STILL-ALIVE" });\nreturn out;',
        background: true,
        label: "bg-exec",
      },
      bgCtx,
    );
    const id = /job (r\d+) started/.exec(r0.output)![1];
    turn.abort(); // the user interrupted the turn; the job keeps going
    let poll = await replRun({ job: id }, ctx);
    for (let i = 0; i < 50 && poll.output.includes("running"); i++) {
      await new Promise((r) => setTimeout(r, 20));
      poll = await replRun({ job: id }, ctx);
    }
    expect(poll.ok).toBe(true);
    expect(poll.output).toContain("finished");
    expect(poll.output).toContain("STILL-ALIVE");
    expect(poll.output).not.toContain("143");
  }, 30_000);

  test("a foreground eval's tool calls still die with the turn", async () => {
    // the other half of the same rule: a foreground eval IS the turn's work, so
    // interrupting the turn must kill its subprocesses (measured as
    // `exit 143 (interrupted)`) rather than leave them running detached
    const turn = new AbortController();
    const fgCtx = { ...ctx, signal: turn.signal } as unknown as ToolContext;
    const run = replRun({ code: 'await tools.call("exec", { cmd: "sleep 20" }); return "never";' }, fgCtx);
    await new Promise((r) => setTimeout(r, 200));
    turn.abort();
    const r = await run;
    expect(r.ok).toBe(false);
    expect(r.output).toContain("interrupted");
  }, 30_000);
});

describe("repl: a foreground eval streams its console live", () => {
  // The row used to sit on the label "repl" for the whole run with no sign of
  // progress, even though `exec` streams. A foreground eval is often the longest
  // call in a turn, so it gets the same live feed — throttled, UI-only, and the
  // model still receives just the final result.
  test("console lines reach the host through tool_output, tagged with the call", async () => {
    const events: { type: string; id?: string; delta?: string }[] = [];
    const r = await replRun(
      { code: 'console.log("first"); await new Promise(r => setTimeout(r, 200)); console.log("second"); return "done";' },
      { ...ctx, emit: (ev: any) => events.push(ev), callId: "call-7" } as unknown as ToolContext,
    );
    expect(r.ok).toBe(true);
    // the model's result is unchanged: both lines, plus the value
    expect(r.output).toBe("first\nsecond\ndone");
    const streamed = events.filter((e) => e.type === "tool_output");
    expect(streamed.length).toBeGreaterThan(0);
    expect(streamed.every((e) => e.id === "call-7")).toBe(true);
    // the two lines are 200ms apart and the flush threshold is 120ms, so the
    // feed is genuinely incremental rather than one dump at the end
    expect(streamed.length).toBeGreaterThan(1);
    expect(streamed.map((e) => e.delta).join("")).toBe("first\nsecond\n");
  }, 30_000);

  test("a failing eval still flushes what it printed", async () => {
    const events: any[] = [];
    const r = await replRun(
      { code: 'console.log("printed before the throw"); throw new Error("boom");' },
      { ...ctx, emit: (ev: any) => events.push(ev), callId: "c9" } as unknown as ToolContext,
    );
    expect(r.ok).toBe(false);
    expect(r.output).toContain("boom");
    expect(events.map((e) => e.delta ?? "").join("")).toContain("printed before the throw");
  }, 30_000);

  test("with no host to emit to, nothing changes", async () => {
    const r = await replRun({ code: 'console.log("quiet"); return 1;' }, ctx);
    expect(r).toEqual({ ok: true, output: "quiet\n1" });
  }, 30_000);
});
