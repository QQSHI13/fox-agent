/**
 * The ACP layer: fox-agent as an agent (server), fox as a client, and the pure event
 * mapping between fox-agent's `AgentEvent` stream and ACP's `SessionUpdate`.
 *
 * Every case here pairs a client app to an agent app IN PROCESS —
 * `client().connectWith(agentApp, …)`, no subprocess, no stdio — so the protocol
 * round trips without paying for a spawn per assertion. The one thing this cannot
 * cover is Bun's FileSink-vs-WritableStream gap in the two stdio adapters
 * (`bunStdout` in server.ts, `childStream` in client.ts); those are exercised by
 * driving `bin/fox --acp` by hand, and by delegation actually spawning a child.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as acp from "@agentclientprotocol/sdk";
import type { AgentEvent } from "../src/core/events.ts";
import type { Config } from "../src/core/config.ts";
import type { StreamEvent } from "../src/providers/types.ts";

let home: string;
let work: string;

beforeEach(async () => {
  home = mkdtempSync(join(tmpdir(), "fox-acp-"));
  work = mkdtempSync(join(tmpdir(), "fox-acp-cwd-"));
  process.env.FOX_AGENT_HOME = home;
  (await import("../src/store/db.ts")).closeAll();
});

afterEach(async () => {
  (await import("../src/store/db.ts")).closeAll();
  rmSync(home, { recursive: true, force: true });
  rmSync(work, { recursive: true, force: true });
});

const cfg = (): Config => ({
  model: "gpt-4o-mini",
  baseUrl: "http://127.0.0.1:1",
  apiKey: "sk-test",
  provider: "openai-compatible",
  maxSteps: 10,
  retryLimit: 0,
  compactAt: 0.85,
  requestTimeoutMs: 0,
  mcpServers: {},
  agents: {},
  lsp: {},
  // no language server in an ACP prompt test: it would spawn a real tsserver on
  // whatever the mock happens to edit and add seconds per assertion
  diagnostics: false,
  plugins: [],
  disabledPlugins: [],
  providers: {},
  toolOutputCap: 30_000,
  sessionListLimit: 50,
  tuiCollapsedChars: 240,
  tuiKeptChars: 4_000,
  theme: "default",
  warnings: [],
  projectInstructions: "",
});

const provider = () => ({
  baseUrl: "http://127.0.0.1:1",
  apiKey: "sk-test",
  model: "gpt-4o-mini",
  provider: "openai-compatible" as const,
});

/** A scripted `chat`, injected at the same seam test/turn.test.ts uses. */
function mockChat(scripts: StreamEvent[][]) {
  let n = 0;
  return async function* (): AsyncGenerator<StreamEvent> {
    const script = scripts[n++];
    if (!script) throw new Error("mock exhausted");
    for (const ev of script) yield ev;
  };
}

const textTurn = (t: string): StreamEvent[] => [
  { type: "text", delta: t },
  { type: "done", reason: "stop" },
];

async function build(scripts: StreamEvent[][], overrides: Partial<Config> = {}) {
  const { buildAgent } = await import("../src/acp/server.ts");
  return buildAgent({ config: { ...cfg(), ...overrides }, provider: provider(), chat: mockChat(scripts) as never });
}

/** Connect a bare client, initialize, and run `op` against the agent. */
async function withAgent<T>(app: acp.AgentApp, op: (agent: acp.ClientContext) => Promise<T>): Promise<T> {
  return acp.client({ name: "test" }).connectWith(app, async (agent) => {
    await agent.request(acp.methods.agent.initialize, {
      protocolVersion: acp.PROTOCOL_VERSION,
      clientCapabilities: {},
    });
    return op(agent);
  });
}

