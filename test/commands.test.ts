import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "fox-cmd-"));
  process.env.FOX_AGENT_HOME = dir;
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
  test("new/sessions flow: an argument switches, no argument lists", async () => {
    const t = await setup();
    const s = t.createSession("/w", "m1");
    const state = { sessionId: s.id, cwd: "/w", provider: { baseUrl: "http://x", apiKey: "k", model: "m" } };
    expect(t.runSlashCommand("/sessions", state)!.output).toContain(s.id);
    const n = t.runSlashCommand("/new", state)!;
    expect(n.newSessionId).toBeTruthy();
    // the host is what applies a switch; runSlashCommand only reports it
    state.sessionId = n.newSessionId!;
    // `/sessions <id>` absorbed what `/resume` used to do
    const r = t.runSlashCommand(`/sessions ${s.id}`, state)!;
    expect(r.newSessionId).toBe(s.id);
    // switching to where you already are is a no-op, not a pointless reload
    state.sessionId = s.id;
    const same = t.runSlashCommand(`/sessions ${s.id}`, state)!;
    expect(same.newSessionId).toBeUndefined();
    expect(same.output).toBe(`already in ${s.id}`);
    expect(t.runSlashCommand("/sessions 99", state)!.output).toContain("no session at index");
    // and /resume itself is gone rather than silently aliased
    expect(t.runSlashCommand(`/resume ${s.id}`, state)!.output).toMatch(/unknown command/);
    expect(t.COMMANDS.some((c: { name: string }) => c.name === "/resume")).toBe(false);
  });

  test("/sessions asks an interactive host for a picker instead of printing", async () => {
    const t = await setup();
    const s = t.createSession("/w", "m1");
    const base = { sessionId: s.id, cwd: "/w", provider: { baseUrl: "http://x", apiKey: "k", model: "m" } };

    // plain mode / -p cannot block on a keypress, so they must keep getting text
    const plain = t.runSlashCommand("/sessions", base)!;
    expect(plain.picker).toBeUndefined();
    expect(plain.output).toContain(s.id);

    const tui = t.runSlashCommand("/sessions", { ...base, interactive: true })!;
    expect(tui.picker).toEqual({ kind: "sessions" });
    expect(tui.output).toBeUndefined();

    // with an argument it is a direct switch in both, picker or not
    expect(t.runSlashCommand(`/sessions ${s.id}`, { ...base, interactive: true })!.picker).toBeUndefined();
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

  test("/delete accepts a list index, resolved the same way /sessions does", async () => {
    const t = await setup();
    const live = t.createSession("/w", "m1");
    const victim = t.createSession("/w", "m1");
    const state = { sessionId: live.id, cwd: "/w", provider: { baseUrl: "http://x", apiKey: "k", model: "m" } };
    // an index that means one session to /sessions and another to /delete would
    // be the worst possible bug in a destructive command
    const idx = t.listSessions().findIndex((r: { id: string }) => r.id === victim.id) + 1;
    expect(t.runSlashCommand(`/sessions ${idx}`, state)!.newSessionId).toBe(victim.id);
    expect(t.runSlashCommand(`/delete ${idx} yes`, state)!.output).toBe(`deleted ${victim.id}`);
    expect(t.runSlashCommand(`/delete 99 yes`, state)!.output).toMatch(/unknown session/);
  });

  test("/fork forks another session by id or index, not just this one at a marker", async () => {
    const t = await setup();
    const here = t.createSession("/w", "m1");
    const other = t.createSession("/w", "m1");
    t.appendMessage(other.id, { parent_id: null, role: "user", content: "a", tokens: 1 });
    t.appendMessage(other.id, { parent_id: null, role: "assistant", content: "b", tokens: 1 });
    const state = { sessionId: here.id, cwd: "/w", provider: { baseUrl: "http://x", apiKey: "k", model: "m" } };

    // this is what the picker's `f` key sends: fork a session that is not the live one
    const res = t.runSlashCommand(`/fork ${other.id}`, state)!;
    expect(res.newSessionId).toBeTruthy();
    expect(res.newSessionId).not.toBe(other.id);
    expect(res.output).toContain(other.id);
    // forked at the tip, so the whole history came along
    expect(t.allMessages(res.newSessionId!)).toHaveLength(2);

    // a bare number is still a marker in THIS session, never a list index —
    // otherwise `/fork 2` would mean two different things depending on history
    expect(t.runSlashCommand("/fork 7", state)!.output).toBe("no message m7");
    expect(t.runSlashCommand("/fork nope", state)!.output).toMatch(/usage:/);
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

describe("command matching", () => {
  test("exact names and aliases resolve to one command", async () => {
    const t = await setup();
    expect(t.matchCommands("/help")).toHaveLength(1);
    expect(t.matchCommands("/?")[0].name).toBe("/help");
    expect(t.matchCommands("/ls")[0].name).toBe("/sessions");
    expect(t.matchCommands("/quit")[0].name).toBe("/exit");
    expect(t.findCommand("/ls")!.name).toBe("/sessions");
    expect(t.findCommand("/nope")).toBeUndefined();
  });

  test("aliases run the command they point at", async () => {
    const t = await setup();
    const s = t.createSession("/w", "m1");
    const state = { sessionId: s.id, cwd: "/w", provider: { baseUrl: "http://x", apiKey: "k", model: "m" } };
    // dispatch switches on the canonical name, so an alias cannot fall through
    // to "unknown command" the way a hand-written switch on the typed word would
    expect(t.runSlashCommand("/ls", state)!.output).toContain(s.id);
    expect(t.runSlashCommand("/quit", state)!.exit).toBe(true);
    expect(t.runSlashCommand("/?", state)!.output).toBe(t.helpText());
  });

  test("prefixes rank above fuzzy matches, and fuzzy still finds the command", async () => {
    const t = await setup();
    expect(t.matchCommands("/se")[0].name).toBe("/sessions");
    // subsequence matching: neither of these is a prefix of anything
    expect(t.matchCommands("/ssn").map((c: { name: string }) => c.name)).toContain("/sessions");
    expect(t.matchCommands("/dl").map((c: { name: string }) => c.name)).toContain("/delete");
    expect(t.matchCommands("/zzz")).toHaveLength(0);
    expect(t.matchCommands("not a command")).toHaveLength(0);
  });

  test("matching uses the first word only, so hints survive typing an argument", async () => {
    const t = await setup();
    // the old popup vanished at the first space — `/model gpt` matched nothing
    expect(t.matchCommands("/model gpt-4o")[0].name).toBe("/model");
    expect(t.matchCommands("/mo something")[0].name).toBe("/model");
  });

  test("/help is generated from COMMANDS and cannot drift from them", async () => {
    const t = await setup();
    const help = t.helpText();
    for (const c of t.COMMANDS) {
      expect(help).toContain(c.name);
      if (c.usage) expect(help).toContain(`${c.name} ${c.usage}`);
      expect(help).toContain(c.help ?? c.desc);
    }
    expect(help.split("\n")).toHaveLength(t.COMMANDS.length);
    expect(help).not.toContain("/resume");
  });
});

describe("/login", () => {
  test("/login reports status, rejects unknown providers, and saves+activates credentials", async () => {
    const t = await setup();
    const cfgPath = join(dir, "config.toml"); // sandbox: state.configPath is where /login writes
    const s = t.createSession("/w", "m1");
    const state = { sessionId: s.id, cwd: "/w", provider: { baseUrl: "http://x", apiKey: "", model: "m" } as any, configPath: cfgPath };

    const status = t.runSlashCommand("/login", state)!;
    expect(status.output).toContain("NOT SET");
    expect(status.output).toContain("google");

    expect(t.runSlashCommand("/login provider=nope key=k", state)!.output).toContain('unknown provider "nope"');
    expect(t.runSlashCommand("/login garbage", state)!.output).toContain("key=value");

    const done = t.runSlashCommand("/login provider=google key=gk-1 model=gemini-2.5-flash", state)!;
    expect(done.output).toContain("saved");
    // live state changed without a restart
    expect(state.provider.provider).toBe("google");
    expect(state.provider.apiKey).toBe("gk-1");
    expect(state.provider.model).toBe("gemini-2.5-flash");
    // and the global config holds it for the next launch
    expect(existsSync(cfgPath)).toBe(true);
    const text = readFileSync(cfgPath, "utf8");
    expect(text).toContain('provider = "google"');
    expect(text).toContain('apiKey = "gk-1"');
  });

  test("a preset id expands to its format and endpoint — tokenguard needs no key", async () => {
    const t = await setup();
    const cfgPath = join(dir, "config.toml");
    const s = t.createSession("/w", "m1");
    const state = { sessionId: s.id, cwd: "/w", provider: { baseUrl: "http://x", apiKey: "", model: "m" } as any, configPath: cfgPath };

    const done = t.runSlashCommand("/login provider=tokenguard model=qwen3-max", state)!;
    expect(done.output).toContain("saved");
    expect(state.provider.provider).toBe("openai-compatible");
    expect(state.provider.baseUrl).toBe("http://127.0.0.1:3742/v1");
    expect(state.provider.model).toBe("qwen3-max");
    const text = readFileSync(cfgPath, "utf8");
    expect(text).toContain('baseUrl = "http://127.0.0.1:3742/v1"');
  });
});

describe("interactive wizards", () => {
  test("an interactive host always gets the /login wizard, kv args only prefill it", async () => {
    const t = await setup();
    const cfgPath = join(dir, "config.toml");
    const s = t.createSession("/w", "m1");
    const state = {
      sessionId: s.id,
      cwd: "/w",
      provider: { baseUrl: "http://x", apiKey: "", model: "m" } as any,
      configPath: cfgPath,
      interactive: true,
    };

    // bare: wizard with a provider select; an unknown endpoint maps to "custom"
    const bare = t.runSlashCommand("/login", state)!;
    expect(bare.prompt).toBeDefined();
    expect(bare.prompt!.steps.map((st) => st.key)).toEqual(["provider", "apiKey", "baseUrl", "model", "modelCustom"]);
    expect(bare.prompt!.steps[0].kind).toBe("select");
    expect(bare.prompt!.steps[0].initial).toBe("custom");
    expect(bare.prompt!.steps[1].secret).toBe(true);

    // kv args: still the wizard, but prefilled — nothing applied yet
    const pre = t.runSlashCommand("/login provider=google", state)!;
    expect(pre.prompt!.steps[0].initial).toBe("google");
    expect(existsSync(cfgPath)).toBe(false);

    // the wizard's run applies the answers like kv pairs would
    const res = pre.prompt!.run({ provider: "google", apiKey: "gk-9", baseUrl: "", model: "", modelCustom: "" }, state);
    expect(res.output).toContain("saved");
    expect(state.provider.provider).toBe("google");
    expect(state.provider.apiKey).toBe("gk-9");
    expect(readFileSync(cfgPath, "utf8")).toContain('provider = "google"');
  });

  test("bare /model, /prune and /fork ask; bare /delete opens the session picker", async () => {
    const t = await setup();
    const s = t.createSession("/w", "m1");
    // configPath pointed at scratch: /model and /login persist to the global config
    // and must never touch the real one from a test
    const state = { sessionId: s.id, cwd: "/w", provider: { baseUrl: "http://x", apiKey: "k", model: "m" }, interactive: true, configPath: join(dir, "config.toml") };

    const model = t.runSlashCommand("/model", state)!;
    // a searchable select now: current model first, then profiles and catalog
    expect(model.prompt!.steps[0].kind).toBe("select");
    expect(model.prompt!.steps[0].initial).toBe("m:m");
    const applied = model.prompt!.run({ model: "m:m2" }, state);
    expect(applied.output).toContain("m2");
    expect(state.provider.model).toBe("m2");

    const prune = t.runSlashCommand("/prune", state)!;
    expect(prune.prompt!.steps[0].kind).toBe("select");
    // the report option runs a dry-run — nothing deleted
    expect(prune.prompt!.run({ mode: "" }, state).output).toBeTruthy();

    expect(t.runSlashCommand("/fork", state)!.prompt).toBeDefined();
    expect(t.runSlashCommand("/delete", state)!.picker).toEqual({ kind: "sessions" });
  });
});

describe("session listing", () => {
  test("lists most recently used first, not most recently created", async () => {
    const t = await setup();
    const old = t.createSession("/w", "m1");
    t.createSession("/w", "m1"); // newer by creation
    t.appendMessage(old.id, { parent_id: null, role: "user", content: "worked in this one", tokens: 1 });

    const items = t.sessionList({ currentId: old.id });
    expect(items[0].id).toBe(old.id);
    expect(items[0].index).toBe(1);
    expect(items[0].current).toBe(true);
    expect(items[1].current).toBe(false);
  });

  test("indices in the printed list match what /sessions <n> resolves to", async () => {
    const t = await setup();
    t.createSession("/w", "m1");
    const b = t.createSession("/w", "m1");
    const state = { sessionId: "none", cwd: "/w", provider: { baseUrl: "http://x", apiKey: "k", model: "m" } };
    const items = t.sessionList();
    // the number the user reads off the list is the number they can type
    for (const it of items) {
      expect(t.runSlashCommand(`/sessions ${it.index}`, state)!.newSessionId).toBe(it.id);
    }
    expect(t.formatSessionList(items)).toContain(b.id);
    expect(t.formatSessionList([])).toBe("(no sessions)");
  });

  test("relTime compacts to one unit", async () => {
    const t = await setup();
    const now = 1_000_000_000_000;
    expect(t.relTime(now - 5_000, now)).toBe("5s");
    expect(t.relTime(now - 180_000, now)).toBe("3m");
    expect(t.relTime(now - 7_200_000, now)).toBe("2h");
    expect(t.relTime(now - 5 * 86_400_000, now)).toBe("5d");
    // a clock that jumped backwards must not print a negative age
    expect(t.relTime(now + 60_000, now)).toBe("0s");
  });

  test("picker rows quote a real title and never quote a cwd as one", async () => {
    const t = await setup();
    const untitled = t.createSession("/w/project", "m1");
    const titled = t.createSession("/w/project", "m1");
    t.appendMessage(titled.id, { parent_id: null, role: "user", content: "fix the login bug", tokens: 1 });

    const { sessionRows } = await import("../src/tui/pickerui.ts");
    const rows = sessionRows(t.sessionList(), t.relTime);
    const byId = new Map(rows.map((r) => [r.id, r]));

    // the delete confirm reads this label out loud, so a titled session names
    // its conversation...
    expect(byId.get(titled.id)!.label).toBe(`${titled.id} "fix the login bug"`);
    // ...and an untitled one names only itself. `label` in the list column falls
    // back to the cwd, so quoting that would have the confirm claim the
    // directory is what disappears.
    expect(byId.get(untitled.id)!.label).toBe(untitled.id);
    expect(byId.get(untitled.id)!.label).not.toContain("/w/project");
    // the visible column still shows the cwd for an untitled session
    expect(byId.get(untitled.id)!.cells.at(-1)).toBe("/w/project");
  });
});
