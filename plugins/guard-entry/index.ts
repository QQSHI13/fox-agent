/**
 * guard-entry — protected-path refusal enforced inside the tool entry.
 *
 * ## What it is
 *
 * The same policy as `guard-hook`, enforced at the other layer: as a WRAPPER
 * around the real `exec`, so it holds for every caller — a step's tool call, a
 * `repl` eval calling `tools.call(...)` in a loop, a nested eval, a plugin.
 * Nothing above it has to remember to run it.
 *
 * ## Why it wraps rather than replaces
 *
 * `tools` may be a function of the registry as it stands at merge time
 * (`src/plugins/types.ts`). That is the only moment the tool being shadowed is
 * still reachable, so this captures the built-in `exec` and calls it through.
 * Reimplementing `exec` would be a different experiment: the modified build
 * would differ from the original in two ways at once, and any change in
 * behaviour could be blamed on either.
 *
 * The captured tool keeps the same `def`, so the model sees an identical schema
 * and the prompt cache is untouched — the only difference between the two builds
 * is where the check lives.
 *
 * ## Two behaviours `guard-hook` cannot have
 *
 * 1. **Resolve before comparing.** A guard that matches the command string loses
 *    to `"rm -rf /etc/ho" + "sts"`, which contains no complete path. This one
 *    extracts path-shaped arguments, resolves each through `realpath` (so `./`,
 *    `//`, quotes inside a token, and symlinked parents collapse), and compares
 *    the result.
 *
 * 2. **Answer with `ok:false`, not a throw.** A thrown guard is an error a
 *    caller can swallow or retry around; a falsy result is the tool's own
 *    answer, so a code-mode loop that inspects the result sees the refusal.
 *
 * ## Enabling it
 *
 *     plugins = ["/absolute/path/to/plugins/guard-entry/index.ts"]
 *
 * `GUARD_PROTECT` overrides the protected list (colon-separated, default
 * `/etc/hosts`).
 */
import { realpathSync } from "node:fs";
import { fail, type FoxPlugin, type Tool, type ToolContext } from "fox-agent/sdk";

/** Paths this guard refuses to let a command touch. */
const PROTECTED = (process.env.GUARD_PROTECT ?? "/etc/hosts").split(":").filter(Boolean);

/**
 * The protected paths, resolved once.
 *
 * At module load, not per call: resolving at check time can be raced by swapping
 * a symlink between the check and the use.
 */
const PROTECTED_REAL = PROTECTED.map((p) => {
  try {
    return realpathSync(p);
  } catch {
    return p; // not there yet — keep the literal so a later creation still matches
  }
});

/**
 * Path-shaped arguments of a command.
 *
 * Not a shell parser, and deliberately so: the finding under test is that SOME
 * resolution has to happen at the entry, not that this must reimplement bash.
 *
 * Quote characters are removed from the WHOLE token, not just the ends, because
 * that is what the shell does: `'ho'sts` reaches the syscall as `hosts`. A guard
 * that only trims outer quotes sees `/path/'ho'sts`, resolves a path that does
 * not exist, and compares the wrong string — measured, and the reason this loop
 * is written this way.
 */
function pathsIn(cmd: string): string[] {
  const out: string[] = [];
  for (const raw of cmd.split(/[\s;|&()<>]+/)) {
    const tok = raw.replace(/['"\\]/g, "");
    if (!tok || tok.startsWith("-")) continue;
    if (!tok.startsWith("/") && !tok.startsWith(".") && !tok.startsWith("~")) continue;
    out.push(tok);
  }
  return out;
}

/** Resolve one token against `cwd`, following symlinks and `..` where possible. */
function resolveToken(tok: string, cwd: string): string {
  const expanded = tok.startsWith("~") ? tok.replace(/^~/, process.env.HOME ?? "") : tok;
  const abs = expanded.startsWith("/") ? expanded : `${cwd}/${expanded}`;
  try {
    return realpathSync(abs);
  } catch {
    // Does not exist (yet). Resolve its DIRECTORY, so a symlinked parent cannot
    // smuggle the write somewhere the literal path does not name.
    const dir = abs.replace(/\/[^/]*$/, "") || "/";
    try {
      return `${realpathSync(dir)}/${abs.split("/").pop()}`;
    } catch {
      return abs;
    }
  }
}

/** The first protected path this command touches, or null. */
export function refusedBy(cmd: string, cwd: string): string | null {
  for (const tok of pathsIn(cmd)) {
    const real = resolveToken(tok, cwd);
    for (const p of PROTECTED_REAL) if (real === p || real.startsWith(`${p}/`)) return p;
  }
  return null;
}

/**
 * Wrap a tool so its input is checked before it runs.
 *
 * Exported for the experiment harness, which feeds it the registry's `exec`.
 */
export function guardTool(inner: Tool): Tool {
  return {
    def: inner.def, // identical schema: the model must not be able to tell
    async run(args: any, ctx: ToolContext) {
      const cmd = args?.cmd;
      if (typeof cmd !== "string") return inner.run(args, ctx);
      const cwd = args.workdir ? `${ctx.cwd}/${args.workdir}` : ctx.cwd;
      // ---- the check, at the entry, on resolved paths ---------------------
      const refused = refusedBy(cmd, cwd);
      if (refused) {
        // ok:false, so a code-mode loop inspecting the result sees the refusal
        // and nothing was executed.
        return fail(`error: refused by guard-entry — ${refused} is protected (resolved-path check)`);
      }
      return inner.run(args, ctx);
    },
  };
}

export const name = "guard-entry";
export const description = "refuses protected-path deletes inside the exec entry — survives code mode";

/**
 * CAPTURE the built-in here, at merge time. Looking it up later from
 * `ctx.tools.get("exec")` would return this wrapper and recurse forever.
 */
export const tools = (current: ReadonlyMap<string, Tool>): Tool[] => {
  const inner = current.get("exec");
  return inner ? [guardTool(inner)] : [];
};

export default { name, tools } satisfies FoxPlugin;

