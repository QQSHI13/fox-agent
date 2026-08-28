/**
 * fox-agent deliberately runs tools with full machine access (see README), but that
 * is about filesystem and process reach — not about handing our own provider
 * credentials to every subprocess. Strip them so a command the model runs
 * can't read the key that is driving the model.
 */
const SECRET_PATTERNS = [/^FOX_AGENT_API_KEY$/, /^ANTHROPIC_API_KEY$/, /^OPENAI_API_KEY$/, /_API_KEY$/, /^FOX_AGENT_AUTH/];

/**
 * @param extra  per-server / per-call additions; these win over the inherited env.
 * @param cwd    the directory the child is actually being spawned into. When
 *               given, `PWD` is pinned to it instead of inheriting fox-agent's own,
 *               which would otherwise disagree with the real cwd. This matters
 *               for children spawned *without* a shell — an MCP server reading
 *               `os.environ["PWD"]`, say. Anything launched through `bash -c`
 *               (i.e. `exec`) is already covered, because bash recomputes `PWD`
 *               and unsets `OLDPWD` for its own children on startup; passing the
 *               cwd there just means the env is right before bash fixes it.
 */
export function childEnv(extra?: Record<string, string>, cwd?: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v === undefined) continue;
    if (SECRET_PATTERNS.some((re) => re.test(k))) continue;
    out[k] = v;
  }
  if (cwd) {
    out.PWD = cwd;
    // a stale OLDPWD is worse than none: `cd -` would jump somewhere unrelated
    delete out.OLDPWD;
  }
  // explicit per-server env still wins — the user asked for those to be passed
  return extra ? { ...out, ...extra } : out;
}
