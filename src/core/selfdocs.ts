/**
 * Agent-facing self-documentation: the docs under `docs/agent/` embedded into
 * the binary at build time and materialized as REAL FILES under
 * `agentHome()/docs/` at startup.
 *
 * Why materialize instead of just embedding: the agent explains fox-agent by
 * READING these files with its ordinary `read` tool — that is pi's mechanism
 * (system-prompt routing section → files on disk) and it needs paths that
 * exist. A compiled bun binary has no package dir to read from, so the text
 * rides inside the binary (explicit `with { type: "text" }` imports — bun has
 * no import.meta.glob) and is written out, version-stamped: when the running
 * binary's version changes, the dir is wiped and rewritten, so files never
 * contradict the binary that serves them.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { agentHome } from "../core/paths.ts";
import { VERSION as version } from "../core/version.ts";
import hacking from "../../docs/agent/hacking.md" with { type: "text" };
import config from "../../docs/agent/config.md" with { type: "text" };
import plugins from "../../docs/agent/plugins.md" with { type: "text" };
import sessionsAcp from "../../docs/agent/sessions-acp.md" with { type: "text" };
import themesTui from "../../docs/agent/themes-tui.md" with { type: "text" };

const EMBEDDED: Record<string, string> = { hacking, config, plugins, "sessions-acp": sessionsAcp, "themes-tui": themesTui };

/** docs/agent/<name>.md → content, keyed by bare file name ("config"). */
export function agentDocs(): Record<string, string> {
  return EMBEDDED;
}

/** Materialized root — where the agent should be told to read. */
export function agentDocsDir(): string {
  return join(agentHome(), "docs");
}

/**
 * Write the embedded docs to `agentHome()/docs/`. A stamp file carrying the
 * binary version forces a rewrite when the version changes; same version +
 * all files present = no writes (the common case — this runs per system-prompt
 * build, but its steady-state cost is a handful of stat()s, so it needs no
 * memo: a memo keyed on anything weaker than the freshness check would serve
 * a stale dir after a test or an admin deletes a file under it).
 */
export function ensureAgentDocs(): string {
  const dir = agentDocsDir();
  try {
    const stamp = join(dir, ".version");
    const fresh =
      existsSync(stamp) &&
      readFileSync(stamp, "utf-8").trim() === version &&
      Object.keys(EMBEDDED).every((name) => existsSync(join(dir, `${name}.md`)));
    if (fresh) return dir;
    // stale or partial: replace wholesale — a doc removed from the source tree
    // must not linger on disk claiming to be current
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    for (const [name, content] of Object.entries(EMBEDDED)) {
      writeFileSync(join(dir, `${name}.md`), content);
    }
    writeFileSync(join(dir, ".version"), version + "\n");
    return dir;
  } catch {
    // docs are a convenience — a read-only home must not break startup
    return agentDocsDir();
  }
}
