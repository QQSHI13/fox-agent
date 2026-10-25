// The skills loader: discovery, SKILL.md frontmatter, the config key, and the
// prompt section it feeds.
//
// Split by what each part can prove:
//   - the loader is unit-testable against real directories on disk
//   - the config key's tilde/config-dir resolution and its `trusted` gate are
//     tested through `loadConfig`, because that is the only place they apply
//   - the prompt section is checked for byte-stability, because it lands inside
//     the cache prefix and a per-turn change there re-bills the whole history
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadSkills, resetSkills } from "../src/skills/load.ts";

let home: string;
let skills: string;

function skillFile(dir: string, name: string, content: string): string {
  mkdirSync(dir, { recursive: true });
  const p = join(dir, `${name}.md`);
  writeFileSync(p, content);
  return p;
}

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "fox-skills-"));
  skills = join(home, "skills");
  mkdirSync(skills, { recursive: true });
  resetSkills();
});

afterEach(() => {
  resetSkills();
  rmSync(home, { recursive: true, force: true });
});

describe("skills discovery", () => {
  test("a collection directory yields one skill per subdirectory with a SKILL.md", () => {
    skillFile(join(skills, "alpha"), "SKILL", "---\nname: alpha\ndescription: does alpha things\n---\n\n# Alpha\n");
    skillFile(join(skills, "beta"), "SKILL", "---\nname: beta\ndescription: does beta things\n---\n");
    // a subdirectory WITHOUT a SKILL.md is not a skill and must not warn —
    // reference/asset folders are normal inside a skill collection
    mkdirSync(join(skills, "references"), { recursive: true });

    const { skills: found, warnings } = loadSkills([skills]);
    expect(found.map((s) => s.name)).toEqual(["alpha", "beta"]);
    expect(found[0]!.description).toBe("does alpha things");
    expect(warnings).toEqual([]);
  });

  test("a directory that IS one skill is accepted too", () => {
    const dir = join(home, "single");
    skillFile(dir, "SKILL", "---\nname: solo\ndescription: one skill, own folder\n---\n");
    const { skills: found } = loadSkills([dir]);
    expect(found).toHaveLength(1);
    expect(found[0]!.name).toBe("solo");
    expect(found[0]!.path).toBe(join(dir, "SKILL.md"));
  });

  test("dot-directories are skipped, so a .git in a skills checkout contributes nothing", () => {
    skillFile(join(skills, ".hidden"), "SKILL", "---\nname: hidden\ndescription: nope\n---\n");
    skillFile(join(skills, "real"), "SKILL", "---\nname: real\ndescription: yes\n---\n");
    expect(loadSkills([skills]).skills.map((s) => s.name)).toEqual(["real"]);
  });

  test("a missing directory warns by name instead of throwing", () => {
    const { skills: found, warnings } = loadSkills([join(home, "nope")]);
    expect(found).toEqual([]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("does not exist");
  });

  test("duplicate names keep the first and warn about the second", () => {
    skillFile(join(skills, "a"), "SKILL", "---\nname: dup\ndescription: first\n---\n");
    skillFile(join(skills, "b"), "SKILL", "---\nname: dup\ndescription: second\n---\n");
    const { skills: found, warnings } = loadSkills([skills]);
    expect(found).toHaveLength(1);
    expect(found[0]!.description).toBe("first");
    expect(warnings[0]).toContain("already uses that name");
  });
});

describe("SKILL.md frontmatter", () => {
  test("no frontmatter falls back to the directory name and first prose line", () => {
    mkdirSync(join(skills, "plain"), { recursive: true });
    writeFileSync(
      join(skills, "plain", "SKILL.md"),
      "# A Heading\n\nThis skill does plain things.\n\nMore text.\n",
    );
    const { skills: found } = loadSkills([skills]);
    expect(found[0]!.name).toBe("plain");
    expect(found[0]!.description).toBe("This skill does plain things.");
  });

  test("a folded block description is collapsed to one line", () => {
    mkdirSync(join(skills, "folded"), { recursive: true });
    writeFileSync(
      join(skills, "folded", "SKILL.md"),
      "---\nname: folded\ndescription: |\n  line one\n  line two\n---\n",
    );
    expect(loadSkills([skills]).skills[0]!.description).toBe("line one line two");
  });

  test("a long description is truncated rather than shipped whole", () => {
    mkdirSync(join(skills, "long"), { recursive: true });
    writeFileSync(join(skills, "long", "SKILL.md"), `---\nname: long\ndescription: ${"x".repeat(900)}\n---\n`);
    const d = loadSkills([skills]).skills[0]!.description;
    expect(d.length).toBeLessThanOrEqual(401);
    expect(d.endsWith("…")).toBe(true);
  });

  test("malformed YAML degrades to the fallbacks instead of failing the directory", () => {
    mkdirSync(join(skills, "bad"), { recursive: true });
    writeFileSync(join(skills, "bad", "SKILL.md"), "---\nname: [unclosed\ndescription: x\n---\n\nBody prose.\n");
    const { skills: found, warnings } = loadSkills([skills]);
    expect(warnings).toEqual([]);
    expect(found[0]!.name).toBe("bad");
    expect(found[0]!.description).toBe("Body prose.");
  });

  test("unknown frontmatter fields are ignored, not an error", () => {
    mkdirSync(join(skills, "meta"), { recursive: true });
    writeFileSync(
      join(skills, "meta", "SKILL.md"),
      '---\nname: meta\ndescription: has metadata\nversion: "1.0.8"\nmetadata:\n  openclaw:\n    emoji: "🕷"\n---\n',
    );
    expect(loadSkills([skills]).skills[0]!.name).toBe("meta");
  });
});

describe("the skills config key", () => {
  test("a global entry expands ~ and is discovered", async () => {
    const { loadConfig } = await import("../src/core/config.ts");
    const cfgPath = join(home, "config.toml");
    skillFile(join(skills, "alpha"), "SKILL", "---\nname: alpha\ndescription: a\n---\n");
    writeFileSync(cfgPath, `skills = ["${skills}"]\n`);
    process.env.FOX_AGENT_CONFIG = cfgPath;
    try {
      resetSkills();
      const cfg = loadConfig({ cwd: home, configPath: cfgPath });
      expect(cfg.skills).toEqual([skills]);
      expect(cfg.skillList.map((s) => s.name)).toEqual(["alpha"]);
    } finally {
      delete process.env.FOX_AGENT_CONFIG;
    }
  });

  test("a relative entry resolves against the config file's own directory", async () => {
    const { loadConfig } = await import("../src/core/config.ts");
    const cfgDir = join(home, "cfg");
    mkdirSync(cfgDir, { recursive: true });
    skillFile(join(cfgDir, "myskills", "alpha"), "SKILL", "---\nname: alpha\ndescription: a\n---\n");
    const cfgPath = join(cfgDir, "config.toml");
    writeFileSync(cfgPath, 'skills = ["./myskills"]\n');
    resetSkills();
    const cfg = loadConfig({ cwd: home, configPath: cfgPath });
    expect(cfg.skills).toEqual([join(cfgDir, "myskills")]);
    expect(cfg.skillList.map((s) => s.name)).toEqual(["alpha"]);
  });

  test("a project config's skills are ignored in an untrusted directory, with a warning", async () => {
    const { loadConfig } = await import("../src/core/config.ts");
    skillFile(join(skills, "alpha"), "SKILL", "---\nname: alpha\ndescription: a\n---\n");
    const repo = join(home, "repo");
    mkdirSync(repo, { recursive: true });
    writeFileSync(join(repo, "fox-agent.toml"), `skills = ["${skills}"]\n`);
    // an explicit --config must exist, so name a real (empty) one
    const cfgPath = join(home, "config.toml");
    writeFileSync(cfgPath, "");
    resetSkills();
    const cfg = loadConfig({ cwd: repo, configPath: cfgPath, trusted: false });
    expect(cfg.skills).toEqual([]);
    expect(cfg.skillList).toEqual([]);
    expect(cfg.warnings.some((w) => w.includes("skills") && w.includes("untrusted"))).toBe(true);
  });

  test("the same project config applies in a trusted directory", async () => {
    const { loadConfig } = await import("../src/core/config.ts");
    skillFile(join(skills, "alpha"), "SKILL", "---\nname: alpha\ndescription: a\n---\n");
    const repo = join(home, "repo");
    mkdirSync(repo, { recursive: true });
    writeFileSync(join(repo, "fox-agent.toml"), `skills = ["${skills}"]\n`);
    const cfgPath = join(home, "config.toml");
    writeFileSync(cfgPath, "");
    resetSkills();
    const cfg = loadConfig({ cwd: repo, configPath: cfgPath, trusted: true });
    expect(cfg.skillList.map((s) => s.name)).toEqual(["alpha"]);
  });

  test("an unknown 'skills' key is not reported as a typo", async () => {
    const { loadConfig } = await import("../src/core/config.ts");
    const cfgPath = join(home, "config.toml");
    writeFileSync(cfgPath, 'skills = []\n');
    resetSkills();
    const cfg = loadConfig({ cwd: home, configPath: cfgPath });
    expect(cfg.warnings.filter((w) => w.includes("unknown key"))).toEqual([]);
  });
});

describe("the prompt section", () => {
  const tools = async () => {
    const { buildSystemPrompt } = await import("../src/loop/prompt.ts");
    const read = { name: "read", description: "read a file", parameters: {} } as never;
    return (skills?: readonly { name: string; description: string; path: string }[]) =>
      buildSystemPrompt({ tools: [read], skills });
  };

  test("lists each skill by name, description and path", async () => {
    const build = await tools();
    const sys = build([{ name: "alpha", description: "does alpha", path: "/x/alpha/SKILL.md" }]);
    expect(sys).toContain("<skills>");
    expect(sys).toContain("- alpha: does alpha (/x/alpha/SKILL.md)");
    expect(sys).toContain("</skills>");
  });

  test("is absent with no skills, and absent when read is not available", async () => {
    const { buildSystemPrompt } = await import("../src/loop/prompt.ts");
    expect(buildSystemPrompt({ tools: [] })).not.toContain("<skills>");
    // a path list with no read tool to follow it is a dead end
    const sys = buildSystemPrompt({
      tools: [{ name: "exec", description: "run", parameters: {} } as never],
      skills: [{ name: "alpha", description: "d", path: "/x/SKILL.md" }],
    });
    expect(sys).not.toContain("<skills>");
  });

  test("is byte-stable across builds, so it stays inside the cache prefix", async () => {
    const build = await tools();
    const list = [{ name: "alpha", description: "a", path: "/x/a/SKILL.md" }];
    expect(build(list)).toBe(build(list));
  });

  test("the skill body is never inlined — only its path and description", async () => {
    mkdirSync(join(skills, "alpha"), { recursive: true });
    writeFileSync(
      join(skills, "alpha", "SKILL.md"),
      "---\nname: alpha\ndescription: short summary\n---\n\nSECRET BODY TEXT\n",
    );
    const found = loadSkills([skills]).skills;
    const build = await tools();
    const sys = build(found);
    expect(sys).toContain("short summary");
    expect(sys).not.toContain("SECRET BODY TEXT");
  });
});
