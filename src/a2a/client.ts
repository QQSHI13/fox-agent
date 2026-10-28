/**
 * A2A client — delegation over HTTP + JSON-RPC 2.0.
 *
 * ACP is for agents fox-agent *spawns*; A2A is for agents that already live
 * somewhere on the network behind a URL. Config picks the protocol by shape: an
 * `[agents.x]` entry with `command` is spawned, one with `url` is reached here.
 *
 * ## Version negotiation (§3.6)
 *
 * The card's `supportedInterfaces` is read first (§8.3.2: parse it, pick the
 * first supported transport). We speak 1.0; a peer that only offers 0.3 is still
 * a peer, so the connection falls back to that dialect — and every request
 * carries `A2A-Version`, which §3.6.1 says a client MUST send.
 *
 * ## Operations
 *
 * All eleven of §3.1 are reachable from here. `runA2aAgent` is the one the
 * `task` tool uses: send a message, stream if possible, poll otherwise, return
 * the artifacts.
 */
import { VERSION } from "../core/version.ts";
import {
  LEGACY_PROTOCOL_VERSION,
  PROTOCOL_VERSION,
  TERMINAL_STATES,
  INTERRUPTED_STATES,
  type AgentCard,
  type Message,
  type Part,
  type SendMessageConfiguration,
  type SendMessageRequest,
  type StreamResponse,
  type Task,
  type TaskPushNotificationConfig,
  type TaskState,
} from "./types.ts";
import {
  cardInterfaces,
  decodeMessage,
  decodeStreamResponse,
  decodeTask,
  encodeMessage,
  encodeParts,
  encodeState,
  isoNow,
  isObj,
  normalizeVersion,
  partsText,
} from "./codec.ts";
import type { Dialect } from "./types.ts";
import { A2aError, RpcError, fromRpcError } from "./errors.ts";

export interface A2aOptions {
  signal?: AbortSignal;
  headers?: Record<string, string>;
  /** overall cap on a delegation, default 30 min */
  timeoutMs?: number;
  /**
   * Progress while streaming: state transitions and artifact text as it
   * accumulates. Never called on the polling fallback, which has nothing to
   * report between polls.
   */
  onEvent?: (ev: { state?: TaskState; text?: string; artifactId?: string }) => void;
  /** Pin the protocol version instead of taking the card's preference. */
  version?: string;
  /** Bearer token, sent as `authorization`. */
  authToken?: string;
  /** Multi-tenant routing key (§8.3.2 rule 4). */
  tenant?: string;
  /** Skip card discovery (a peer that publishes nothing is still a peer). */
  skipDiscovery?: boolean;
}

interface JsonRpc {
  jsonrpc: "2.0";
  id: number | string | null;
  result?: any;
  error?: { code: number; message: string; data?: unknown };
}

let rpcId = 0;

/**
 * 1.0 method name -> the 0.3 spelling of the same operation (§5.3).
 *
 * Used only for the one-shot downgrade in `downgradeToLegacy`: a peer that has
 * not upgraded answers `-32601` to a PascalCase method, and §A.2 asks callers to
 * keep working with the old shape during the overlap.
 */
const LEGACY_METHODS: Record<string, string> = {
  SendMessage: "message/send",
  SendStreamingMessage: "message/stream",
  GetTask: "tasks/get",
  ListTasks: "tasks/list",
  CancelTask: "tasks/cancel",
  SubscribeToTask: "tasks/resubscribe",
  CreateTaskPushNotificationConfig: "tasks/pushNotificationConfig/set",
  GetTaskPushNotificationConfig: "tasks/pushNotificationConfig/get",
  ListTaskPushNotificationConfigs: "tasks/pushNotificationConfig/list",
  DeleteTaskPushNotificationConfig: "tasks/pushNotificationConfig/delete",
  GetExtendedAgentCard: "agent/getAuthenticatedExtendedCard",
};

/**
 * Switch a connection to the legacy dialect for good.
 *
 * A peer either speaks 1.0 or it does not; there is no point re-asking on every
 * later call, and the version header has to change with it — §3.6.2 says an
 * empty or 0.3 value means 0.3 semantics, and claiming 1.0 while sending 0.3
 * payloads would be a lie the server can act on.
 */
