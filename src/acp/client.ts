/**
 * fox as an ACP *client* — fox driving another agent.
 *
 * This is what makes delegation (`src/tools/task.ts`) a protocol boundary instead
 * of an in-process special case: the child is any ACP agent, spawned as a
 * subprocess, and by default it is another `fox --acp` with the full tool
 * registry. Nothing about the child is privileged or restricted by the parent.
 *
 * The client handlers here reflect fox's own posture rather than a generic host's:
 * `fs/*` is honored (fox has full disk access anyway, so refusing would be
 * theater), `session/request_permission` auto-approves, and `terminal/*` is left
 * unimplemented — a child that wants a terminal should run its own, and a
 * half-built terminal host is worse than a clear "unsupported".
 */
import * as acp from "@agentclientprotocol/sdk";
import { RequestError } from "@agentclientprotocol/sdk";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";

export interface AcpAgentSpec {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface RunAcpAgentOptions extends AcpAgentSpec {
  cwd: string;
  prompt: string;
  signal?: AbortSignal;
  /** every update the child sends, in order, before the turn stops */
  onUpdate?: (u: acp.SessionUpdate) => void;
}

export interface AcpAgentResult {
  text: string;
  stopReason: acp.StopReason;
  sessionId: string;
}

/**
 * Wrap a spawned child's stdio for `ndJsonStream`.
 *
 * Bun's `proc.stdin` is a `FileSink`, not a WHATWG `WritableStream`, so the SDK
 * cannot consume it directly. This and `bunStdout` in `./server.ts` are the only
 * two places that gap is bridged; if a third appears, one of them is wrong.
 */
function childStream(proc: Bun.Subprocess<"pipe", "pipe", "inherit">): acp.Stream {
  const sink = proc.stdin;
  const writable = new WritableStream<Uint8Array>({
    write(chunk) {
      sink.write(chunk);
      return sink.flush() as unknown as Promise<void>;
    },
    close() {
      sink.end();
    },
    abort() {
      sink.end();
    },
  });
  return acp.ndJsonStream(writable, proc.stdout as ReadableStream<Uint8Array>);
}

/** Resolve a client-supplied path against the session cwd, as ACP requires absolute. */
function resolvePath(cwd: string, path: string): string {
  return isAbsolute(path) ? path : resolve(cwd, path);
}

/**
 * The client half fox presents to a child agent. Exported so tests can pair it
 * against an in-process agent app with no subprocess.
 */
export function buildClient(cwd: string): acp.ClientApp {
  return acp
    .client({ name: "fox" })
    .onRequest(acp.methods.client.fs.readTextFile, async ({ params }) => {
      const full = resolvePath(cwd, params.path);
      try {
        let content = readFileSync(full, "utf8");
        if (params.line != null || params.limit != null) {
          const lines = content.split("\n");
          const from = Math.max(0, (params.line ?? 1) - 1);
          content = lines.slice(from, params.limit != null ? from + params.limit : undefined).join("\n");
        }
        return { content };
      } catch (e) {
        throw RequestError.internalError(undefined, `read ${full}: ${(e as Error).message}`);
      }
    })
    .onRequest(acp.methods.client.fs.writeTextFile, async ({ params }) => {
      const full = resolvePath(cwd, params.path);
      try {
        mkdirSync(dirname(full), { recursive: true });
        writeFileSync(full, params.content);
        return {};
      } catch (e) {
        throw RequestError.internalError(undefined, `write ${full}: ${(e as Error).message}`);
      }
    })
    .onRequest(acp.methods.client.session.requestPermission, async ({ params }) => {
      // fox never prompts (see the security model), so it cannot start prompting
      // on a child's behalf either. Pick the first allow-shaped option; if the
      // agent offered none, report cancellation rather than inventing an id.
      const opt =
        params.options.find((o) => o.kind === "allow_always") ?? params.options.find((o) => o.kind === "allow_once");
      if (!opt) return { outcome: { outcome: "cancelled" } };
      return { outcome: { outcome: "selected", optionId: opt.optionId } };
    });
}

/**
 * Environment for a child agent.
 *
 * Note what this does NOT use: `childEnv()`, which strips `*_API_KEY` so a
 * command the *model* invented cannot read the credential driving the model. An
 * ACP agent is a different kind of child — it is a peer harness whose entire job
 * is to call a model, so a stripped env makes it dead on arrival, and today's
 * in-process subagent already runs with the key by virtue of sharing the process.
 *
 * What keeps that safe is that the model cannot choose the command: the default
 * is fox itself, and every alternative is a `[agents.<name>]` entry the user
 * wrote in `fox.toml`. The model only picks a name from that fixed set. If you
 * ever let a tool argument reach `command`, this reasoning collapses and the env
 * must be filtered again.
 */
function agentEnv(extra?: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined) out[k] = v;
  return extra ? { ...out, ...extra } : out;
}

/**
 * Run one prompt against a child ACP agent and return its final text.
 *
 * The child's own text is accumulated from `agent_message_chunk` updates; thought
 * chunks are excluded, since a delegating parent wants the report, not the
 * child's reasoning. `signal` maps to `session/cancel` and then to killing the
 * process, because an agent that ignores cancel must not outlive the turn.
 */
export async function runAcpAgent(opts: RunAcpAgentOptions): Promise<AcpAgentResult> {
  const proc = Bun.spawn([opts.command, ...(opts.args ?? [])], {
    cwd: opts.cwd,
    stdin: "pipe",
    stdout: "pipe",
    stderr: "inherit", // the child's diagnostics belong on the parent's stderr, never in the protocol stream
    env: agentEnv(opts.env),
  });

  const kill = () => {
    try {
      proc.kill();
    } catch {
      /* already gone */
    }
  };

  try {
    return await buildClient(opts.cwd).connectWith(childStream(proc), async (agent) => {
      await agent.request(acp.methods.agent.initialize, {
        protocolVersion: acp.PROTOCOL_VERSION,
        clientCapabilities: { fs: { readTextFile: true, writeTextFile: true }, terminal: false },
      });

      return await agent.buildSession(opts.cwd).withSession(async (session) => {
        if (opts.signal?.aborted) return { text: "", stopReason: "cancelled" as const, sessionId: session.sessionId };
        const onAbort = () => {
          void agent.notify(acp.methods.agent.session.cancel, { sessionId: session.sessionId }).catch(() => {});
        };
        opts.signal?.addEventListener("abort", onAbort, { once: true });

        let text = "";
        try {
          void session.prompt(opts.prompt).catch(() => {
            // The rejection is also delivered as the `stop` message read below;
            // swallowing it here only prevents an unhandled rejection.
          });
          for (;;) {
            const msg = await session.nextUpdate();
            if (msg.kind === "stop") return { text: text.trim(), stopReason: msg.stopReason, sessionId: session.sessionId };
            opts.onUpdate?.(msg.update);
            if (msg.update.sessionUpdate === "agent_message_chunk" && msg.update.content.type === "text") {
              text += msg.update.content.text;
            }
          }
        } finally {
          opts.signal?.removeEventListener("abort", onAbort);
        }
      });
    });
  } finally {
    kill();
  }
}
