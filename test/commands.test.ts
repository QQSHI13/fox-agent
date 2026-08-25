import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
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

  test("/delete needs confirmation, then removes the database from disk", async () => {
    const t = await setup();
    const live = t.createSession("/w", "m1");
    const victim = t.createSession("/w", "m1");
    const path = join(dir, "sessions", `${victim.id}.db`);
    const state = { sessionId: live.id, cwd: "/w", provider: { baseUrl: "http://x", apiKey: "k", model: "m" } };

    // unconfirmed is a report, not an action — the file must still be there
    const dry = t.runSlashCommand(`/delete ${victim.id}`, state)!;
    expect(dry.output).toMatch(/would delete/);
    expect(existsSync(path)).toBe(true);
    expect(t.getSession(victim.id)).toBeTruthy();

    const done = t.runSlashCommand(`/delete ${victim.id} yes`, state)!;
    expect(done.output).toBe(`deleted ${victim.id}`);
    expect(existsSync(path)).toBe(false);
    expect(t.getSession(victim.id)).toBeNull();
    // and it leaves the index consistent, not holding a row for a missing file
    expect(t.listSessions().map((r: { id: string }) => r.id)).not.toContain(victim.id);
  });

  test("/delete refuses the current session and unknown ids", async () => {
    const t = await setup();
    const s = t.createSession("/w", "m1");
    const state = { sessionId: s.id, cwd: "/w", provider: { baseUrl: "http://x", apiKey: "k", model: "m" } };
    // deleting the live session would unlink the db the turn loop is writing to
    expect(t.runSlashCommand(`/delete ${s.id} yes`, state)!.output).toMatch(/current session/);
    expect(existsSync(join(dir, "sessions", `${s.id}.db`))).toBe(true);
    expect(t.runSlashCommand("/delete nope yes", state)!.output).toMatch(/unknown session/);
    expect(t.runSlashCommand("/delete", state)!.output).toMatch(/usage:/);
  });

  test("/delete accepts a list index, resolved the same way /resume does", async () => {
    const t = await setup();
    const live = t.createSession("/w", "m1");
    const victim = t.createSession("/w", "m1");
    const state = { sessionId: live.id, cwd: "/w", provider: { baseUrl: "http://x", apiKey: "k", model: "m" } };
    // an index that means one session to /resume and another to /delete would be
    // the worst possible bug in a destructive command
    const idx = t.listSessions().findIndex((r: { id: string }) => r.id === victim.id) + 1;
    expect(t.runSlashCommand(`/resume ${idx}`, state)!.newSessionId).toBe(victim.id);
    expect(t.runSlashCommand(`/delete ${idx} yes`, state)!.output).toBe(`deleted ${victim.id}`);
    expect(t.runSlashCommand(`/delete 99 yes`, state)!.output).toMatch(/unknown session/);
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
