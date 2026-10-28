// The A2A server, driven through its real request handler.
//
// Every operation in §3.1 is exercised here over actual HTTP requests and
// responses — no mocks of the protocol layer — so a wrong field name or a 0.3
// spelling creeping into 1.0 output fails a test rather than a peer.
//
// The turn loop is replaced with a scripted `chat` so no provider is needed; the
// rest (sessions, events, the store) is the real thing.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createA2aHandler, type A2aHandler, type A2aServerOptions } from "../src/a2a/server.ts";
import { defaultConfig } from "../src/core/config.ts";
import type { ProviderConfig } from "../src/providers/types.ts";
import type { StreamEvent } from "../src/providers/types.ts";

let dir: string;
let handler: A2aHandler | undefined;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "fox-a2a-"));
  process.env.FOX_AGENT_HOME = join(dir, ".fox");
  process.env.FOX_AGENT_CONFIG = join(dir, ".fox", "config.toml");
});

afterEach(() => {
  handler?.close();
  handler = undefined;
  rmSync(dir, { recursive: true, force: true });
  delete process.env.FOX_AGENT_HOME;
  delete process.env.FOX_AGENT_CONFIG;
});

const provider = (): ProviderConfig =>
  ({ format: "openai-compatible", baseUrl: "http://127.0.0.1:9/v1", apiKey: "test", model: "test-model" }) as ProviderConfig;

/** A handler whose turns answer with `reply` (no tools, no network). */
function serve(reply = "hello from the agent", extra: Partial<A2aServerOptions> = {}): A2aHandler {
  const config = defaultConfig({ model: "test-model", baseUrl: "http://127.0.0.1:9/v1", apiKey: "test" });
  handler = createA2aHandler({
    config,
    provider: provider(),
    portValue: 1234,
    // The protocol is what is under test, so the turn is scripted: no network,
    // no key, deterministic output.
    chat: scriptedChat(),
    ...extra,
  });
  return handler;
}

/**
 * A `ChatFn` that streams one fixed reply in two deltas.
 *
 * Two rather than one so a consumer that only handles a single chunk shows up
 * as a failure instead of passing quietly.
 */
function scriptedChat(): any {
  return async function* (): AsyncGenerator<StreamEvent> {
    const reply = String(globalThis.__a2aReply ?? "hello from the agent");
    const half = Math.ceil(reply.length / 2);
    yield { type: "text", delta: reply.slice(0, half) } as StreamEvent;
    yield { type: "text", delta: reply.slice(half) } as StreamEvent;
    yield { type: "usage", prompt_tokens: 5, completion_tokens: 3, cached_tokens: 0 } as StreamEvent;
    yield { type: "done", reason: "stop" } as StreamEvent;
  };
}

declare global {
  // eslint-disable-next-line no-var
  var __a2aReply: string | undefined;
}

