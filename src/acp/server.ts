/**
 * fox as an ACP agent — `fox --acp`, driven by Zed, acpx, or any ACP client.
 *
 * This is a protocol skin over `runTurnCore` and the session store, not a second
 * loop: every handler below delegates to a primitive that already existed for the
 * TUI. `session/new` is `createSession`, `session/fork` is `forkSession`,
 * `session/prompt` is one `runTurnCore` generator piped through
 * `toSessionUpdate`. Anything that looks like turn logic in here is a bug.
 *
 * Two deliberate non-implementations:
 *
 * - **fox never calls `session/request_permission`.** fox is a no-prompt harness
 *   by design (see the security model in the README); tools just run. A client
 *   connecting to fox will never be asked to approve anything, which it must know
 *   before pointing fox at code it doesn't trust.
 * - **fox does not route its own tools through the client's `fs/*` and
 *   `terminal/*`.** `read`/`write`/`exec`/`pty` must behave identically with no
 *   ACP client present at all (TUI, `-p`), and the exec-never-drifts /
 *   pty-keeps-its-shell contracts are fox's own, pinned by `test/execcwd.test.ts`
 *   and `test/pty.test.ts`. Delegating them to a host would make those contracts
 *   depend on whoever is driving. Do not "fix" this later.
 */
import * as acp from "@agentclientprotocol/sdk";
import { RequestError } from "@agentclientprotocol/sdk";
import {
  createSession,
  deleteSession,
  forkSession,
  getSession,
  listSessions,
  type MessageRow,
} from "../store/db.ts";
import { projectView } from "../context/view.ts";
import type { Config } from "../core/config.ts";
import type { ProviderConfig, ChatFn } from "../providers/types.ts";
import { resolveChat } from "../providers/index.ts";
import { runTurnCore } from "../loop/turn.ts";
import { shutdownTools } from "../tools/index.ts";
import { lookupModel } from "../providers/models.ts";
import { VERSION } from "../core/version.ts";
import { stopReasonFor, toolKind, toSessionUpdate } from "./updates.ts";

export interface AcpServerOptions {
  config: Config;
  provider: ProviderConfig;
  /** injected in tests; production uses the real provider */
  chat?: ChatFn;
}

/** Text content of one ACP prompt request, flattened for fox's single-string turn API. */
function promptText(blocks: acp.ContentBlock[]): string {
  const parts: string[] = [];
  for (const b of blocks) {
    if (b.type === "text") parts.push(b.text);
    else if (b.type === "resource_link") parts.push(`@${b.uri}`);
    else if (b.type === "resource" && "text" in b.resource) parts.push(`${b.resource.uri}:\n${b.resource.text}`);
    // image/audio blocks are not advertised in promptCapabilities, so a
    // conforming client will not send them; silently dropping beats crashing.
  }
  return parts.join("\n").trim();
}

/**
 * Replay a stored transcript as session updates for `session/load`.
 *
 * Uses `projectView`, not `allMessages`, so a loading client sees exactly what
 * the model sees: compacted and `ctx_edit`-deleted spans stay hidden. Tool calls
 * replay as already-`completed` — they ran in a previous process, so there is no
 * in-flight state to report.
 */
async function replay(sessionId: string, notify: (u: acp.SessionUpdate) => Promise<void>): Promise<void> {
  for (const node of projectView(sessionId)) {
    if (node.deleted) continue;
    const msg: MessageRow = node.msg;
    const text = node.content;
    if (msg.role === "user") await notify({ sessionUpdate: "user_message_chunk", content: { type: "text", text } });
    else if (msg.role === "assistant") {
      if (text) await notify({ sessionUpdate: "agent_message_chunk", content: { type: "text", text } });
      for (const call of parseCalls(msg.tool_calls)) {
        await notify({
          sessionUpdate: "tool_call",
          toolCallId: call.id,
          title: call.name,
          name: call.name,
          kind: toolKind(call.name),
          status: "completed",
          rawInput: call.arguments,
        });
      }
    } else if (msg.role === "think") await notify({ sessionUpdate: "agent_thought_chunk", content: { type: "text", text } });
    else if (msg.role === "tool" && msg.tool_call_id) {
      await notify({
        sessionUpdate: "tool_call_update",
        toolCallId: msg.tool_call_id,
        status: msg.error ? "failed" : "completed",
        content: [{ type: "content", content: { type: "text", text } }],
      });
    }
    // role "system" is fox's own bookkeeping (step limits, provider errors) and
    // has no ACP equivalent that isn't a lie about who said it.
  }
}

