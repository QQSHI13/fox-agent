/**
 * A2A (Agent2Agent) server — expose fox-agent as a peer agent over HTTP + JSON-RPC 2.0.
 *
 * The A2A client (`client.ts`) is how fox-agent *reaches* a remote agent; this
 * module is how fox-agent *is* one. It serves the four surfaces the client
 * already speaks: the agent card (`/.well-known/agent-card.json`), `message/send`
 * (one-shot), `message/stream` (SSE live progress), and `tasks/get` (poll). A
 * turn runs through the same `runTurnCore` engine the TUI, headless, and ACP
 * paths use, so behavior (compaction, budget, hooks, converge) is identical.
 *
 * MCP connects an agent *down* to its tools; A2A connects an agent *across* to
 * peers. This is the horizontal surface — other agents (including the gateway
 * plugin and other fox-agent instances) discover and delegate to fox-agent here.
 *
 * Binds local-only by default: this endpoint runs tools with full machine
 * access, so it must not face an untrusted network without a separate auth layer.
 */
import { VERSION } from "../core/version.ts";
import { createSession } from "../store/db.ts";
import { runTurnCore } from "../loop/turn.ts";
import { resolveChat } from "../providers/index.ts";
import { lookupModel } from "../providers/models.ts";
import type { Config } from "../core/config.ts";
import type { ProviderConfig } from "../providers/types.ts";

export interface A2aServerOptions {
  config: Config;
  provider: ProviderConfig;
  /** port to bind, default 0 (ephemeral — the OS picks, printed to stderr) */
  port?: number;
  /** host to bind, default 127.0.0.1 (local only) */
  hostname?: string;
}

interface TaskState {
  id: string;
  sessionId: string;
  state: string;
  statusText: string;
  artifacts: Map<string, string>;
  done: boolean;
}

/** Text out of a part list (text parts only), mirroring the client's parser. */
function partsText(parts: any[] | undefined): string {
  return (parts ?? [])
    .filter((p) => p?.kind === "text" && typeof p.text === "string")
    .map((p) => p.text)
    .join("\n");
}

/** Task view for `tasks/get` and the terminal result of send/stream. */
function taskView(task: TaskState): Record<string, unknown> {
  return {
    kind: "task",
    id: task.id,
    status: {
      state: task.state,
      message: task.statusText
        ? { kind: "message", role: "agent", parts: [{ kind: "text", text: task.statusText }] }
        : undefined,
    },
    artifacts: [...task.artifacts.entries()].map(([artifactId, text]) => ({
      artifactId,
      parts: [{ kind: "text", text }],
    })),
    final: task.done,
  };
}

/**
 * Run one turn for a task. `onText` receives each text delta (so the streaming
 * path can emit artifact-update events); `onState` receives terminal state. The
 * task's artifacts/statusText are updated in place for later `tasks/get` polls.
 */
async function runTurnForTask(
  task: TaskState,
  prompt: string,
  opts: A2aServerOptions,
  onText: (delta: string) => void,
): Promise<void> {
  const provider = opts.provider;
  let text = "";
  try {
    if (!provider.apiKey) {
      task.state = "failed";
      task.statusText = "no API key: set FOX_AGENT_API_KEY / OPENAI_API_KEY / ANTHROPIC_API_KEY";
      return;
    }
    for await (const ev of runTurnCore(task.sessionId, provider, prompt, undefined, {
      maxSteps: opts.config.maxSteps,
      retryLimit: opts.config.retryLimit,
      compactWarnAt: opts.config.compactWarnAt,
      compactCtxOnlyAt: opts.config.compactCtxOnlyAt,
      projectInstructions: opts.config.projectInstructions,
      config: opts.config,
      chat: resolveChat,
    })) {
      if (ev.type === "text") {
        text += ev.delta;
        onText(ev.delta);
      } else if (ev.type === "done") {
        task.state = ev.reason === "error" ? "failed" : "completed";
        break;
      }
    }
    if (text) task.artifacts.set("result", text);
    task.statusText = text || task.statusText;
  } catch (e) {
    task.state = "failed";
    task.statusText = `error: ${(e as Error).message ?? e}`;
  } finally {
    task.done = true;
  }
}