async function rpc(
  body: Record<string, unknown>,
  opts: { version?: string | null; token?: string; path?: string } = {},
): Promise<{ status: number; json: any; headers: Headers }> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (opts.version !== null) headers["a2a-version"] = opts.version ?? "1.0";
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  const res = await handler!.fetch(
    new Request(`http://127.0.0.1:1234${opts.path ?? "/"}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    }),
  );
  const text = await res.clone().text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { status: res.status, json, headers: res.headers };
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const sendParams = (text: string, extra: Record<string, unknown> = {}) => ({
  message: { messageId: `m-${Math.random().toString(36).slice(2)}`, role: "ROLE_USER", parts: [{ text }] },
  ...extra,
});

afterEach(() => {
  globalThis.__a2aReply = undefined;
});

describe("agent card discovery (§8)", () => {
  test("served at the 1.0 well-known path, with supportedInterfaces", async () => {
    serve();
    const res = await handler!.fetch(
      new Request("http://127.0.0.1:1234/.well-known/agent-card.json", { headers: { "a2a-version": "1.0" } }),
    );
    expect(res.status).toBe(200);
    const card = await res.json();
    expect(card.name).toBe("fox-agent");
    expect(card.supportedInterfaces[0].protocolBinding).toBe("JSONRPC");
    expect(card.supportedInterfaces[0].protocolVersion).toBe("1.0");
    // the 0.3 transport spelling must NOT appear in a 1.0 card
    expect(card.preferredTransport).toBeUndefined();
  });

  test("a 0.3 client gets the legacy card spelling", async () => {
    serve();
    const res = await handler!.fetch(
      new Request("http://127.0.0.1:1234/.well-known/agent-card.json", { headers: { "a2a-version": "0.3" } }),
    );
    const card = await res.json();
    expect(card.url).toBeTruthy();
    expect(card.preferredTransport).toBe("JSONRPC");
  });

  test("the card is cacheable and carries an ETag (§8.6.1)", async () => {
    serve();
    const res = await handler!.fetch(new Request("http://127.0.0.1:1234/.well-known/agent-card.json"));
    expect(res.headers.get("cache-control")).toContain("max-age");
    expect(res.headers.get("etag")).toBeTruthy();
  });

  test("the legacy /agent.json path still answers", async () => {
    serve();
    const res = await handler!.fetch(new Request("http://127.0.0.1:1234/.well-known/agent.json"));
    expect(res.status).toBe(200);
  });

  test("capabilities are declared honestly", async () => {
    serve();
    const card = await (await handler!.fetch(new Request("http://127.0.0.1:1234/.well-known/agent-card.json"))).json();
    expect(card.capabilities.streaming).toBe(true);
    expect(card.capabilities.pushNotifications).toBe(true);
    // no extended card was configured, so it must not be advertised
    expect(card.capabilities.extendedAgentCard).toBe(false);
  });
});

describe("version negotiation (§3.6)", () => {
  test("an unsupported version is VersionNotSupported (-32009)", async () => {
    serve();
    const r = await rpc({ jsonrpc: "2.0", id: 1, method: "GetTask", params: { id: "x" } }, { version: "0.5" });
    expect(r.json.error.code).toBe(-32009);
    const info = r.json.error.data[0];
    expect(info.metadata.requestedVersion).toBe("0.5");
    expect(info.metadata.supportedVersions).toContain("1.0");
  });

  test("an absent version means 0.3, per §3.6.2", async () => {
    serve();
    // 0.3 method name, 0.3 payload: this must work rather than fail
    const r = await rpc(
      { jsonrpc: "2.0", id: 1, method: "message/send", params: sendParams("hi") },
      { version: null },
    );
    expect(r.json.error).toBeUndefined();
    // and the state comes back in the 0.3 spelling
    expect(r.json.result.task.status.state).toBe("completed");
  });

  test("the same operation answers in each dialect's own spelling", async () => {
    serve();
    globalThis.__a2aReply = "ok";
    const one = await rpc({ jsonrpc: "2.0", id: 1, method: "SendMessage", params: sendParams("hi") }, { version: "1.0" });
    expect(one.json.result.task.status.state).toBe("TASK_STATE_COMPLETED");

    const old = await rpc({ jsonrpc: "2.0", id: 2, method: "SendMessage", params: sendParams("hi") }, { version: "0.3" });
    expect(old.json.result.task.status.state).toBe("completed");
  });

  test("a legacy method name is accepted under the 1.0 header too", async () => {
    // §A.2: servers MAY accept both forms during the overlap
    serve();
    const r = await rpc({ jsonrpc: "2.0", id: 1, method: "message/send", params: sendParams("hi") }, { version: "1.0" });
    expect(r.json.error).toBeUndefined();
  });
});

describe("SendMessage (§3.1.1)", () => {
  test("returns a task with a context, artifacts and a terminal state", async () => {
    serve();
    globalThis.__a2aReply = "the answer is 4";
    const r = await rpc({ jsonrpc: "2.0", id: 1, method: "SendMessage", params: sendParams("2+2?") });
    const task = r.json.result.task;
    expect(task.id).toBeTruthy();
    expect(task.contextId).toBeTruthy();
    expect(task.status.state).toBe("TASK_STATE_COMPLETED");
    // §5.6.1: a timestamp on every status
    expect(task.status.timestamp).toMatch(/Z$/);
    // §3.1.2 streams the reply in deltas, so the artifact accumulates several
    // parts — they join to the whole answer
    expect(task.artifacts[0].parts.map((p: any) => p.text).join("")).toBe("the answer is 4");
  });

  test("1.0 output has no kind discriminator anywhere (§A.2.1)", async () => {
    serve();
    globalThis.__a2aReply = "x";
    const r = await rpc({ jsonrpc: "2.0", id: 1, method: "SendMessage", params: sendParams("hi") });
    const wire = JSON.stringify(r.json);
    expect(wire).not.toContain('"kind"');
    // and the message parts are the flat {text} form
    expect(r.json.result.task.history[0].parts[0]).toEqual({ text: "hi" });
  });

  test("a message with no parts is InvalidParams with a field detail (§3.3.2)", async () => {
    serve();
    const r = await rpc({
      jsonrpc: "2.0",
      id: 1,
      method: "SendMessage",
      params: { message: { messageId: "m", role: "ROLE_USER", parts: [] } },
    });
    expect(r.json.error.code).toBe(-32602);
    expect(r.json.error.data[0].fieldViolations[0].field).toBe("message.parts");
  });

  test("a missing messageId is rejected", async () => {
    serve();
    const r = await rpc({
      jsonrpc: "2.0",
      id: 1,
      method: "SendMessage",
      params: { message: { role: "ROLE_USER", parts: [{ text: "hi" }] } },
    });
    expect(r.json.error.code).toBe(-32602);
  });

  test("returnImmediately hands back a running task (§3.2.2)", async () => {
    serve();
    globalThis.__a2aReply = "slow";
    const r = await rpc({
      jsonrpc: "2.0",
      id: 1,
      method: "SendMessage",
      params: sendParams("hi", { configuration: { returnImmediately: true } }),
    });
    const state = r.json.result.task.status.state;
    // it may already be finished on a fast machine, but it must never be an error
    expect(["TASK_STATE_SUBMITTED", "TASK_STATE_WORKING", "TASK_STATE_COMPLETED"]).toContain(state);
  });
});

describe("multi-turn (§3.4)", () => {
  test("a follow-up message continues the same task and history grows", async () => {
    // The task must still be open: a blocking send finishes it, and §3.1.1
    // correctly refuses a message to a terminal task. So hold the first turn
    // open with a gate, continue while it is working, then release it.
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    serve();
    handler!.store; // (handler is created by serve with the scripted chat below)
    const config = defaultConfig({ model: "test-model", baseUrl: "http://127.0.0.1:9/v1", apiKey: "test" });
    handler!.close();
    handler = createA2aHandler({
      config,
      provider: provider(),
      portValue: 1234,
      chat: (async function* () {
        await gate;
        yield { type: "text", delta: "answered" } as StreamEvent;
        yield { type: "done", reason: "stop" } as StreamEvent;
      }) as any,
    });

    const first = await rpc({
      jsonrpc: "2.0",
      id: 1,
      method: "SendMessage",
      params: sendParams("one", { configuration: { returnImmediately: true } }),
    });
    const taskId = first.json.result.task.id;
    const ctx = first.json.result.task.contextId;
    expect(first.json.result.task.status.state).toBe("TASK_STATE_WORKING");

    const second = await rpc({
      jsonrpc: "2.0",
      id: 2,
      method: "SendMessage",
      params: {
        message: { messageId: "m2", role: "ROLE_USER", parts: [{ text: "two" }], taskId, contextId: ctx },
        configuration: { returnImmediately: true },
      },
    });
    release();
    expect(second.json.error).toBeUndefined();
    expect(second.json.result.task.id).toBe(taskId);
    // both user messages are in the task's history
    const got = await rpc({ jsonrpc: "2.0", id: 3, method: "GetTask", params: { id: taskId } });
    const texts = got.json.result.history.flatMap((m: any) => m.parts.map((p: any) => p.text));
    expect(texts).toContain("one");
    expect(texts).toContain("two");
  });

  test("a mismatched contextId for a known task is rejected (§3.4.3)", async () => {
    serve();
    globalThis.__a2aReply = "ok";
    const first = await rpc({ jsonrpc: "2.0", id: 1, method: "SendMessage", params: sendParams("one") });
    const taskId = first.json.result.task.id;
    const r = await rpc({
      jsonrpc: "2.0",
      id: 2,
      method: "SendMessage",
      params: { message: { messageId: "m2", role: "ROLE_USER", parts: [{ text: "two" }], taskId, contextId: "a-different-context" } },
    });
    expect(r.json.error.code).toBe(-32602);
  });

  test("a message to an unknown taskId is TaskNotFound (§3.4.2)", async () => {
    serve();
    const r = await rpc({
      jsonrpc: "2.0",
      id: 1,
      method: "SendMessage",
      params: { message: { messageId: "m", role: "ROLE_USER", parts: [{ text: "x" }], taskId: "ghost" } },
    });
    expect(r.json.error.code).toBe(-32001);
  });

  test("a message to a terminal task is UnsupportedOperation (§3.1.1)", async () => {
    serve();
    globalThis.__a2aReply = "done";
    const first = await rpc({ jsonrpc: "2.0", id: 1, method: "SendMessage", params: sendParams("one") });
    const taskId = first.json.result.task.id;
    // wait for the task to settle
    await Bun.sleep(50);
    const r = await rpc({
      jsonrpc: "2.0",
      id: 2,
      method: "SendMessage",
      params: { message: { messageId: "m2", role: "ROLE_USER", parts: [{ text: "more" }], taskId } },
    });
    expect(r.json.error.code).toBe(-32004);
  });

  test("priority: a new message with only a contextId starts a new task in that context", async () => {
    serve();
    globalThis.__a2aReply = "ok";
    const first = await rpc({ jsonrpc: "2.0", id: 1, method: "SendMessage", params: sendParams("one") });
    const ctx = first.json.result.task.contextId;
    const second = await rpc({
      jsonrpc: "2.0",
      id: 2,
      method: "SendMessage",
      params: { message: { messageId: "m2", role: "ROLE_USER", parts: [{ text: "two" }], contextId: ctx } },
    });
    expect(second.json.result.task.id).not.toBe(first.json.result.task.id);
    expect(second.json.result.task.contextId).toBe(ctx);
  });
});

describe("GetTask (§3.1.3)", () => {
  test("returns the task, with history truncated on request", async () => {
    serve();
    globalThis.__a2aReply = "ok";
    const sent = await rpc({ jsonrpc: "2.0", id: 1, method: "SendMessage", params: sendParams("one") });
    const id = sent.json.result.task.id;

    const full = await rpc({ jsonrpc: "2.0", id: 2, method: "GetTask", params: { id } });
    expect(full.json.result.history.length).toBeGreaterThan(0);

    const none = await rpc({ jsonrpc: "2.0", id: 3, method: "GetTask", params: { id, historyLength: 0 } });
    expect(none.json.result.history).toBeUndefined();
  });

  test("an unknown id is TaskNotFound", async () => {
    serve();
    const r = await rpc({ jsonrpc: "2.0", id: 1, method: "GetTask", params: { id: "nope" } });
    expect(r.json.error.code).toBe(-32001);
  });

  test("a negative historyLength is InvalidParams", async () => {
    serve();
    globalThis.__a2aReply = "ok";
    const sent = await rpc({ jsonrpc: "2.0", id: 1, method: "SendMessage", params: sendParams("x") });
    const r = await rpc({ jsonrpc: "2.0", id: 2, method: "GetTask", params: { id: sent.json.result.task.id, historyLength: -5 } });
    expect(r.json.error.code).toBe(-32602);
  });
});

describe("ListTasks (§3.1.4)", () => {
  test("lists tasks newest first with a total and an empty cursor on the last page", async () => {
    serve();
    globalThis.__a2aReply = "ok";
    for (let i = 0; i < 3; i++) {
      await rpc({ jsonrpc: "2.0", id: i + 1, method: "SendMessage", params: sendParams(`n${i}`) });
    }
    const r = await rpc({ jsonrpc: "2.0", id: 99, method: "ListTasks", params: { pageSize: 10 } });
    expect(r.json.result.tasks).toHaveLength(3);
    expect(r.json.result.totalSize).toBe(3);
    expect(r.json.result.pageSize).toBe(10);
    // §3.1.4: always present, "" when there is nothing more
    expect(r.json.result.nextPageToken).toBe("");
  });

  test("pagination walks every task exactly once", async () => {
    serve();
    globalThis.__a2aReply = "ok";
    for (let i = 0; i < 5; i++) {
      await rpc({ jsonrpc: "2.0", id: i + 1, method: "SendMessage", params: sendParams(`n${i}`) });
    }
    const seen: string[] = [];
    let token: string | undefined;
    for (let i = 0; i < 10; i++) {
      const r = await rpc({ jsonrpc: "2.0", id: 100 + i, method: "ListTasks", params: { pageSize: 2, pageToken: token } });
      seen.push(...r.json.result.tasks.map((t: any) => t.id));
      if (!r.json.result.nextPageToken) break;
      token = r.json.result.nextPageToken;
    }
    expect(seen).toHaveLength(5);
    expect(new Set(seen).size).toBe(5);
  });

  test("filters by contextId and status", async () => {
    serve();
    globalThis.__a2aReply = "ok";
    const a = await rpc({ jsonrpc: "2.0", id: 1, method: "SendMessage", params: sendParams("a") });
    await rpc({ jsonrpc: "2.0", id: 2, method: "SendMessage", params: sendParams("b") });
    const ctx = a.json.result.task.contextId;
    const byCtx = await rpc({ jsonrpc: "2.0", id: 3, method: "ListTasks", params: { contextId: ctx } });
    expect(byCtx.json.result.totalSize).toBe(1);
    const byStatus = await rpc({ jsonrpc: "2.0", id: 4, method: "ListTasks", params: { status: "TASK_STATE_COMPLETED" } });
    expect(byStatus.json.result.tasks.length).toBeGreaterThan(0);
  });

  test("artifacts are omitted unless includeArtifacts is set", async () => {
    serve();
    globalThis.__a2aReply = "ok";
    await rpc({ jsonrpc: "2.0", id: 1, method: "SendMessage", params: sendParams("a") });
    const plain = await rpc({ jsonrpc: "2.0", id: 2, method: "ListTasks", params: {} });
    expect(plain.json.result.tasks[0].artifacts).toBeUndefined();
    const withArt = await rpc({ jsonrpc: "2.0", id: 3, method: "ListTasks", params: { includeArtifacts: true } });
    expect(withArt.json.result.tasks[0].artifacts).toBeDefined();
  });

  test("an out-of-range pageSize or unknown status is InvalidParams (§6.5)", async () => {
    serve();
    const big = await rpc({ jsonrpc: "2.0", id: 1, method: "ListTasks", params: { pageSize: 150 } });
    expect(big.json.error.code).toBe(-32602);
    const bad = await rpc({ jsonrpc: "2.0", id: 2, method: "ListTasks", params: { status: "TASK_STATE_RUNNING" } });
    expect(bad.json.error.code).toBe(-32602);
    expect(JSON.stringify(bad.json.error.data)).toContain("TASK_STATE_SUBMITTED");
  });
});

describe("CancelTask (§3.1.5)", () => {
  test("cancels a running task and returns it as canceled", async () => {
    serve();
    globalThis.__a2aReply = "x";
    const sent = await rpc({
      jsonrpc: "2.0",
      id: 1,
      method: "SendMessage",
      params: sendParams("go", { configuration: { returnImmediately: true } }),
    });
    const id = sent.json.result.task.id;
    const r = await rpc({ jsonrpc: "2.0", id: 2, method: "CancelTask", params: { id } });
    // either it canceled, or the turn already finished — both are legal, and
    // §3.1.5 says success is not guaranteed
    if (r.json.error) {
      expect(r.json.error.code).toBe(-32002);
    } else {
      expect(["TASK_STATE_CANCELED", "TASK_STATE_COMPLETED"]).toContain(r.json.result.status.state);
    }
  });

  test("a finished task is TaskNotCancelable (-32002)", async () => {
    serve();
    globalThis.__a2aReply = "done";
    const sent = await rpc({ jsonrpc: "2.0", id: 1, method: "SendMessage", params: sendParams("x") });
    const r = await rpc({ jsonrpc: "2.0", id: 2, method: "CancelTask", params: { id: sent.json.result.task.id } });
    expect(r.json.error.code).toBe(-32002);
  });

  test("an unknown task is TaskNotFound", async () => {
    serve();
    const r = await rpc({ jsonrpc: "2.0", id: 1, method: "CancelTask", params: { id: "ghost" } });
    expect(r.json.error.code).toBe(-32001);
  });
});

describe("SendStreamingMessage (§3.1.2)", () => {
  /** Read SSE frames out of a response. */
  async function frames(res: Response): Promise<any[]> {
    const text = await res.text();
    return text
      .split(/\r?\n\r?\n/)
      .map((chunk) => chunk.split(/\r?\n/).filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()).join("\n"))
      .filter(Boolean)
      .map((d) => JSON.parse(d).result);
  }

  test("streams the task first, then artifact updates, then a terminal status", async () => {
    serve();
    globalThis.__a2aReply = "streamed answer";
    const res = await handler!.fetch(
      new Request("http://127.0.0.1:1234/", {
        method: "POST",
        headers: { "content-type": "application/json", "a2a-version": "1.0" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 7, method: "SendStreamingMessage", params: sendParams("go") }),
      }),
    );
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    const got = await frames(res);
    // §3.1.2: the stream begins with a Task
    expect(got[0].task).toBeDefined();
    // then artifact updates carrying the text
    const text = got
      .filter((f) => f.artifactUpdate && f.artifactUpdate.append)
      .flatMap((f) => f.artifactUpdate.artifact.parts.map((p: any) => p.text))
      .join("");
    expect(text).toContain("streamed answer");
    // and it ends with a terminal status
    const last = got.at(-1);
    expect(last.statusUpdate.status.state).toBe("TASK_STATE_COMPLETED");
    // 1.0 frames are discriminated by member name only
    expect(JSON.stringify(got)).not.toContain('"kind"');
  });

  test("the legacy spelling of the same stream uses kind and final", async () => {
    serve();
    globalThis.__a2aReply = "old answer";
    const res = await handler!.fetch(
      new Request("http://127.0.0.1:1234/", {
        method: "POST",
        headers: { "content-type": "application/json", "a2a-version": "0.3" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 8, method: "message/stream", params: sendParams("go") }),
      }),
    );
    const got = await frames(res);
    expect(got[0].kind).toBe("task");
    const terminal = got.at(-1);
    expect(terminal.kind).toBe("status-update");
    expect(terminal.status.state).toBe("completed");
    // 0.3 carried terminality on the event
    expect(terminal.final).toBe(true);
  });
});

describe("SubscribeToTask (§3.1.6)", () => {
  test("an unknown task is TaskNotFound", async () => {
    serve();
    const r = await rpc({ jsonrpc: "2.0", id: 1, method: "SubscribeToTask", params: { id: "ghost" } });
    expect(r.json.error.code).toBe(-32001);
  });

  test("a terminal task is UnsupportedOperation, per §9.4.6", async () => {
    serve();
    globalThis.__a2aReply = "done";
    const sent = await rpc({ jsonrpc: "2.0", id: 1, method: "SendMessage", params: sendParams("x") });
    const r = await rpc({ jsonrpc: "2.0", id: 2, method: "SubscribeToTask", params: { id: sent.json.result.task.id } });
    expect(r.json.error.code).toBe(-32004);
    expect(r.json.error.message).toContain("terminal");
  });
});

describe("push notification configs (§3.1.7-§3.1.10)", () => {
  test("create, get, list, delete round-trip", async () => {
    serve();
    globalThis.__a2aReply = "ok";
    const sent = await rpc({ jsonrpc: "2.0", id: 1, method: "SendMessage", params: sendParams("x") });
    const taskId = sent.json.result.task.id;

    const created = await rpc({
      jsonrpc: "2.0",
      id: 2,
      method: "CreateTaskPushNotificationConfig",
      params: { taskId, pushNotificationConfig: { url: "https://client.example/hook" } },
    });
    expect(created.json.error).toBeUndefined();
    const configId = created.json.result.id;
    expect(created.json.result.url).toBe("https://client.example/hook");

    const got = await rpc({ jsonrpc: "2.0", id: 3, method: "GetTaskPushNotificationConfig", params: { taskId, configId } });
    expect(got.json.result.url).toBe("https://client.example/hook");

    const list = await rpc({ jsonrpc: "2.0", id: 4, method: "ListTaskPushNotificationConfigs", params: { taskId } });
    expect(list.json.result.configs).toHaveLength(1);

    const del = await rpc({ jsonrpc: "2.0", id: 5, method: "DeleteTaskPushNotificationConfig", params: { taskId, configId } });
    expect(del.json.error).toBeUndefined();
    const after = await rpc({ jsonrpc: "2.0", id: 6, method: "ListTaskPushNotificationConfigs", params: { taskId } });
    expect(after.json.result.configs).toHaveLength(0);
  });

  test("a config attached at send time is honoured and the webhook fires (§6.6)", async () => {
    serve();
    globalThis.__a2aReply = "notified";
    const seen: any[] = [];
    const hook = Bun.serve({
      port: 0,
      hostname: "127.0.0.1",
      async fetch(req) {
        seen.push(await req.json());
        return new Response("ok");
      },
    });
    try {
      await rpc({
        jsonrpc: "2.0",
        id: 1,
        method: "SendMessage",
        params: sendParams("x", {
          configuration: { taskPushNotificationConfig: { url: `http://127.0.0.1:${hook.port}/hook` } },
        }),
      });
      await handler!.store.drain(3_000);
      expect(seen.length).toBeGreaterThan(0);
      // the payload is a StreamResponse (§4.3.3)
      expect(seen.some((b) => b.statusUpdate?.status?.state === "TASK_STATE_COMPLETED")).toBe(true);
    } finally {
      hook.stop(true);
    }
  }, 15_000);

  test("capability off means PushNotificationNotSupported, not a silent no-op (§3.3.4)", async () => {
    serve("ok", { card: { capabilities: { streaming: true, pushNotifications: false } } });
    globalThis.__a2aReply = "ok";
    const sent = await rpc({ jsonrpc: "2.0", id: 1, method: "SendMessage", params: sendParams("x") });
    const r = await rpc({
      jsonrpc: "2.0",
      id: 2,
      method: "CreateTaskPushNotificationConfig",
      params: { taskId: sent.json.result.task.id, pushNotificationConfig: { url: "https://x" } },
    });
    expect(r.json.error.code).toBe(-32003);
  });
});