function downgradeToLegacy(conn: A2aConnection): A2aConnection {
  conn.dialect = "legacy";
  conn.version = LEGACY_PROTOCOL_VERSION;
  conn.headers = { ...conn.headers, "a2a-version": LEGACY_PROTOCOL_VERSION };
  return conn;
}

/** True when an error means "this peer does not know that method". */
function isMethodNotFound(e: unknown): boolean {
  if (e instanceof RpcError) return e.code === -32601 || e.code === -32004;
  // A 1.0-only server may answer an unknown method with a bare HTTP error
  // instead of a JSON-RPC body, which surfaces as a plain RpcError too.
  return false;
}

/** A negotiated connection to one peer. */
export interface A2aConnection {
  /** the RPC endpoint, no trailing slash */
  url: string;
  dialect: Dialect;
  version: string;
  tenant?: string;
  headers: Record<string, string>;
  card?: AgentCard;
}

// ---------------------------------------------------------------------------
// discovery and negotiation
// ---------------------------------------------------------------------------

/** The agent's display name, or null when it publishes no card (not an error). */
export async function agentCardName(base: string, opts: A2aOptions = {}): Promise<string | null> {
  const found = await fetchCard(base, opts);
  return found && typeof found.raw.name === "string" ? found.raw.name : null;
}

/**
 * Fetch and normalise the agent card (§8.2).
 *
 * Both well-known paths are tried: `agent-card.json` is 1.0's, `agent.json` is
 * what 0.3 published. A peer that answers neither is not a failure — it just
 * cannot be negotiated with, which `connect` reports as a 1.0 attempt.
 */
export async function fetchCard(
  base: string,
  opts: A2aOptions = {},
): Promise<{ card: AgentCard; raw: any } | null> {
  for (const path of ["/.well-known/agent-card.json", "/.well-known/agent.json", "/agent.json"]) {
    try {
      const res = await fetch(`${trimEnd(base)}${path}`, {
        headers: requestHeaders(opts, undefined),
        signal: opts.signal ?? AbortSignal.timeout(opts.timeoutMs ?? 15_000),
      });
      if (!res.ok) continue;
      const raw = await res.json();
      if (!isObj(raw)) continue;
      return { card: raw as AgentCard, raw };
    } catch {
      // try the next well-known path
    }
  }
  return null;
}

/**
 * Pick the interface we can actually speak (§8.3.2).
 *
 * Preference order is the card's own, but a 1.0 interface always beats a 0.3 one
 * even if the card lists 0.3 first: a client that silently downgrades loses the
 * features it was built for, which §3.6.3 warns about explicitly.
 */
function chooseInterface(
  interfaces: { url: string; binding: string; version: string; tenant?: string }[],
): { url: string; version: string; tenant?: string } | null {
  const jsonrpc = interfaces.filter((i) => /^(JSONRPC|JSON-RPC)$/i.test(i.binding));
  const pool = jsonrpc.length ? jsonrpc : interfaces;
  const current = pool.find((i) => normalizeVersion(i.version) === PROTOCOL_VERSION);
  const pick = current ?? pool[0];
  return pick ? { url: pick.url, version: normalizeVersion(pick.version), tenant: pick.tenant } : null;
}

/**
 * Resolve a peer into a connection: endpoint, dialect, and the headers every
 * request must carry.
 *
 * Discovery is best-effort by design. A peer with no card is tried as 1.0 — that
 * is the current standard, and a server that predates cards entirely is far less
 * likely than one that simply does not advertise.
 */
export async function connect(base: string, opts: A2aOptions = {}): Promise<A2aConnection> {
  const root = trimEnd(base);
  let url = root;
  let version = normalizeVersion(opts.version ?? PROTOCOL_VERSION);
  let tenant = opts.tenant;
  let card: AgentCard | undefined;

  if (!opts.skipDiscovery && !opts.version) {
    const found = await fetchCard(root, opts);
    if (found) {
      card = found.card;
      const chosen = chooseInterface(cardInterfaces(found.raw));
      if (chosen) {
        url = trimEnd(chosen.url);
        version = chosen.version;
        tenant = tenant ?? chosen.tenant;
      }
    }
  }

  return {
    url,
    version,
    dialect: version === PROTOCOL_VERSION ? "1.0" : "legacy",
    tenant,
    headers: requestHeaders(opts, version),
    card,
  };
}

