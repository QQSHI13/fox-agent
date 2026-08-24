/**
 * fox deliberately runs tools with full machine access (see README), but that
 * is about filesystem and process reach — not about handing our own provider
 * credentials to every subprocess. Strip them so a command the model runs
 * can't read the key that is driving the model.
 */
const SECRET_PATTERNS = [/^FOX_API_KEY$/, /^ANTHROPIC_API_KEY$/, /^OPENAI_API_KEY$/, /_API_KEY$/, /^FOX_AUTH/];

export function childEnv(extra?: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v === undefined) continue;
    if (SECRET_PATTERNS.some((re) => re.test(k))) continue;
    out[k] = v;
  }
  // explicit per-server env still wins — the user asked for those to be passed
  return extra ? { ...out, ...extra } : out;
}
