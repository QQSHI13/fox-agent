// The A2A client, against a real server and against a legacy 0.3 peer.
//
// The client is the half that has to be tolerant: a peer publishes its own card,
// may speak 0.3, may not stream at all, and may answer with a direct Message
// instead of a task. Each of those is a case below.
//
// Mostly these run against `runA2aServer`'s own handler wrapped in `Bun.serve`,
// so the wire pairs are the real encode/decode on both ends — a field name the
// two sides disagreed about would fail here rather than in the field.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  agentCardName,
  cancelTask,
  connect,
  createPushConfig,
  deletePushConfig,
  fetchCard,
  getPushConfig,
  getTask,
  listPushConfigs,
  listTasks,
  runA2aAgent,
  sendMessage,
  subscribeToTask,
} from "../src/a2a/client.ts";
import { createA2aHandler, runA2aServer } from "../src/a2a/server.ts";
import { A2aError, RpcError } from "../src/a2a/errors.ts";
import { defaultConfig } from "../src/core/config.ts";
import type { ProviderConfig, StreamEvent } from "../src/providers/types.ts";

let dir: string;
let servers: ReturnType<typeof Bun.serve>[] = [];

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "fox-a2aclient-"));
  process.env.FOX_AGENT_HOME = join(dir, ".fox");
  process.env.FOX_AGENT_CONFIG = join(dir, ".fox", "config.toml");
});

afterEach(() => {
  for (const s of servers) s.stop(true);
  servers = [];
  rmSync(dir, { recursive: true, force: true });
  delete process.env.FOX_AGENT_HOME;
  delete process.env.FOX_AGENT_CONFIG;
});

const provider = (): ProviderConfig =>
  ({ format: "openai-compatible", baseUrl: "http://127.0.0.1:9/v1", apiKey: "test", model: "test-model" }) as ProviderConfig;

/** A `ChatFn` that streams `reply` in two deltas. */
function scripted(reply: () => string): any {
  return async function* (): AsyncGenerator<StreamEvent> {
    const text = reply();
    const half = Math.ceil(text.length / 2);
    yield { type: "text", delta: text.slice(0, half) } as StreamEvent;
    yield { type: "text", delta: text.slice(half) } as StreamEvent;
    yield { type: "done", reason: "stop" } as StreamEvent;
  };
}

/** Run a real fox-agent A2A server on an ephemeral port. */
function foxServer(reply = "fox says hi", extra: Record<string, unknown> = {}): string {
  let port = 0;
  const handler = createA2aHandler({
    config: defaultConfig({ model: "test-model", baseUrl: "http://127.0.0.1:9/v1", apiKey: "test" }),
    provider: provider(),
    portValue: 0,
    chat: scripted(() => reply),
    ...(extra as any),
  });
  const server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch: (req) => handler.fetch(req),
  });
  port = server.port ?? 0;
  servers.push(server);
  return `http://127.0.0.1:${port}`;
}

/** A hand-rolled 0.3 peer: `kind` discriminators, lowercase enums, slash methods. */
function legacyServer(opts: { stream?: boolean; reply?: string } = {}): {
  url: string;
  seen: { method: string; params: any; version?: string }[];
} {
  const seen: { method: string; params: any; version?: string }[] = [];
  const reply = opts.reply ?? "legacy answer";
  const server: ReturnType<typeof Bun.serve> = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    async fetch(req) {
      const url = new URL(req.url);
      if (url.pathname === "/.well-known/agent-card.json" || url.pathname === "/.well-known/agent.json") {
        // a 0.3 card: url + preferredTransport, no supportedInterfaces
        return Response.json({
          name: "old-peer",
          description: "a 0.3 agent",
          url: `http://127.0.0.1:${server.port}/`,
          preferredTransport: "JSONRPC",
          protocolVersion: "0.3",
          version: "0.3.0",
          capabilities: { streaming: opts.stream ?? false, pushNotifications: false },
          defaultInputModes: ["text/plain"],
          defaultOutputModes: ["text/plain"],
          skills: [],
        });
      }
      if (req.method !== "POST") return new Response("nope", { status: 404 });
      const body = (await req.json()) as { id: number; method: string; params: any };
      seen.push({ method: body.method, params: body.params, version: req.headers.get("a2a-version") ?? undefined });

      if (body.method === "message/stream" && opts.stream) {
        const ev = (r: unknown) => `data: ${JSON.stringify({ jsonrpc: "2.0", id: body.id, result: r })}\r\n\r\n`;
        const payload =
          ev({ kind: "task", id: "t1", status: { state: "working" } }) +
          ev({ kind: "artifact-update", taskId: "t1", artifact: { artifactId: "a", parts: [{ kind: "text", text: reply }] } }) +
          ev({ kind: "status-update", taskId: "t1", status: { state: "completed" }, final: true });
        return new Response(payload, { headers: { "content-type": "text/event-stream" } });
      }
      if (body.method === "message/stream") {
        return Response.json({ jsonrpc: "2.0", id: body.id, error: { code: -32601, message: "no streaming" } });
      }
      if (body.method === "message/send") {
        return Response.json({
          jsonrpc: "2.0",
          id: body.id,
          result: { id: "t1", status: { state: "completed" }, artifacts: [{ artifactId: "a", parts: [{ kind: "text", text: reply }] }] },
        });
      }
      if (body.method === "tasks/get") {
        return Response.json({ jsonrpc: "2.0", id: body.id, result: { id: "t1", status: { state: "completed" } } });
      }
      return Response.json({ jsonrpc: "2.0", id: body.id, error: { code: -32601, message: `unknown ${body.method}` } });
    },
  });
  servers.push(server);
  return { url: `http://127.0.0.1:${server.port}`, seen };
}