/** One full prompt turn: every update the agent sent, plus how the turn stopped. */
async function promptTurn(
  scripts: StreamEvent[][],
  prompt = "hello",
): Promise<{ updates: acp.SessionUpdate[]; stopReason: acp.StopReason; sessionId: string }> {
  return withAgent(await build(scripts), (agent) =>
    agent.buildSession(work).withSession(async (session) => {
      const updates: acp.SessionUpdate[] = [];
      // The prompt's own rejection also arrives as the `stop` message read below,
      // so catching here only avoids an unhandled rejection.
      void session.prompt(prompt).catch(() => {});
      for (;;) {
        const msg = await session.nextUpdate();
        if (msg.kind === "stop") return { updates, stopReason: msg.stopReason, sessionId: session.sessionId };
        updates.push(msg.update);
      }
    }),
  );
}

const textOf = (updates: acp.SessionUpdate[], kind: acp.SessionUpdate["sessionUpdate"]): string =>
  updates
    .filter((u) => u.sessionUpdate === kind)
    .map((u) => ("content" in u && !Array.isArray(u.content) && (u.content as any)?.type === "text" ? (u.content as any).text : ""))
    .join("");

describe("acp server: initialize", () => {
  test("reports protocol 1, fox-agent's identity, and only the capabilities it implements", async () => {
    const res = await acp.client({ name: "test" }).connectWith(await build([]), (agent) =>
      agent.request(acp.methods.agent.initialize, { protocolVersion: acp.PROTOCOL_VERSION, clientCapabilities: {} }),
    );
    expect(res.protocolVersion).toBe(1);
    expect(res.agentInfo?.name).toBe("fox-agent");
    expect(res.agentCapabilities?.loadSession).toBe(true);
    // Every one of these is backed by a store primitive that predates ACP; `{}`
    // is how the protocol says "supported".
    const caps = res.agentCapabilities?.sessionCapabilities ?? {};
    for (const k of ["list", "delete", "fork", "resume", "close"]) expect(caps).toHaveProperty(k);
    // fox-agent reaches MCP servers itself rather than through the client's transport
    expect(res.agentCapabilities?.mcpCapabilities).toMatchObject({ http: false, sse: false });
  });
});

