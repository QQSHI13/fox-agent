/**
 * A2A 1.0 server — expose fox-agent as a peer agent over HTTP + JSON-RPC 2.0.
 *
 * Implements every operation §3.1 defines, over the JSON-RPC binding (§9):
 *
 *   SendMessage · SendStreamingMessage · GetTask · ListTasks · CancelTask ·
 *   SubscribeToTask · Create/Get/List/DeleteTaskPushNotificationConfig ·
 *   GetExtendedAgentCard
 *
 * A turn runs through the same `runTurnCore` engine the TUI, headless and ACP
 * paths use, so compaction, budgets and hooks are identical — there is no second
 * loop. Every A2A task is a real session in the store, so the work is visible in
 * `fox ls` afterwards.
 *
 * ## Version negotiation (§3.6)
 *
 * The client sends `A2A-Version`. An empty value means 0.3 (§3.6.2), and we
 * answer in that dialect: 1.0 by default, 0.3 on request, `VersionNotSupported`
 * for anything else. Both dialects are produced by `codec.ts`; this file only
 * decides which one a given request asked for.
 *
 * ## Threading
 *
 * `Bun.serve` handles requests concurrently. A task owns a `runTurnCore`
 * generator for its whole life; `SubscribeToTask` attaches to that task's
 * subscriber set rather than starting a second turn, which is what §3.5.2
 * requires (multiple streams, same events, closing one must not affect others).
 */
import { VERSION } from "../core/version.ts";
import { createSession } from "../store/db.ts";
import { runTurnCore } from "../loop/turn.ts";
import { attachHost, detachHost, releaseSteer, waitQuiescent } from "../loop/steer.ts";
import { resolveChat } from "../providers/index.ts";
import type { Config } from "../core/config.ts";
import type { ProviderConfig } from "../providers/types.ts";
import type { AgentEvent } from "../core/events.ts";
import {
  LEGACY_PROTOCOL_VERSION,
  PROTOCOL_VERSION,
  type AgentCard,
  type Message,
  type Part,
  type SendMessageRequest,
  type StreamResponse,
  type TaskArtifactUpdateEvent,
  type TaskPushNotificationConfig,
  type TaskStatusUpdateEvent,
} from "./types.ts";
import {
  decodeMessage,
  decodeState,
  encodeAgentCard,
  encodeMessage,
  encodeStreamResponse,
  encodeTask,
  isoNow,
  isObj,
  normalizeVersion,
  partsText,
  cardInterfaces,
} from "./codec.ts";
import { A2aError, RPC_ERROR_CODES, RpcError, badRequest, fromRpcError, invalidParams, toRpcError, versionNotSupported } from "./errors.ts";
import { TaskStore, type StoredTask } from "./registry.ts";
import type { Dialect } from "./types.ts";

export interface A2aServerOptions {
  config: Config;
  provider: ProviderConfig;
  /** port to bind, default 0 (ephemeral — the OS picks, printed to stderr) */
  port?: number;
  /** host to bind, default 127.0.0.1 (local only) */
  hostname?: string;
  /**
   * Bearer token required on every RPC and on the extended card.
   *
   * Absent means no authentication: the endpoint runs tools with full machine
   * access, so exposing it beyond loopback without this is not supported.
   */
  authToken?: string;
  /** An authenticated extended card, if this deployment has one (§3.1.11). */
  extendedCard?: AgentCard;
  /** Agent card fields a deployment wants to publish; defaults are derived. */
  card?: Partial<AgentCard>;
  /**
   * The port this agent is reachable on, for the card's own URL.
   *
   * A getter when the listener picks the port (`port: 0`): a plain number would
   * make the card advertise `:0`, and a client that follows its own discovery
   * document would then dial a dead port. Omitted entirely, the card uses the
   * request's own Host, which is also the right answer behind a proxy.
   */
  portValue?: number | (() => number);
  /**
   * The provider entry point for a turn. Defaults to `resolveChat`.
   *
   * A seam for tests exactly like `TurnOptions.chat` is, so a suite can drive
   * the whole protocol without a network or an API key.
   */
  chat?: typeof resolveChat;
}

