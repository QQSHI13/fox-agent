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
 * - **fox-agent never calls `session/request_permission`.** fox-agent is a no-prompt harness
 *   by design (see the security model in the README); tools just run. A client
 *   connecting to fox-agent will never be asked to approve anything, which it must know
 *   before pointing fox-agent at code it doesn't trust.
 * - **fox-agent does not route its own tools through the client's `fs/*` and
 *   `terminal/*`.** `read`/`write`/`exec`/`pty` must behave identically with no
 *   ACP client present at all (TUI, `-p`), and the exec-never-drifts /
 *   pty-keeps-its-shell contracts are fox-agent's own, pinned by `test/execcwd.test.ts`
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
  pinSession,
  unpinSession,
  type MessageRow,
} from "../store/db.ts";
import { projectView } from "../context/view.ts";
import { acquireLock, releaseLock, lockHolder } from "../store/lock.ts";
import type { Config } from "../core/config.ts";
import type { ProviderConfig, ChatFn } from "../providers/types.ts";
import { resolveChat } from "../providers/index.ts";
import { runTurnCore } from "../loop/turn.ts";
import { attachHost, detachHost, abortTurn, turnRunning, releaseSteer, waitQuiescent, adoptTurnController } from "../loop/steer.ts";
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

const SAFE_ID = /^[A-Za-z0-9_-]+$/;
/** Client-controlled ids must never become paths (locks/../../x). */
function checkId(id: string): void {
  if (!SAFE_ID.test(id)) throw RequestError.invalidParams(undefined, `invalid session id`);
}

/** Text content of one ACP prompt request, flattened for fox-agent's single-string turn API. */
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
 * the model sees: compacted and ctx-deleted spans stay hidden. Tool calls
 * replay as already-`completed` — they ran in a previous process, so there is no
 * in-flight state to report.
 */
/**
 * Which replayed nodes a loading client gets, per `config.acpHistory`.
 * "last" keeps the final user message and everything after it — the exchange
 * the user came back to — without shipping the whole transcript.
 */
export function selectHistory<T extends { msg: MessageRow; deleted?: boolean }>(
  nodes: T[],
  scope: Config["acpHistory"],
): T[] {
  const visible = nodes.filter((n) => !n.deleted);
  if (scope === "full") return visible;
  if (typeof scope === "number") return visible.slice(-scope);
  const lastUser = visible.map((n, i) => (n.msg.role === "user" ? i : -1)).filter((i) => i >= 0).pop();
  return lastUser === undefined ? visible : visible.slice(lastUser);
}

