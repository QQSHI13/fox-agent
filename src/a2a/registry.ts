/**
 * The server's task store: everything that must outlive a single request.
 *
 * A2A separates the *task* from any connection that watches it (§3.5.2):
 *
 *   - a task's lifecycle is independent of a stream's lifecycle;
 *   - events MUST be broadcast to every active stream for a task, in the same
 *     order (§3.5.2);
 *   - closing one stream MUST NOT affect the others.
 *
 * That is the whole reason this exists rather than the state living inside a
 * `ReadableStream.start()` closure: `SubscribeToTask` (§3.1.6) lets a client
 * attach later, and §3.5.2 explicitly wants several watchers at once.
 *
 * It also owns push-notification configs (§3.1.7–3.1.10) and performs the
 * webhook deliveries those configs describe (§4.3.3), because their trigger is
 * the same event stream the local subscribers read.
 */
import {
  type Artifact,
  type Message,
  type StreamResponse,
  type Task,
  type TaskPushNotificationConfig,
  type TaskState,
  type TaskStatus,
  INTERRUPTED_STATES,
  TERMINAL_STATES,
} from "./types.ts";
import { isoNow } from "./codec.ts";
import { A2aError, taskNotCancelable, taskNotFound } from "./errors.ts";

/** A subscriber to one task's events. */
export interface TaskSubscriber {
  /** deliver one frame; must not throw (the store isolates it) */
  send: (frame: StreamResponse) => void;
  /** the stream went away — stop delivering to it */
  close: () => void;
}

export interface StoredTask {
  task: Task;
  /** the fox session this task drives; created on the first turn */
  sessionId?: string;
  /** every message ever exchanged for this task, newest last (for `history`) */
  history: Message[];
  subscribers: Set<TaskSubscriber>;
  /** push-notification configs registered for this task, by config id */
  pushConfigs: Map<string, TaskPushNotificationConfig>;
  /** monotonic counter for ordering `ListTasks` pages deterministically */
  seq: number;
  /** set when cancellation was requested, so a cooperating turn can stop */
  canceled: boolean;
  /** called on CancelTask; the runner decides how to stop */
  onCancel?: () => void;
  /** webhook delivery in flight, awaited on shutdown */
  outgoing: Set<Promise<void>>;
}

/** How many tasks a single process keeps. A2A tasks are conversation-sized. */
const MAX_TASKS = 500;
/** History kept per task; `historyLength` trims a response, this bounds memory. */
const MAX_HISTORY = 200;
/** Webhook attempt budget (§4.3.3 allows retries; this is the local ceiling). */
const WEBHOOK_ATTEMPTS = 3;
const WEBHOOK_TIMEOUT_MS = 10_000;

export class TaskStore {
  private readonly tasks = new Map<string, StoredTask>();
  /** contextId -> task ids, in creation order */
  private readonly byContext = new Map<string, string[]>();
  private counter = 0;

  constructor(private readonly newId: (prefix: string) => string = (p) => `${p}-${crypto.randomUUID()}`) {}

  /** Create a task in `TASK_STATE_SUBMITTED`, with its context. */
  create(contextId: string | undefined): StoredTask {
    this.evictIfNeeded();
    const id = this.newId("task");
    const task: Task = {
      id,
      contextId: contextId ?? this.newId("context"),
      status: { state: "TASK_STATE_SUBMITTED", timestamp: isoNow() },
      artifacts: [],
      history: [],
    };
    const stored: StoredTask = {
      task,
      history: [],
      subscribers: new Set(),
      pushConfigs: new Map(),
      seq: ++this.counter,
      canceled: false,
      outgoing: new Set(),
    };
    this.tasks.set(id, stored);
    const list = this.byContext.get(task.contextId!) ?? [];
    list.push(id);
    this.byContext.set(task.contextId!, list);
    return stored;
  }

  get(id: string): StoredTask | undefined {
    return this.tasks.get(id);
  }