describe("acp server: prompt turns", () => {
  test("text streams as agent_message_chunk and the turn ends with end_turn", async () => {
    const { updates, stopReason } = await promptTurn([textTurn("hi from fox")]);
    expect(stopReason).toBe("end_turn");
    expect(textOf(updates, "agent_message_chunk")).toBe("hi from fox");
  });

  test("reasoning arrives as agent_thought_chunk, kept out of the message text", async () => {
    const { updates } = await promptTurn([
      [{ type: "reasoning", delta: "thinking" }, { type: "text", delta: "answer" }, { type: "done", reason: "stop" }],
    ]);
    expect(textOf(updates, "agent_thought_chunk")).toBe("thinking");
    expect(textOf(updates, "agent_message_chunk")).toBe("answer");
  });

  test("the prompt is persisted to the session, so a later load can replay it", async () => {
    const { sessionId } = await promptTurn([textTurn("noted")], "remember this");
    const { allMessages } = await import("../src/store/db.ts");
    const msgs = allMessages(sessionId);
    expect(msgs.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(msgs[0]!.content).toBe("remember this");
  });

  test("a tool call reports pending, then completed with its output as content", async () => {
    // A real fox-agent tool through the real registry: `read` on a real file, so the
    // kind mapping and the output path are both exercised rather than mocked.
    const f = join(work, "note.txt");
    await Bun.write(f, "file body here");
    const { updates } = await promptTurn([
      [
        { type: "tool_call", call: { id: "t1", name: "read", arguments: JSON.stringify({ path: f }) } },
        { type: "done", reason: "tool_calls" },
      ],
      textTurn("done reading"),
    ]);
    expect(updates.find((u) => u.sessionUpdate === "tool_call")).toMatchObject({
      toolCallId: "t1",
      name: "read",
      kind: "read",
      status: "pending",
    });
    const end = updates.find((u) => u.sessionUpdate === "tool_call_update");
    expect(end).toMatchObject({ toolCallId: "t1", status: "completed" });
    const block = end?.sessionUpdate === "tool_call_update" ? end.content?.[0] : undefined;
    expect(block?.type === "content" && block.content.type === "text" && block.content.text).toContain("file body here");
  });

  test("a failing tool reports failed rather than vanishing", async () => {
    const { updates } = await promptTurn([
      [
        { type: "tool_call", call: { id: "t1", name: "read", arguments: JSON.stringify({ path: join(work, "nope.txt") }) } },
        { type: "done", reason: "tool_calls" },
      ],
      textTurn("could not read"),
    ]);
    expect(updates.find((u) => u.sessionUpdate === "tool_call_update")).toMatchObject({ status: "failed" });
  });

  test("usage is reported against the model's real context window", async () => {
    const { updates } = await promptTurn([
      [
        { type: "text", delta: "x" },
        { type: "usage", prompt_tokens: 100, completion_tokens: 20 },
        { type: "done", reason: "stop" },
      ],
    ]);
    const { lookupModel } = await import("../src/providers/models.ts");
    expect(updates.find((u) => u.sessionUpdate === "usage_update")).toMatchObject({
      used: 120,
      size: lookupModel("gpt-4o-mini").contextWindow,
    });
  });

  test("harness chatter never reaches the client, not even disguised as text", async () => {
    // step/retry/warn have no ACP vocabulary. Mapping them to a text chunk would
    // print fox-agent's internals inside the assistant's own message in every client,
    // so the assertion is on the message *content*, not just the update kinds —
    // a leaked `step` mapped to agent_message_chunk would pass a kinds-only check.
    const { updates } = await promptTurn([textTurn("clean")]);
    expect(new Set(updates.map((u) => u.sessionUpdate))).toEqual(new Set(["agent_message_chunk"]));
    expect(textOf(updates, "agent_message_chunk")).toBe("clean");
  });

  test("hitting the step limit stops with max_turn_requests, not end_turn", async () => {
    // maxSteps=1 with a tool-calling first step: the loop needs a second step and
    // is refused one, which is exactly what ACP's max_turn_requests means.
    const app = await build(
      [
        [
          { type: "tool_call", call: { id: "t1", name: "read", arguments: JSON.stringify({ path: join(work, "x") }) } },
          { type: "done", reason: "tool_calls" },
        ],
      ],
      { maxSteps: 1 },
    );
    const stop = await withAgent(app, (agent) =>
      agent.buildSession(work).withSession(async (s) => (await s.prompt("go")).stopReason),
    );
    expect(stop).toBe("max_turn_requests");
  });

  test("a keyless install fails with auth_required rather than a bare provider error", async () => {
    // `fox --acp` starts before the missing-key check (src/cli.ts), so this path
    // is reachable in production; an editor renders auth_required actionably.
    const { buildAgent } = await import("../src/acp/server.ts");
    const app = buildAgent({
      config: { ...cfg(), apiKey: "" },
      provider: { ...provider(), apiKey: "" },
      chat: mockChat([textTurn("never runs")]) as never,
    });
    const err = await withAgent(app, async (agent) => {
      const s = await agent.request(acp.methods.agent.session.new, { cwd: work, mcpServers: [] });
      return agent
        .request(acp.methods.agent.session.prompt, { sessionId: s.sessionId, prompt: [{ type: "text", text: "hi" }] })
        .then(
          () => null,
          (e) => e as Error,
        );
    });
    expect(String(err)).toMatch(/API key/i);
  });

  test("an empty prompt is refused without calling the model", async () => {
    const app = await build([textTurn("should never run")]);
    const err = await withAgent(app, async (agent) => {
      const s = await agent.request(acp.methods.agent.session.new, { cwd: work, mcpServers: [] });
      return agent.request(acp.methods.agent.session.prompt, { sessionId: s.sessionId, prompt: [] }).then(
        () => null,
        (e) => e as Error,
      );
    });
    expect(String(err)).toMatch(/prompt/i);
  });

  test("prompting an unknown session errors instead of inventing one", async () => {
    const err = await withAgent(await build([textTurn("x")]), (agent) =>
      agent
        .request(acp.methods.agent.session.prompt, {
          sessionId: "no-such-session",
          prompt: [{ type: "text", text: "hi" }],
        })
        .then(
          () => null,
          (e) => e as Error,
        ),
    );
    expect(err).toBeTruthy();
    const { listSessions } = await import("../src/store/db.ts");
    expect(listSessions(10)).toHaveLength(0);
  });
});

describe("acp server: cancellation", () => {
  test("session/cancel mid-turn resolves the prompt as cancelled", async () => {
    // The mock hangs after its first chunk, so the ONLY way this turn ends is the
    // cancel notification reaching runTurnCore's abort signal. It aborts the way a
    // real provider does — the signal rejects the in-flight request — because
    // that is the mechanism `drainStep` relies on to interrupt a live stream.
    const { buildAgent } = await import("../src/acp/server.ts");
    const hang = async function* (
      _cfg: unknown,
      _messages: unknown,
      _tools: unknown,
      signal?: AbortSignal,
    ): AsyncGenerator<StreamEvent> {
      yield { type: "text", delta: "starting" };
      await new Promise((_resolve, reject) => {
        const t = setTimeout(reject, 30_000, new Error("mock was never cancelled"));
        signal?.addEventListener("abort", () => {
          clearTimeout(t);
          reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
        });
      });
    };
    const app = buildAgent({ config: cfg(), provider: provider(), chat: hang as never });
    const stop = await withAgent(app, (agent) =>
      agent.buildSession(work).withSession(async (session) => {
        const p = session.prompt("go");
        // wait for the first chunk so the cancel lands mid-turn, not pre-turn
        for (;;) {
          const msg = await session.nextUpdate();
          if (msg.kind === "stop") return msg.stopReason;
          if (msg.update.sessionUpdate === "agent_message_chunk") break;
        }
        await agent.notify(acp.methods.agent.session.cancel, { sessionId: session.sessionId });
        return (await p).stopReason;
      }),
    );
    expect(stop).toBe("cancelled");
  });
});

describe("acp server: session lifecycle", () => {
  test("new/list/fork/resume/delete all run against the real store", async () => {
    const app = await build([textTurn("first answer")]);
    const out = await withAgent(app, async (agent) => {
      const created = await agent.buildSession(work).withSession(async (s) => {
        await s.prompt("remember this");
        return s.sessionId;
      });
      const listed = await agent.request(acp.methods.agent.session.list, {});
      const forked = await agent.request(acp.methods.agent.session.fork, { sessionId: created, cwd: work });
      await agent.request(acp.methods.agent.session.resume, { sessionId: created, cwd: work, mcpServers: [] });
      await agent.request(acp.methods.agent.session.delete, { sessionId: created });
      const after = await agent.request(acp.methods.agent.session.list, {});
      return { created, forked: forked.sessionId, listed, after };
    });

    expect(out.listed.sessions.map((s) => s.sessionId)).toContain(out.created);
    expect(out.listed.sessions.find((s) => s.sessionId === out.created)?.cwd).toBe(work);
    expect(out.forked).not.toBe(out.created);
    expect(out.after.sessions.map((s) => s.sessionId)).not.toContain(out.created);
    // deleted for real: the file is gone, not just the index row
    expect(existsSync(join(home, "sessions", `${out.created}.db`))).toBe(false);
    // ...and the fork outlives its source, which is the point of one db per session
    expect(existsSync(join(home, "sessions", `${out.forked}.db`))).toBe(true);
  });

  test("session/list reports when a session was last used, not when it was made", async () => {
    const app = await build([textTurn("a")]);
    const db = await import("../src/store/db.ts");
    const out = await withAgent(app, async (agent) => {
      const first = await agent.buildSession(work).withSession(async (s) => {
        await s.prompt("older");
        return s.sessionId;
      });
      // created second and never used again
      const second = await agent.request(acp.methods.agent.session.new, { cwd: work, mcpServers: [] });
      // the clock has millisecond resolution and all of this fits inside one tick
      await Bun.sleep(3);
      // work in the first one again, the way a resumed session would
      db.appendMessage(first, { parent_id: null, role: "user", content: "back again", tokens: 1 });
      const listed = await agent.request(acp.methods.agent.session.list, {});
      return { first, second: second.sessionId, listed };
    });

    const row = out.listed.sessions.find((s) => s.sessionId === out.first)!;
    const idle = out.listed.sessions.find((s) => s.sessionId === out.second)!;
    // an ACP client sorts and labels by this field, so reporting created_at made
    // a session worked in all day look older than one opened and abandoned
    expect(Date.parse(row.updatedAt!)).toBeGreaterThan(Date.parse(idle.updatedAt!));
    expect(Date.parse(row.updatedAt!)).toBeLessThanOrEqual(Date.now());
  });

  test("session/load replays the stored transcript before it returns", async () => {
    // `buildSession` only routes updates for the id IT created, so the replay is
    // observed with a raw notification handler on the client app instead.
    const app = await build([
      [
        { type: "tool_call", call: { id: "t1", name: "read", arguments: JSON.stringify({ path: join(work, "gone") }) } },
        { type: "done", reason: "tool_calls" },
      ],
      textTurn("the stored answer"),
    ]);
    const seen: acp.SessionUpdate[] = [];
    const replayed = await acp
      .client({ name: "test" })
      .onNotification(acp.methods.client.session.update, async ({ params }) => {
        seen.push(params.update);
      })
      .connectWith(app, async (agent) => {
        await agent.request(acp.methods.agent.initialize, {
          protocolVersion: acp.PROTOCOL_VERSION,
          clientCapabilities: {},
        });
        const s = await agent.request(acp.methods.agent.session.new, { cwd: work, mcpServers: [] });
        await agent.request(acp.methods.agent.session.prompt, {
          sessionId: s.sessionId,
          prompt: [{ type: "text", text: "the stored question" }],
        });
        seen.length = 0; // drop the live turn; keep only what load replays
        await agent.request(acp.methods.agent.session.load, { sessionId: s.sessionId, cwd: work, mcpServers: [] });
        return [...seen];
      });

    expect(textOf(replayed, "user_message_chunk")).toBe("the stored question");
    expect(textOf(replayed, "agent_message_chunk")).toBe("the stored answer");
    // a tool call from a previous process has no in-flight state left to report
    expect(replayed.find((u) => u.sessionUpdate === "tool_call")).toMatchObject({ name: "read", status: "completed" });
    expect(replayed.find((u) => u.sessionUpdate === "tool_call_update")).toMatchObject({ status: "failed" });
  });

  test("load, resume, fork and delete of an unknown session are all errors", async () => {
    const errs = await withAgent(await build([]), async (agent) => {
      const attempt = (p: Promise<unknown>) =>
        p.then(
          () => null,
          (e) => e as Error,
        );
      return Promise.all([
        attempt(agent.request(acp.methods.agent.session.load, { sessionId: "ghost", cwd: work, mcpServers: [] })),
        attempt(agent.request(acp.methods.agent.session.resume, { sessionId: "ghost", cwd: work, mcpServers: [] })),
        attempt(agent.request(acp.methods.agent.session.fork, { sessionId: "ghost", cwd: work })),
        attempt(agent.request(acp.methods.agent.session.delete, { sessionId: "ghost" })),
      ]);
    });
    for (const e of errs) expect(e).toBeTruthy();
  });

  test("session/close is safe on an idle session", async () => {
    // It kills the tmux pane and MCP children; with neither started it must still
    // succeed, since a well-behaved client closes every session it opened.
    const closed = await withAgent(await build([]), async (agent) => {
      const s = await agent.request(acp.methods.agent.session.new, { cwd: work, mcpServers: [] });
      await agent.request(acp.methods.agent.session.close, { sessionId: s.sessionId });
      return true;
    });
    expect(closed).toBe(true);
  });
});

describe("acp client: fox-agent driving another agent", () => {
  /** Pair fox-agent's client half against a scripted agent and read its message text. */
  async function driveProbe(app: acp.AgentApp): Promise<string> {
    const { buildClient } = await import("../src/acp/client.ts");
    return buildClient(work).connectWith(app, async (agent) => {
      await agent.request(acp.methods.agent.initialize, {
        protocolVersion: acp.PROTOCOL_VERSION,
        clientCapabilities: {},
      });
      return agent.buildSession(work).withSession(async (s) => {
        void s.prompt("go").catch(() => {});
        for (;;) {
          const msg = await s.nextUpdate();
          if (msg.kind === "stop") return "";
          if (msg.update.sessionUpdate === "agent_message_chunk" && msg.update.content.type === "text") {
            return msg.update.content.text;
          }
        }
      });
    });
  }

  /** A minimal ACP agent whose prompt handler calls back into fox-agent's client. */
  const probe = (onPrompt: (client: acp.AgentContext) => Promise<string>) =>
    acp
      .agent({ name: "probe" })
      .onRequest(acp.methods.agent.initialize, async () => ({ protocolVersion: acp.PROTOCOL_VERSION }))
      .onRequest(acp.methods.agent.session.new, async () => ({ sessionId: "s1" }))
      .onRequest(acp.methods.agent.session.prompt, async ({ client }) => {
        const text = await onPrompt(client);
        await client.notify(acp.methods.client.session.update, {
          sessionId: "s1",
          update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text } },
        });
        return { stopReason: "end_turn" as const };
      });

  test("fs/write_text_file and fs/read_text_file are honored end to end", async () => {
    const target = join(work, "nested", "written.txt");
    const text = await driveProbe(
      probe(async (client) => {
        // a nested path on purpose: the handler mkdirs, so a child need not
        await client.request(acp.methods.client.fs.writeTextFile, {
          sessionId: "s1",
          path: target,
          content: "from the child",
        });
        const back = await client.request(acp.methods.client.fs.readTextFile, { sessionId: "s1", path: target });
        return back.content;
      }),
    );
    expect(text).toBe("from the child");
    expect(await Bun.file(target).text()).toBe("from the child");
  });

  test("fs/read_text_file honors line and limit", async () => {
    await Bun.write(join(work, "lines.txt"), "one\ntwo\nthree\nfour\n");
    const text = await driveProbe(
      probe(async (client) => {
        const r = await client.request(acp.methods.client.fs.readTextFile, {
          sessionId: "s1",
          path: join(work, "lines.txt"),
          line: 2,
          limit: 2,
        });
        return r.content;
      }),
    );
    expect(text).toBe("two\nthree");
  });

  test("a relative path resolves against the session cwd, not the process cwd", async () => {
    await Bun.write(join(work, "rel.txt"), "resolved");
    const text = await driveProbe(
      probe(async (client) => {
        const r = await client.request(acp.methods.client.fs.readTextFile, { sessionId: "s1", path: "rel.txt" });
        return r.content;
      }),
    );
    expect(text).toBe("resolved");
  });

  test("an unreadable file is an error to the child, not an empty string", async () => {
    const text = await driveProbe(
      probe(async (client) => {
        try {
          const r = await client.request(acp.methods.client.fs.readTextFile, {
            sessionId: "s1",
            path: join(work, "absent"),
          });
          return `unexpected:${r.content}`;
        } catch (e) {
          return `errored: ${(e as Error).message}`;
        }
      }),
    );
    expect(text).toStartWith("errored:");
  });

  test("permission requests are auto-approved with an allow option", async () => {
    // fox-agent never prompts a human, so it cannot start prompting on a child's
    // behalf; picking the allow option beats stalling the child forever.
    const text = await driveProbe(
      probe(async (client) => {
        const res = await client.request(acp.methods.client.session.requestPermission, {
          sessionId: "s1",
          toolCall: { toolCallId: "t1", title: "rm -rf" },
          options: [
            { optionId: "no", name: "Reject", kind: "reject_once" },
            { optionId: "yes", name: "Allow", kind: "allow_once" },
            { optionId: "always", name: "Always", kind: "allow_always" },
          ],
        });
        return res.outcome.outcome === "selected" ? res.outcome.optionId : res.outcome.outcome;
      }),
    );
    // allow_always is preferred over allow_once: fox-agent's answer will not change
    expect(text).toBe("always");
  });

  test("with no allow option offered, fox-agent reports cancelled instead of inventing an id", async () => {
    const text = await driveProbe(
      probe(async (client) => {
        const res = await client.request(acp.methods.client.session.requestPermission, {
          sessionId: "s1",
          toolCall: { toolCallId: "t1", title: "nope" },
          options: [{ optionId: "no", name: "Reject", kind: "reject_once" }],
        });
        return res.outcome.outcome;
      }),
    );
    expect(text).toBe("cancelled");
  });
});