/** The JSON-RPC request envelope (§9.3). */
interface RpcRequest {
  jsonrpc?: string;
  id?: number | string | null;
  method?: string;
  params?: any;
}

const STREAM_CONTENT_TYPE = "text/event-stream";
const JSON_CONTENT_TYPE = "application/json";

/**
 * The request handler, separated from the listener.
 *
 * Exported so tests can drive every operation through a real `Request` without
 * binding a port or having to stop a server: `runA2aServer` is a thin wrapper
 * that adds `Bun.serve` and signal handling around this.
 */
export interface A2aHandler {
  fetch(req: Request): Promise<Response>;
  store: TaskStore;
  close(): void;
}

export function createA2aHandler(opts: A2aServerOptions): A2aHandler {
  const store = new TaskStore();
  /** the port we are actually on, if the caller knows it */
  const portNow = (): number | undefined =>
    typeof opts.portValue === "function" ? opts.portValue() : opts.portValue;

  /**
   * The card, with its own URL resolved as well as we can.
   *
   * `origin` comes from the request that asked for the card when we do not know
   * our port — the alternative is advertising `:0`, which is worse than
   * trusting the Host header the client just used to reach us.
   */
  const card = (origin?: string): AgentCard => ({
    name: opts.card?.name ?? "fox-agent",
    description:
      opts.card?.description ?? "A light coding harness with full machine control — reachable as an A2A peer agent.",
    supportedInterfaces: opts.card?.supportedInterfaces ?? [
      { url: `${origin ?? `http://127.0.0.1:${portNow() ?? 0}`}/`, protocolBinding: "JSONRPC", protocolVersion: PROTOCOL_VERSION },
    ],
    version: opts.card?.version ?? VERSION,
    capabilities: {
      streaming: true,
      // Push notifications are implemented (config CRUD + webhook delivery), so
      // the card advertises them; §3.3.4 makes the card the contract.
      pushNotifications: true,
      extendedAgentCard: !!opts.extendedCard,
      ...opts.card?.capabilities,
    },
    defaultInputModes: opts.card?.defaultInputModes ?? ["text/plain"],
    defaultOutputModes: opts.card?.defaultOutputModes ?? ["text/plain"],
    skills: opts.card?.skills ?? [
      { id: "coding", name: "Coding", description: "Autonomous coding, file editing, shell, research.", tags: ["coding"] },
    ],
    provider: opts.card?.provider ?? { organization: "fox-agent", url: "https://github.com/QQSHI13/fox-agent" },
    ...(opts.authToken
      ? {
          securitySchemes: {
            bearer: { httpAuthSecurityScheme: { scheme: "Bearer", bearerFormat: "opaque" } },
          },
          securityRequirements: [{ schemes: { bearer: { list: [] } } }],
        }
      : {}),
    ...opts.card,
  });

  const fetch = async (req: Request): Promise<Response> => {
    {
      const url = new URL(req.url);

      if (req.method === "GET" && isCardPath(url.pathname)) {
        const dialect = requestDialect(req, url).dialect;
        const body = JSON.stringify(encodeAgentCard(card(url.origin), dialect));
        return new Response(body, {
          headers: {
            "content-type": JSON_CONTENT_TYPE,
            // §8.6.1: cacheable, and the version doubles as a usable ETag
            "cache-control": "public, max-age=300",
            etag: `"${card().version}"`,
            "a2a-version": dialect === "1.0" ? PROTOCOL_VERSION : LEGACY_PROTOCOL_VERSION,
          },
        });
      }

      if (req.method !== "POST" || !(url.pathname === "/" || url.pathname === "/a2a" || url.pathname === "/rpc")) {
        return new Response("not found", { status: 404 });
      }

      // ---- authenticate before doing anything (§7.4) ----
      if (opts.authToken && !authorized(req, opts.authToken)) {
        return new Response(JSON.stringify({ error: "unauthorized" }), {
          status: 401,
          headers: { "content-type": JSON_CONTENT_TYPE, "www-authenticate": 'Bearer realm="a2a"' },
        });
      }

      // ---- version negotiation (§3.6.2) ----
      const { dialect, requested, ok } = requestDialect(req, url);

      let body: RpcRequest;
      try {
        body = (await req.json()) as RpcRequest;
      } catch {
        return rpcError(null, new RpcError(RPC_ERROR_CODES.ParseError, "Invalid JSON payload"), dialect);
      }
      if (!isObj(body) || typeof body.method !== "string") {
        return rpcError(body?.id ?? null, new RpcError(RPC_ERROR_CODES.InvalidRequest, "Request payload validation error"), dialect);
      }
      if (!ok) return rpcError(body.id ?? null, versionNotSupported(requested, supportedVersions()), dialect);

      const id = body.id ?? null;
      const params = isObj(body.params) ? body.params : {};
      const method = normalizeMethod(body.method);

      try {
        switch (method) {
          case "SendMessage":
            return await handleSend(id, params, dialect, false);
          case "SendStreamingMessage":
            return await handleSend(id, params, dialect, true);
          case "GetTask":
            return await handleGetTask(id, params, dialect);
          case "ListTasks":
            return await handleListTasks(id, params, dialect);
          case "CancelTask":
            return await handleCancel(id, params, dialect);
          case "SubscribeToTask":
            return await handleSubscribe(id, params, dialect);
          case "CreateTaskPushNotificationConfig":
            return await handlePushCreate(id, params, dialect);
          case "GetTaskPushNotificationConfig":
            return await handlePushGet(id, params);
          case "ListTaskPushNotificationConfigs":
            return await handlePushList(id, params);
          case "DeleteTaskPushNotificationConfig":
            return await handlePushDelete(id, params);
          case "GetExtendedAgentCard":
            return await handleExtendedCard(id, dialect);
          default:
            return rpcError(id, new RpcError(RPC_ERROR_CODES.MethodNotFound, `Method not found: ${body.method}`), dialect);
        }
      } catch (e) {
        return rpcError(id, e, dialect);
      }
    }
  };

  // -------------------------------------------------------------------------
  // operation handlers
  // -------------------------------------------------------------------------

  /** Capability gate (§3.3.4): refuse streaming when the card says it is off. */
  function requireStreaming(dialect: Dialect): void {
    if (!card().capabilities.streaming) throw new A2aError("UnsupportedOperation", "Streaming is not supported");
  }

  function requirePush(dialect: Dialect): void {
    if (!card().capabilities.pushNotifications)
      throw new A2aError("PushNotificationNotSupported");
  }

  async function handleSend(id: number | string | null, params: any, dialect: Dialect, streaming: boolean) {
    const message = decodeMessage(params.message);
    if (!message) throw invalidParams([{ field: "message", description: "message is required" }]);
    if (!message.parts.length)
      throw invalidParams([{ field: "message.parts", description: "At least one part is required" }]);
    if (!message.messageId)
      throw invalidParams([{ field: "message.messageId", description: "messageId is required" }]);

    if (streaming) requireStreaming(dialect);

    // §3.4.2: a client-supplied taskId must reference a task we already have.
    let stored: StoredTask;
    if (message.taskId) {
      stored = store.require(message.taskId);
      // §3.4.3: a mismatched contextId must be rejected, not silently overridden
      if (message.contextId && stored.task.contextId && message.contextId !== stored.task.contextId) {
        throw invalidParams([
          { field: "message.contextId", description: `does not match task ${stored.task.id}'s context ${stored.task.contextId}` },
        ]);
      }
      if (isTerminal(stored.task.status.state)) {
        throw new A2aError("UnsupportedOperation", `Task ${stored.task.id} is ${stored.task.status.state} and cannot accept messages`);
      }
    } else {
      stored = store.create(message.contextId);
    }

    // Attach the webhook before the turn starts, so even an immediately failing
    // run notifies a client that asked to be told (§6.6).
    const cfg = params.configuration?.taskPushNotificationConfig;
    if (isObj(cfg) && typeof cfg.url === "string") {
      requirePush(dialect);
      store.createPushConfig(stored.task.id, {
        url: cfg.url,
        token: typeof cfg.token === "string" ? cfg.token : undefined,
        authentication: isObj(cfg.authentication)
          ? { scheme: String(cfg.authentication.scheme ?? ""), credentials: cfg.authentication.credentials }
          : undefined,
      });
    }

    if (message.contextId && !stored.task.contextId) stored.task.contextId = message.contextId;
    store.appendHistory(stored, message);

    const historyLength = numberOrUndefined(params.configuration?.historyLength);
    // §3.2.2: both operations default to blocking; `returnImmediately` opts out.
    const blocking = params.configuration?.returnImmediately !== true;

    const run = driveTask(stored, message);

    if (streaming) return streamTask(stored, id, dialect, run);

    if (blocking) {
      await run;
      if (stored.canceled) {
        // a canceled run is not an error: the client gets the terminal task
      }
    }
    return rpcResult(id, { task: encodeTask(store.view(stored, historyLength), dialect) });
  }

  async function handleGetTask(id: number | string | null, params: any, dialect: Dialect) {
    const taskId = requireString(params.id, "id");
    const stored = store.require(taskId);
    const historyLength = numberOrUndefined(params.historyLength);
    if (historyLength !== undefined && historyLength < 0) {
      throw invalidParams([{ field: "historyLength", description: `Must be non-negative integer, got ${historyLength}` }]);
    }
    return rpcResult(id, encodeTask(store.view(stored, historyLength), dialect));
  }

  async function handleListTasks(id: number | string | null, params: any, dialect: Dialect) {
    const status = params.status
      ? decodeState(params.status)
      : undefined;
    if (status && !VALID_STATES.has(status)) {
      throw invalidParams([
        { field: "status", description: `Invalid status value '${params.status}'. Must be one of: ${[...VALID_STATES].join(", ")}` },
      ]);
    }
    const pageSize = numberOrUndefined(params.pageSize);
    if (pageSize !== undefined && (pageSize < 1 || pageSize > 100)) {
      throw invalidParams([{ field: "pageSize", description: `Must be between 1 and 100 inclusive, got ${pageSize}` }]);
    }
    const historyLength = numberOrUndefined(params.historyLength);
    if (historyLength !== undefined && historyLength < 0) {
      throw invalidParams([{ field: "historyLength", description: `Must be non-negative integer, got ${historyLength}` }]);
    }
    const page = store.list({
      contextId: typeof params.contextId === "string" ? params.contextId : undefined,
      status,
      pageSize,
      pageToken: typeof params.pageToken === "string" ? params.pageToken : undefined,
      historyLength,
      includeArtifacts: params.includeArtifacts === true,
    });
    return rpcResult(id, {
      tasks: page.tasks.map((t) => encodeTask(t, dialect)),
      totalSize: page.totalSize,
      pageSize: page.pageSize,
      // §3.1.4: always present, "" on the last page
      nextPageToken: page.nextPageToken,
    });
  }

  async function handleCancel(id: number | string | null, params: any, dialect: Dialect) {
    const taskId = requireString(params.id, "id");
    const task = store.cancel(taskId);
    return rpcResult(id, encodeTask(store.view(store.require(taskId)), dialect));
  }

  async function handleSubscribe(id: number | string | null, params: any, dialect: Dialect) {
    const taskId = requireString(params.id, "id");
    const stored = store.require(taskId);
    if (isTerminal(stored.task.status.state)) {
      throw new A2aError(
        "UnsupportedOperation",
        `Task ${taskId} is in a terminal state (${stored.task.status.state}) and cannot be subscribed to`,
      );
    }
    return streamTask(stored, id, dialect);
  }

  async function handlePushCreate(id: number | string | null, params: any, dialect: Dialect) {
    requirePush(dialect);
    const taskId = requireString(params.taskId ?? params.id, "taskId");
    const cfg = isObj(params.pushNotificationConfig) ? params.pushNotificationConfig : params;
    if (typeof cfg.url !== "string" || !cfg.url) {
      throw invalidParams([{ field: "pushNotificationConfig.url", description: "url is required" }]);
    }
    const saved = store.createPushConfig(taskId, {
      url: cfg.url,
      token: typeof cfg.token === "string" ? cfg.token : undefined,
      authentication: isObj(cfg.authentication)
        ? { scheme: String(cfg.authentication.scheme ?? ""), credentials: cfg.authentication.credentials }
        : undefined,
    });
    return rpcResult(id, encodePushConfig(saved));
  }

  async function handlePushGet(id: number | string | null, params: any) {
    const taskId = requireString(params.taskId ?? params.id, "taskId");
    const configId = requireString(params.configId, "configId");
    return rpcResult(id, encodePushConfig(store.getPushConfig(taskId, configId)));
  }

  async function handlePushList(id: number | string | null, params: any) {
    const taskId = requireString(params.taskId ?? params.id, "taskId");
    return rpcResult(id, { configs: store.listPushConfigs(taskId).map(encodePushConfig) });
  }

  async function handlePushDelete(id: number | string | null, params: any) {
    const taskId = requireString(params.taskId ?? params.id, "taskId");
    const configId = requireString(params.configId, "configId");
    store.deletePushConfig(taskId, configId);
    return rpcResult(id, {});
  }

  async function handleExtendedCard(id: number | string | null, dialect: Dialect) {
    // §3.3.4: declared-but-unconfigured is a different error from not-supported
    if (!card().capabilities.extendedAgentCard) {
      throw new A2aError("UnsupportedOperation", "This agent does not provide an extended agent card");
    }
    if (!opts.extendedCard) throw new A2aError("ExtendedAgentCardNotConfigured");
    return rpcResult(id, encodeAgentCard(opts.extendedCard, dialect));
  }

  // -------------------------------------------------------------------------
  // the turn, and the streams that watch it
  // -------------------------------------------------------------------------

  /**
   * One A2A task's turn: start (or continue) the session's turn, stream text as
   * artifact updates, and record the terminal state.
   */
  function driveTask(stored: StoredTask, message: Message): Promise<void> {
    const sessionId = stored.sessionId ?? createSession(process.cwd(), opts.provider.model).id;
    stored.sessionId = sessionId;
    const prompt = partsText(message.parts as unknown);
    const provider = opts.provider;

    /** accumulate text into one artifact so late subscribers see the whole body */
    let artifactText = "";
    const artifactId = "result";

    const emitText = (delta: string) => {
      artifactText += delta;
      const artifact = { artifactId, parts: [{ text: delta } as Part] };
      // append the delta; `lastChunk` is set only on the closing frame
      store.updateArtifact(stored, artifact, true);
    };

    const drive = async function* (turnPrompt: string, signal: AbortSignal): AsyncGenerator<AgentEvent> {
      for await (const ev of runTurnCore(sessionId, provider, turnPrompt, signal, {
        maxSteps: opts.config.maxSteps,
        retryLimit: opts.config.retryLimit,
        compactWarnAt: opts.config.compactWarnAt,
        compactCtxOnlyAt: opts.config.compactCtxOnlyAt,
        projectInstructions: opts.config.projectInstructions,
        config: opts.config,
        chat: opts.chat ?? resolveChat,
      })) {
        if (ev.type === "text") emitText(ev.delta);
        yield ev;
      }
    };

    const controller = new AbortController();
    stored.onCancel = () => controller.abort();

    attachHost(sessionId, {
      provider: () => provider,
      config: () => opts.config,
      chat: resolveChat,
      turn: (turnPrompt, ctl) => drive(turnPrompt, ctl.signal),
    });

    return (async () => {
      try {
        if (!provider.apiKey) {
          store.updateStatus(stored, "TASK_STATE_FAILED", {
            messageId: `msg-${crypto.randomUUID()}`,
            role: "ROLE_AGENT",
            parts: [{ text: "no API key: set FOX_AGENT_API_KEY / OPENAI_API_KEY / ANTHROPIC_API_KEY" }],
          });
          return;
        }
        store.updateStatus(stored, "TASK_STATE_WORKING");
        for await (const _ev of drive(prompt, controller.signal)) {
          // accumulation happens in emitText
          if (stored.canceled) break;
        }
        // A task is not finished while work is outstanding: a steer or a live
        // background job will add to this same result (§3.3.3).
        await waitQuiescent(sessionId);
        if (artifactText) {
          // close the artifact: lastChunk tells a late subscriber it is complete
          store.updateArtifact(stored, { artifactId, parts: [] }, true, true);
        }
        if (stored.canceled) {
          if (!isTerminal(stored.task.status.state)) store.updateStatus(stored, "TASK_STATE_CANCELED");
        } else {
          store.updateStatus(stored, "TASK_STATE_COMPLETED");
        }
      } catch (e) {
        if (stored.canceled) {
          store.updateStatus(stored, "TASK_STATE_CANCELED");
        } else {
          store.updateStatus(stored, "TASK_STATE_FAILED", {
            messageId: `msg-${crypto.randomUUID()}`,
            role: "ROLE_AGENT",
            parts: [{ text: `error: ${(e as Error).message ?? e}` }],
          });
        }
      } finally {
        detachHost(sessionId);
        releaseSteer(sessionId);
      }
    })();
  }

  /**
   * An SSE response watching a task (§9.4.2, §9.4.6).
   *
   * `run`, when given, is the turn this stream initiated: the stream ends when
   * that promise settles. A subscription has no run of its own — the task's own
   * terminal status closes it (the store does that in `updateStatus`).
   */
  function streamTask(stored: StoredTask, id: number | string | null, dialect: Dialect, run?: Promise<void>): Response {
    const enc = new TextEncoder();
    let closed = false;
    let keepalive: ReturnType<typeof setInterval> | undefined;

    /**
     * Close the controller exactly once.
     *
     * `controller.close()` throws `Invalid state: Controller is already closed`
     * when the client already disconnected — and from inside `start()` that
     * throw escapes as an uncaught exception rather than a rejected promise, so
     * a browser tab closing mid-turn could kill the server. One guard covers
     * every path that closes.
     */
    const shutdown = (controller: ReadableStreamDefaultController<Uint8Array>) => {
      if (closed) return;
      closed = true;
      if (keepalive) clearInterval(keepalive);
      try {
        controller.close();
      } catch {}
    };

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (frame: StreamResponse) => {
          if (closed) return;
          try {
            controller.enqueue(
              enc.encode(`data: ${JSON.stringify(rpcBody(id, encodeStreamResponse(frame, dialect)))}\r\n\r\n`),
            );
          } catch {
            closed = true;
          }
        };

        // First event is the task itself, so a client that attaches late knows
        // the current state before any delta (§3.1.6 requires this).
        send({ task: store.view(stored) });

        const unsubscribe = store.subscribe(stored, {
          send,
          close: () => shutdown(controller),
        });

        // A turn can run for minutes with no output at all. SSE comments keep
        // proxies and Bun's idle timer from dropping the socket; they carry no
        // `data:` line, so a client that only reads data events skips them.
        keepalive = setInterval(() => {
          if (closed) return;
          try {
            controller.enqueue(enc.encode(": keepalive\r\n\r\n"));
          } catch {
            closed = true;
          }
        }, 15_000);

        try {
          // A stream that initiated the turn ends when that turn settles. A pure
          // subscription has no turn of its own: it ends when the TASK reaches a
          // terminal state, which the store signals by calling our close().
          if (run) await run;
          else if (!isTerminal(stored.task.status.state)) await store.terminated(stored);
        } catch {}
        // give the terminal event a tick to flush before the socket closes
        await Bun.sleep(0);
        unsubscribe();
        shutdown(controller);
      },
      cancel() {
        closed = true;
        if (keepalive) clearInterval(keepalive);
        // the turn keeps running: §3.5.2 — a task's lifecycle is independent of
        // any stream's lifecycle, so a disconnect must not cancel the work
      },
    });

    return new Response(stream, {
      headers: {
        "content-type": STREAM_CONTENT_TYPE,
        "cache-control": "no-cache",
        "a2a-version": dialect === "1.0" ? PROTOCOL_VERSION : LEGACY_PROTOCOL_VERSION,
      },
    });
  }

  // -------------------------------------------------------------------------
  // responses
  // -------------------------------------------------------------------------

  function rpcBody(id: number | string | null, result: unknown): Record<string, unknown> {
    return { jsonrpc: "2.0", id, result };
  }

  function rpcResult(id: number | string | null, result: unknown): Response {
    return new Response(JSON.stringify(rpcBody(id, result)), {
      headers: {
        "content-type": JSON_CONTENT_TYPE,
        "a2a-version": PROTOCOL_VERSION,
      },
    });
  }

  function rpcError(id: number | string | null, err: unknown, dialect: Dialect): Response {
    const body = { jsonrpc: "2.0", id, error: toRpcError(err) };
    const status = err instanceof A2aError || err instanceof RpcError ? err.httpStatus : 200;
    return new Response(JSON.stringify(body), {
      // JSON-RPC errors travel in a 200 body per §9.5; only transport-level
      // failures (auth, parse) use an HTTP status.
      status: status === 401 || status === 404 ? status : 200,
      headers: {
        "content-type": JSON_CONTENT_TYPE,
        "a2a-version": dialect === "1.0" ? PROTOCOL_VERSION : LEGACY_PROTOCOL_VERSION,
      },
    });
  }

  return {
    fetch,
    store,
    close: () => store.closeAll(),
  };
}

