// A2A delegation: the `task` tool reaches a remote agent over HTTP/JSON-RPC
// when its `[agents.*]` entry has a `url` instead of a `command`. These run a
// fake A2A server in-process and exercise the wire: message/send, tasks/get
// polling, direct-Message replies, and JSON-RPC errors.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ToolContext } from "../src/tools/types.ts";

let dir: string;
let server: ReturnType<typeof Bun.serve> | undefined;
let base: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "fox-a2a-"));
  process.env.FOX_AGENT_HOME = join(dir, ".fox");
});

afterEach(() => {
  server?.stop(true);
  server = undefined;
  rmSync(dir, { recursive: true, force: true });
});

type Handler = (method: string, params: any) => { result?: any; error?: { code: number; message: string } };

/** A fake A2A agent: JSON-RPC POSTs at /, no agent card (404 is tolerated). */
function serve(handler: Handler): string {
  server = Bun.serve({
    port: 0,
    async fetch(req) {
      if (req.method !== "POST") return new Response("not found", { status: 404 });
      const body = (await req.json()) as { id: number; method: string; params: any };
      const out = handler(body.method, body.params);
      return Response.json({ jsonrpc: "2.0", id: body.id, ...out });
    },
  });
  return `http://127.0.0.1:${server.port}`;
}

const completedTask = (text: string) => ({
  id: "t1",
  status: { state: "completed" },
  artifacts: [{ parts: [{ kind: "text", text }] }],
});

describe("a2a client", () => {
  test("a completed task's artifact text is the report", async () => {
    const url = serve(() => ({ result: completedTask("the answer is 4") }));
    const { runA2aAgent } = await import("../src/a2a/client.ts");
    expect(await runA2aAgent(url, "2+2?")).toBe("the answer is 4");
  });

  test("a non-final task is polled on tasks/get until it completes", async () => {
    let gets = 0;
    const url = serve((method) => {
      if (method === "message/send") return { result: { id: "t1", status: { state: "working" } } };
      if (method === "tasks/get") return { result: ++gets === 1 ? { id: "t1", status: { state: "working" } } : completedTask("done eventually") };
      throw new Error(`unexpected ${method}`);
    });
    const { runA2aAgent } = await import("../src/a2a/client.ts");
    expect(await runA2aAgent(url, "work")).toBe("done eventually");
    expect(gets).toBe(2);
  }, 10_000);

  test("a direct Message reply (no task lifecycle) returns its text", async () => {
    const url = serve(() => ({ result: { kind: "message", role: "agent", parts: [{ kind: "text", text: "hi" }] } }));
    const { runA2aAgent } = await import("../src/a2a/client.ts");
    expect(await runA2aAgent(url, "hello")).toBe("hi");
  });

  test("a failed task throws with the agent's own message", async () => {
    const url = serve(() => ({
      result: { id: "t1", status: { state: "failed", message: { role: "agent", parts: [{ kind: "text", text: "out of juice" }] } } },
    }));
    const { runA2aAgent } = await import("../src/a2a/client.ts");
    await expect(runA2aAgent(url, "x")).rejects.toThrow("out of juice");
  });

  test("a JSON-RPC error throws with code and message", async () => {
    const url = serve(() => ({ error: { code: -32601, message: "no such method" } }));
    const { runA2aAgent } = await import("../src/a2a/client.ts");
    await expect(runA2aAgent(url, "x")).rejects.toThrow("no such method");
  });

  test("a missing agent card is null, not a failure", async () => {
    const url = serve(() => ({ result: completedTask("x") }));
    const { agentCardName } = await import("../src/a2a/client.ts");
    expect(await agentCardName(url)).toBeNull();
  });
});

describe("task tool: a2a routing", () => {
  const ctx = (agents: unknown): ToolContext => {
    let pty: unknown;
    return { sessionId: "s1", cwd: dir, agents, readFiles: new Set<string>(), get pty() { return pty; }, set pty(v: unknown) { pty = v; } } as unknown as ToolContext;
  };

  test("an agent with a url delegates over A2A and returns the report", async () => {
    const url = serve((method, params) => {
      expect(method).toBe("message/send");
      expect(params.message.parts[0].text).toBe("do the thing");
      return { result: completedTask("thing done") };
    });
    const { taskRun } = await import("../src/tools/task.ts");
    const r = await taskRun({ description: "d", prompt: "do the thing", agent: "remote" }, ctx({ remote: { url } }));
    expect(r.ok).toBe(true);
    expect(r.output).toContain("thing done");
    expect(r.output).toContain("[a2a task on remote]");
  });

  test("a remote failure surfaces as a tool failure, not a crash", async () => {
    const url = serve(() => ({ result: { id: "t1", status: { state: "failed" } } }));
    const { taskRun } = await import("../src/tools/task.ts");
    const r = await taskRun({ description: "d", prompt: "p", agent: "remote" }, ctx({ remote: { url } }));
    expect(r.ok).toBe(false);
    expect(r.output).toContain("subagent failed");
  });

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
    expect(r.output).toContain("remote");
  });
});