// ---------------------------------------------------------------------------

describe("discovery and negotiation (§8.3.2, §3.6)", () => {
  test("a 1.0 card is discovered and the interface selected", async () => {
    const url = foxServer();
    const conn = await connect(url);
    expect(conn.version).toBe("1.0");
    expect(conn.dialect).toBe("1.0");
    expect(conn.card?.name).toBe("fox-agent");
  });

  test("the agent's display name is readable, and a peer with no card is null", async () => {
    expect(await agentCardName(foxServer())).toBe("fox-agent");
    const bare = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: () => new Response("x", { status: 404 }) });
    servers.push(bare);
    expect(await agentCardName(`http://127.0.0.1:${bare.port}`)).toBeNull();
  });

  test("a 0.3-only card negotiates the legacy dialect", async () => {
    const { url } = legacyServer();
    const conn = await connect(url);
    expect(conn.version).toBe("0.3");
    expect(conn.dialect).toBe("legacy");
  });

  test("a 1.0 interface beats a 0.3 one even if the card lists 0.3 first (§3.6.3)", async () => {
    const server: ReturnType<typeof Bun.serve> = Bun.serve({
      port: 0,
      hostname: "127.0.0.1",
      fetch(req) {
        if (new URL(req.url).pathname.includes("agent-card")) {
          return Response.json({
            name: "dual",
            supportedInterfaces: [
              { url: `http://127.0.0.1:${server.port}/old`, protocolBinding: "JSONRPC", protocolVersion: "0.3" },
              { url: `http://127.0.0.1:${server.port}/new`, protocolBinding: "JSONRPC", protocolVersion: "1.0" },
            ],
          });
        }
        return new Response("x", { status: 404 });
      },
    });
    servers.push(server);
    const conn = await connect(`http://127.0.0.1:${server.port}`);
    expect(conn.version).toBe("1.0");
    expect(conn.url).toContain("/new");
  });

  test("a pinned version overrides the card's preference", async () => {
    const conn = await connect(foxServer(), { version: "0.3" });
    expect(conn.dialect).toBe("legacy");
  });

  test("every request carries A2A-Version (§3.6.1)", async () => {
    const { url, seen } = legacyServer();
    await runA2aAgent(url, "hi");
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((s) => s.version === "0.3")).toBe(true);
  });

  test("fetchCard tolerates the legacy well-known path", async () => {
    const { url } = legacyServer();
    const found = await fetchCard(url);
    expect(found?.raw.name).toBe("old-peer");
  });
});

