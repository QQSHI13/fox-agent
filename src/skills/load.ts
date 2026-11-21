/**
 * Load skills: directories containing `SKILL.md` files.
 *
 * A skill is documentation the agent may choose to read — deliberately NOT
 * prompt content. Only `name`, `description` and the file's path reach the
 * system prompt (see `loop/prompt.ts`); the body is loaded on demand with the
 * ordinary `read` tool, exactly like `selfdocs.ts` routes to the built-in docs.
 * Inlining bodies would re-bill every skill on every request, which is the cost
 * this indirection exists to avoid.
 *
 * Modeled on `src/plugins/load.ts` for the same reason it is modeled on
 * `src/tools/mcp.ts`: a broken skill directory must warn, never throw. The
 * user's next turn should still run when one SKILL.md has a stray tab in it.
 *
 * Two layouts are accepted per configured directory:
 *
 *   <dir>/SKILL.md            the directory IS one skill
 *   <dir>/<name>/SKILL.md     a collection (the OpenClaw layout)
 *
 * Both, rather than one, because a `skills` key pointing at a single skill's
 * own folder reads as naturally as one pointing at a folder of them, and
 * guessing wrong would silently find nothing.
 */
import { readFileSync, readdirSync, type Dirent } from "node:fs";
import { join } from "node:path";
import { isDir } from "../core/fs.ts";

export interface SkillInfo {
  /** from frontmatter, else the containing directory's name */
  name: string;
  /** from frontmatter, else the file's first prose line */
  description: string;
  /** absolute path to the SKILL.md the agent should read */
  path: string;
}

/** Frontmatter is capped: a runaway YAML block must not be parsed per turn. */
const FRONTMATTER_CAP = 8_192;
/** Description cap, in chars — this text ships in every request's system block. */
const DESCRIPTION_CAP = 400;

/** Cap a description, marking the cut so a truncated one does not read as complete. */
function capText(s: string): string {
  return s.length > DESCRIPTION_CAP ? `${s.slice(0, DESCRIPTION_CAP).trimEnd()}…` : s;
}

let cache: { key: string; skills: SkillInfo[]; warnings: string[] } | null = null;

/**
 * Split a leading `---` YAML block off a SKILL.md.
 *
 * A file without frontmatter is not an error: the layout that matters is "a
 * folder with a SKILL.md in it", and requiring YAML would reject the plainest
 * possible skill. Returns an empty object for that case so the caller falls
 * back to what it can see — the directory name and the first prose line.
 */
function splitFrontmatter(text: string): { data: Record<string, unknown>; body: string } {
  const head = text.slice(0, FRONTMATTER_CAP);
  if (!/^---\r?\n/.test(head)) return { data: {}, body: text };
  // the closing fence must be on its own line; `\r?\n` because a Windows-edited
  // SKILL.md otherwise never closes and the whole file parses as YAML
  const end = /\r?\n---[ \t]*(\r?\n|$)/.exec(head.slice(3));
  if (!end) return { data: {}, body: text };
  const yaml = head.slice(3, 3 + end.index);
  const bodyStart = 3 + end.index + end[0].length;
  try {
    const parsed = Bun.YAML.parse(yaml);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return { data: parsed as Record<string, unknown>, body: text.slice(bodyStart) };
    }
  } catch {
    // a typo'd fence is a warning the caller can't attribute to a field, so the
    // file degrades to no-frontmatter instead of failing the whole directory
  }
  return { data: {}, body: text.slice(bodyStart) };
}

/** First line of prose — skipping blanks, headings and bare fences. */
function firstProseLine(body: string): string {
  for (const raw of body.split("\n").slice(0, 40)) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || line.startsWith("```") || line.startsWith("---")) continue;
    return capText(line);
  }
  return "";
}

/**
 * Read one SKILL.md into a SkillInfo, or say why it could not.
 *
 * `missing` is separate from `error` so discovery can probe the standard
 * `<dir>/<name>/SKILL.md` path with a read instead of a stat-then-read pair:
 * a directory that simply has no SKILL.md is not a skill and must stay silent.
 */