function requestHeaders(opts: A2aOptions, version: string | undefined): Record<string, string> {
  const h: Record<string, string> = {
    "user-agent": `fox-agent/${VERSION}`,
    ...(opts.headers ?? {}),
  };
  // §3.6.1: clients MUST send it, except 0.3 clients (an empty value means 0.3).
  if (version) h["a2a-version"] = version;
  if (opts.authToken) h.authorization = `Bearer ${opts.authToken}`;
  return h;
}

// ---------------------------------------------------------------------------
// one JSON-RPC call
// ---------------------------------------------------------------------------

/**
 * One JSON-RPC call, with a one-shot downgrade to the legacy spelling.
 *
 * `build` takes the dialect because the *params* change shape with it, not just
 * the method name — a legacy peer needs `kind`-discriminated parts and lowercase
 * enums, so re-encoding is part of the retry rather than an afterthought. The
 * connection object is mutated by the downgrade, so every later call on it goes
 * straight out in the dialect that worked.
 */
async function rpc(
  conn: A2aConnection,
  method: keyof typeof LEGACY_METHODS | string,
  build: (dialect: Dialect) => unknown,
  opts: A2aOptions,
): Promise<any> {
  const attempt = async (name: string, dialect: Dialect): Promise<any> => {
    const params = build(dialect) as Record<string, unknown>;
    if (conn.tenant && isObj(params)) params.tenant = conn.tenant;
    const res = await fetch(conn.url, {
      method: "POST",
      headers: { "content-type": "application/json", ...conn.headers },
      body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method: name, params }),
      signal: opts.signal,
    });
    if (res.status === 401 || res.status === 403) {
      throw new RpcError(-32000, `A2A HTTP ${res.status} from ${conn.url}: not authorized`, undefined, res.status);
    }
    if (!res.ok) throw new RpcError(-32000, `A2A HTTP ${res.status} from ${conn.url}`, undefined, res.status);
    const payload = (await res.json()) as JsonRpc;
    if (payload.error) throw fromRpcError(payload.error);
    return payload.result;
  };

  try {
    return await attempt(nameFor(method, conn.dialect), conn.dialect);
  } catch (e) {
    const legacyName = LEGACY_METHODS[method as string];
    // Downgrade only when the peer clearly does not know the 1.0 name, and only
    // once: a 0.3 peer stays 0.3 for every later call on this connection.
    if (conn.dialect === "1.0" && legacyName && isMethodNotFound(e)) {
      downgradeToLegacy(conn);
      return attempt(legacyName, conn.dialect);
    }
    throw e;
  }
}

/**
 * The method name in the given dialect.
 *
 * 1.0 uses PascalCase (§9.1) and 0.3 uses `category/action`, so the name is part
 * of the wire format — a connection that has already downgraded must send the
 * old name on the very next call, not just on the retry that downgraded it.
 */
function nameFor(method: string, dialect: Dialect): string {
  return dialect === "legacy" ? (LEGACY_METHODS[method] ?? method) : method;
}

// ---------------------------------------------------------------------------
// operations (§3.1)
// ---------------------------------------------------------------------------

/** §3.1.1 — returns a Task (still running or finished) or a direct Message. */
export async function sendMessage(
  conn: A2aConnection,
  message: Message,
  configuration?: SendMessageConfiguration,
  opts: A2aOptions = {},
): Promise<{ task?: Task; message?: Message }> {
  const params: SendMessageRequest = {
    message,
    ...(configuration ? { configuration } : {}),
  };
  const result = await rpc(conn, "SendMessage", (d) => encodeSendParams(params, d), opts);
  return decodeSendResponse(result);
}