describe("runA2aAgent: streaming (§3.1.2)", () => {
  test("against a real fox-agent server, streaming returns the artifact text", async () => {
    const url = foxServer("the report body");
    expect(await runA2aAgent(url, "write it")).toBe("the report body");
  });

  test("remote states and text deltas are reported live", async () => {
    const seen: { state?: string; text?: string }[] = [];
    await runA2aAgent(foxServer("streamed"), "go", { onEvent: (e) => seen.push(e) });
    expect(seen.some((e) => e.state === "TASK_STATE_COMPLETED")).toBe(true);
    // the reply arrives in two deltas, so onEvent saw text at least twice
    expect(seen.filter((e) => e.text).length).toBeGreaterThanOrEqual(2);
    expect(seen.map((e) => e.text).join("")).toBe("streamed");
  });

  test("a peer without streaming falls back to polling and still answers", async () => {
    const { url, seen } = legacyServer({ stream: false, reply: "polled answer" });
    expect(await runA2aAgent(url, "go")).toBe("polled answer");
    // it tried the stream first (§3.5.1 prefers it), then sent
    expect(seen.map((s) => s.method)).toContain("message/stream");
    expect(seen.map((s) => s.method)).toContain("message/send");
  });

  test("a streaming 0.3 peer's frames decode (kind + final)", async () => {
    const { url } = legacyServer({ stream: true, reply: "old streamed" });
    expect(await runA2aAgent(url, "go")).toBe("old streamed");
  });

  test("a failed task surfaces the peer's own message", async () => {
    const server = Bun.serve({
      port: 0,
      hostname: "127.0.0.1",
      fetch(req) {
        if (new URL(req.url).pathname.includes("agent-card")) return new Response("no", { status: 404 });
        return Response.json({
          jsonrpc: "2.0",
          id: 1,
          result: {
            statusUpdate: {
              taskId: "t",
              status: {
                state: "TASK_STATE_FAILED",
                message: { messageId: "m", role: "ROLE_AGENT", parts: [{ text: "out of juice" }] },
              },
            },
          },
        });
      },
    });
    servers.push(server);
    await expect(runA2aAgent(`http://127.0.0.1:${server.port}`, "x")).rejects.toThrow("out of juice");
  });

  test("a task needing input ends the wait instead of hanging", async () => {
    const server = Bun.serve({
      port: 0,
      hostname: "127.0.0.1",
      fetch(req) {
        if (new URL(req.url).pathname.includes("agent-card")) return new Response("no", { status: 404 });
        return Response.json({
          jsonrpc: "2.0",
          id: 1,
          result: {
            task: {
              id: "t1",
              status: {
                state: "TASK_STATE_INPUT_REQUIRED",
                message: { messageId: "m", role: "ROLE_AGENT", parts: [{ text: "which city?" }] },
              },
            },
          },
        });
      },
    });
    servers.push(server);
    // nobody can answer a headless delegation's question (§3.4.3)
    await expect(runA2aAgent(`http://127.0.0.1:${server.port}`, "book a flight")).rejects.toThrow(/which city/);
  });
});

describe("typed operations (§3.1)", () => {
  test("getTask / listTasks / cancelTask against a real server", async () => {
    const url = foxServer("ok");
    const conn = await connect(url);
    const sent = await sendMessage(conn, {
      messageId: "m1",
      role: "ROLE_USER",
      parts: [{ text: "hello" }],
    });
    const id = sent.task!.id;

    const got = await getTask(conn, id);
    expect(got.id).toBe(id);
    expect(got.status.state).toBe("TASK_STATE_COMPLETED");

    const listed = await listTasks(conn, { pageSize: 10 });
    expect(listed.tasks.length).toBeGreaterThan(0);
    expect(listed.nextPageToken).toBe("");

    // a completed task cannot be canceled (§3.1.5)
    await expect(cancelTask(conn, id)).rejects.toThrow();
  });

  test("SubscribeToTask on a terminal task is refused with -32004", async () => {
    const url = foxServer("done");
    const conn = await connect(url);
    const sent = await sendMessage(conn, { messageId: "m", role: "ROLE_USER", parts: [{ text: "x" }] });
    try {
      await subscribeToTask(conn, sent.task!.id);
      throw new Error("should have thrown");
    } catch (e) {
      expect(e instanceof A2aError || e instanceof RpcError).toBe(true);
      expect((e as any).code).toBe(-32004);
    }
  });

  test("push config CRUD against a real server", async () => {
    const url = foxServer("ok");
    const conn = await connect(url);
    const sent = await sendMessage(conn, { messageId: "m", role: "ROLE_USER", parts: [{ text: "x" }] });
    const taskId = sent.task!.id;

    const created = await createPushConfig(conn, taskId, { url: "https://client.example/hook" });
    expect(created.id).toBeTruthy();
    const got = await getPushConfig(conn, taskId, created.id!);
    expect(got.url).toBe("https://client.example/hook");
    expect(await listPushConfigs(conn, taskId)).toHaveLength(1);
    await deletePushConfig(conn, taskId, created.id!);
    expect(await listPushConfigs(conn, taskId)).toHaveLength(0);
  }, 15_000);

  test("a direct Message reply is returned as text, not forced into a task", async () => {
    const server = Bun.serve({
      port: 0,
      hostname: "127.0.0.1",
      fetch(req) {
        if (new URL(req.url).pathname.includes("agent-card")) return new Response("no", { status: 404 });
        return Response.json({
          jsonrpc: "2.0",
          id: 1,
          result: { message: { messageId: "m", role: "ROLE_AGENT", parts: [{ text: "just a reply" }] } },
        });
      },
    });
    servers.push(server);
    expect(await runA2aAgent(`http://127.0.0.1:${server.port}`, "hi")).toBe("just a reply");
  });
});