describe("GetExtendedAgentCard (§3.1.11)", () => {
  test("declared-but-unconfigured is its own error (-32007), not unsupported", async () => {
    serve("ok", { card: { capabilities: { streaming: true, pushNotifications: true, extendedAgentCard: true } } });
    const r = await rpc({ jsonrpc: "2.0", id: 1, method: "GetExtendedAgentCard", params: {} });
    expect(r.json.error.code).toBe(-32007);
  });

  test("when the capability is off it is UnsupportedOperation (§3.3.4)", async () => {
    serve();
    const r = await rpc({ jsonrpc: "2.0", id: 1, method: "GetExtendedAgentCard", params: {} });
    expect(r.json.error.code).toBe(-32004);
  });

  test("a configured extended card is returned", async () => {
    const base = defaultConfig({ model: "m", baseUrl: "http://x", apiKey: "k" });
    handler = createA2aHandler({
      config: base,
      provider: provider(),
      extendedCard: {
        name: "ext",
        description: "d",
        supportedInterfaces: [{ url: "http://x", protocolBinding: "JSONRPC", protocolVersion: "1.0" }],
        version: "9",
        capabilities: {},
        defaultInputModes: ["text/plain"],
        defaultOutputModes: ["text/plain"],
        skills: [],
      },
      card: { capabilities: { streaming: true, pushNotifications: true, extendedAgentCard: true } },
    });
    const r = await rpc({ jsonrpc: "2.0", id: 1, method: "GetExtendedAgentCard", params: {} });
    expect(r.json.result.name).toBe("ext");
  });
});