/** §3.1.3 */
export async function getTask(
  conn: A2aConnection,
  id: string,
  historyLength?: number,
  opts: A2aOptions = {},
): Promise<Task> {
  const result = await rpc(
    conn,
    "GetTask",
    () => ({ id, ...(historyLength === undefined ? {} : { historyLength }) }),
    opts,
  );
  const task = decodeTask(result);
  if (!task) throw new A2aError("InvalidAgentResponse", "GetTask returned no task");
  return task;
}

/** §3.1.4 */
export async function listTasks(
  conn: A2aConnection,
  params: { contextId?: string; status?: TaskState; pageSize?: number; pageToken?: string; historyLength?: number; includeArtifacts?: boolean } = {},
  opts: A2aOptions = {},
): Promise<{ tasks: Task[]; totalSize: number; pageSize: number; nextPageToken: string }> {
  const wire = (d: Dialect): Record<string, unknown> => {
    const out: Record<string, unknown> = {};
    if (params.contextId) out.contextId = params.contextId;
    // the enum is spelled per dialect, so it has to be built inside the call
    if (params.status) out.status = encodeState(params.status, d);
    if (params.pageSize !== undefined) out.pageSize = params.pageSize;
    if (params.pageToken !== undefined) out.pageToken = params.pageToken;
    if (params.historyLength !== undefined) out.historyLength = params.historyLength;
    if (params.includeArtifacts !== undefined) out.includeArtifacts = params.includeArtifacts;
    return out;
  };
  const result = await rpc(conn, "ListTasks", wire, opts);
  return {
    tasks: (Array.isArray(result?.tasks) ? result.tasks : []).map(decodeTask).filter((t: Task | null): t is Task => t !== null),
    totalSize: Number(result?.totalSize ?? 0),
    pageSize: Number(result?.pageSize ?? 0),
    nextPageToken: String(result?.nextPageToken ?? ""),
  };
}

/** §3.1.5 */
export async function cancelTask(conn: A2aConnection, id: string, opts: A2aOptions = {}): Promise<Task> {
  const result = await rpc(conn, "CancelTask", () => ({ id }), opts);
  const task = decodeTask(result);
  if (!task) throw new A2aError("InvalidAgentResponse", "CancelTask returned no task");
  return task;
}

/** §3.1.7 */
export async function createPushConfig(
  conn: A2aConnection,
  taskId: string,
  config: TaskPushNotificationConfig,
  opts: A2aOptions = {},
): Promise<TaskPushNotificationConfig> {
  const result = await rpc(
    conn,
    "CreateTaskPushNotificationConfig",
    () => ({
      taskId,
      pushNotificationConfig: {
        url: config.url,
        ...(config.token ? { token: config.token } : {}),
        ...(config.authentication ? { authentication: config.authentication } : {}),
      },
    }),
    opts,
  );
  return decodePushConfig(result);
}

/** §3.1.8 */
export async function getPushConfig(
  conn: A2aConnection,
  taskId: string,
  configId: string,
  opts: A2aOptions = {},
): Promise<TaskPushNotificationConfig> {
  return decodePushConfig(await rpc(conn, "GetTaskPushNotificationConfig", () => ({ taskId, configId }), opts));
}

/** §3.1.9 */
export async function listPushConfigs(
  conn: A2aConnection,
  taskId: string,
  opts: A2aOptions = {},
): Promise<TaskPushNotificationConfig[]> {
  const result = await rpc(conn, "ListTaskPushNotificationConfigs", () => ({ taskId }), opts);
  const list = Array.isArray(result?.configs) ? result.configs : Array.isArray(result) ? result : [];
  return list.map(decodePushConfig);
}

/** §3.1.10 */
export async function deletePushConfig(
  conn: A2aConnection,
  taskId: string,
  configId: string,
  opts: A2aOptions = {},
): Promise<void> {
  await rpc(conn, "DeleteTaskPushNotificationConfig", () => ({ taskId, configId }), opts);
}

/** §3.1.11 */
export async function getExtendedAgentCard(conn: A2aConnection, opts: A2aOptions = {}): Promise<any> {
  return rpc(conn, "GetExtendedAgentCard", () => ({}), opts);
}

// ---------------------------------------------------------------------------
// streaming (§3.1.2, §3.1.6)
// ---------------------------------------------------------------------------