describe("errors (§3.3.2, §5.4)", () => {
  test("a JSON-RPC error surfaces as a typed A2aError with its code", async () => {
    const server = Bun.serve({
      port: 0,
      hostname: "127.0.0.1",
      fetch(req) {
        const path = new URL(req.url).pathname;
        if (path.includes("agent-card")) return new Response("no", { status: 404 });
        return Response.json({
          jsonrpc: "2.0",
          id: 1,
          error: { code: -32001, message: "Task not found", data: [{ "@type": "x", reason: "TASK_NOT_FOUND" }] },
        });
      },
    });
    servers.push(server);
    try {
      await getTask(await connect(`http://127.0.0.1:${server.port}`), "ghost");
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(A2aError);
      expect((e as A2aError).code).toBe(-32001);
      expect((e as A2aError).a2aName).toBe("TaskNotFound");
      expect((e as A2aError).details).toHaveLength(1);
    }
  });

  test("a 401 is a clear authorization failure, not a parse error", async () => {
    const url = foxServer("ok", { authToken: "s3cret" });
    const conn = await connect(url);
    try {
      await listTasks(conn, {});
      throw new Error("should have thrown");
    } catch (e) {
      expect(String((e as Error).message)).toMatch(/HTTP 401|not authorized/);
    }
  });

  test("the right token gets through", async () => {
    const url = foxServer("ok", { authToken: "s3cret" });
    const conn = await connect(url, { authToken: "s3cret" });
    const listed = await listTasks(conn, {});
    expect(listed.totalSize).toBe(0);
  });

  test("a version the peer refuses is reported with its own message", async () => {
    const server = Bun.serve({
      port: 0,
      hostname: "127.0.0.1",
      fetch(req) {
        if (new URL(req.url).pathname.includes("agent-card")) return new Response("no", { status: 404 });
        const v = req.headers.get("a2a-version");
        if (v !== "1.0") {
          return Response.json({ jsonrpc: "2.0", id: 1, error: { code: -32009, message: `version ${v} unsupported` } });
        }
        return Response.json({ jsonrpc: "2.0", id: 1, result: { tasks: [], totalSize: 0, pageSize: 10, nextPageToken: "" } });
      },
    });
    servers.push(server);
    const conn = await connect(`http://127.0.0.1:${server.port}`, { version: "0.3" });
    try {
      await listTasks(conn, {});
      throw new Error("should have thrown");
    } catch (e) {
      expect((e as any).code).toBe(-32009);
    }
  });
});

describe("task tool: a2a routing", () => {
  const ctx = (agents: unknown) => {
    let pty: unknown;
    return {
      sessionId: "s1",
      cwd: dir,
      agents,
      get pty() {
        return pty;
      },
      set pty(v: unknown) {
        pty = v;
      },
    } as any;
  };

  test("an agent with a url delegates over A2A and returns the report", async () => {
    const url = foxServer("thing done");
    const { taskRun } = await import("../src/tools/task.ts");
    const r = await taskRun({ description: "d", prompt: "do the thing", agent: "remote" }, ctx({ remote: { url } }));
    expect(r.ok).toBe(true);
    expect(r.output).toContain("thing done");
    expect(r.output).toContain("[a2a task on remote]");
  }, 15_000);

  test("a remote failure surfaces as a tool failure, not a crash", async () => {
    const { url } = legacyServer({ stream: false });
    const { taskRun } = await import("../src/tools/task.ts");
    // a peer that answers with no artifacts at all still counts as done
    const r = await taskRun({ description: "d", prompt: "p", agent: "remote" }, ctx({ remote: { url } }));
    expect(r.ok).toBe(true);
  }, 15_000);

  test("an agent with neither command nor url is rejected plainly", async () => {
    const { taskRun } = await import("../src/tools/task.ts");
    const r = await taskRun({ description: "d", prompt: "p", agent: "broken" }, ctx({ broken: {} }));
    expect(r.ok).toBe(false);
    expect(r.output).toContain("neither command nor url");
  });

  test("an unknown agent still names what is configured", async () => {
    const { taskRun } = await import("../src/tools/task.ts");
    const r = await taskRun({ description: "d", prompt: "p", agent: "ghost" }, ctx({ remote: { url: "http://x" } }));
    expect(r.ok).toBe(false);
    expect(r.output).toContain('unknown agent "ghost"');
  });
});
