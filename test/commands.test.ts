import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "fox-cmd-"));
  process.env.FOX_HOME = dir;
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

async function setup() {
  const db = await import("../src/store/db.ts");
  const cmds = await import("../src/commands.ts");
  return { ...db, ...cmds };
}

describe("slash commands", () => {
  test("new/resume/sessions flow", async () => {
    const t = await setup();
    const s = t.createSession("/w", "m1");
    const state = { sessionId: s.id, cwd: "/w", provider: { baseUrl: "http://x", apiKey: "k", model: "m" } };
    expect(t.runSlashCommand("/sessions", state)!.output).toContain(s.id);
    const n = t.runSlashCommand("/new", state)!;
    expect(n.newSessionId).toBeTruthy();
    const r = t.runSlashCommand(`/resume ${s.id}`, state)!;
    expect(r.newSessionId).toBe(s.id);
    expect(t.runSlashCommand("/resume 99", state)!.output).toContain("no session at index");
  });

  test("fork command switches to a copy", async () => {
    const t = await setup();
    const s = t.createSession("/w", "m1");
    t.appendMessage(s.id, { parent_id: null, role: "user", content: "a", tokens: 1 });
    t.appendMessage(s.id, { parent_id: null, role: "assistant", content: "b", tokens: 1 });
    const state = { sessionId: s.id, cwd: "/w", provider: { baseUrl: "http://x", apiKey: "k", model: "m" } };
    const res = t.runSlashCommand("/fork m1", state)!;
    expect(res.newSessionId).toBeTruthy();
    expect(res.newSessionId).not.toBe(s.id);
    expect(t.allMessages(res.newSessionId!)).toHaveLength(1);
  });

  test("unknown commands are handled gracefully", async () => {
    const t = await setup();
    const s = t.createSession("/w", "m1");
    const res = t.runSlashCommand("/wat", { sessionId: s.id, cwd: "/w", provider: {} as any })!;
    expect(res.output).toMatch(/unknown command/);
  });

  test("non-slash input returns null", async () => {
    const t = await setup();
    expect(t.runSlashCommand("hello", {} as any)).toBeNull();
  });
});
