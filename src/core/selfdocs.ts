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
 * no import.meta.glob) and is written out, fingerprint-stamped: when the
 * embedded text changes, the dir is wiped and rewritten, so files never
 * contradict the binary that serves them. See `docsFingerprint` for why the
 * stamp hashes content and does not trust the version number alone.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { createHash } from "node:crypto";
import { join } from "path";
import { agentHome } from "../core/paths.ts";
import { VERSION as version } from "../core/version.ts";
import hacking from "../../docs/agent/hacking.md" with { type: "text" };
import index from "../../docs/agent/index.md" with { type: "text" };
import config from "../../docs/agent/config.md" with { type: "text" };
import plugins from "../../docs/agent/plugins.md" with { type: "text" };
import tools from "../../docs/agent/tools.md" with { type: "text" };
import sessionsAcp from "../../docs/agent/sessions-acp.md" with { type: "text" };
import themesTui from "../../docs/agent/themes-tui.md" with { type: "text" };

const EMBEDDED: Record<string, string> = {
  index,
  hacking,
  config,
  plugins,
  tools,
  "sessions-acp": sessionsAcp,
  "themes-tui": themesTui,
};

/** docs/agent/<name>.md → content, keyed by bare file name ("config"). */
export function agentDocs(): Record<string, string> {
  return EMBEDDED;
}

/** Materialized root — where the agent should be told to read. */
export function agentDocsDir(): string {
  return join(agentHome(), "docs");
}

/**
 * Fingerprint of the embedded doc set: the binary version plus a hash of every
 * doc's text.
 *
 * The version alone is NOT enough, and relying on it shipped a real bug: A2A was
 * deleted on 2026-11-01 (commit ff030e7) with no version bump, so a running 0.7.0
 * binary saw its stamp match and kept serving a `sessions-acp.md` that still
 * documented `fox --a2a` and `url = "..."` delegation. Any doc edit that lands
 * without a release was invisible to every already-installed binary. Hashing the
 * content makes the freshness check answer the question it claims to answer —
 * "do the files on disk match the docs compiled into this binary?" — regardless
 * of whether anyone bumped a version.
 */
function docsFingerprint(): string {
  const h = createHash("sha256").update(version);
  for (const name of Object.keys(EMBEDDED).sort()) {
    // length-prefixed so a shifted boundary between two docs cannot collide
    h.update(`\u0000${name}\u0000${EMBEDDED[name].length}\u0000`);
    h.update(EMBEDDED[name]);
  }
  return `v${version} ${h.digest("hex").slice(0, 32)}`;
}

/**
 * Write the embedded docs to `agentHome()/docs/`. A stamp file carrying the
 * fingerprint above forces a rewrite whenever the embedded text (or the version)
 * changes; same fingerprint + all files present = no writes (the common case —
 * this runs per system-prompt build, but its steady-state cost is a handful of
 * stat()s, so it needs no memo: a memo keyed on anything weaker than the
 * freshness check would serve a stale dir after a test or an admin deletes a
 * file under it).
 */
export function ensureAgentDocs(): string {
  const dir = agentDocsDir();
  try {
    const stamp = join(dir, ".version");
    const expected = docsFingerprint();
    const fresh =
      existsSync(stamp) &&
      readFileSync(stamp, "utf-8").trim() === expected &&
      Object.keys(EMBEDDED).every((name) => existsSync(join(dir, `${name}.md`)));
    if (fresh) return dir;
    // stale or partial: replace wholesale — a doc removed from the source tree
    // must not linger on disk claiming to be current
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    for (const [name, content] of Object.entries(EMBEDDED)) {
      writeFileSync(join(dir, `${name}.md`), content);
    }
    writeFileSync(stamp, expected + "\n");
    return dir;
  } catch {
    // docs are a convenience — a read-only home must not break startup
    return agentDocsDir();
  }
}