/** Returned when the peer has no streaming support, so callers poll instead. */
const NO_STREAM = Symbol("no-stream");
export type StreamOutcome = { kind: "stream"; text: string; task?: Task } | { kind: "no-stream" };

/**
 * Read one SSE stream of `StreamResponse` frames (§3.2.3, §3.5.2).
 *
 * Frames are blank-line separated; `\r\n\r\n` wins over `\n\n` because the
 * latter is a substring of the former, and a terminator split across a chunk
 * waits for more bytes rather than cutting mid-JSON. Returns the accumulated
 * artifact text plus the last task seen.
 */
async function readStream(
  res: Response,
  conn: A2aConnection,
  opts: A2aOptions,
  deadline: number,
): Promise<{ text: string; task?: Task }> {
  const artifacts = new Map<string, string>();
  let statusText = "";
  let finalTask: Task | undefined;
  let lastState: TaskState | undefined;
  let buf = "";
  const reader = (res.body as ReadableStream<Uint8Array>).getReader();
  const dec = new TextDecoder();
  try {
    for (;;) {
      if (Date.now() > deadline) throw new A2aError("InvalidAgentResponse", "A2A stream did not finish within the timeout");
      // Idle watchdog: read() pends forever against a peer that accepts the
      // connection then goes silent, and neither the abort signal nor the
      // deadline can interrupt a pending read.
      let idle: ReturnType<typeof setTimeout> | undefined;
      const chunk = await Promise.race([
        reader.read(),
        new Promise<never>((_, reject) => {
          idle = setTimeout(() => reject(new A2aError("InvalidAgentResponse", "A2A stream idle: no data for 60s")), 60_000);
        }),
      ]).finally(() => clearTimeout(idle));
      const { done, value } = chunk;
      if (done) break;
      buf += dec.decode(value, { stream: true });

      for (;;) {
        const crlf = buf.indexOf("\r\n\r\n");
        const lf = buf.indexOf("\n\n");
        let cut: number;
        let sepLen: number;
        if (crlf >= 0 && (lf < 0 || crlf < lf)) {
          cut = crlf;
          sepLen = 4;
        } else if (lf >= 0) {
          cut = lf;
          sepLen = 2;
        } else break;
        const raw = buf.slice(0, cut);
        buf = buf.slice(cut + sepLen);
        // SSE: several `data:` lines concatenate; a frame with none is a comment
        // (our keepalives) and carries nothing to act on.
        const data = raw
          .split(/\r?\n/)
          .filter((l) => l.startsWith("data:"))
          .map((l) => l.slice(5).replace(/^ /, "").replace(/\r$/, ""))
          .join("\n");
        if (!data) continue;
        let msg: JsonRpc;
        try {
          msg = JSON.parse(data) as JsonRpc;
        } catch {
          continue; // a malformed frame is skipped, not fatal
        }
        if (msg.error) throw fromRpcError(msg.error);
        const frame = decodeStreamResponse(msg.result);
        if (!frame) continue;

        if ("task" in frame) {
          finalTask = frame.task;
          lastState = frame.task.status.state;
          opts.onEvent?.({ state: lastState });
          // A task frame can carry a status message — that is how a task that is
          // already INPUT_REQUIRED explains itself to a subscriber that arrives
          // late. Dropping it left the caller with a bare state and no reason.
          const fromStatus = frame.task.status.message ? partsText(frame.task.status.message.parts) : "";
          if (fromStatus) statusText = fromStatus;
          if (TERMINAL_STATES.has(lastState) || INTERRUPTED_STATES.has(lastState)) break;
        } else if ("message" in frame) {
          const t = partsText(frame.message.parts);
          if (t) statusText = t;
          finalTask = finalTask ?? { id: "", status: { state: "TASK_STATE_COMPLETED" } };
        } else if ("statusUpdate" in frame) {
          const e = frame.statusUpdate;
          lastState = e.status.state;
          opts.onEvent?.({ state: lastState });
          const t = e.status.message ? partsText(e.status.message.parts) : "";
          if (t) statusText = t;
          if (finalTask) finalTask.status = e.status;
          // A stream may open with a status update instead of a task frame (a
          // peer that already knows the state). Keep a stand-in so the caller
          // still learns the terminal state — without it a FAILED task looked
          // like a clean finish with some text attached.
          else finalTask = { id: e.taskId, contextId: e.contextId, status: e.status };
          if (TERMINAL_STATES.has(lastState) || INTERRUPTED_STATES.has(lastState)) break;
        } else {
          const e = frame.artifactUpdate;
          const t = partsText(e.artifact.parts);
          if (t) {
            const id = e.artifact.artifactId;
            artifacts.set(id, e.append ? (artifacts.get(id) ?? "") + t : t);
            opts.onEvent?.({ text: t, artifactId: id });
          }
        }
      }
      if (lastState && (TERMINAL_STATES.has(lastState) || INTERRUPTED_STATES.has(lastState))) break;
    }
  } finally {
    reader.cancel().catch(() => {});
  }

  const text = [...artifacts.values()].filter(Boolean).join("\n") || statusText;
  return { text, task: finalTask };
}

