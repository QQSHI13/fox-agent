/**
 * A2A (Agent2Agent) client — delegation over HTTP + JSON-RPC 2.0.
 *
 * ACP (src/acp/) is for agents fox-agent *spawns* as child processes; A2A is for
 * agents that already live somewhere on the network behind a URL. Config picks
 * the protocol by shape: an `[agents.x]` entry with `command` is spawned (ACP),
 * one with `url` is reached here.
 *
 * Wire format, per the Linux Foundation spec: JSON-RPC POSTs to the agent's
 * base URL — `message/send` with a text part, then `tasks/get` polling while
 * the task is non-final. `configuration.blocking` is requested but not trusted:
 * servers may ignore it, so the poll loop is the real wait, not an error path.
 * The agent card (`/.well-known/agent-card.json`, legacy `/agent.json`) is read
 * for the agent's name only — a missing card is not a failure.
 */
import { VERSION } from "../core/version.ts";

export interface A2aOptions {
  signal?: AbortSignal;
  headers?: Record<string, string>;
  /** overall cap on a delegation, default 30 min */
  timeoutMs?: number;
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
 * Delegate one prompt to an A2A agent and wait for its final report.
 *
 * `input-required` is terminal *for us*: delegation is headless, there is nobody
 * to answer the agent's question, so it is reported as a failure carrying the
 * agent's own message rather than leaving the task parked forever.
 */
export async function runA2aAgent(base: string, prompt: string, opts: A2aOptions = {}): Promise<string> {
  base = base.replace(/\/$/, "");
  const deadline = Date.now() + (opts.timeoutMs ?? 30 * 60_000);

  const sent = await rpc(
    base,
    "message/send",
    {
      message: {
        messageId: `fox-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        role: "user",
        parts: [{ kind: "text", text: prompt }],
      },
      configuration: { blocking: true },
    },
    opts,
  );

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