function parseCalls(raw: string | null): Array<{ id: string; name: string; arguments: string }> {
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

/**
 * Build the agent app. Exported separately from `runAcpServer` so tests can pair
 * it to a client in-process — `client().connectWith(buildAgent(...), …)` — with
 * no subprocess and no stdio.
 */
export function buildAgent(opts: AcpServerOptions): acp.AgentApp {
  const { config, provider } = opts;
  const chat = opts.chat ?? resolveChat;
  const contextWindow = lookupModel(provider.model).contextWindow;

  /** in-flight prompts, so `session/cancel` can abort the right turn */
  const running = new Map<string, AbortController>();

  return acp
    .agent({ name: "fox" })
    .onRequest(acp.methods.agent.initialize, async () => ({
      protocolVersion: acp.PROTOCOL_VERSION,
      agentInfo: { name: "fox", version: VERSION },
      agentCapabilities: {
        loadSession: true,
        promptCapabilities: { embeddedContext: true },
        mcpCapabilities: { http: false, sse: false },
        // each `{}` advertises support; omitted means unsupported
        sessionCapabilities: { list: {}, delete: {}, fork: {}, resume: {}, close: {} },
      },
    }))
    .onRequest(acp.methods.agent.session.new, async ({ params }) => {
      const s = createSession(params.cwd, provider.model);
      return { sessionId: s.id };
    })
    .onRequest(acp.methods.agent.session.list, async () => ({
      sessions: listSessions(100).map((s) => ({
        sessionId: s.id,
        cwd: s.cwd,
        title: s.title ?? undefined,
        updatedAt: new Date(s.created_at).toISOString(),
      })),
    }))
    .onRequest(acp.methods.agent.session.load, async ({ params, client }) => {
      if (!getSession(params.sessionId)) throw RequestError.resourceNotFound(params.sessionId);
      await replay(params.sessionId, (update) =>
        client.notify(acp.methods.client.session.update, { sessionId: params.sessionId, update }),
      );
      return {};
    })
    .onRequest(acp.methods.agent.session.resume, async ({ params }) => {
      if (!getSession(params.sessionId)) throw RequestError.resourceNotFound(params.sessionId);
      return {};
    })
    .onRequest(acp.methods.agent.session.fork, async ({ params }) => {
      const forked = forkSession(params.sessionId);
      if (!forked) throw RequestError.resourceNotFound(params.sessionId);
      return { sessionId: forked.id };
    })
    .onRequest(acp.methods.agent.session.delete, async ({ params }) => {
      if (!deleteSession(params.sessionId)) throw RequestError.resourceNotFound(params.sessionId);
      return {};
    })
    .onRequest(acp.methods.agent.session.close, async ({ params }) => {
      running.get(params.sessionId)?.abort();
      running.delete(params.sessionId);
      await shutdownTools(params.sessionId);
      return {};
    })
    .onNotification(acp.methods.agent.session.cancel, async ({ params }) => {
      // Notification, not a request: cancel does not reply. The prompt it aborts
      // is what reports `stopReason: "cancelled"`.
      running.get(params.sessionId)?.abort();
    })
    .onRequest(acp.methods.agent.session.prompt, async ({ params, client, signal }) => {
      const session = getSession(params.sessionId);
      if (!session) throw RequestError.resourceNotFound(params.sessionId);
      // `fox --acp` is launched before the missing-key check (see src/cli.ts), so
      // a keyless install reaches here. Say so in the protocol's own terms — an
      // editor renders `auth_required` as an actionable message, whereas the
      // provider's 401 arrives as unexplained turn failure.
      if (!provider.apiKey) {
        throw RequestError.authRequired(undefined, "no API key: set FOX_API_KEY / OPENAI_API_KEY / ANTHROPIC_API_KEY");
      }
      const text = promptText(params.prompt);
      // the message is the *second* argument; the first is JSON-RPC `data`, which
      // does not reach a client's error string
      if (!text) throw RequestError.invalidParams(undefined, "prompt has no text content");

      // Two ways a turn can be cut short: the client's `session/cancel`, and the
      // request's own signal (connection dropped, `$/cancel_request`). Both must
      // reach `runTurnCore`, so they are merged into one controller.
      const ctl = new AbortController();
      const onAbort = () => ctl.abort();
      signal.addEventListener("abort", onAbort, { once: true });
      running.set(params.sessionId, ctl);

      let stop: acp.StopReason = "end_turn";
      try {
        for await (const ev of runTurnCore(params.sessionId, provider, text, ctl.signal, {
          maxSteps: config.maxSteps,
          retryLimit: config.retryLimit,
          compactAt: config.compactAt,
          projectInstructions: config.projectInstructions,
          config,
          chat,
        })) {
          if (ev.type === "done") {
            stop = stopReasonFor(ev.reason);
            break;
          }
          const update = toSessionUpdate(ev, { contextWindow });
          if (update) await client.notify(acp.methods.client.session.update, { sessionId: params.sessionId, update });
        }
      } finally {
        signal.removeEventListener("abort", onAbort);
        running.delete(params.sessionId);
      }
      return { stopReason: stop };
    });
}

/**
 * Serve ACP on stdio and resolve when the client disconnects.
 *
 * stdout belongs to the protocol — every diagnostic in this path must go to
 * stderr or it corrupts the stream.
 */
export async function runAcpServer(opts: AcpServerOptions): Promise<void> {
  const stream = acp.ndJsonStream(bunStdout(), Bun.stdin.stream() as ReadableStream<Uint8Array>);
  const conn = buildAgent(opts).connect(stream);
  await conn.closed;
}

/**
 * Bun's `Bun.stdout` is a `FileSink`, not a WHATWG `WritableStream`, so
 * `ndJsonStream` cannot consume it directly. This adapter is the only place that
 * difference is handled on the agent side (`./client.ts` has the child-process
 * equivalent).
 */
function bunStdout(): WritableStream<Uint8Array> {
  const sink = Bun.stdout.writer();
  return new WritableStream<Uint8Array>({
    write(chunk) {
      sink.write(chunk);
      return sink.flush() as unknown as Promise<void>;
    },
    close() {
      sink.end();
    },
  });
}