/** POST a streaming method and read the SSE response, or report no support. */
async function streamRpc(
  conn: A2aConnection,
  method: string,
  build: (dialect: Dialect) => unknown,
  opts: A2aOptions,
  deadline: number,
): Promise<StreamOutcome> {
  // An already-negotiated 0.3 connection needs the 0.3 method name here too.
  // This path does not go through `rpc`, so it would otherwise keep asking for
  // `SendStreamingMessage` on every call and being told -32601 each time.
  const name = nameFor(method, conn.dialect);
  const res = await fetch(conn.url, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "text/event-stream", ...conn.headers },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method: name, params: build(conn.dialect) }),
    signal: opts.signal,
  });
  if (res.status === 401 || res.status === 403) throw new RpcError(-32000, `A2A HTTP ${res.status}: not authorized`, undefined, res.status);
  if (!res.ok) throw new RpcError(-32000, `A2A HTTP ${res.status} from ${conn.url}`, undefined, res.status);

  const ctype = res.headers.get("content-type") ?? "";
  if (!ctype.includes("text/event-stream")) {
    // A non-SSE reply is legal: either an error (no streaming here → poll) or a
    // plain JSON result that answers the call outright.
    const body = (await res.json()) as JsonRpc;
    if (body.error) {
      const err = body.error;
      const noMethod = err.code === -32601 || err.code === -32004;
      if (noMethod) {
        // A 1.0 peer that simply does not do streaming, or a 1.0 peer that did
        // not recognise the PascalCase name: either way the answer is to ask in
        // the legacy spelling once, then fall back to polling.
        if (conn.dialect === "1.0" && LEGACY_METHODS[method]) {
          downgradeToLegacy(conn);
          return streamRpc(conn, method, build, opts, deadline);
        }
        return { kind: "no-stream" };
      }
      throw fromRpcError(err);
    }
    const decoded = decodeSendResponse(body.result);
    // A non-SSE reply to a STREAMING method can still be a StreamResponse frame:
    // a peer may answer `SendStreamingMessage` with one `statusUpdate` (or one
    // `task`) instead of opening a stream. `decodeSendResponse` only knows the
    // `{task}`/`{message}` shape of `SendMessage`, so without this the frame was
    // dropped and a FAILED task read as a clean finish with some text attached.
    const frame = decoded.task || decoded.message ? null : decodeStreamResponse(body.result);
    if (frame) {
      if ("task" in frame) {
        const t = [...(frame.task.artifacts ?? [])].map((a) => partsText(a.parts)).filter(Boolean).join("\n");
        const fromStatus = frame.task.status.message ? partsText(frame.task.status.message.parts) : "";
        return { kind: "stream", text: t || fromStatus, task: frame.task };
      }
      if ("statusUpdate" in frame) {
        const e = frame.statusUpdate;
        const fromStatus = e.status.message ? partsText(e.status.message.parts) : "";
        // an interrupted state is an outcome, not a completed task
        return { kind: "stream", text: fromStatus, task: { id: e.taskId, contextId: e.contextId, status: e.status } };
      }
      if ("message" in frame) return { kind: "stream", text: partsText(frame.message.parts), task: undefined };
      return { kind: "stream", text: partsText(frame.artifactUpdate.artifact.parts), task: undefined };
    }
    // A `{task}` reply to a STREAMING method may explain itself only in its
    // status message — that is how a peer says "I need input" or "I failed,
    // here is why". Reading artifacts only left the caller with a bare state and
    // no reason, so the outcome was reported as an empty string.
    const taskText = (task: Task): string => {
      const fromArtifacts = [...(task.artifacts ?? [])].map((a) => partsText(a.parts)).filter(Boolean).join("\n");
      if (fromArtifacts) return fromArtifacts;
      return task.status.message ? partsText(task.status.message.parts) : "";
    };
    const text = decoded.task
      ? taskText(decoded.task)
      : decoded.message
        ? partsText(decoded.message.parts)
        : "";
    return { kind: "stream", text, task: decoded.task };
  }
  return { kind: "stream", ...(await readStream(res, conn, opts, deadline)) };
}

