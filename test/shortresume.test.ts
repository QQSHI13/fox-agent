// shortResumeArg: the deterministic `fox -c <short>` selector printed in the
// exit hint. Unlike the old list index it never shifts when sessions are
// touched — it is a pure function of the id and the current session set, and
// resolveSessionArg accepts it through the existing search-term path.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "fox-shortres-"));
  process.env.FOX_AGENT_HOME = dir;
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

async function twoSessions() {
  const { createSession } = await import("../src/store/db.ts");
  const a = createSession("/w/a", "m1");
  const b = createSession("/w/b", "m1");
  return { a, b };
}

describe("shortResumeArg", () => {
  test("resolves round-trip through resolveSessionArg", async () => {
    const { shortResumeArg, resolveSessionArg } = await import("../src/commands.ts");
    const { a, b } = await twoSessions();

    for (const s of [a, b]) {
      const short = shortResumeArg(s.id, 50);
      expect(short.length).toBeLessThan(s.id.length);
      expect(short.length).toBeGreaterThanOrEqual(6);
      expect(resolveSessionArg(short, 50)).toBe(s.id);
    }
  });

  test("is stable across list churn — adding sessions does not change an older prefix's meaning", async () => {
    const { shortResumeArg, resolveSessionArg } = await import("../src/commands.ts");
    const { createSession } = await import("../src/store/db.ts");
    const { a } = await twoSessions();
    const short = shortResumeArg(a.id, 50);

    // five more sessions join the list — a list index would have shifted
    for (let i = 0; i < 5; i++) createSession(`/w/x${i}`, "m1");

    expect(resolveSessionArg(short, 50)).toBe(a.id);
  });

  test("prefixes are distinct between sessions with near-identical searchable text", async () => {
    const { shortResumeArg, resolveSessionArg } = await import("../src/commands.ts");
    const { createSession } = await import("../src/store/db.ts");
    // same cwd + model on purpose: only the ids can tell these apart
    const a = createSession("/w/same", "m1");
    const b = createSession("/w/same", "m1");
    const sa = shortResumeArg(a.id, 50);
    const sb = shortResumeArg(b.id, 50);
    expect(resolveSessionArg(sa, 50)).toBe(a.id);
    expect(resolveSessionArg(sb, 50)).toBe(b.id);
  });

  test("a colliding title extends the prefix instead of resolving wrong", async () => {
    const { shortResumeArg, resolveSessionArg } = await import("../src/commands.ts");
    const { createSession, setRefTitle } = await import("../src/store/db.ts");
    const { a } = await twoSessions();
    const short = shortResumeArg(a.id, 50);
    // a NEW session titled with a's short prefix — that prefix is now
    // ambiguous, so a's selector must GROW past it, not resolve to the wrong row
    const c = createSession("/w/other", "m1");
    setRefTitle(c.id, `session ${short} notes`);
    const grown = shortResumeArg(a.id, 50);
    expect(grown.length).toBeGreaterThan(short.length);
    expect(resolveSessionArg(grown, 50)).toBe(a.id);
  });

  test("prefix is unique against every other session's searchable text", async () => {
    const { shortResumeArg, resolveSessionArg } = await import("../src/commands.ts");
    const { createSession } = await import("../src/store/db.ts");
    // created back-to-back: ids share a timestamp head of varying length, so
    // the selector is whatever prefix first diverges — 6, 7, more — but it
    // must always round-trip
    const s = [];
    for (let i = 0; i < 4; i++) s.push(createSession(`/w/burst${i}`, "m1"));
    for (const x of s) {
      const short = shortResumeArg(x.id, 50);
      expect(short.length).toBeGreaterThanOrEqual(6);
      expect(resolveSessionArg(short, 50)).toBe(x.id);
    }
  });
});
