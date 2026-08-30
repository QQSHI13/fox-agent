/**
 * A2A (Agent2Agent) client — delegation over HTTP + JSON-RPC 2.0.
 *
 * ACP (src/acp/) is for agents fox-agent *spawns* as child processes; A2A is for
 * agents that already live somewhere on the network behind a URL. Config picks
 * the protocol by shape: an `[agents.x]` entry with `command` is spawned (ACP),
 * one with `url` is reached here.
 *
 * Wire format, per the Linux Foundation spec: `message/stream` (SSE) first for
 * live progress, falling back to `message/send` + `tasks/get` polling when the
 * server does not implement streaming. `configuration.blocking` is requested
 * but not trusted: servers may ignore it, so the poll loop is the real wait,
 * not an error path. The agent card (`/.well-known/agent-card.json`, legacy
 * `/agent.json`) is read for the agent's name only — a missing card is not a
 * failure.
 */
import { VERSION } from "../core/version.ts";

export interface A2aOptions {
  signal?: AbortSignal;
  headers?: Record<string, string>;
  /** overall cap on a delegation, default 30 min */
  timeoutMs?: number;
  /**
   * Progress from a streaming (`message/stream`) agent: state transitions and
   * artifact text as it accumulates. Never called on the polling fallback.
   */
  onEvent?: (ev: { state?: string; text?: string }) => void;
}

const FINAL = new Set(["completed", "canceled", "failed", "rejected", "input-required"]);

interface JsonRpc {
  jsonrpc: "2.0";
  id: number | string;
  result?: any;
  error?: { code: number; message: string };
}

let rpcId = 0;

async function rpc(base: string, method: string, params: unknown, opts: A2aOptions): Promise<any> {
  const res = await fetch(base, {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": `fox-agent/${VERSION}`, ...opts.headers },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method, params }),
    signal: opts.signal,
  });
  if (!res.ok) throw new Error(`A2A HTTP ${res.status} from ${base}`);
  const body = (await res.json()) as JsonRpc;
  if (body.error) throw new Error(`A2A ${method} failed: ${body.error.message} (code ${body.error.code})`);
  return body.result;
}

/** Text out of a part list (text parts only; file/data parts are not extracted). */
function partsText(parts: any[] | undefined): string {
  return (parts ?? [])
    .filter((p) => p?.kind === "text" && typeof p.text === "string")
    .map((p) => p.text)
    .join("\n");
}

/** Result text of a task: artifacts first (the work product), status message second. */
function taskText(task: any): string {
  const artifacts = (task.artifacts ?? []).map((a: any) => partsText(a.parts)).filter(Boolean);
  if (artifacts.length) return artifacts.join("\n");
  return partsText(task.status?.message?.parts);
}

/** The agent's display name, or null when it publishes no card (not an error). */
export async function agentCardName(base: string, opts: A2aOptions = {}): Promise<string | null> {
  for (const wellKnown of ["/.well-known/agent-card.json", "/.well-known/agent.json"]) {
    try {
      const res = await fetch(`${base}${wellKnown}`, { headers: opts.headers, signal: opts.signal });
      if (res.ok) {
        const card = await res.json();
        return typeof card.name === "string" ? card.name : null;
      }
    } catch {
      // try the next well-known path
    }
  }
  return null;
}

/**
 * One `message/stream` call. Returns null when the server does not implement
 * streaming (JSON-RPC -32601) so the caller falls back to send + poll; a
 * non-SSE 200 with a plain result is legal too and comes back as a task for
 * the poll loop or as final text.
 */
