import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "fox-selfdocs-"));
  process.env.FOX_AGENT_HOME = dir;
  process.env.FOX_AGENT_CONFIG = join(dir, "config.toml");
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("self docs", () => {
  test("ensureAgentDocs materializes every embedded doc with a version stamp", async () => {
    const { ensureAgentDocs, agentDocs, agentDocsDir } = await import("../src/core/selfdocs.ts");
    const docs = agentDocs();
    expect(Object.keys(docs).length).toBeGreaterThanOrEqual(4);
    const d = ensureAgentDocs();
    expect(d).toBe(agentDocsDir());
    for (const name of Object.keys(docs)) {
      const p = join(d, `${name}.md`);
      expect(existsSync(p)).toBe(true);
      expect(readFileSync(p, "utf-8")).toBe(docs[name]);
    }
    expect(readFileSync(join(d, ".version"), "utf-8").trim().length).toBeGreaterThan(0);

    // second call is a no-op path (stamp matches, files exist) — same dir
    expect(ensureAgentDocs()).toBe(d);
  });

  // Regression: the stamp used to be the bare version string, so a doc edit
  // that shipped without a version bump was invisible to installed binaries.
  // A2A was deleted on 2026-11-01 (ff030e7) with no bump, and every running
  // 0.7.0 binary kept serving a sessions-acp.md describing `fox --a2a`. The
  // stamp must therefore be a content fingerprint, and a legacy version-only
  // stamp must never count as fresh.
  test("the stamp fingerprints the doc content, not just the version", async () => {
    const { ensureAgentDocs, agentDocsDir, agentDocs } = await import("../src/core/selfdocs.ts");
    const d = ensureAgentDocs();
    const stamp = readFileSync(join(d, ".version"), "utf-8").trim();
    expect(stamp).toMatch(/^v\S+ [0-9a-f]{32}$/);

    // a legacy stamp (bare version, which is what older builds wrote) is stale
    // even though it names the running version
    const legacy = stamp.split(" ")[0].slice(1);
    writeFileSync(join(d, ".version"), legacy + "\n");
    writeFileSync(join(d, "config.md"), "RUINED\n");
    expect(ensureAgentDocs()).toBe(d);
    expect(readFileSync(join(d, "config.md"), "utf-8")).toBe(agentDocs().config);
    expect(readFileSync(join(d, ".version"), "utf-8").trim()).toBe(stamp);
    expect(agentDocsDir()).toBe(d);
  });

  test("a stale stamp forces a rewrite", async () => {
    const { ensureAgentDocs, agentDocsDir } = await import("../src/core/selfdocs.ts");
    const d = ensureAgentDocs();
    const victim = join(d, "config.md");
    rmSync(victim);
    // stamp still matches but a file is missing -> rewritten
    expect(ensureAgentDocs()).toBe(d);
    expect(existsSync(victim)).toBe(true);
  });

  test("/init returns a submit turn carrying the repo path and focus", async () => {
    const { runSlashCommand } = await import("../src/commands.ts");
    const state = { sessionId: "s", cwd: "/repo", provider: { baseUrl: "http://x", apiKey: "k", model: "m" } };
    const bare = runSlashCommand("/init", state)!;
    expect(bare.handled).toBe(true);
    expect(bare.submit).toContain("/repo");
    expect(bare.submit).toContain("AGENTS.md");
    expect(bare.submit).not.toContain("User-provided focus");
    const focused = runSlashCommand("/init only the build system", state)!;
    expect(focused.submit).toContain("only the build system");
  });

  test("buildSystemPrompt routes to the materialized docs dir", async () => {
    const { buildSystemPrompt } = await import("../src/loop/prompt.ts");
    const { agentDocsDir } = await import("../src/core/selfdocs.ts");
    const sys = buildSystemPrompt({ tools: [] });
    expect(sys).toContain("<self_documentation>");
    expect(sys).toContain(agentDocsDir());
    // the prompt routes to the docs dir but does NOT enumerate individual doc
    // files — that list is a per-token cost with no benefit (read on demand)
    expect(sys).not.toContain("plugins.md");
    expect(sys).not.toContain("config.md");
  });
});
