/**
 * Gateway V1 server — a persistent WebSocket gateway with a TUI-parity chat UI.
 *
 * This file lives in the PLUGIN directory on purpose: an on-disk plugin's
 * imports resolve relative to the plugin, and it must not reach into the
 * harness's `src/` (a compiled binary has no `src/` beside it). The engine comes
 * from the host API (`globalThis.foxHost`) instead, which the binary publishes
 * before any plugin runs.
 *
 * - Bidirectional WebSocket: the client sends RPCs, the server pushes typed
 *   events. Cancel is client→server; text, tool cards, thinking and turn
 *   lifecycle are server→client.
 * - The UI (ui.html) sits beside this file and is read at runtime, so neither
 *   the UI nor this server is part of the compiled binary.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";

/** The host API shape this server uses (a subset of fox-agent's). */
interface HostApi {
  version: string;
  provider: { model: string };
  sessions: {
    list(limit?: number): { id: string; title: string | null; cwd: string; model: string; updated_at: number }[];
    get(id: string): { id: string; title: string | null; cwd: string; model: string; updated_at: number } | null;
    messages(id: string): { role: string; content: string; seq: number }[];
    create(cwd?: string): { id: string };
  };
  turn(sessionId: string, prompt: string, signal?: AbortSignal): AsyncGenerator<any>;
}

function host(): HostApi {
  const h = (globalThis as { foxHost?: HostApi }).foxHost;
  if (!h) throw new Error("fox-agent host API not installed — plugins run under the CLI, which publishes it");
  return h;
}

// ---- wire protocol ----

type ClientMsg =
  | { id: number; method: "session.list" }
  | { id: number; method: "session.get"; params: { id: string } }
  | { id: number; method: "session.new"; params: { cwd?: string } }
  | { id: number; method: "turn.send"; params: { sessionId: string; prompt: string } }
  | { id: number; method: "turn.cancel"; params: { sessionId: string } };

type ServerEvent =
  | { event: "turn.delta"; sessionId: string; delta: string }
  | { event: "turn.think"; sessionId: string; delta: string }
  | { event: "turn.tool_start"; sessionId: string; id: string; name: string; args: string }
  | { event: "turn.tool_end"; sessionId: string; id: string; output: string; ok: boolean }
  | { event: "turn.status"; sessionId: string; state: "started" | "completed" | "failed" | "cancelled" };

const esc = (s: unknown) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// The UI is an ON-DISK asset beside this file — deliberately not imported, so
// it stays out of the compiled binary.
const uiPath = join(dirname(new URL(import.meta.url).pathname), "ui.html");
function loadUi(model: string): string {
  try {
    return readFileSync(uiPath, "utf8").replaceAll("%MODEL%", esc(model));
  } catch {
    return "<!doctype html><title>fox-agent gateway</title><p>gateway UI not found at " + uiPath + "</p>";
  }
}

const running = new Map<string, AbortController>();

/** Run one turn, pushing typed events as it goes. */
async function runTurn(
  sessionId: string,
  prompt: string,
  push: (ev: ServerEvent) => void,
): Promise<void> {
  const h = host();
  const ctl = new AbortController();
  running.set(sessionId, ctl);
  push({ event: "turn.status", sessionId, state: "started" });
  try {
    for await (const ev of h.turn(sessionId, prompt, ctl.signal)) {
      if (ev.type === "text") push({ event: "turn.delta", sessionId, delta: ev.delta });
      else if (ev.type === "reasoning") push({ event: "turn.think", sessionId, delta: ev.delta });
      else if (ev.type === "tool_start") push({ event: "turn.tool_start", sessionId, id: ev.id, name: ev.name, args: ev.args });
      else if (ev.type === "tool_end") push({ event: "turn.tool_end", sessionId, id: ev.id, output: ev.output, ok: ev.ok });
      else if (ev.type === "done") {
        push({ event: "turn.status", sessionId, state: ev.reason === "error" ? "failed" : "completed" });
        break;
      }
    }
  } catch (e) {
    if (ctl.signal.aborted) push({ event: "turn.status", sessionId, state: "cancelled" });
    else {
      push({ event: "turn.delta", sessionId, delta: `\n[error: ${(e as Error).message ?? e}]` });
      push({ event: "turn.status", sessionId, state: "failed" });
    }
  } finally {
    running.delete(sessionId);
  }
}

/** Serve the gateway. Resolves when the server stops (SIGINT/SIGTERM). */
export async function runGateway(opts: { port?: number; hostname?: string } = {}): Promise<void> {
  const h = host();
  const clients = new Set<{ send: (data: string) => void }>();

  const server = Bun.serve<{ remoteId: string }>({
    port: opts.port ?? 0,
    hostname: opts.hostname ?? "127.0.0.1",
    async fetch(req, serverUp) {
      const path = new URL(req.url).pathname;
      if (path === "/ws") {
        const ok = serverUp.upgrade(req, { data: { remoteId: `${Math.random().toString(36).slice(2)}` } });
        return ok ? undefined : new Response("websocket upgrade failed", { status: 400 });
      }
      if (path === "/" || path === "/index.html") {
        return new Response(loadUi(esc(h.provider.model)), { headers: { "content-type": "text/html" } });
      }
      if (path === "/api/sessions") return Response.json(h.sessions.list(100));
      if (path === "/api/new" && req.method === "POST") return Response.json(h.sessions.create());
      const m = path.match(/^\/api\/session\/(.+)$/);
      if (m) {
        const id = decodeURIComponent(m[1]);
        const s = h.sessions.get(id);
        return s ? Response.json({ ...s, messages: h.sessions.messages(id) }) : Response.json({ error: "no session" }, { status: 404 });
      }
      return new Response("not found", { status: 404 });
    },
    websocket: {
      open(ws) {
        clients.add({ send: (d) => ws.send(d) });
      },
      close() {
        clients.clear();
      },
      message(ws, raw) {
        let msg: ClientMsg;
        try {
          msg = JSON.parse(String(raw));
        } catch {
          ws.send(JSON.stringify({ error: "parse error" }));
          return;
        }
        const reply = (result: unknown) => ws.send(JSON.stringify({ id: msg.id, result }));
        const broadcast = (ev: ServerEvent) => {
          const data = JSON.stringify(ev);
          for (const c of [...clients]) c.send(data);
        };
        switch (msg.method) {
          case "session.list":
            reply(h.sessions.list(100));
            break;
          case "session.get": {
            const id = msg.params.id;
            const s = h.sessions.get(id);
            reply(s ? { ...s, messages: h.sessions.messages(id) } : null);
            break;
          }
          case "session.new":
            reply(h.sessions.create(msg.params.cwd));
            break;
          case "turn.send": {
            const { sessionId, prompt } = msg.params;
            if (running.has(sessionId)) {
              reply({ error: "a turn is already running" });
              break;
            }
            void runTurn(sessionId, prompt, broadcast);
            reply({ ok: true });
            break;
          }
          case "turn.cancel":
            running.get(msg.params.sessionId)?.abort();
            reply({ ok: true });
            break;
        }
      },
    },
  });

  console.error(`fox-agent gateway v1: http://${server.hostname}:${server.port}/ (Ctrl+C to stop)`);
  await new Promise<void>((resolve) => {
    const stop = () => {
      server.stop();
      resolve();
    };
    process.on("SIGINT", stop);
    process.on("SIGTERM", stop);
  });
}