  /** `TaskNotFoundError` rather than undefined, for the call sites that need one. */
  require(id: string): StoredTask {
    const t = this.tasks.get(id);
    if (!t) throw taskNotFound(id);
    return t;
  }

  /**
   * A task's current state, with history/artifacts trimmed per the request
   * (§3.2.4: 0 omits history, unset means the server's default, >0 caps it).
   */
  view(stored: StoredTask, historyLength?: number, includeArtifacts = true): Task {
    const task: Task = { ...stored.task, status: { ...stored.task.status } };
    if (historyLength === 0) task.history = undefined;
    else if (historyLength === undefined || historyLength >= stored.history.length) task.history = [...stored.history];
    else task.history = stored.history.slice(-historyLength);
    if (!includeArtifacts) task.artifacts = undefined;
    else task.artifacts = [...(stored.task.artifacts ?? [])];
    return task;
  }

  /**
   * `ListTasks` (§3.1.4): filter, sort newest-first, cursor-paginate.
   *
   * The cursor is the sort key of the last row returned, so a page never shifts
   * when a task is added between calls — offset pagination would. `totalSize` is
   * the size of the *filtered* set, which is what §6.5's example shows.
   */
  list(opts: {
    contextId?: string;
    status?: TaskState;
    pageSize?: number;
    pageToken?: string;
    historyLength?: number;
    includeArtifacts?: boolean;
  }): { tasks: Task[]; totalSize: number; pageSize: number; nextPageToken: string } {
    const pageSize = clampPageSize(opts.pageSize);
    let rows = [...this.tasks.values()];
    if (opts.contextId) rows = rows.filter((r) => r.task.contextId === opts.contextId);
    if (opts.status) rows = rows.filter((r) => r.task.status.state === opts.status);
    // most recently updated first (§3.1.4 ordering requirement)
    rows.sort((a, b) => b.seq - a.seq);
    const totalSize = rows.length;
    const after = opts.pageToken ? Number(Buffer.from(opts.pageToken, "base64url").toString("utf8")) : Number.POSITIVE_INFINITY;
    const page = rows.filter((r) => r.seq < after).slice(0, pageSize);
    const nextPageToken = page.length === pageSize && rows.some((r) => r.seq < page[page.length - 1].seq)
      ? Buffer.from(String(page[page.length - 1].seq), "utf8").toString("base64url")
      : "";
    return {
      tasks: page.map((r) => this.view(r, opts.historyLength, opts.includeArtifacts ?? false)),
      totalSize,
      pageSize,
      nextPageToken,
    };
  }

  // -------------------------------------------------------------------------
  // events
  // -------------------------------------------------------------------------

  /**
   * Move the task to a new state and tell everyone watching (§3.5.2).
   *
   * A terminal status also closes every local subscriber: §3.1.2 says a task
   * stream MUST close when the task reaches a terminal state, so leaving the
   * sockets open would hang clients that trust the spec.
   */
  updateStatus(stored: StoredTask, state: TaskState, message?: Message): void {
    stored.task.status = { state, timestamp: isoNow(), ...(message ? { message } : {}) };
    // §3.1.4 sorts ListTasks by "last update time, descending", so a status
    // change has to move the task in the order — `seq` is only set at creation,
    // so without this a task touched just now still sorted by its birth order.
    stored.seq = ++this.counter;
    if (message) this.appendHistory(stored, message);
    const event = {
      statusUpdate: {
        taskId: stored.task.id,
        contextId: stored.task.contextId,
        status: stored.task.status,
      },
    };
    this.broadcast(stored, event);
    void this.deliverPush(stored, event);
    if (TERMINAL_STATES.has(state) || INTERRUPTED_STATES.has(state)) this.closeSubscribers(stored);
  }