/**
 * Serve A2A over HTTP. Resolves when the server stops (SIGINT/SIGTERM).
 *
 * Thin wrapper: the protocol lives in `createA2aHandler`, which is what the
 * tests drive. This adds the listener, the idle timeout and signal handling.
 */
export async function runA2aServer(opts: A2aServerOptions): Promise<void> {
  let port = opts.port ?? 0;
  let handler: A2aHandler | undefined;
  const server: ReturnType<typeof Bun.serve> = Bun.serve({
    port,
    hostname: opts.hostname ?? "127.0.0.1",
    // Bun closes an idle socket after 10s by default, which kills any turn that
    // thinks for longer. 255 is Bun's ceiling; SSE keepalive comments cover the
    // rest of the wait.
    idleTimeout: 255,
    fetch: (req) => handler!.fetch(req),
  });
  port = server.port ?? port;
  // built AFTER the listener so the card can name the port Bun actually bound
  handler = createA2aHandler({ ...opts, portValue: port });

  console.error(`fox-agent A2A server listening on http://${server.hostname}:${server.port}/ (Ctrl+C to stop)`);
  await new Promise<void>((resolve) => {
    const stop = () => {
      handler.close();
      server.stop();
      resolve();
    };
    process.on("SIGINT", stop);
    process.on("SIGTERM", stop);
  });
  await handler.store.drain();
}

