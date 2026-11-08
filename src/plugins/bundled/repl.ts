/**
 * In-process JavaScript environment, as a bundled plugin.
 *
 * A persistent `node:vm` context per session, seeded with the real host
 * environment — `process`, timers, `Buffer`, `fetch`, and working dynamic
 * `import()`. The model already has full machine control through `exec`
 * (which runs anything, including `node -e "process.exit()"`), so the
 * scratchpad deliberately offers the same power: sandboxing one tool while
 * every other tool runs unrestricted would be theater, not safety.
 *
 * From code the agent reaches its own tools directly (`tools.call`), shell
 * included, without shell-quoting hell: compute over data instead of pasting
 * data into context. Direct calls bypass the turn loop's beforeTool/afterTool
 * hooks (documented in the def) — they are invocations, not steps.
 *
 * FOREGROUND ONLY. There is no `background` flag, no job id, and no polling: a
 * call not waited on past `autoBackgroundMs` is taken over by the turn loop,
 * which owns the placeholder row, the kill switch and the delivery of the
 * result. One mechanism for every tool beats a special one for this tool.
 */
import vm from "node:vm";
import { safeDelay, setLongTimeout, type LongTimeout } from "../../core/timers.ts";
import type { ToolDef } from "../../providers/types.ts";
import type { ToolContext, ToolResult } from "../../core/tool.ts";
import { fail, ok, validateArgs } from "../../core/tool.ts";


export const replDef: ToolDef = {
  name: "repl",
  description:
    "In-process JavaScript environment (no shell, no subprocess — works in the compiled binary with no bun on PATH). Full environment: `process`, timers, `fetch`, and dynamic `import()` all work. State persists across calls in this session: assign once (`rows = ...`), reuse for twenty turns. `return` (or a trailing expression) becomes the result; `console.log` lines are captured alongside it. Reach your tools from code as `await tools.call(name, args)` (shell included: `await tools.call(\"exec\", {cmd})`); `tools.list()` and `tools.search(\"...\")` discover them. Direct tool calls bypass the turn loop's beforeTool/afterTool hooks. There is NO default timeout: an eval runs as long as it needs, so pass `timeout_ms` when you want a bound (omit it, or 0, for none). There is no background flag: a call that runs past the harness's auto-background threshold is taken over by the turn loop — its result arrives as its own message and the harness tells you how to stop it, so you never poll and never manage a job id.",

  parameters: {
    type: "object",
    properties: {
      code: { type: "string", description: "JavaScript to evaluate: a bare expression (or await) completes to its value; multi-statement blocks need an explicit return." },
      reset: { type: "boolean", description: "Drop the session's scratchpad state before evaluating" },
      timeout_ms: { type: "number", description: "Optional bound in milliseconds; there is NO default — omit it (or pass 0) to run for as long as the eval needs, with no upper bound. vm cannot preempt a running eval, so an omitted bound on a hung eval blocks the call until the turn is interrupted." },
    },
    required: [],
  },
};

/** Session-nesting depth of repl-in-repl calls; unbounded nesting is a hang with extra steps. */
const MAX_REPL_DEPTH = 3;
const depths = new Map<string, number>();

interface ReplSession {
  context: vm.Context;
}

const sessions = new Map<string, ReplSession>();

/**
 * The host globals a fresh scratchpad starts with.
 *
 * These are seeded once, at context creation — and they are the REAL host
 * bindings, not stand-ins, because the whole point is a full environment:
 * `exec` already runs anything, so a hobbled repl adds friction, not safety.
 * A dynamic `import()` inside the eval resolves through
 * `importModuleDynamically` (Bun's vm supports it; the probe confirmed it),
 * so `await import("node:fs")` works exactly as it does in the harness itself.
 */
function seed(): Record<string, unknown> {
  return {
    process,
    console,
    Buffer,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    setImmediate,
    clearImmediate,
    queueMicrotask,
    fetch,
    URL,
    URLSearchParams,
    TextEncoder,
    TextDecoder,
    AbortController,
    AbortSignal,
    atob,
    btoa,
    structuredClone,
  };
}

