/**
 * guard-hook — protected-path refusal implemented as a `beforeTool` hook.
 *
 * ## What it is
 *
 * A working guard, placed where the plugin system most obviously invites one:
 * the turn loop's per-call hook. It refuses any `exec` whose command mentions a
 * protected path, and returns that refusal as the tool's result so the
 * `tool_call` / `tool_result` pairing stays intact and the transcript is never
 * malformed.
 *
 * ## What it cannot do
 *
 * It fires for a tool call made by a step. It never fires for a call made from
 * inside a `repl` eval. `repl` is this harness's code mode: its `tools.call(...)`
 * bridge invokes the tool's `run` directly, outside the loop —
 * `src/plugins/bundled/repl.ts:452` says so in its own comment: *"validated like
 * a step's call, but outside the turn loop, so no live streaming and no
 * beforeTool/afterTool hooks."*
 *
 * So a loop like this executes every iteration with no hook consulted:
 *
 *     for (const p of paths) await tools.call("exec", { cmd: `rm -f ${p}` })
 *
 * That is the whole point of shipping this file next to `guard-entry`: it is a
 * correct guard in the wrong layer, and the difference is measurable. Compare
 * the two by running the same task with each enabled.
 *
 * ## Second limitation
 *
 * The match is on the command as typed. A command assembled from pieces —
 * `"rm -f /etc/ho" + "sts"` — contains no complete path, so nothing matches.
 * `guard-entry` resolves paths before comparing and is not fooled.
 *
 * ## Enabling it
 *
 *     plugins = ["/absolute/path/to/plugins/guard-hook/index.ts"]
 *
 * in the global config. `GUARD_PROTECT` overrides the protected list
 * (colon-separated, default `/etc/hosts`).
 */
import type { FoxPlugin, BeforeToolContext, BeforeToolPatch } from "fox-agent/sdk";

/** Paths this guard refuses to let a command touch. */
const PROTECTED = (process.env.GUARD_PROTECT ?? "/etc/hosts").split(":").filter(Boolean);

/** Does the command string mention a protected path, in any obvious spelling? */
function mentionsProtected(cmd: string): string | null {
  const flat = cmd.replace(/\s+/g, " ");
  for (const p of PROTECTED) if (flat.includes(p)) return p;
  return null;
}

export const name = "guard-hook";
export const description = "refuses protected-path deletes from a beforeTool hook — bypassed by code mode";

export const hooks = {
  beforeTool(c: BeforeToolContext): BeforeToolPatch | void {
    if (c.name !== "exec") return;
    const cmd = (c.args as { cmd?: unknown })?.cmd;
    if (typeof cmd !== "string") return;
    const hit = mentionsProtected(cmd);
    if (!hit) return;
    // `output` skips the run and becomes the tool result. Returning the refusal
    // as the result (instead of throwing) is what keeps the transcript valid:
    // an assistant tool_call with no matching result is rejected by providers.
    return { output: `error: refused by guard-hook — ${hit} is protected` };
  },
};

export default { name, hooks } satisfies FoxPlugin;