describe("event mapping", () => {
  test("every AgentEvent variant maps to exactly one outcome", async () => {
    const { toSessionUpdate } = await import("../src/acp/updates.ts");
    const map = (ev: AgentEvent) => toSessionUpdate(ev, { contextWindow: 128_000 });

    expect(map({ type: "text", delta: "a" })).toEqual({
      sessionUpdate: "agent_message_chunk",
      content: { type: "text", text: "a" },
    });
    expect(map({ type: "reasoning", delta: "a" })).toEqual({
      sessionUpdate: "agent_thought_chunk",
      content: { type: "text", text: "a" },
    });
    expect(map({ type: "tool_start", id: "t", name: "exec", args: '{"cmd":"ls"}' })).toMatchObject({
      sessionUpdate: "tool_call",
      toolCallId: "t",
      kind: "execute",
      status: "pending",
      rawInput: { cmd: "ls" },
    });
    expect(map({ type: "tool_end", id: "t", seq: 3, name: "exec", output: "out", ok: true })).toMatchObject({
      sessionUpdate: "tool_call_update",
      toolCallId: "t",
      status: "completed",
    });
    expect(map({ type: "tool_end", id: "t", seq: 3, name: "exec", output: "boom", ok: false })).toMatchObject({
      status: "failed",
    });
    expect(map({ type: "usage", prompt_tokens: 100, completion_tokens: 20 })).toMatchObject({
      sessionUpdate: "usage_update",
      used: 120,
      size: 128_000,
    });
    expect(map({ type: "compacted", removed: [1, 2], tokens_before: 900, tokens_after: 200 })).toMatchObject({
      sessionUpdate: "compaction_update",
      status: "completed",
    });

    // the five that must produce nothing at all
    expect(map({ type: "step", n: 1 })).toBeNull();
    expect(map({ type: "retry", attempt: 1, delay_ms: 500, error: "429" })).toBeNull();
    expect(map({ type: "warn", message: "hm" })).toBeNull();
    expect(map({ type: "done", reason: "stop" })).toBeNull();
    expect(map({ type: "child_tool", session: "sub", name: "read", done: true, ok: true })).toBeNull();
  });

  test("truncated tool_start args reach the client as a string, not as a dropped field", async () => {
    // turn.ts truncates args to 200 chars before emitting tool_start, so JSON
    // parsing genuinely fails for large calls; the fragment is still useful.
    const { toSessionUpdate } = await import("../src/acp/updates.ts");
    const u = toSessionUpdate({ type: "tool_start", id: "t", name: "write", args: '{"content":"aaaa' }, { contextWindow: 1 });
    expect(u).toMatchObject({ rawInput: '{"content":"aaaa' });
  });

  test("tool kinds cover the whole built-in registry and default to other", async () => {
    const { TOOL_KIND, toolKind } = await import("../src/acp/updates.ts");
    const { baseRegistry } = await import("../src/tools/index.ts");
    const valid = new Set(["read", "edit", "delete", "move", "search", "execute", "think", "fetch", "switch_mode", "other"]);
    // every built-in needs a real entry, not just a valid-looking fallback — a
    // new tool added without one would silently render as a generic icon
    for (const name of baseRegistry().keys()) {
      expect(TOOL_KIND).toHaveProperty(name);
      expect(valid.has(toolKind(name))).toBe(true);
    }
    expect(toolKind("read")).toBe("read");
    expect(toolKind("exec")).toBe("execute");
    // an MCP tool fox-agent knows nothing about
    expect(toolKind("some_mcp_tool")).toBe("other");
  });

  test("fox-agent's free-form finish reasons narrow to ACP's closed set", async () => {
    const { stopReasonFor } = await import("../src/acp/updates.ts");
    expect(stopReasonFor("stop")).toBe("end_turn");
    expect(stopReasonFor("aborted")).toBe("cancelled");
    expect(stopReasonFor("max_steps")).toBe("max_turn_requests");
    expect(stopReasonFor("length")).toBe("max_tokens");
    expect(stopReasonFor("refusal")).toBe("refusal");
    // An unrecognized reason must not be guessed into refusal or max_tokens: the
    // turn did end, and a client acts on those two.
    expect(stopReasonFor("error: provider exploded")).toBe("end_turn");
    expect(stopReasonFor("")).toBe("end_turn");
  });
});