// ---------------------------------------------------------------------------
// request-level helpers
// ---------------------------------------------------------------------------

const VALID_STATES = new Set([
  "TASK_STATE_SUBMITTED",
  "TASK_STATE_WORKING",
  "TASK_STATE_COMPLETED",
  "TASK_STATE_FAILED",
  "TASK_STATE_CANCELED",
  "TASK_STATE_REJECTED",
  "TASK_STATE_INPUT_REQUIRED",
  "TASK_STATE_AUTH_REQUIRED",
]);

function isTerminal(state: string): boolean {
  return (
    state === "TASK_STATE_COMPLETED" ||
    state === "TASK_STATE_FAILED" ||
    state === "TASK_STATE_CANCELED" ||
    state === "TASK_STATE_REJECTED"
  );
}

function isCardPath(path: string): boolean {
  return (
    path === "/.well-known/agent-card.json" ||
    path === "/.well-known/agent.json" ||
    // 0.3's other spelling
    path === "/agent.json"
  );
}

/**
 * The dialect this request speaks (§3.6.2).
 *
 * An absent or empty `A2A-Version` means 0.3 — that is the spec's own rule, not
 * a leniency — so a peer written against the old spec keeps working. The version
 * may also arrive as a query parameter (§3.6.1 lets a client choose).
 */