async function tryStream(base: string, message: unknown, deadline: number, opts: A2aOptions): Promise<string | { task: any } | null> {
  const res = await fetch(base, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "text/event-stream", "user-agent": `fox-agent/${VERSION}`, ...opts.headers },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method: "message/stream", params: { message } }),
    signal: opts.signal,
  });
  if (!res.ok) throw new Error(`A2A HTTP ${res.status} from ${base}`);

  const ctype = res.headers.get("content-type") ?? "";
  if (!ctype.includes("text/event-stream")) {
    const body = (await res.json()) as JsonRpc;
    if (body.error) {
      if (body.error.code === -32601) return null; // method unknown → poll path
      throw new Error(`A2A message/stream failed: ${body.error.message} (code ${body.error.code})`);
    }
    return directOutcome(body.result);
  }

  // SSE: events are blank-line separated, each a JSON-RPC response whose result
  // is a Task, Message, TaskStatusUpdateEvent or TaskArtifactUpdateEvent.
  const artifacts = new Map<string, string>();
  let statusText = "";
  let finalTask: any = null;
  let buf = "";
  const reader = (res.body as ReadableStream<Uint8Array>).getReader();
  const dec = new TextDecoder();
  try {
    for (;;) {
      if (Date.now() > deadline) throw new Error("A2A stream did not finish within the timeout");
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let cut: number;
      while ((cut = buf.indexOf("\n\n")) >= 0 || (cut = buf.indexOf("\r\n\r\n")) >= 0) {
        const raw = buf.slice(0, cut);
        buf = buf.slice(cut + (buf[cut] === "\r" ? 4 : 2));
        const data = raw
          .split(/\r?\n/)
          .filter((l) => l.startsWith("data:"))
          .map((l) => l.slice(5).trimStart())
          .join("\n");
        if (!data) continue;
        const msg = JSON.parse(data) as JsonRpc;
        if (msg.error) throw new Error(`A2A stream failed: ${msg.error.message} (code ${msg.error.code})`);
        const r = msg.result;
        if (!r) continue;
        if (r.kind === "status-update" || r.kind === "task") {
          const state = r.status?.state;
          if (state) {
            opts.onEvent?.({ state });
            const t = partsText(r.status?.message?.parts);
            if (t) statusText = t;
          }
          if (r.kind === "task" && r.artifacts) {
            for (const a of r.artifacts) {
              const t = partsText(a.parts);
              if (t) artifacts.set(a.artifactId ?? "", t);
            }
          }
          if (r.final === true || (state && FINAL.has(state))) finalTask = r;
        } else if (r.kind === "artifact-update") {
          const t = partsText(r.artifact?.parts);
          if (t) {
            const id = r.artifact?.artifactId ?? "";
            artifacts.set(id, r.append ? (artifacts.get(id) ?? "") + t : t);
            opts.onEvent?.({ text: t });
          }
        } else if (r.kind === "message" || (r.role && r.parts)) {
          const t = partsText(r.parts);
          if (t) statusText = t;
          finalTask = finalTask ?? { status: { state: "completed" } };
        }
      }
      if (finalTask) break;
    }
  } finally {
    reader.cancel().catch(() => {});
  }

  const text = [...artifacts.values()].filter(Boolean).join("\n") || statusText;
  const state = finalTask?.status?.state;
  if (state && state !== "completed") throw new Error(`A2A task ${state}${text ? `: ${text}` : ""}`);
  if (!finalTask) throw new Error("A2A stream ended without a final event");
  return text || "(agent completed with no report)";
}

/** A non-streamed result: final text, or a task for the poll loop. */
function directOutcome(result: any): string | { task: any } | null {
  if (result?.kind === "message" || (result?.role && result?.parts && !result?.status)) {
    const text = partsText(result.parts);
    if (text) return text;
  }
  if (result?.id) return { task: result };
  return null;
}

/**
 * Delegate one prompt to an A2A agent and wait for its final report.
 *
 * Streaming first: `message/stream` (SSE) carries status transitions and
 * artifact updates as they happen, which is how a remote agent gets the same
 * live-progress visibility an ACP child has. A server that does not implement
 * it says so with JSON-RPC -32601 (or answers with plain JSON), and we fall
 * back to `message/send` + `tasks/get` polling — the poll loop is the real
 * wait there, `configuration.blocking` being advisory.
 *
 * `input-required` is terminal *for us*: delegation is headless, there is nobody
 * to answer the agent's question, so it is reported as a failure carrying the
 * agent's own message rather than leaving the task parked forever.
 */
export async function runA2aAgent(base: string, prompt: string, opts: A2aOptions = {}): Promise<string> {
  base = base.replace(/\/$/, "");
  const deadline = Date.now() + (opts.timeoutMs ?? 30 * 60_000);

  const message = {
    messageId: `fox-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    role: "user",
    parts: [{ kind: "text", text: prompt }],
  };

  const streamed = await tryStream(base, message, deadline, opts).catch((e) => {
    if (opts.signal?.aborted) throw new Error("aborted");
    throw e;
  });
  if (typeof streamed === "string") return streamed;

  const sent = streamed?.task ?? (await rpc(base, "message/send", { message, configuration: { blocking: true } }, opts));

  // A direct Message reply (no task lifecycle) is legal — take its text and go.
  if (sent?.kind === "message" || (sent?.role && sent?.parts && !sent?.status)) {
    const text = partsText(sent.parts);
    if (text) return text;
  }

  let task = sent;
  while (task?.id && !FINAL.has(task.status?.state)) {
    if (Date.now() > deadline) throw new Error(`A2A task ${task.id} did not finish within the timeout`);
    if (opts.signal?.aborted) throw new Error("aborted");
    await Bun.sleep(1_000);
    task = await rpc(base, "tasks/get", { id: task.id }, opts);
  }
  if (!task?.id) throw new Error(`A2A reply was neither a task nor a message: ${JSON.stringify(sent).slice(0, 200)}`);

  const state = task.status?.state;
  const text = taskText(task);
  if (state === "completed") return text || "(agent completed with no report)";
  throw new Error(`A2A task ${state}${text ? `: ${text}` : ""}`);
}
