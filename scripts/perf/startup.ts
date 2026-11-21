#!/usr/bin/env bun
/**
 * Startup loading microbenchmark.
 *
 * Developer tool, not a CI gate: timings vary by machine. It builds synthetic
 * skill directories and plugin files in a scratch directory, points the agent
 * paths at that scratch, then reports the median cost of a cold and a warm
 * `loadSkills` / `loadPlugins` call. Cold means the loader cache was reset, so
 * the filesystem is walked again.
 *
 * Usage: bun scripts/perf/startup.ts [iterations]
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const scratch = mkdtempSync(join(tmpdir(), "fox-startup-perf-"));
// Hermetic: never touch the developer's real agent home or config.
process.env.FOX_AGENT_HOME = join(scratch, "home");
process.env.FOX_AGENT_CONFIG = join(scratch, "config.toml");
mkdirSync(process.env.FOX_AGENT_HOME, { recursive: true });

const { loadSkills, resetSkills } = await import("../../src/skills/load.ts");
const { loadPlugins, resetPlugins } = await import("../../src/plugins/load.ts");

const COLLECTIONS = 6;
const SKILLS_PER_COLLECTION = 20;
const PLUGINS = 24;
const ITERATIONS = Math.max(5, Number(process.argv[2] ?? 15) || 15);
const WARMUP = 3;

const skillsRoot = join(scratch, "skills");
const pluginDir = join(scratch, "plugins");
mkdirSync(pluginDir, { recursive: true });

const skillDirs: string[] = [];
const skillFile = (name: string, description: string): string =>
  `---\nname: ${name}\ndescription: ${description}\n---\n\n# ${name}\n`;

for (let c = 0; c < COLLECTIONS; c++) {
  const dir = join(skillsRoot, `collection-${c}`);
  for (let s = 0; s < SKILLS_PER_COLLECTION; s++) {
    const sub = join(dir, `skill-${c}-${s}`);
    mkdirSync(sub, { recursive: true });
    writeFileSync(join(sub, "SKILL.md"), skillFile(`skill-${c}-${s}`, `synthetic skill ${c}/${s}`));
  }
  // a reference folder with no SKILL.md must be skipped without warning
  mkdirSync(join(dir, "references"), { recursive: true });
  skillDirs.push(dir);
}
// one directory that IS a single skill, exercising the other accepted layout
const singleSkill = join(skillsRoot, "solo");
mkdirSync(singleSkill, { recursive: true });
writeFileSync(join(singleSkill, "SKILL.md"), skillFile("solo", "single skill layout"));
skillDirs.push(singleSkill);

const pluginPaths: string[] = [];
for (let p = 0; p < PLUGINS; p++) {
  const id = `plugin-${p}`;
  const entry = join(pluginDir, `${id}.ts`);
  writeFileSync(entry, `export default { name: ${JSON.stringify(id)} };\n`);
  writeFileSync(
    join(pluginDir, `${id}.plugin.json`),
    JSON.stringify({ id, version: "1.0.0", entry: `${id}.ts`, permissions: [], contributes: {} }),
  );
  pluginPaths.push(entry);
}

function median(samples: number[]): number {
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

function report(label: string, samples: number[]): void {
  console.log(`${label} median_ms=${median(samples).toFixed(3)}`);
}

function measureSkills(label: string, before: () => void) {
  for (let i = 0; i < WARMUP; i++) {
    before();
    loadSkills(skillDirs);
  }
  const samples: number[] = [];
  let count = 0;
  let warnings = 0;
  for (let i = 0; i < ITERATIONS; i++) {
    before();
    const t0 = performance.now();
    const res = loadSkills(skillDirs);
    samples.push(performance.now() - t0);
    count = res.skills.length;
    warnings = res.warnings.length;
  }
  report(label, samples);
  return { count, warnings };
}

async function measurePlugins(label: string, before: () => void) {
  for (let i = 0; i < WARMUP; i++) {
    before();
    await loadPlugins(pluginPaths, scratch);
  }
  const samples: number[] = [];
  let count = 0;
  let warnings = 0;
  for (let i = 0; i < ITERATIONS; i++) {
    before();
    const t0 = performance.now();
    const res = await loadPlugins(pluginPaths, scratch);
    samples.push(performance.now() - t0);
    count = res.plugins.length;
    warnings = res.warnings.length;
  }
  report(label, samples);
  return { count, warnings };
}

try {
  const coldSkills = measureSkills("skills_cold", resetSkills);
  const warmSkills = measureSkills("skills_warm", () => {});
  const coldPlugins = await measurePlugins("plugins_cold", resetPlugins);
  const warmPlugins = await measurePlugins("plugins_warm", () => {});

  console.log(
    `skills cold=${coldSkills.count} warm=${warmSkills.count} warnings=${coldSkills.warnings}`,
  );
  console.log(
    `plugins cold=${coldPlugins.count} warm=${warmPlugins.count} warnings=${coldPlugins.warnings}`,
  );
} finally {
  resetSkills();
  resetPlugins();
  rmSync(scratch, { recursive: true, force: true });
}
