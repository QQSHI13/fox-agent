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
import { realpathSync, globSync } from "node:fs";
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
 * The path-shaped arguments of a command, with the directory each one is
 * relative to.
 *
 * Not a shell parser, and deliberately so: the finding under test is that SOME
 * resolution has to happen at the entry, not that this must reimplement bash.
 *
 * Three things here are the result of measuring, not of guessing — each was a
 * case this function got WRONG before `scripts/guard-probe.ts` existed:
 *
 * 1. Quotes are removed from the WHOLE token, not just the ends: the shell does
 *    that, so `'ho'sts` reaches the syscall as `hosts`. Trimming only the edges
 *    resolved a path that does not exist and compared the wrong string.
 *
 * 2. A RELATIVE token is still a path. Filtering to `/`, `.` and `~` prefixes
 *    dropped `rm -f sub/hosts` and `rm -f hosts` entirely — the guard never saw
 *    them, so `aliasdir/hosts` (a symlinked parent) deleted the protected file.
 *
 * 3. `cd` moves the base for everything after it. Resolving `cd protected && rm
 *    -f hosts` against the original cwd named a file that does not exist while
 *    the shell deleted the protected one.
 *
 * What it still cannot see: command substitution whose output is a path, and
 * any path a program resolves for itself (`python3 -c "os.remove(…)"`). Those
 * need the shell's own expansion or a sandbox, which is the honest boundary of
 * a tokenizer — and it is the same boundary the hook had, only one layer lower.
 */
function pathsIn(cmd: string): { token: string; base: string }[] {
  const out: { token: string; base: string }[] = [];
  let base = ""; // "" = the call's cwd
  const vars = new Map<string, string>();
  const tokens = splitTokens(cmd);
  for (let i = 0; i < tokens.length; i++) {
    let raw = tokens[i]!;
    // `NAME=value` assigns for the rest of this command line. Tracked because
    // `P=<protected>; rm -f "$P"` deleted it while every literal token was innocent.
    const assign = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(raw);
    if (assign) {
      vars.set(assign[1]!, expandVars(stripQuotes(assign[2]!), vars));
      continue;
    }
    raw = expandVars(raw, vars);
    const tok = stripQuotes(raw);
    if (!tok || tok.startsWith("-")) continue;
    // `cd X` retargets every token after it
    if (tok === "cd") {
      const next = stripQuotes(expandVars(tokens[i + 1] ?? "", vars));
      if (next && !next.startsWith("-")) {
        base = base ? resolveJoin(base, next) : next;
        i++;
      }
      continue;
    }
    // A GLOB is expanded by the shell before any program sees it. Expanding it
    // here is not extra caution: `rm -f /etc/host*` deleted the protected file
    // while the literal token named nothing — measured, guard-probe case "glob".
    if (/[*?[]/.test(tok)) {
      for (const hit of expandGlob(tok, base)) out.push({ token: hit, base: "" });
      continue;
    }
    out.push({ token: tok, base });
  }
  return out;
}

/**
 * Split a command line on shell word boundaries, respecting quotes.
 *
 * Whitespace inside quotes does not separate words: `rm -f "/a b/hosts"` is ONE
 * argument. Splitting naively on whitespace broke that path into two tokens,
 * neither of which resolved to the protected file — the guard then allowed a
 * command the shell would have executed as a delete. Measured, guard-probe case
 * "path with space".
 */
function splitTokens(cmd: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quote: string | null = null;
  for (let i = 0; i < cmd.length; i++) {
    const ch = cmd[i]!;
    if (quote) {
      cur += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      cur += ch;
      continue;
    }
    if (/[\s;|&()<>]/.test(ch)) {
      if (cur) out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}

/** Remove quote characters wherever they sit in a token — what the shell does. */
function stripQuotes(tok: string): string {
  return tok.replace(/['"]/g, "");
}

/** Replace `$NAME`, `${NAME}`, `$1`-free subset with what this command assigned. */
function expandVars(tok: string, vars: Map<string, string>): string {
  return tok.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}|\$([A-Za-z_][A-Za-z0-9_]*)/g, (whole, a, b) => {
    const name = a ?? b;
    return vars.get(name) ?? whole; // unknown stays as-is and simply won't resolve
  });
}

/** Absolute results of expanding one glob pattern, or [] when nothing matches. */
function expandGlob(pattern: string, base: string): string[] {
  const rel = base ? resolveJoin(base, pattern) : pattern;
  try {
    return globSync(rel, { cwd: process.cwd() }).map(String);
  } catch {
    return [];
  }
}

/** Join a relative token onto a base, leaving absolute tokens alone. */
function resolveJoin(base: string, tok: string): string {
  if (tok.startsWith("/")) return tok;
  return `${base.replace(/\/+$/, "")}/${tok}`;
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
  for (const { token, base } of pathsIn(cmd)) {
    const real = resolveToken(token, base ? resolveToken(base, cwd) : cwd);
    for (const p of PROTECTED_REAL) if (real === p || real.startsWith(`${p}/`)) return p;
  }
  // Second pass: does the protected path appear LITERALLY anywhere in the
  // command, quotes and all?
  //
  // This exists because the first pass is a tokenizer, and a tokenizer can be
  // made blind by constructs it does not model. `rm -f "$(echo /p/hosts)"` and
  // `python3 -c "os.remove('/p/hosts')"` both name the file in plain text while
  // resolving it somewhere the token walk never looks.
  //
  // Worth being honest about the history: the FIRST version of this file caught
  // both of those by accident. It split on whitespace without respecting
  // quotes, which shredded `"$(echo /p/hosts)"` into the piece `/p/hosts` and
  // matched. Making the splitter quote-aware (needed: `rm -f "/a b/hosts"` is
  // one argument) removed the accident and the two cases leaked. A guard that
  // was right for the wrong reason is one refactor away from being wrong, so the
  // behaviour is now stated on purpose.
  const flat = cmd.replace(/['"\\]/g, "");
  for (const p of PROTECTED) if (flat.includes(p)) return p;
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

