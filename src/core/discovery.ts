import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * Discovery and reading of well-known markdown documents — AGENTS.md,
 * CLAUDE.md, README.md, SKILL.md.
 *
 * One helper for all four because they share the same shape: a known filename
 * to find, a text body to read, and a caller that either injects the content
 * into the model's context (AGENTS.md, CLAUDE.md) or reads it on demand
 * (SKILL.md, README.md via /init). Splitting the discovery per call site was
 * how AGENTS.md and SKILL.md ended up with two independent walk-up walkers.
 */

/** Read a text file, capped and trimmed; "" on any error (missing, unreadable). */
export function readTextFile(path: string, cap = 8192): string {
  try {
    return readFileSync(path, "utf8").slice(0, cap).trim();
  } catch {
    return "";
  }
}

/**
 * Walk up from `cwd` collecting EVERY existing candidate, root-most first.
 *
 * Instructions nest: a monorepo root AGENTS.md and a package-local one both
 * apply, and the nearest one should get the last word, so it comes last.
 */
export function findUpAll(cwd: string, names: string[]): string[] {
  const found: string[] = [];
  let dir = cwd;
  for (;;) {
    for (const n of names) {
      const p = join(dir, n);
      if (existsSync(p)) found.push(p);
    }
    const parent = join(dir, "..");
    if (parent === dir) break;
    dir = parent;
  }
  return found.reverse();
}

/** Find the nearest single candidate (first hit walking up), or null. */
export function findUp(cwd: string, names: string[]): string | null {
  let dir = cwd;
  for (;;) {
    for (const n of names) {
      const p = join(dir, n);
      if (existsSync(p)) return p;
    }
    const parent = join(dir, "..");
    if (parent === dir) return null;
    dir = parent;
  }
}

/**
 * Every AGENTS.md / CLAUDE.md on the path from the filesystem root to cwd,
 * each labeled with the file it came from.
 *
 * The label is load-bearing, not decoration: instructions that say "run
 * ./scripts/x" mean the file's own directory, and a bare concatenation leaves
 * the model guessing which directory that is — or even whether the file came
 * from cwd at all.
 *
 * Files with byte-identical content are included once: the common
 * AGENTS.md-symlinked-to-CLAUDE.md (or copied) pairing would otherwise inject
 * the same text twice. The first (root-most) occurrence wins, and its label is
 * the correct one for relative paths.
 */
export function loadProjectInstructions(cwd: string): string {
  const seen = new Set<string>();
  return findUpAll(cwd, ["AGENTS.md", "CLAUDE.md"])
    .map((p) => {
      const text = readTextFile(p);
      if (!text || seen.has(text)) return "";
      seen.add(text);
      return `From ${p} (relative paths in it resolve against ${dirname(p)}):\n${text}`;
    })
    .filter(Boolean)
    .join("\n\n");
}