async function replay(
  sessionId: string,
  scope: Config["acpHistory"],
  notify: (u: acp.SessionUpdate) => Promise<void>,
): Promise<void> {
  for (const node of selectHistory(projectView(sessionId), scope)) {
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
    // role "system" is fox-agent's own bookkeeping (step limits, provider errors) and
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

  /** per-session model override, set by `session/set_config_option`; a session
   * without an entry uses the process's configured provider.model. */
  const sessionModels = new Map<string, string>();

  /**
   * Run one turn and stream it to the client.
   *
   * Which turn runs, and when, is core's decision (src/loop/steer.ts) — this
   * function is the protocol skin: map events to `session/update` notifications
   * and report the stop reason. `session/prompt` and an auto-started steered
   * turn both come through here, so they cannot diverge on pinning, aborting or
   * stop-reason mapping.
   */
  async function* turnEvents(
    sessionId: string,
    text: string,
    signal: AbortSignal,
    client: { notify: (method: string, params: unknown) => Promise<unknown> },
  ): AsyncGenerator<import("../core/events.ts").AgentEvent> {
    const modelOverride = sessionModels.get(sessionId);
    const turnProvider = modelOverride ? { ...provider, model: modelOverride } : provider;
    const turnContextWindow = lookupModel(turnProvider.model).contextWindow;
    // Pin the handle for the turn's lifetime, exactly as the TUI does: the
    // client may interleave session/list / session/load / session/fork (each
    // opens other session dbs), and an unpinned handle is the LRU-oldest —
    // the picker eviction that closes it mid-append is the RangeError the
    // pin exists to prevent.
    pinSession(sessionId);
    try {
      for await (const ev of runTurnCore(sessionId, turnProvider, text, signal, {
        maxSteps: config.maxSteps,
        retryLimit: config.retryLimit,
        compactWarnAt: config.compactWarnAt,
        compactCtxOnlyAt: config.compactCtxOnlyAt,
        projectInstructions: config.projectInstructions,
        config,
        chat,
      })) {
        const update = ev.type === "done" ? null : toSessionUpdate(ev, { contextWindow: turnContextWindow });
        if (update) await client.notify(acp.methods.client.session.update, { sessionId, update });
        yield ev;
      }
    } finally {
      // release the pin the turn held; the next prompt re-pins
      unpinSession(sessionId);
    }
  }

  /** The client attached to a session — kept from the last prompt, because a
   *  steered turn may start with no request in flight to carry a client. */
  const sessionClients = new Map<string, { notify: (method: string, params: unknown) => Promise<unknown> }>();

  /**
   * Attach this ACP client as the session's host: core starts turns for steered
   * text (a background job finishing, typically) and this is how their events
   * reach the editor. Without it, a steer could only be answered by whatever
   * the user typed next — the original bug.
   */
  function attachSteer(sessionId: string, client: { notify: (method: string, params: unknown) => Promise<unknown> }): void {
    sessionClients.set(sessionId, client);
    attachHost(sessionId, {
      provider: () => {
        const m = sessionModels.get(sessionId);
        return m ? { ...provider, model: m } : provider;
      },
      config: () => config,
      chat,
      turn: (text, ctl) => turnEvents(sessionId, text, ctl.signal, sessionClients.get(sessionId) ?? client),
    });
  }

  return acp
    .agent({ name: "fox-agent" })
    .onRequest(acp.methods.agent.initialize, async () => ({
      protocolVersion: acp.PROTOCOL_VERSION,
      agentInfo: { name: "fox-agent", version: VERSION },
      agentCapabilities: {
        loadSession: true,
        promptCapabilities: { embeddedContext: true },
        mcpCapabilities: { http: false, sse: false },
        // each `{}` advertises support; omitted means unsupported
        sessionCapabilities: { list: {}, delete: {}, fork: {}, resume: {}, close: {} },
      },
      // A model selector so a client (e.g. the gateway plugin) can route a
      // session to a specific model via `session/set_config_option`. The list
      // is the process's configured model; the current one is preselected.
      configOptions: [{
        id: "model",
        name: "Model",
        description: "The model this session routes its turns to.",
        category: "model",
        type: "select",
        currentValue: provider.model,
        options: [{ value: provider.model, name: provider.model }],
      }],
    }))
    .onRequest(acp.methods.agent.session.setConfigOption, async ({ params }) => {
      checkId(params.sessionId);
      if (!getSession(params.sessionId)) throw RequestError.resourceNotFound(params.sessionId);
      if (params.configId !== "model") {
        throw RequestError.invalidParams(undefined, `unknown config option ${JSON.stringify(params.configId)}`);
      }
      // A select option sends the value id; boolean options send a boolean. The
      // model selector is a select, so a boolean here is a malformed request.
      if (typeof params.value === "boolean") {
        throw RequestError.invalidParams(undefined, "model config expects a value id, not a boolean");
      }
      const model = String(params.value);
      if (!lookupModel(model)) throw RequestError.invalidParams(undefined, `unknown model ${JSON.stringify(model)}`);
      sessionModels.set(params.sessionId, model);
      // The response echoes the full option set with the new current value.
      return {
        configOptions: [{
          id: "model",
          name: "Model",
          description: "The model this session routes its turns to.",
          category: "model",
          type: "select",
          currentValue: model,
          options: [{ value: provider.model, name: provider.model }],
        }],
      };
    })
    .onRequest(acp.methods.agent.session.new, async ({ params }) => {
      const s = createSession(params.cwd, sessionModels.get("") ?? provider.model);
      acquireLock(s.id, "acp");
      return { sessionId: s.id };
    })
    .onRequest(acp.methods.agent.session.list, async () => ({
      sessions: listSessions(100).map((s) => ({
        sessionId: s.id,
        cwd: s.cwd,
        title: s.title ?? undefined,
        updatedAt: new Date(s.updated_at).toISOString(),
      })),
    }))
    .onRequest(acp.methods.agent.session.load, async ({ params, client }) => {
      checkId(params.sessionId);
      if (!getSession(params.sessionId)) throw RequestError.resourceNotFound(params.sessionId);
      acquireLock(params.sessionId, "acp");
      await replay(params.sessionId, config.acpHistory, (update) =>
        client.notify(acp.methods.client.session.update, { sessionId: params.sessionId, update }),
      );
      return {};
    })
    .onRequest(acp.methods.agent.session.resume, async ({ params }) => {
      checkId(params.sessionId);
      if (!getSession(params.sessionId)) throw RequestError.resourceNotFound(params.sessionId);
      acquireLock(params.sessionId, "acp");
      return {};
    })
    .onRequest(acp.methods.agent.session.fork, async ({ params }) => {
      checkId(params.sessionId);
      const forked = forkSession(params.sessionId);
      if (!forked) throw RequestError.resourceNotFound(params.sessionId);
      acquireLock(forked.id, "acp");
      return { sessionId: forked.id };
    })
    .onRequest(acp.methods.agent.session.delete, async ({ params }) => {
      checkId(params.sessionId);
      // a turn still running for a deleted session must not keep appending to
      // its DB — same teardown close does, before the row disappears
      abortTurn(params.sessionId, "session deleted");
      releaseSteer(params.sessionId);
      await shutdownTools(params.sessionId);
      releaseLock(params.sessionId);
      if (!deleteSession(params.sessionId)) throw RequestError.resourceNotFound(params.sessionId);
      return {};
    })
    .onRequest(acp.methods.agent.session.close, async ({ params }) => {
      checkId(params.sessionId);
      abortTurn(params.sessionId, "session closed");
      detachHost(params.sessionId);
      releaseSteer(params.sessionId);
      await shutdownTools(params.sessionId);
      releaseLock(params.sessionId);
      return {};
    })
    .onNotification(acp.methods.agent.session.cancel, async ({ params }) => {
      // Notification, not a request: cancel does not reply. The prompt it aborts
      // is what reports `stopReason: "cancelled"`.
      try {
        checkId(params.sessionId);
      } catch {
        return;
      }
      // one abort path for every client: the controller lives in the loop layer
      abortTurn(params.sessionId, "client cancel");
    })
    .onRequest(acp.methods.agent.session.prompt, async ({ params, client, signal }) => {
      checkId(params.sessionId);
      const session = getSession(params.sessionId);
      if (!session) throw RequestError.resourceNotFound(params.sessionId);
      if (turnRunning(params.sessionId)) throw RequestError.invalidParams(undefined, "a prompt is already running for this session");
      // #11: a session another live process holds is theirs to write — a second
      // opener prompting here would interleave appends into one transcript. The
      // TUI degrades to a read-only viewer for the same reason; ACP has no
      // viewer mode, so the honest answer is a refused prompt that says who
      // holds the session.
      const holder = lockHolder(params.sessionId);
      if (holder && holder.pid !== process.pid) {
        throw RequestError.invalidParams(
          undefined,
          `session is open in another fox-agent process (${holder.kind}, pid ${holder.pid}) — close it there first, or fork this session`,
        );
      }
      // `fox --acp` is launched before the missing-key check (see src/cli.ts), so
      // a keyless install reaches here. Say so in the protocol's own terms — an
      // editor renders `auth_required` as an actionable message, whereas the
      // provider's 401 arrives as unexplained turn failure.
      if (!provider.apiKey) {
        throw RequestError.authRequired(undefined, "no API key: set FOX_AGENT_API_KEY / OPENAI_API_KEY / ANTHROPIC_API_KEY");
      }
      const text = promptText(params.prompt);
      // the message is the *second* argument; the first is JSON-RPC `data`, which
      // does not reach a client's error string
      if (!text) throw RequestError.invalidParams(undefined, "prompt has no text content");
      // Attach the client first, so a steer that arrives once this turn is over
      // can start the next one and still reach the editor's stream.
      attachSteer(params.sessionId, client);

      // The prompt's own message is NOT queued: it is what the client asked for,
      // and it must be answered even if a steer is also pending (that one gets
      // its own turn after).
      // One controller for both cancellation sources (the protocol's
      // `session/cancel` and this request's own signal), registered so the
      // shared `abortTurn` reaches it — ACP must not keep a second map of
      // in-flight turns.
      const ctl = new AbortController();
      const onAbort = () => ctl.abort();
      signal.addEventListener("abort", onAbort, { once: true });
      adoptTurnController(params.sessionId, ctl);

      let stop: acp.StopReason = "end_turn";
      let failed: unknown = null;
      try {
        for await (const ev of turnEvents(params.sessionId, text, ctl.signal, client)) {
          if (ev.type === "done") {
            stop = stopReasonFor(ev.reason);
            break;
          }
        }
      } catch (e) {
        failed = e;
      } finally {
        signal.removeEventListener("abort", onAbort);
      }
      // A one-shot surface is not finished while work is still outstanding: a
      // steered message or a live background job will produce more of the
      // answer. Wait for quiescence before replying, so the editor sees one
      // prompt resolve once the session is actually done — the same rule `fox
      // -p` and an A2A `message/send` follow.
      await waitQuiescent(params.sessionId);
      if (failed) throw failed;
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