function sessionState(sessionId: string): ReplSession {
  let s = sessions.get(sessionId);
  if (!s) {
    s = { context: vm.createContext(seed()) };
    sessions.set(sessionId, s);
  }
  return s;
}

// No background machinery lives here: a call the loop stops waiting on is
// adopted by the turn loop (src/loop/background.ts), which owns the placeholder,
// the kill switch and the delivery of the result. One mechanism, every tool.

/** Session end: drop the scratchpad for this session. */
export function cleanupRepl(sessionId: string): void {
  sessions.delete(sessionId);
  depths.delete(sessionId);
}

function evalInContext(state: ReplSession, code: string, timeout: number, consoleObj: Record<string, unknown>, toolsObj: Record<string, unknown>): Promise<unknown> {
  // timeout 0 = no bound at all: vm's sync `timeout` is omitted (it means
  // "infinite" when 0, but leaving it out is explicit) and the hang timer is
  // never armed. vm's own `timeout` is a plain setTimeout value, so it shares
  // the 32-bit limit: a budget past ~24 days would overflow there and abort the
  // eval instantly. Clamp THAT to the ceiling — the promise race below carries
  // the real deadline with setLongTimeout.
  const runOptions: Record<string, unknown> = {
    ...(timeout > 0 ? { timeout: safeDelay(timeout) } : {}),
    importModuleDynamically: async (specifier: string) => import(specifier),
  };
  // expression-first: a bare expression completes to its value; anything that is
  // not one expression (declarations, loops, blocks — end those with `return`)
  // falls back to statement form. Only SyntaxError falls through: runtime
  // failures are the answer, not a retry signal.
  const expr = code.replace(/;+\s*$/, "");
  const raceEval = (body: string) => {
    // raceEval: eval vs a real timer, with the timer CLEARED when the eval wins
    // (a left-running timer rejecting a promise nobody awaits is an unhandled
    // rejection that blames the next tool call). vm's `timeout` only bounds
    // SYNCHRONOUS execution; these evals are async IIFEs, so a hung `await`
    // would otherwise ignore it forever.
    let timer: LongTimeout | undefined;
    const hang = new Promise<never>((_, rej) => {
      if (timeout <= 0) return; // timeout_ms: 0 — never race, never reject
      // setLongTimeout, not setTimeout: the agent may legitimately pass a budget
      // above the 32-bit wall, and a plain setTimeout would fire it after 1ms
      timer = setLongTimeout(() => rej(new Error(`eval exceeded timeout_ms (${timeout}ms) — likely a hung await; the eval keeps running detached and cannot be killed`)), timeout);
      timer.unref();
    });
    // The argument is evaluated synchronously by runInContext, so the binding
    // is captured before this call returns and the temporary global can be
    // removed again without affecting the running eval.
    const sandbox = state.context as Record<string, unknown>;
    let ran: Promise<unknown>;
    sandbox.__fox_repl_console = consoleObj;
    sandbox.__fox_repl_tools = toolsObj;
    try {
      ran = vm.runInContext(`(async (console, tools) => ${body})(__fox_repl_console, __fox_repl_tools)`, state.context, runOptions);
    } catch (e) {
      // a SYNCHRONOUS infinite loop (or a parse error) throws straight out of
      // runInContext — clear the timer there too, or it fires later into a
      // promise nobody is awaiting
      timer?.clear();
      throw e;
    } finally {
      delete sandbox.__fox_repl_console;
      delete sandbox.__fox_repl_tools;
    }
    return Promise.race([ran, hang]).finally(() => timer?.clear());
  };
  return (async () => {
    try {
      return await raceEval(`(${expr})`);
    } catch (e) {
      if (e instanceof SyntaxError) return await raceEval(`{\n${code}\n}`);
      throw e;
    }
  })();
}