  /** Append an artifact chunk and broadcast it (§3.1.2). */
  updateArtifact(stored: StoredTask, artifact: Artifact, append: boolean, lastChunk?: boolean): void {
    const existing = stored.task.artifacts?.find((a) => a.artifactId === artifact.artifactId);
    if (existing && append) {
      existing.parts = [...existing.parts, ...artifact.parts];
    } else {
      const list = stored.task.artifacts ?? (stored.task.artifacts = []);
      const at = list.findIndex((a) => a.artifactId === artifact.artifactId);
      if (at >= 0) list[at] = { ...list[at], ...artifact, parts: append ? [...list[at].parts, ...artifact.parts] : artifact.parts };
      else list.push(artifact);
    }
    const event = {
      artifactUpdate: {
        taskId: stored.task.id,
        contextId: stored.task.contextId,
        artifact,
        append,
        ...(lastChunk === undefined ? {} : { lastChunk }),
      },
    };
    this.broadcast(stored, event);
    void this.deliverPush(stored, event);
  }

  /** Record a message in the task's history (bounded). */
  appendHistory(stored: StoredTask, message: Message): void {
    stored.history.push(message);
    if (stored.history.length > MAX_HISTORY) stored.history.splice(0, stored.history.length - MAX_HISTORY);
  }

  subscribe(stored: StoredTask, sub: TaskSubscriber): () => void {
    stored.subscribers.add(sub);
    return () => {
      stored.subscribers.delete(sub);
      sub.close();
    };
  }

  /**
   * Resolve when the task reaches a terminal state.
   *
   * <p>A pure subscription has no turn of its own to await: `SubscribeToTask`
   * attaches to a task somebody else is driving (§3.1.6). Its stream must stay
   * open until the task terminates and no longer, so it waits on this instead of
   * on a promise it does not own.
   */
  terminated(stored: StoredTask): Promise<void> {
    if (TERMINAL_STATES.has(stored.task.status.state)) return Promise.resolve();
    return new Promise<void>((resolve) => {
      const waiter: TaskSubscriber = {
        send: () => {
          if (!TERMINAL_STATES.has(stored.task.status.state)) return;
          stored.subscribers.delete(waiter);
          resolve();
        },
        close: () => {
          stored.subscribers.delete(waiter);
          resolve();
        },
      };
      stored.subscribers.add(waiter);
    });
  }

  /**
   * Deliver to every local subscriber, isolating failures.
   *
   * One dead subscriber must not stop the others from seeing an event (§3.5.2:
   * "closing one stream MUST NOT affect other active streams"), so a throwing
   * `send` is treated as that subscriber leaving.
   */
  private broadcast(stored: StoredTask, event: StreamResponse): void {
    for (const sub of [...stored.subscribers]) {
      try {
        sub.send(event);
      } catch {
        stored.subscribers.delete(sub);
      }
    }
  }

  private closeSubscribers(stored: StoredTask): void {
    for (const sub of [...stored.subscribers]) {
      stored.subscribers.delete(sub);
      try {
        sub.close();
      } catch {}
    }
  }

  // -------------------------------------------------------------------------
  // cancel (§3.1.5)
  // -------------------------------------------------------------------------

  /**
   * Request cancellation. Success is not guaranteed — the spec says so plainly
   * — but the task always ends up in a state that says what happened: terminal
   * already means `TaskNotCancelableError`, and otherwise it becomes canceled.
   */
  cancel(id: string): Task {
    const stored = this.require(id);
    if (TERMINAL_STATES.has(stored.task.status.state)) {
      throw taskNotCancelable(id, stored.task.status.state);
    }
    stored.canceled = true;
    try {
      stored.onCancel?.();
    } catch {}
    this.updateStatus(stored, "TASK_STATE_CANCELED");
    return stored.task;
  }

  // -------------------------------------------------------------------------
  // push notification configs (§3.1.7–3.1.10)
  // -------------------------------------------------------------------------

  createPushConfig(taskId: string, config: TaskPushNotificationConfig): TaskPushNotificationConfig {
    const stored = this.require(taskId);
    const id = config.id || this.newId("cfg");
    const saved: TaskPushNotificationConfig = { ...config, id, taskId };
    stored.pushConfigs.set(id, saved);
    return saved;
  }