/** §3.1.6 — attach to a running task and stream it to completion. */
export async function subscribeToTask(
  conn: A2aConnection,
  id: string,
  opts: A2aOptions = {},
): Promise<{ text: string; task?: Task }> {
  const outcome = await streamRpc(conn, "SubscribeToTask", () => ({ id }), opts, Date.now() + (opts.timeoutMs ?? 30 * 60_000));
  if (outcome.kind === "no-stream") throw new A2aError("UnsupportedOperation", "The peer does not support streaming");
  return { text: outcome.text, task: outcome.task };
}

// ---------------------------------------------------------------------------
// the one call the `task` tool makes
// ---------------------------------------------------------------------------

/**
 * Delegate one prompt to an A2A agent and wait for its final report.
 *
 * Streaming first (§3.1.2) because it carries progress and artifact deltas as
 * they happen; a peer without streaming answers `-32601`/`-32004` and we fall
 * back to `SendMessage` + `GetTask` polling (§3.5.1), where `returnImmediately`
 * is what makes the poll loop necessary rather than `blocking` being honoured.
 *
 * An interrupted state (`INPUT_REQUIRED`, `AUTH_REQUIRED`) ends the wait: this is
 * a headless delegation, nobody can answer the peer's question, so it is
 * reported as a failure carrying the peer's own message rather than parked.
 */
export async function runA2aAgent(base: string, prompt: string, opts: A2aOptions = {}): Promise<string> {
  const conn = await connect(base, opts);
  const deadline = Date.now() + (opts.timeoutMs ?? 30 * 60_000);
  const message = outgoingMessage(prompt, conn.dialect);

  const streamed = await streamRpc(conn, "SendStreamingMessage", (d) => encodeSendParams({ message }, d), opts, deadline).catch((e) => {
    if (opts.signal?.aborted) throw new A2aError("InvalidAgentResponse", "aborted");
    throw e;
  });

  if (streamed.kind === "stream") {
    const state = streamed.task?.status.state;
    if (state && TERMINAL_STATES.has(state) && state !== "TASK_STATE_COMPLETED") {
      throw new A2aError("InvalidAgentResponse", `A2A task ${state}${streamed.text ? `: ${streamed.text}` : ""}`);
    }
    if (state && INTERRUPTED_STATES.has(state)) {
      throw new A2aError("UnsupportedOperation", `A2A task needs input (${state})${streamed.text ? `: ${streamed.text}` : ""}`);
    }
    return streamed.text || "(agent completed with no report)";
  }

  // ---- polling fallback ----
  const sent = await sendMessage(conn, message, { returnImmediately: true }, opts);
  if (sent.message) {
    const text = partsText(sent.message.parts);
    if (text) return text;
  }
  if (!sent.task?.id) throw new A2aError("InvalidAgentResponse", "A2A reply was neither a task nor a message");

  let task = sent.task;
  while (!TERMINAL_STATES.has(task.status.state) && !INTERRUPTED_STATES.has(task.status.state)) {
    if (Date.now() > deadline) throw new A2aError("InvalidAgentResponse", `A2A task ${task.id} did not finish within the timeout`);
    if (opts.signal?.aborted) throw new A2aError("InvalidAgentResponse", "aborted");
    await Bun.sleep(1_000);
    task = await getTask(conn, task.id, undefined, opts);
  }

  const text = taskText(task);
  const state = task.status.state;
  if (state === "TASK_STATE_COMPLETED") return text || "(agent completed with no report)";
  if (INTERRUPTED_STATES.has(state)) {
    throw new A2aError("UnsupportedOperation", `A2A task needs input (${state})${text ? `: ${text}` : ""}`);
  }
  throw new A2aError("InvalidAgentResponse", `A2A task ${state}${text ? `: ${text}` : ""}`);
}

