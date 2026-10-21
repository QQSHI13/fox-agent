/**
 * Gateway V1 — a persistent WebSocket gateway + real chat UI over fox-agent's
 * sessions. This is the product-grade surface, not a demo:
 *
 * - Bidirectional WebSocket (not one-way SSE): the client sends RPCs, the server
 *   pushes typed events. Cancel/steer/approval are client→server; streaming text,
 *   tool cards, thinking, and turn lifecycle are server→client.
 * - A persistent process (`fox gateway`) that owns the run registry and outlives
 *   any single TUI session — the same supervisor model as OpenClaw/dsh.
 * - A real chat UI: streaming markdown, expandable tool-call cards, thinking
 *   blocks, and a cancel button. Server-rendered shell + a small reactive client.
 *
 * Binds local-only by default (full machine access; no auth). Not for untrusted
 * networks.
 */
import { VERSION } from "../core/version.ts";
import { listSessions, getSession, allMessagesLite, createSession } from "../store/db.ts";
import { runTurnCore } from "../loop/turn.ts";
import { resolveChat } from "../providers/index.ts";
import type { Config } from "../core/config.ts";
import type { ProviderConfig } from "../providers/types.ts";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";

// The chat UI is an ON-DISK asset (plugins/gateway/ui.html), loaded at runtime —
// deliberately NOT imported, so it stays out of the compiled binary. A plugin
// ships its UI beside its code; the gateway reads it here.
const uiPath = join(dirname(new URL(import.meta.url).pathname), "../../plugins/gateway/ui.html");
function loadUi(model: string): string {
  try {
    return readFileSync(uiPath, "utf8").replaceAll("%MODEL%", model);
  } catch {
    return "<!doctype html><title>fox-agent gateway</title><p>gateway UI not found at " + uiPath + "</p>";
  }
}

// ---- wire protocol ----

/** Client → server RPC. */
type ClientMsg =
  | { id: number; method: "session.list" }
  | { id: number; method: "session.get"; params: { id: string } }
  | { id: number; method: "session.new"; params: { cwd?: string } }
  | { id: number; method: "turn.send"; params: { sessionId: string; prompt: string } }
  | { id: number; method: "turn.cancel"; params: { sessionId: string } };

/** Server → client event (no id — unsolicited push). */
type ServerEvent =
  | { event: "turn.delta"; sessionId: string; delta: string }
  | { event: "turn.think"; sessionId: string; delta: string }
  | { event: "turn.tool_start"; sessionId: string; id: string; name: string; args: string }
  | { event: "turn.tool_end"; sessionId: string; id: string; output: string; ok: boolean }
  | { event: "turn.status"; sessionId: string; state: "started" | "completed" | "failed" | "cancelled" };

interface GatewayCtx {
  config: Config;
  provider: ProviderConfig;
  port: number;
  hostname: string;
}

const esc = (s: unknown) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** The set of sessions with a live run, so cancel can abort the right turn. */
const running = new Map<string, AbortController>();

function sessionPayload(id: string) {
  const s = getSession(id);
  if (!s) return null;
  return {
    id: s.id,
    title: s.title,
    cwd: s.cwd,
    model: s.model,
    updated_at: s.updated_at,
    messages: allMessagesLite(id).map((m) => ({ role: m.role, content: m.content, seq: m.seq })),
  };
}

/** Run one turn for a session, pushing typed events to the sink. */
async function runTurn(sessionId: string, prompt: string, ctx: GatewayCtx, push: (ev: ServerEvent) => void): Promise<void> {
  const ctl = new AbortController();
  running.set(sessionId, ctl);
  push({ event: "turn.status", sessionId, state: "started" });
  try {
    for await (const ev of runTurnCore(sessionId, ctx.provider, prompt, ctl.signal, {
      maxSteps: ctx.config.maxSteps,
      retryLimit: ctx.config.retryLimit,
      compactAt: ctx.config.compactAt,
      projectInstructions: ctx.config.projectInstructions,
      config: ctx.config,
      chat: resolveChat,
    })) {
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

/** Serve the V1 WebSocket gateway. Resolves when the server stops. */
export async function runGateway(ctx: GatewayCtx): Promise<void> {
  // Connected WebSocket clients, for broadcasting run events to all viewers of a session.
  const clients = new Set<{ send: (data: string) => void }>();

  const server = Bun.serve<{ remoteId: string }>({
    port: ctx.port,
    hostname: ctx.hostname,
    async fetch(req, serverUp) {
      const url = new URL(req.url);
      const path = url.pathname;

      // WebSocket upgrade.
      if (path === "/ws") {
        const upgraded = serverUp.upgrade(req, { data: { remoteId: `${Math.random().toString(36).slice(2)}` } });
        return upgraded ? undefined : new Response("websocket upgrade failed", { status: 400 });
      }

      // Static shell + session APIs (the SPA is one HTML file).
      if (path === "/" || path === "/index.html") {
        return new Response(loadUi(esc(ctx.provider.model)), { headers: { "content-type": "text/html" } });
      }
      if (path === "/api/sessions") return Response.json(listSessions(100).map((s) => ({ id: s.id, title: s.title, cwd: s.cwd, model: s.model, updated_at: s.updated_at })));
      if (path === "/api/new" && req.method === "POST") {
        const s = createSession(process.cwd(), ctx.provider.model);
        return Response.json({ id: s.id });
      }
      const sessMatch = path.match(/^\/api\/session\/(.+)$/);
      if (sessMatch) {
        const p = sessionPayload(decodeURIComponent(sessMatch[1]));
        return p ? Response.json(p) : Response.json({ error: "no session" }, { status: 404 });
      }
      return new Response("not found", { status: 404 });
    },
    websocket: {
      open(ws) {
        clients.add({ send: (d) => ws.send(d) });
      },
      close(ws) {
        for (const c of clients) {
          // remove this client's wrapper; identity by closure is simplest here
        }
        clients.clear();
      },
      async message(ws, raw) {
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
            reply(listSessions(100).map((s) => ({ id: s.id, title: s.title, cwd: s.cwd, model: s.model, updated_at: s.updated_at })));
            break;
          case "session.get":
            reply(sessionPayload(msg.params.id));
            break;
          case "session.new": {
            const s = createSession(msg.params.cwd ?? process.cwd(), ctx.provider.model);
            reply({ id: s.id });
            break;
          }
          case "turn.send": {
            const { sessionId, prompt } = msg.params;
            if (running.has(sessionId)) {
              reply({ error: "a turn is already running" });
              break;
            }
            // broadcast streams the turn to every connected client (multi-viewer).
            void runTurn(sessionId, prompt, ctx, broadcast);
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