describe("authentication (§7)", () => {
  test("a token-protected endpoint refuses an unauthenticated RPC", async () => {
    serve("ok", { authToken: "s3cret" });
    const r = await rpc({ jsonrpc: "2.0", id: 1, method: "ListTasks", params: {} });
    expect(r.status).toBe(401);
    expect(r.headers.get("www-authenticate")).toContain("Bearer");
  });

  test("the right token is accepted, a wrong one is not", async () => {
    serve("ok", { authToken: "s3cret" });
    const good = await rpc({ jsonrpc: "2.0", id: 1, method: "ListTasks", params: {} }, { token: "s3cret" });
    expect(good.json.error).toBeUndefined();
    const bad = await rpc({ jsonrpc: "2.0", id: 2, method: "ListTasks", params: {} }, { token: "s3cre" });
    expect(bad.status).toBe(401);
  });

  test("the card declares the bearer scheme when a token is configured", async () => {
    serve("ok", { authToken: "s3cret" });
    const card = await (await handler!.fetch(new Request("http://127.0.0.1:1234/.well-known/agent-card.json"))).json();
    expect(card.securitySchemes.bearer.httpAuthSecurityScheme.scheme).toBe("Bearer");
    expect(card.securityRequirements).toHaveLength(1);
  });
});

describe("protocol-level rejections (§9.5)", () => {
  test("unknown method is -32601", async () => {
    serve();
    const r = await rpc({ jsonrpc: "2.0", id: 1, method: "NoSuchMethod", params: {} });
    expect(r.json.error.code).toBe(-32601);
  });

  test("malformed JSON is -32700 with a null id", async () => {
    serve();
    const res = await handler!.fetch(
      new Request("http://127.0.0.1:1234/", {
        method: "POST",
        headers: { "content-type": "application/json", "a2a-version": "1.0" },
        body: "{not json",
      }),
    );
    const body = await res.json();
    expect(body.error.code).toBe(-32700);
    expect(body.id).toBeNull();
  });

  test("a non-RPC path is 404", async () => {
    serve();
    const res = await handler!.fetch(new Request("http://127.0.0.1:1234/nope"));
    expect(res.status).toBe(404);
  });

  test("every JSON-RPC error response is still valid JSON with jsonrpc 2.0", async () => {
    serve();
    const r = await rpc({ jsonrpc: "2.0", id: 5, method: "GetTask", params: { id: "ghost" } });
    expect(r.json.jsonrpc).toBe("2.0");
    expect(r.json.id).toBe(5);
    expect(typeof r.json.error.message).toBe("string");
  });
});