// ---------------------------------------------------------------------------
// wire helpers
// ---------------------------------------------------------------------------

/** A user message in the negotiated dialect (§4.1.4). */
export function outgoingMessage(prompt: string, dialect: Dialect): Message {
  const parts: Part[] = [{ text: prompt }];
  return {
    messageId: `fox-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    role: "ROLE_USER",
    parts,
    ...(dialect === "legacy" ? {} : {}),
  };
}

function encodeSendParams(params: SendMessageRequest, dialect: Dialect): Record<string, unknown> {
  const out: Record<string, unknown> = { message: encodeMessage(params.message, dialect) };
  if (params.configuration) {
    const c = params.configuration;
    out.configuration = {
      ...(c.acceptedOutputModes ? { acceptedOutputModes: c.acceptedOutputModes } : {}),
      ...(c.historyLength !== undefined ? { historyLength: c.historyLength } : {}),
      ...(c.returnImmediately !== undefined ? { returnImmediately: c.returnImmediately } : {}),
      ...(c.taskPushNotificationConfig ? { taskPushNotificationConfig: c.taskPushNotificationConfig } : {}),
    };
  }
  if (params.metadata) out.metadata = params.metadata;
  return out;
}

/**
 * `SendMessage`'s result (§9.4.1). 1.0 wraps it as `{task}` or `{message}`; 0.3
 * put the object itself in `result`, so both are accepted.
 *
 * The bare-object branch has to be strict about what counts as a Message:
 * `decodeMessage` happily returns an object for anything (an empty `messageId`
 * and no parts), which made every unrecognised result look like a direct reply
 * and hid the `statusUpdate`/`artifactUpdate` frames a streaming method may
 * return.
 */
function decodeSendResponse(result: unknown): { task?: Task; message?: Message } {
  if (!isObj(result)) return {};
  if (isObj(result.task)) {
    const task = decodeTask(result.task);
    return task ? { task } : {};
  }
  if (isObj(result.message)) {
    const message = decodeMessage(result.message);
    return message ? { message } : {};
  }
  const task = decodeTask(result);
  if (task) return { task };
  // a Message must actually be one: an id and something to say
  if (isObj(result) && (typeof result.role === "string" || typeof result.messageId === "string") && Array.isArray(result.parts)) {
    const message = decodeMessage(result);
    if (message) return { message };
  }
  return {};
}

/** A task's result text: artifacts first (the work product), status message second. */
function taskText(task: Task): string {
  const fromArtifacts = (task.artifacts ?? []).map((a) => partsText(a.parts)).filter(Boolean);
  if (fromArtifacts.length) return fromArtifacts.join("\n");
  return task.status.message ? partsText(task.status.message.parts) : "";
}

function decodePushConfig(v: any): TaskPushNotificationConfig {
  const out: TaskPushNotificationConfig = { url: String(v?.url ?? "") };
  if (typeof v?.id === "string") out.id = v.id;
  if (typeof v?.taskId === "string") out.taskId = v.taskId;
  if (typeof v?.token === "string") out.token = v.token;
  if (isObj(v?.authentication)) out.authentication = v.authentication;
  return out;
}

function trimEnd(s: string): string {
  return s.replace(/\/$/, "");
}

// Re-exported so callers do not have to reach into `codec.ts` for these.
export { partsText, encodeParts, isoNow, PROTOCOL_VERSION, LEGACY_PROTOCOL_VERSION };
export type { StreamResponse };
