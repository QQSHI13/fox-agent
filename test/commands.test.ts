import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

  test("completeSlashCommand offers command words for Tab, nothing else", async () => {
    const t = await setup();
    // prefix narrows to the command, with a trailing space when it takes args
    expect(t.completeSlashCommand("/de")).toContain("/delete ");
    expect(t.completeSlashCommand("/help")).toEqual(["/help"]);
    // exact bare commands without args complete plainly
    expect(t.completeSlashCommand("/new")).toEqual(["/new"]);
    // non-slash input and argument positions complete nothing — ids and
    // paths are not the completer's business
    expect(t.completeSlashCommand("hello")).toEqual([]);
    expect(t.completeSlashCommand("/delete 12")).toEqual([]);
    expect(t.completeSlashCommand("")).toEqual([]);
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

  test("a preset id expands to its format and endpoint", async () => {
    const t = await setup();
    const cfgPath = join(dir, "config.toml");
    const s = t.createSession("/w", "m1");
    const state = { sessionId: s.id, cwd: "/w", provider: { baseUrl: "http://x", apiKey: "", model: "m" } as any, configPath: cfgPath };

    const done = t.runSlashCommand("/login provider=deepseek key=sk-ds model=deepseek-chat", state)!;
    expect(done.output).toContain("saved");
    expect(state.provider.provider).toBe("openai-compatible");
    expect(state.provider.baseUrl).toBe("https://api.deepseek.com/v1");
    expect(state.provider.model).toBe("deepseek-chat");
    const text = readFileSync(cfgPath, "utf8");
    expect(text).toContain('baseUrl = "https://api.deepseek.com/v1"');
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
    expect(bare.prompt!.steps.map((st) => st.key)).toEqual(["provider", "apiKey", "baseUrl", "model", "modelCustom", "saveProfile"]);
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

  test("/login model steps appear and disappear with the answers (skipIf)", async () => {
    const t = await setup();
    // seed a cached models.dev catalog: without it the static fallback presets
    // list no models and the model select would be skipped for every provider
    const { mkdirSync, writeFileSync } = await import("node:fs");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "models.dev.json"),
      JSON.stringify({
        at: Date.now(),
        providers: [{ id: "google", name: "Google Gemini", api: "https://generativelanguage.googleapis.com", env: ["GEMINI_API_KEY"], format: "google", models: [{ id: "gemini-2.5-pro", name: "Gemini 2.5 Pro", context: 1_048_576 }] }],
      }),
    );
    const s = t.createSession("/w", "m1");
    const state = { sessionId: s.id, cwd: "/w", provider: { baseUrl: "http://x", apiKey: "k", model: "m" } as any, interactive: true, configPath: join(dir, "config.toml") };

    // a provider with catalog models: picking a listed model skips the text step
    const wiz = t.runSlashCommand("/login provider=google", state)!.prompt!;
    const custom = wiz.steps.find((st) => st.key === "modelCustom")!;
    const model = wiz.steps.find((st) => st.key === "model")!;
    expect(typeof custom.skipIf === "function" && custom.skipIf({ provider: "google", model: "gemini-2.5-pro" })).toBe(true); // listed pick: no re-ask
    expect(typeof custom.skipIf === "function" && custom.skipIf({ provider: "google", model: "__custom" })).toBe(false); // typed pick: ask
    // the select itself disappears when the provider lists nothing (custom)
    expect(typeof model.skipIf === "function" && model.skipIf({ provider: "custom" })).toBe(true);
    expect(typeof model.skipIf === "function" && model.skipIf({ provider: "google" })).toBe(false);

    // end to end: a listed pick lands without any modelCustom round-trip
    const res = wiz.run({ provider: "google", apiKey: "", baseUrl: "", model: "gemini-2.5-pro" }, state);
    expect(res.output).toContain("saved");
    expect(state.provider.model).toBe("gemini-2.5-pro");
  });

  test("/model provider step never lists the current identity twice", async () => {
    const t = await setup();
    // seed a cached catalog holding the openrouter preset: without it only
    // static presets (and their env-gated visibility) are in play
    const { mkdirSync, writeFileSync } = await import("node:fs");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "models.dev.json"),
      JSON.stringify({
        at: Date.now(),
        providers: [{ id: "openrouter", name: "OpenRouter", api: "https://openrouter.ai/api/v1", env: ["OPENROUTER_API_KEY"], format: "openai-compatible", models: [] }],
      }),
    );
    const s = t.createSession("/w", "m1");
    // logged in via the preset: the current row already IS openrouter, so the
    // preset row would resolve to the same endpoint under the same identity
    const state = {
      sessionId: s.id,
      cwd: "/w",
      interactive: true,
      provider: { baseUrl: "https://openrouter.ai/api/v1", apiKey: "k", model: "m", provider: "openai-compatible", label: "openrouter" } as any,
      config: { provider: "openrouter", model: "m", providers: {} } as any,
    };
    const opts = t.runSlashCommand("/model", state)!.prompt!.steps[0].options as { value: string; label: string }[];
    expect(opts[0].value).toBe("m:");
    expect(opts.filter((o) => o.value === "x:openrouter")).toHaveLength(0);
    // same for a profile: the current row already is it
    const state2 = {
      ...state,
      provider: { ...state.provider, label: "mine" },
      config: { provider: "mine", model: "m", providers: { mine: { baseUrl: "https://openrouter.ai/api/v1", apiKey: "k", models: [] } } } as any,
    };
    const opts2 = t.runSlashCommand("/model", state2)!.prompt!.steps[0].options as { value: string; label: string }[];
    expect(opts2.filter((o) => o.value === "p:mine")).toHaveLength(0);
  });

  test("/login keeps several providers as profiles instead of one slot", async () => {
    const t = await setup();
    // catalog holding deepseek, so the preset path lists a real model
    const { mkdirSync, writeFileSync, readFileSync } = await import("node:fs");
    const { loadConfig } = await import("../src/core/config.ts");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "models.dev.json"),
      JSON.stringify({
        at: Date.now(),
        providers: [
          { id: "deepseek", name: "DeepSeek", api: "https://api.deepseek.com/v1", env: ["DEEPSEEK_API_KEY"], format: "openai-compatible", models: [{ id: "deepseek-chat", name: "DeepSeek Chat", context: 64000 }] },
          { id: "openrouter", name: "OpenRouter", api: "https://openrouter.ai/api/v1", env: ["OPENROUTER_API_KEY"], format: "openai-compatible", models: [{ id: "m-or", name: "M Or", context: 128000 }] },
        ],
      }),
    );
    const cfgPath = join(dir, "config.toml");
    writeFileSync(cfgPath, 'model = "m0"\nprovider = "openai-compatible"\napiKey = "k0"\n');
    const s = t.createSession("/w", "m1");
    const fresh = () => {
      const cfg = loadConfig({ cwd: "/w", configPath: cfgPath }, {});
      return {
        sessionId: s.id,
        cwd: "/w",
        interactive: true,
        configPath: cfgPath,
        provider: { baseUrl: cfg.baseUrl, apiKey: cfg.apiKey, model: cfg.model, provider: cfg.provider, label: undefined } as any,
        config: cfg as any,
      };
    };

    // save a preset login as a profile: the table lands, the flat slot only
    // learns the pointer, and the old flat key is untouched
    const st1 = fresh();
    const w1 = t.runSlashCommand("/login", st1)!.prompt!;
    const r1 = w1.run({ provider: "deepseek", apiKey: "sk-ds", baseUrl: "", model: "deepseek-chat", modelCustom: "", saveProfile: "ds" }, st1);
    expect(r1.output).toContain("provider: ds");
    const file1 = readFileSync(cfgPath, "utf8");
    expect(file1).toContain("[providers.ds]");
    expect(file1).toContain('apiKey = "sk-ds"');
    expect(file1).toContain('apiKey = "k0"'); // the flat fallback survived
    expect(file1).toContain('provider = "ds"');
    expect(st1.provider.label).toBe("ds");
    expect(st1.provider.baseUrl).toBe("https://api.deepseek.com/v1");

    // a second login coexists; the wizard offers the saved profile first and
    // preselects it while it is active
    const st2 = fresh();
    const w2 = t.runSlashCommand("/login", st2)!.prompt!;
    const provOpts = w2.steps[0].options as { value: string }[];
    expect(provOpts[0].value).toBe("profile:ds");
    expect(w2.steps[0].initial).toBe("profile:ds");
    const r2 = w2.run({ provider: "openrouter", apiKey: "sk-or", baseUrl: "", model: "__custom", modelCustom: "m-or", saveProfile: "or" }, st2);
    expect(r2.output).toContain("provider: or");
    expect(readFileSync(cfgPath, "utf8")).toContain("[providers.or]");

    // profile picks skip credential steps and activate through the profile
    const st3 = fresh();
    const w3 = t.runSlashCommand("/login", st3)!.prompt!;
    const skip = (key: string, a: Record<string, string>) => t.runSlashCommand("/login", st3)!.prompt!.steps.find((st) => st.key === key)!.skipIf!(a);
    void w3;
    expect(skip("apiKey", { provider: "profile:ds" })).toBe(true);
    expect(skip("baseUrl", { provider: "profile:ds" })).toBe(true);
    expect(skip("saveProfile", { provider: "profile:ds" })).toBe(true);
    const r3 = t.runSlashCommand("/login", st3)!.prompt!.run(
      { provider: "profile:ds", model: "deepseek-chat", modelCustom: "", saveProfile: "" }, st3,
    );
    expect(r3.output).toContain("provider: ds");
    expect(st3.provider.label).toBe("ds");
    expect(st3.provider.baseUrl).toBe("https://api.deepseek.com/v1");
    expect(st3.provider.apiKey).toBe("sk-ds");
    expect(st3.config.provider).toBe("ds");

    // headless: profile name switches, key alongside one is refused loudly
    const st4 = { ...fresh(), interactive: false };
    expect(t.runSlashCommand("/login provider=or", st4)!.output).toContain("provider: or");
    expect(st4.provider.label).toBe("or");
    expect(t.runSlashCommand("/login provider=or key=x", st4)!.output).toContain("saved profile");

    // a bad profile name fails before anything is written
    const st5 = fresh();
    const r5 = t.runSlashCommand("/login", st5)!.prompt!.run(
      { provider: "deepseek", apiKey: "k", baseUrl: "", model: "deepseek-chat", modelCustom: "", saveProfile: "no spaces" }, st5,
    );
    expect(r5.output).toContain("cannot save profile");
    expect(readFileSync(cfgPath, "utf8")).not.toContain("no spaces");

    // the model step lists a profile's own models, then the custom escape hatch
    const st6 = fresh();
    (st6.config as any).providers.mine = {
      format: "openai-compatible",
      baseUrl: "https://x.invalid/v1",
      apiKey: "k",
      models: [{ id: "m-x" }],
    };
    const w6 = t.runSlashCommand("/login", st6)!.prompt!;
    const modelStep = w6.steps.find((st) => st.key === "model")!;
    const mopts = (modelStep.options as (a: Record<string, string>) => { value: string }[])({ provider: "profile:mine" });
    expect(mopts.map((m) => m.value)).toEqual(["m-x", "__custom"]);
  });

  test("bare /model, /prune and /fork ask; bare /delete opens the session picker", async () => {
    const t = await setup();
    const s = t.createSession("/w", "m1");
    // configPath pointed at scratch: /model and /login persist to the global config
    // and must never touch the real one from a test
    const state = { sessionId: s.id, cwd: "/w", provider: { baseUrl: "http://x", apiKey: "k", model: "m" }, interactive: true, configPath: join(dir, "config.toml") };

    const model = t.runSlashCommand("/model", state)!;
    // provider-first wizard: step 1 picks the provider, a base-url step
    // appears only for custom endpoints, then the model on that provider
    expect(model.prompt!.steps[0].kind).toBe("select");
    expect(model.prompt!.steps[0].initial).toBe("m:");
    expect(model.prompt!.steps[1].key).toBe("baseUrl");
    expect(model.prompt!.steps[1].kind).toBe("text");
    expect(model.prompt!.steps[2].kind).toBe("select");
    const applied = model.prompt!.run({ provider: "m:", model: "m:m2" }, state);
    expect(applied.output).toContain("m2");
    expect(state.provider.model).toBe("m2");

    const prune = t.runSlashCommand("/prune", state)!;
    expect(prune.prompt!.steps[0].kind).toBe("select");
    // the report option runs a dry-run — nothing deleted
    expect(prune.prompt!.run({ mode: "" }, state).output).toBeTruthy();

    expect(t.runSlashCommand("/fork", state)!.prompt).toBeDefined();
    expect(t.runSlashCommand("/delete", state)!.picker).toEqual({ kind: "sessions" });
  });

  test("/theme: bare lists, a name switches live and persists, junk names do not write", async () => {
    const t = await setup();
    const s = t.createSession("/w", "m1");
    const cfgPath = join(dir, "theme-config.toml"); // scratch — /theme saves to the global config
    const state = { sessionId: s.id, cwd: "/w", provider: { baseUrl: "http://x", apiKey: "k", model: "m" }, interactive: true, configPath: cfgPath };
    const { themeName, setTheme } = await import("../src/tui/themes.ts");
    try {
      const chooser = t.runSlashCommand("/theme", state)!;
      expect(chooser.prompt!.steps[0].kind).toBe("select");
      expect(chooser.prompt!.steps[0].options!.length).toBeGreaterThan(1);

      const applied = t.runSlashCommand("/theme dracula", state)!;
      expect(applied.output).toContain("dracula");
      expect(themeName()).toBe("dracula");
      expect(readFileSync(cfgPath, "utf8")).toContain('theme = "dracula"');

      const bad = t.runSlashCommand("/theme nope-not-a-theme", state)!;
      expect(bad.output).toContain("unknown theme");
      expect(themeName()).toBe("dracula"); // a miss leaves the theme alone
    } finally {
      setTheme("default");
    }
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

    // all-dirs mode: the cwd column appears, so rows from different directories
    // can tell each other apart (the `fox -c` `a` toggle had no way to show it)
    const allDirs = sessionRows(t.sessionList(), t.relTime, true);
    expect(allDirs[0]!.cells).toContain("/w/project");
    // directory-scoped mode: no column — every row would repeat the same value
    expect(rows[0]!.cells).not.toContain("/w/project");

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

describe("bug-hunt regressions", () => {
  test("/login keeps a typed custom model id when the select is skipped", async () => {
    const t = await setup();
    const cfgPath = join(dir, "config.toml");
    const s = t.createSession("/w", "m1");
    const state = {
      sessionId: s.id,
      cwd: "/w",
      provider: { baseUrl: "http://127.0.0.1:1", apiKey: "", model: "m" } as any,
      configPath: cfgPath,
      interactive: true,
    };
    // a custom endpoint lists nothing, so the model select is skipped and
    // answers.model is never committed — only modelCustom holds the typed id,
    // which the run used to discard, saving the stale model with success
    const wiz = t.runSlashCommand("/login", state)!.prompt!;
    const res = wiz.run({ provider: "custom", apiKey: "", baseUrl: "http://127.0.0.1:1", modelCustom: "m-x", saveProfile: "" }, state);
    expect(res.output).toContain("saved");
    expect(state.provider.model).toBe("m-x");
  });

  test("bare /fork with an empty answer forks at the tip instead of looping", async () => {
    const t = await setup();
    const s = t.createSession("/w", "m1");
    t.appendMessage(s.id, { parent_id: null, role: "user", content: "a", tokens: 1 });
    const state = {
      sessionId: s.id,
      cwd: "/w",
      provider: { baseUrl: "http://x", apiKey: "k", model: "m" } as any,
      interactive: true,
    };
    const res = t.runSlashCommand("/fork", state)!.prompt!.run({ at: "" }, state);
    // a fork happened (new session id reported), not a re-prompt
    expect(res.newSessionId).toBeTruthy();
    expect(res.newSessionId).not.toBe(s.id);
    expect((res as { prompt?: unknown }).prompt).toBeUndefined();
  });

  test("/thinking default clears the live effort, not just the file", async () => {
    const t = await setup();
    const cfgPath = join(dir, "config.toml");
    const s = t.createSession("/w", "m1");
    const state = {
      sessionId: s.id,
      cwd: "/w",
      provider: { baseUrl: "http://x", apiKey: "k", model: "m" } as any,
      configPath: cfgPath,
    };
    t.runSlashCommand("/thinking high", state);
    expect((state.provider.sampling as any)?.reasoningEffort).toBe("high");
    const res = t.runSlashCommand("/thinking default", state)!;
    expect(res.output).toContain("provider default");
    // the provider must stop receiving the old effort immediately, while the
    // readout (which prefers live sampling) agrees with the file
    expect((state.provider.sampling as any)?.reasoningEffort).toBeUndefined();
  });

  test("index resolution honors the listing limit", async () => {
    const t = await setup();
    const a = t.createSession("/w", "m1");
    const b = t.createSession("/w", "m1");
    const c = t.createSession("/w", "m1");
    // recency order: c, b, a — a limit-1 page shows only c
    expect(t.resolveSessionArg("1", 1)).toBe(c.id);
    expect(t.resolveSessionArg("2", 1)).toBeNull();
    // default depth resolves the full list as before
    expect(t.resolveSessionArg("2")).toBe(b.id);
    expect(t.resolveSessionArg(a.id)).toBe(a.id);
  });
});

describe("/settings", () => {
  function mkState(cfgPath: string, sessionId: string, cfg: any) {
    return {
      sessionId,
      cwd: "/w",
      provider: { baseUrl: "http://x", apiKey: "k", model: "m" } as any,
      config: cfg,
      configPath: cfgPath,
      interactive: true,
    };
  }
  test("bare lists every setting with its current value", async () => {
    const tt = await setup();
    const cfgPath = join(dir, "config.toml");
    writeFileSync(cfgPath, 'model = "m"\n'); // explicit --config paths must exist (loud-missing rule)
    const { loadConfig } = await import("../src/core/config.ts");
    const s = tt.createSession("/w", "m1");
    const state = mkState(cfgPath, s.id, loadConfig({ cwd: "/w", configPath: cfgPath }, {}));
    const res = tt.runSlashCommand("/settings", state)!;
    for (const key of ["maxSteps", "retryLimit", "compactAt", "tuiRich", "contextMarkers", "acpHistory"]) {
      expect(res.output).toContain(key);
    }
    expect(res.output).toContain("0.85"); // default shown
  });

  test("key=value validates, saves and applies live; = resets; junk is refused", async () => {
    const tt = await setup();
    const { loadConfig } = await import("../src/core/config.ts");
    const cfgPath = join(dir, "config.toml");
    writeFileSync(cfgPath, 'model = "m"\n'); // explicit --config paths must exist (loud-missing rule)
    const s = tt.createSession("/w", "m1");
    const state = mkState(cfgPath, s.id, loadConfig({ cwd: "/w", configPath: cfgPath }, {}));

    const set1 = tt.runSlashCommand("/settings compactAt=0.7", state)!;
    expect(set1.output).toContain("compactAt = 0.7");
    expect(state.config.compactAt).toBe(0.7); // applied live
    expect(readFileSync(cfgPath, "utf8")).toContain("compactAt = 0.7"); // persisted

    const set2 = tt.runSlashCommand("/settings tuiRich=true", state)!;
    expect(state.config.tuiRich).toBe(true);

    const reset = tt.runSlashCommand("/settings compactAt=", state)!;
    expect(reset.output).toContain("(default 0.85)");
    expect(state.config.compactAt).toBeUndefined();
    expect(readFileSync(cfgPath, "utf8")).not.toContain("compactAt");

    expect(tt.runSlashCommand("/settings compactAt=2", state)!.output).toContain("fraction");
    expect(tt.runSlashCommand("/settings tuiRich=maybe", state)!.output).toContain("not a boolean");
    expect(tt.runSlashCommand("/settings frobnicate=1", state)!.output).toContain("unknown setting");
    // rejected writes changed nothing
    expect(state.config.compactAt).toBeUndefined();
  });

  test("acpHistory accepts full/last/N and refuses junk", async () => {
    const tt = await setup();
    const { loadConfig } = await import("../src/core/config.ts");
    const cfgPath = join(dir, "config.toml");
    writeFileSync(cfgPath, 'model = "m"\n'); // explicit --config paths must exist (loud-missing rule)
    const s = tt.createSession("/w", "m1");
    const state = mkState(cfgPath, s.id, loadConfig({ cwd: "/w", configPath: cfgPath }, {}));
    for (const [raw, want] of [["last", "last"], ["12", "12"], ["full", "full"]] as const) {
      const res = tt.runSlashCommand(`/settings acpHistory=${raw}`, state)!;
      expect(res.output).toContain(`acpHistory = ${want}`);
      expect(state.config.acpHistory).toBe(raw === "12" ? 12 : raw);
    }
    expect(tt.runSlashCommand("/settings acpHistory=sometimes", state)!.output).toContain("full | last");
  });

  test("show-one form prints value and description", async () => {
    const tt = await setup();
    const { loadConfig } = await import("../src/core/config.ts");
    const cfgPath = join(dir, "config.toml");
    writeFileSync(cfgPath, 'model = "m"\n'); // explicit --config paths must exist (loud-missing rule)
    const s = tt.createSession("/w", "m1");
    const state = mkState(cfgPath, s.id, loadConfig({ cwd: "/w", configPath: cfgPath }, {}));
    const res = tt.runSlashCommand("/settings requestTimeoutMs", state)!;
    expect(res.output).toContain("requestTimeoutMs = 120000");
    expect(res.output).toContain("abort a provider request");
  });
});