describe("delegation targets", () => {
  test("selfAgent points at something executable in this runtime", async () => {
    const { selfAgent } = await import("../src/tools/task.ts");
    const spec = selfAgent();
    expect(spec.args).toContain("--acp");
    // From source: bun plus an entry script that must exist on disk. Compiled:
    // the binary itself, with Bun.main a virtual /$bunfs path nothing can exec.
    const script = spec.args?.find((a) => a !== "--acp");
    if (script) expect(existsSync(script)).toBe(true);
    else expect(spec.command).toBe(process.execPath);
  });

  test("an unknown agent name is refused with the names that do exist", async () => {
    const { taskRun } = await import("../src/tools/task.ts");
    const res = await taskRun(
      { description: "d", prompt: "p", agent: "nope" },
      {
        sessionId: "s",
        cwd: work,
        readFiles: new Set(),
        agents: { helper: { command: "true" } },
        pty: undefined,
      },
    );
    expect(res.ok).toBe(false);
    expect(res.output).toContain("nope");
    expect(res.output).toContain("helper");
    expect(res.output).toContain("default");
  });

  test("the depth cap refuses to delegate any deeper", async () => {
    // The cap travels in the environment because a child is a separate process;
    // a closure or a kv row could not cross that boundary.
    const { taskRun } = await import("../src/tools/task.ts");
    const prev = process.env.FOX_AGENT_DELEGATION_DEPTH;
    process.env.FOX_AGENT_DELEGATION_DEPTH = "3";
    try {
      const res = await taskRun(
        { description: "d", prompt: "p" },
        { sessionId: "s", cwd: work, readFiles: new Set(), pty: undefined },
      );
      expect(res.ok).toBe(false);
      expect(res.output).toContain("depth limit");
    } finally {
      if (prev === undefined) delete process.env.FOX_AGENT_DELEGATION_DEPTH;
      else process.env.FOX_AGENT_DELEGATION_DEPTH = prev;
    }
  });
});