function readSkill(file: string, dirName: string): { skill: SkillInfo } | { error: string } | { missing: true } {
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return { missing: true };
    return { error: `cannot read ${file}: ${(e as Error).message.slice(0, 200)}` };
  }
  const { data, body } = splitFrontmatter(text);
  const rawName = typeof data.name === "string" ? data.name.trim() : "";
  const rawDesc = typeof data.description === "string" ? data.description.trim() : "";
  // A name is what the prompt line and every warning about this skill are keyed
  // on, so it must never be empty — the directory name is the honest fallback.
  const name = rawName || dirName;
  if (!name) return { error: `${file} has no name and no usable directory name` };
  // YAML folds a block scalar into one long line; the prompt lists this per
  // skill, so it is collapsed to a sentence-ish length rather than shipped whole
  const flat = rawDesc.replace(/\s+/g, " ").trim();
  const description =
    capText(flat || firstProseLine(body)) || `Skill at ${file} (no description given)`;
  return { skill: { name, description, path: file } };
}

/**
 * Import each configured directory, collecting skill metadata.
 *
 * Cached on the directory list: `buildSystemPrompt` runs on every step, and a
 * cache miss there would mean re-walking the filesystem (and re-parsing YAML)
 * on each one. `resetSkills` is the escape hatch — `/reload` re-reads config,
 * which changes the key, but a skill file edited in place under the same key
 * still needs the tests' explicit reset.
 */
export function loadSkills(dirs: string[]): { skills: SkillInfo[]; warnings: string[] } {
  const key = JSON.stringify(dirs);
  if (cache?.key === key) return { skills: cache.skills, warnings: cache.warnings };

  const skills: SkillInfo[] = [];
  const warnings: string[] = [];
  const seen = new Set<string>();

  const add = (file: string, dirName: string) => {
    const res = readSkill(file, dirName);
    if ("missing" in res) return;
    if ("error" in res) {
      warnings.push(`skill ${res.error}`);
      return;
    }
    const { name } = res.skill;
    // two directories offering the same name would give the model two paths for
    // one name and no way to know which is meant
    if (seen.has(name)) {
      warnings.push(`skill '${name}' at ${file} skipped: another skill already uses that name`);
      return;
    }
    seen.add(name);
    skills.push(res.skill);
  };

  for (const raw of dirs) {
    const dir = raw.trim();
    if (!dir) continue;
    // One readdir with dirents answers "does it exist", "is it a directory",
    // and "which children are directories" at once. The previous existsSync +
    // statSync pair was two syscalls per configured directory, and another stat
    // per child just to learn its type.
    let entries: Dirent[];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if (code === "ENOENT") warnings.push(`skills directory '${dir}' does not exist`);
      else if (code === "ENOTDIR") warnings.push(`skills entry '${dir}' is not a directory`);
      else warnings.push(`skills directory '${dir}' unreadable: ${(e as Error).message.slice(0, 200)}`);
      continue;
    }
    // A directory that IS one skill takes precedence over its children, and a
    // directory literally named SKILL.md still gets its read error reported.
    if (entries.some((entry) => entry.name === "SKILL.md")) {
      add(join(dir, "SKILL.md"), dir.split("/").filter(Boolean).pop() ?? "");
      continue;
    }
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    // dot-dirs are skipped by name rather than by trying to read them: `.git` in
    // a skills checkout would otherwise contribute a stat() per entry per load
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      // dirent types do not follow symlinks; a symlinked skill directory is
      // still a directory, so only those pay for a stat
      if (!entry.isDirectory() && !(entry.isSymbolicLink() && isDir(join(dir, entry.name)))) continue;
      add(join(dir, entry.name, "SKILL.md"), entry.name);
    }
  }

  cache = { key, skills, warnings };
  return { skills, warnings };
}

/** Drop the cache so the next `loadSkills` re-reads. Tests need this. */
export function resetSkills(): void {
  cache = null;
}