function requestDialect(req: Request, url: URL): { dialect: Dialect; requested: string; ok: boolean } {
  const raw = req.headers.get("a2a-version") ?? url.searchParams.get("A2A-Version") ?? "";
  const requested = raw.trim() === "" ? LEGACY_PROTOCOL_VERSION : normalizeVersion(raw);
  return { dialect: requested === PROTOCOL_VERSION ? "1.0" : "legacy", requested, ok: supportedVersions().includes(requested) };
}

function supportedVersions(): string[] {
  return [PROTOCOL_VERSION, LEGACY_PROTOCOL_VERSION];
}

/**
 * Method names are PascalCase in 1.0 (§9.1) and `category/action` in 0.3.
 *
 * Both map onto the same handler, so a legacy peer's `message/send` and a 1.0
 * peer's `SendMessage` are one code path — the dialect only changes the shape of
 * the payloads, never the operation.
 */
function normalizeMethod(method: string): string {
  const legacy: Record<string, string> = {
    "message/send": "SendMessage",
    "message/stream": "SendStreamingMessage",
    "tasks/get": "GetTask",
    "tasks/list": "ListTasks",
    "tasks/cancel": "CancelTask",
    "tasks/resubscribe": "SubscribeToTask",
    "tasks/subscribe": "SubscribeToTask",
    "tasks/pushNotificationConfig/set": "CreateTaskPushNotificationConfig",
    "tasks/pushNotificationConfig/get": "GetTaskPushNotificationConfig",
    "tasks/pushNotificationConfig/list": "ListTaskPushNotificationConfigs",
    "tasks/pushNotificationConfig/delete": "DeleteTaskPushNotificationConfig",
    "agent/getAuthenticatedExtendedCard": "GetExtendedAgentCard",
    "agent/getExtendedCard": "GetExtendedAgentCard",
  };
  return legacy[method] ?? method;
}

function authorized(req: Request, token: string): boolean {
  const h = req.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(h);
  if (!m) return false;
  // constant-time compare: a token check that leaks length/prefix timing is a
  // free oracle on a localhost endpoint that runs tools as the user
  const a = new TextEncoder().encode(m[1]);
  const b = new TextEncoder().encode(token);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

function requireString(v: unknown, field: string): string {
  if (typeof v !== "string" || !v) throw invalidParams([{ field, description: "is required" }]);
  return v;
}

function numberOrUndefined(v: unknown): number | undefined {
  if (v === undefined || v === null) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function encodePushConfig(cfg: TaskPushNotificationConfig): Record<string, unknown> {
  const out: Record<string, unknown> = { url: cfg.url };
  if (cfg.id) out.id = cfg.id;
  if (cfg.taskId) out.taskId = cfg.taskId;
  if (cfg.token) out.token = cfg.token;
  if (cfg.authentication) out.authentication = cfg.authentication;
  return out;
}