function fmt(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === undefined) return "";
  try {
    const j = JSON.stringify(value);
    return j === undefined ? String(value) : j;
  } catch {
    return String(value);
  }
}

export async function replRun(
  args: { code?: string; reset?: boolean; timeout_ms?: number },
  ctx: ToolContext,
): Promise<ToolResult> {
  if (!ctx.tools) return fail("error: repl has no tool registry in this context");
  const sessionId = ctx.sessionId;

  if (typeof args.code !== "string" || !args.code.trim()) return fail("error: repl needs code");
  if ((depths.get(sessionId) ?? 0) >= MAX_REPL_DEPTH) {
    return fail(`error: repl nesting too deep (>${MAX_REPL_DEPTH}) — compute directly instead`);
  }
  if (args.reset) cleanupRepl(sessionId);
  // NO TIMEOUT BY DEFAULT (0 = unbounded). A silent default deadline was the
  // wrong shape for this tool: an eval is the agent's own computation, so "how
  // long may this take" is a question only the agent can answer, and a default
  // killed long computations that would have finished. A caller that wants a
  // bound passes one; nothing else is imposed.
  //
  // The cost is stated plainly because it is real: vm cannot preempt a running
  // eval, so an unbounded eval that hangs hangs the tool call until ESC aborts
  // the turn (the eval itself keeps running detached). That is a deliberate
  // trade — the old 30s default fired on legitimate work far more often than it
  // rescued anyone, and a user can always interrupt.
  const rawTimeout = args.timeout_ms ?? 0;
  if (!Number.isFinite(rawTimeout) || rawTimeout < 0) return fail("error: timeout_ms must be a non-negative number (0 = no timeout)");
  const timeout = rawTimeout === 0 ? 0 : Math.max(1, Math.floor(rawTimeout));
  const state = sessionState(sessionId);

  const tools = ctx.tools;
  /**
   * The `tools` bridge for ONE eval, closing over the signal its calls run under.
   *
   * This is per call, not per session, because of what an inherited signal
   * means: every background job was handed the bridge built for the turn that
   * STARTED it (and, before that, a module-global bridge that the newest call
   * overwrote), so esc — which aborts the TURN — killed the job's subprocesses
   * too. Measured: a job whose code awaited 300ms and then ran
   * `tools.call("exec", …)` died with `exit 143 (interrupted)` the moment the
   * turn was interrupted, and a job started with `signal: "kill"` left its own
   * exec child running. A job's lifetime is the session's: it takes the JOB's
   * signal, which only `signal: "kill"` (or session end) aborts. A foreground
   * eval takes the turn's, exactly as the caller asked.
   */
  const makeBridge = (signal: AbortSignal | undefined) => ({
    list: () => [...tools.values()].map((t) => ({ name: t.def.name, description: t.def.description })),
    search: (q: unknown) => {
      const needle = String(q ?? "").toLowerCase();
      return [...tools.values()]
        .filter((t) => !needle || t.def.name.toLowerCase().includes(needle) || t.def.description.toLowerCase().includes(needle))
        .map((t) => ({ name: t.def.name, description: t.def.description }));
    },
    call: async (name: unknown, callArgs: unknown) => {
      const tool = tools.get(String(name));
      if (!tool) throw new Error(`unknown tool ${String(name)}`);
      if (callArgs !== undefined && (typeof callArgs !== "object" || callArgs === null)) {
        throw new Error(`tool args must be a JSON object`);
      }
      const cargs = (callArgs ?? {}) as Record<string, unknown>;
      // Same unknown-argument refusal a step's call gets — this path skips the
      // turn loop's execToolCall, so without it `tools.call("exec", {job:"x"})`
      // from the scratchpad is the silent no-op it now is nowhere else.
      const schemaErr = validateArgs(tool.def.name, tool.def, cargs);
      if (schemaErr) throw new Error(schemaErr);
      // nested repl calls count against the same depth budget
      const child = tool.def.name === "repl" ? { depth: (depths.get(sessionId) ?? 0) + 1 } : null;
      if (child) depths.set(sessionId, child.depth);
      try {
        // direct invocation: validated like a step's call, but outside the
        // turn loop, so no live streaming and no beforeTool/afterTool hooks.
        // `signal` is the bridge's own — see makeBridge.
        const r = await tool.run(cargs as Record<string, unknown>, { ...ctx, signal, emit: undefined, callId: undefined });
        const result = typeof r === "string" ? { ok: true, output: r } : r;
        if (!result.ok) throw new Error(result.output.slice(0, 500));
        return result.output;
      } finally {
        if (child) depths.set(sessionId, (depths.get(sessionId) ?? 1) - 1);
      }
    },
  });

  const sandbox = state.context as Record<string, unknown>;
  // The eval wrapper below shadows this with its own binding; the global is the
  // fallback for code that reaches `globalThis.tools` explicitly. Each branch
  // replaces it with that eval's own bridge before running anything.
  sandbox.tools = makeBridge(undefined);
  /** A line-collecting console whose output goes to exactly one eval's sink. */
  const makeConsole = (sink: (line: string) => void): Record<string, unknown> => {
    const capture = () => (...a: unknown[]) => {
      sink(a.map((x) => (typeof x === "string" ? x : fmt(x))).join(" "));
    };
    return { log: capture(), info: capture(), warn: capture(), error: capture(), debug: capture() };
  };
  // The eval wrapper below shadows this with its own binding; the global is the
  // fallback for code that reaches `globalThis.console` explicitly. Each branch
  // replaces it with that eval's own console before running anything.
  sandbox.console = makeConsole(() => {});

  // ---- foreground eval ----
  // A per-call sink: two foreground calls (tools run in parallel within a step)
  // cannot steal each other's console lines either.
  const lines: string[] = [];
  // Console lines also stream to the host as they are produced, exactly like
  // exec's live output: a foreground eval is often the longest call in a turn
  // (it is the "compute over data" tool), and without this the row sat on the
  // label "repl" for the whole run with no sign of progress. Throttled so a
  // chatty loop costs a repaint, not a flood; the model still gets only the
  // final result. No emit/callId (a bare ToolContext, or tools.call from inside
  // another eval) simply skips the streaming.
  let pending = "";
  let lastFlush = 0;
  const streamLine = (line: string) => {
    lines.push(line);
    if (!ctx.emit || !ctx.callId) return;
    pending += `${line}\n`;
    const now = Date.now();
    if (now - lastFlush < 120) return;
    lastFlush = now;
    const delta = pending;
    pending = "";
    ctx.emit({ type: "tool_output", id: ctx.callId, delta });
  };
  /** Push anything the throttle is still holding, so the last lines are not lost. */
  const flushLines = () => {
    if (!pending || !ctx.emit || !ctx.callId) return;
    ctx.emit({ type: "tool_output", id: ctx.callId, delta: pending });
    pending = "";
  };
  const evalConsole = makeConsole(streamLine);
  sandbox.console = evalConsole;
  // a foreground eval IS the turn's work: esc killing its subprocesses is right
  const fgTools = makeBridge(ctx.signal);
  sandbox.tools = fgTools;
  try {
    const value = await evalInContext(state, args.code, timeout, evalConsole, fgTools);
    flushLines();
    const body = [lines.join("\n"), fmt(value)].filter(Boolean).join("\n").trimEnd() || "(no output)";
    // Full output returned; the turn loop stores it whole and applies the
    // presentation cap as a revertible view op (ctx restore brings it back).
    return ok(body);
  } catch (e) {
    flushLines();
    const msg = (e as Error).message ?? String(e);
    const stack = (e as Error).stack?.split("\n").slice(0, 4).join("\n");
    return fail(`error: ${msg}${stack && !msg.includes("\n") ? `\n${stack}` : ""}`);
  }
}
