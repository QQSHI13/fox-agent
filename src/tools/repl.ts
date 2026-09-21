/**
 * In-process JavaScript scratchpad, as a bundled plugin.
 *
 * The whole point is what it is NOT: no shell, no subprocess, no `bun` CLI
 * on PATH (the compiled binary ships without one). It evaluates in a
 * persistent `node:vm` context per session, so variables, functions and
 * imports survive across calls — a scratchpad, not a one-shot `bun -e`.
 *
 * From code the agent reaches its own tools directly (`tools.call`), shell
 * included, without shell-quoting hell: compute over data instead of pasting
 * data into context. Direct calls bypass the turn loop's beforeTool/afterTool
 * hooks (documented in the def) — they are invocations, not steps.
 */
import vm from "node:vm";
import type { ToolDef } from "../providers/types.ts";
import type { ToolContext, ToolResult } from "./types.ts";
import { fail, ok } from "./types.ts";
import { outCap } from "./files.ts";

export const replDef: ToolDef = {
  name: "repl",
  description:
    "Fast in-process JavaScript scratchpad (no shell, no subprocess — works in the compiled binary with no bun on PATH). State persists across calls in this session: assign once (`rows = ...`), reuse for twenty turns. `return` (or a trailing expression) becomes the result; `console.log` lines are captured alongside it. Reach your tools from code as `await tools.call(name, args)` (shell included: `await tools.call(\"exec\", {cmd})`); `tools.list()` and `tools.search(\"...\")` discover them. Direct tool calls bypass the turn loop's beforeTool/afterTool hooks. Standard JS builtins only — no timers, fetch, process or require. A hanging eval is killed at timeout_ms.",
  parameters: {
    type: "object",
    properties: {
      code: { type: "string", description: "JavaScript to evaluate: a bare expression (or await) completes to its value; multi-statement blocks need an explicit return" },
      reset: { type: "boolean", description: "Drop the session's scratchpad state before evaluating" },
      timeout_ms: { type: "number", description: "Kill a hanging eval after this long, default 30000" },
    },
    required: ["code"],
  },
};

/** Session-nesting depth of repl-in-repl calls; unbounded nesting is a hang with extra steps. */
const MAX_REPL_DEPTH = 3;
const depths = new Map<string, number>();

interface ReplSession {
  context: vm.Context;
  log: string[];
}

const sessions = new Map<string, ReplSession>();

function sessionState(sessionId: string): ReplSession {
  let s = sessions.get(sessionId);
  if (!s) {
    s = { context: vm.createContext({}), log: [] };
    sessions.set(sessionId, s);
  }
  return s;
}

/** Session end: drop the scratchpad. In-memory only — nothing to kill. */
export function cleanupRepl(sessionId: string): void {
  sessions.delete(sessionId);
  depths.delete(sessionId);
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
  if (typeof args.code !== "string" || !args.code.trim()) return fail("error: repl needs code");
  if (!ctx.tools) return fail("error: repl has no tool registry in this context");
  if ((depths.get(ctx.sessionId) ?? 0) >= MAX_REPL_DEPTH) {
    return fail(`error: repl nesting too deep (>${MAX_REPL_DEPTH}) — compute directly instead`);
  }
  if (args.reset) cleanupRepl(ctx.sessionId);
  const timeout = Math.min(300_000, Math.max(1_000, args.timeout_ms ?? 30_000));
  const state = sessionState(ctx.sessionId);
  state.log.length = 0;

  const tools = ctx.tools;
  const sessionId = ctx.sessionId;
  const bridge = {
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
      // nested repl calls count against the same depth budget
      const child = tool.def.name === "repl" ? { depth: (depths.get(sessionId) ?? 0) + 1 } : null;
      if (child) depths.set(sessionId, child.depth);
      try {
        // direct invocation: validated like a step's call, but outside the
        // turn loop, so no live streaming and no beforeTool/afterTool hooks
        const r = await tool.run((callArgs ?? {}) as any, { ...ctx, emit: undefined, callId: undefined });
        const result = typeof r === "string" ? { ok: true, output: r } : r;
        if (!result.ok) throw new Error(result.output.slice(0, 500));
        return result.output;
      } finally {
        if (child) depths.set(sessionId, (depths.get(sessionId) ?? 1) - 1);
      }
    },
  };

  const sandbox = state.context as Record<string, unknown>;
  sandbox.tools = bridge;
  sandbox.console = { log: (...a: unknown[]) => void state.log.push(a.map((x) => fmt(x)).join(" ")) };
  try {
    // expression-first: `40+2`, `x = 1`, `await foo()` complete to values,
    // which is what a scratchpad is for. Anything that is not one expression
    // (declarations, loops, multi-statement blocks — end those with an
    // explicit `return`) falls back to statement form. Only SyntaxError falls
    // through: runtime failures are the answer, not a retry signal.
    const expr = args.code.replace(/;+\s*$/, "");
    let value: unknown;
    try {
      value = await vm.runInContext(`(async () => (${expr}))()`, state.context, { timeout });
    } catch (e) {
      if (e instanceof SyntaxError) value = await vm.runInContext(`(async () => {\n${args.code}\n})()`, state.context, { timeout });
      else throw e;
    }
    const body = [state.log.join("\n"), fmt(value)].filter(Boolean).join("\n").trimEnd() || "(no output)";
    return ok(body.length > outCap() ? body.slice(-outCap()) + "\n… (head truncated)" : body);
  } catch (e) {
    const msg = (e as Error).message ?? String(e);
    const stack = (e as Error).stack?.split("\n").slice(0, 4).join("\n");
    return fail(`error: ${msg}${stack && !msg.includes("\n") ? `\n${stack}` : ""}`);
  }
}