/** Build the agent card describing this fox-agent instance. */
function agentCard(port: number, provider: ProviderConfig): Record<string, unknown> {
  return {
    kind: "agent-card",
    name: "fox-agent",
    description: "A light coding harness with full machine control — reachable as an A2A peer agent.",
    version: VERSION,
    url: `http://127.0.0.1:${port}/`,
    preferredTransport: "jsonrpc",
    capabilities: { streaming: true, pushNotifications: false },
    skills: [{ id: "coding", name: "Coding", description: "Autonomous coding, file editing, shell, research." }],
    defaultInputModes: ["text/plain"],
    defaultOutputModes: ["text/plain"],
    provider: { model: provider.model },
  };
}

/** Serve A2A over HTTP. Resolves when the server stops (SIGINT/SIGTERM). */
export async function runA2aServer(opts: A2aServerOptions): Promise<void> {
  const tasks = new Map<string, TaskState>();
  let taskSeq = 0;

  const server: ReturnType<typeof Bun.serve> = Bun.serve({
    port: opts.port ?? 0,
    hostname: opts.hostname ?? "127.0.0.1",
    async fetch(req) {
      const url = new URL(req.url);
      const path = url.pathname;

      // Agent card discovery (the client's agentCardName reads `name` only).
      if (req.method === "GET" && (path === "/.well-known/agent-card.json" || path === "/.well-known/agent.json")) {
        return Response.json(agentCard(server.port ?? 0, opts.provider));
      }

      if (req.method !== "POST" || (path !== "/" && path !== "/a2a")) {
        return new Response("not found", { status: 404 });
      }

      let body: { jsonrpc?: string; id?: number | string; method?: string; params?: any };
      try {
        body = await req.json();
      } catch {
        return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "parse error" } });
      }
      const { id, method, params } = body;

      if (method === "message/send" || method === "message/stream") {
        const prompt = partsText(params?.message?.parts);
        if (!prompt) {
          return Response.json({ jsonrpc: "2.0", id, error: { code: -32602, message: "message has no text parts" } });
        }
        const task: TaskState = {
          id: `fox-task-${++taskSeq}`,
          sessionId: createSession(process.cwd(), opts.provider.model).id,
          state: "submitted",
          statusText: "",
          artifacts: new Map(),
          done: false,
        };
        tasks.set(task.id, task);

        const wantsSse =
          method === "message/stream" && (req.headers.get("accept") ?? "").includes("text/event-stream");

        if (wantsSse) {
          // Stream artifact-update events per text delta, terminal status-update last.
          const stream = new ReadableStream({
            async start(controller) {
              const enc = new TextEncoder();
              const send = (result: unknown) =>
                controller.enqueue(enc.encode(`data: ${JSON.stringify({ jsonrpc: "2.0", id, result })}\r\n\r\n`));
              await runTurnForTask(task, prompt, opts, (delta) =>
                send({
                  kind: "artifact-update",
                  artifact: { artifactId: "result", parts: [{ kind: "text", text: delta }] },
                  append: true,
                }),
              );
              send({ ...taskView(task), kind: "status-update" });
              controller.close();
            },
            cancel() {
              task.state = "canceled";
              task.done = true;
            },
          });
          return new Response(stream, { headers: { "content-type": "text/event-stream" } });
        }

        // message/send non-streaming: run to completion, return the final task.
        await runTurnForTask(task, prompt, opts, () => {});
        return Response.json({ jsonrpc: "2.0", id, result: taskView(task) });
      }

      if (method === "tasks/get") {
        const task = tasks.get(params?.id);
        if (!task) {
          return Response.json({ jsonrpc: "2.0", id, error: { code: -32001, message: `no task ${params?.id}` } });
        }
        return Response.json({ jsonrpc: "2.0", id, result: taskView(task) });
      }

      // Unknown method — the client's stream path treats -32601 as "no streaming, poll".
      return Response.json({ jsonrpc: "2.0", id, error: { code: -32601, message: `unknown method ${method}` } });
    },
  });

  console.error(`fox-agent A2A server listening on http://${server.hostname}:${server.port}/ (Ctrl+C to stop)`);
  await new Promise<void>((resolve) => {
    const stop = () => {
      server.stop();
      resolve();
    };
    process.on("SIGINT", stop);
    process.on("SIGTERM", stop);
  });
}