  getPushConfig(taskId: string, configId: string): TaskPushNotificationConfig {
    const stored = this.require(taskId);
    const cfg = stored.pushConfigs.get(configId);
    if (!cfg) throw new A2aError("TaskNotFound", `no push notification config ${configId} for task ${taskId}`);
    return cfg;
  }

  listPushConfigs(taskId: string): TaskPushNotificationConfig[] {
    return [...this.require(taskId).pushConfigs.values()];
  }

  deletePushConfig(taskId: string, configId: string): void {
    const stored = this.require(taskId);
    if (!stored.pushConfigs.delete(configId)) {
      throw new A2aError("TaskNotFound", `no push notification config ${configId} for task ${taskId}`);
    }
  }

  /**
   * POST one event to every webhook registered for the task (§4.3.3).
   *
   * Fire-and-forget from the caller's point of view — a slow webhook must not
   * slow the agent's own turn — but tracked in `outgoing` so shutdown can wait
   * and so the promise never floats unobserved.
   */
  private deliverPush(stored: StoredTask, event: StreamResponse): Promise<void> {
    if (!stored.pushConfigs.size) return Promise.resolve();
    const delivery = (async () => {
      for (const cfg of stored.pushConfigs.values()) {
        await this.postWebhook(cfg, event);
      }
    })().catch(() => {});
    stored.outgoing.add(delivery);
    void delivery.finally(() => stored.outgoing.delete(delivery));
    return delivery;
  }

  private async postWebhook(cfg: TaskPushNotificationConfig, event: StreamResponse): Promise<void> {
    const headers: Record<string, string> = { "content-type": "application/a2a+json" };
    if (cfg.authentication?.scheme) {
      headers.authorization = `${cfg.authentication.scheme} ${cfg.authentication.credentials ?? ""}`.trim();
    }
    if (cfg.token) headers["x-a2a-notification-token"] = cfg.token;
    for (let attempt = 1; attempt <= WEBHOOK_ATTEMPTS; attempt++) {
      try {
        const res = await fetch(cfg.url, {
          method: "POST",
          headers,
          body: JSON.stringify(event),
          signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
        });
        // 2xx acknowledges (§4.3.3); anything else is worth one more try.
        if (res.ok) return;
      } catch {
        // connection refused / timeout: retry with backoff
      }
      if (attempt < WEBHOOK_ATTEMPTS) await Bun.sleep(250 * 2 ** (attempt - 1));
    }
  }

  /** Wait for in-flight webhook deliveries — called on shutdown. */
  async drain(ms = 5_000): Promise<void> {
    const pending = [...this.tasks.values()].flatMap((t) => [...t.outgoing]);
    if (!pending.length) return;
    await Promise.race([Promise.allSettled(pending), Bun.sleep(ms)]);
  }

  /** Close every stream and forget every task (server shutdown). */
  closeAll(): void {
    for (const t of this.tasks.values()) this.closeSubscribers(t);
    this.tasks.clear();
    this.byContext.clear();
  }

  private evictIfNeeded(): void {
    if (this.tasks.size < MAX_TASKS) return;
    // Drop the oldest settled task; a live one is never evicted, so a busy
    // server can exceed the cap rather than lose a running turn.
    const settled = [...this.tasks.values()].filter((t) => TERMINAL_STATES.has(t.task.status.state));
    settled.sort((a, b) => a.seq - b.seq);
    for (const t of settled.slice(0, Math.max(1, settled.length - MAX_TASKS + 1))) {
      this.tasks.delete(t.task.id);
      const ids = this.byContext.get(t.task.contextId ?? "");
      if (ids) this.byContext.set(t.task.contextId!, ids.filter((id) => id !== t.task.id));
    }
  }
}

/** §6.5's validation example: pageSize must be 1..100. */
function clampPageSize(n: number | undefined): number {
  if (n === undefined) return 50;
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(100, Math.floor(n));
}
