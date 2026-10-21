/**
 * Gateway plugin — `fox gateway [--port N]` serves a minimal webUI over fox-agent's
 * sessions, so you can list, read, and chat with any session from a browser.
 *
 * This is the OpenClaw/harness-gateway play: instead of a chat-platform gateway
 * (Discord/Telegram), the first surface is a local web UI. Turns run in-process
 * through the same `runTurnCore` engine the TUI uses, so behavior (compaction,
 * budget, hooks, converge) is identical. Sessions are read straight from the
 * store (`listSessions` / `allMessagesLite`); a chat posts a prompt and streams
 * the assistant reply back over SSE.
 *
 * Binds local-only by default (full machine access; no auth). Not for
 * untrusted networks.
 */
import type { FoxPlugin } from "./types.ts";
import type { Config } from "../core/config.ts";
import type { ProviderConfig } from "../providers/types.ts";
import { listSessions, getSession, allMessagesLite, createSession } from "../store/db.ts";
import { runTurnCore } from "../loop/turn.ts";
import { resolveChat } from "../providers/index.ts";

interface GatewayCtx {
  config: Config;
  provider: ProviderConfig;
}

const esc = (s: unknown) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function page(body: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>fox-agent gateway</title>
<style>
body{font-family:system-ui,sans-serif;max-width:860px;margin:2rem auto;padding:0 1rem;color:#222}
h1{font-size:1.3rem} a{color:#06c;text-decoration:none}
.sess{border:1px solid #ddd;border-radius:6px;padding:.6rem .8rem;margin:.5rem 0;cursor:pointer}
.sess:hover{background:#f5f5f5} .meta{color:#888;font-size:.8rem}
.msg{margin:.4rem 0;padding:.4rem .6rem;border-radius:6px;white-space:pre-wrap}
.user{background:#eef} .assistant{background:#f6f6f6} .tool{background:#ffe;font-size:.8rem;color:#555}
#chat{position:sticky;bottom:0;background:#fff;padding:.6rem 0;border-top:1px solid #ccc}
#in{width:100%;padding:.5rem;box-sizing:border-box}
#out{max-height:60vh;overflow-y:auto}
.bubble{background:#e6f7ff;border-radius:6px;padding:.4rem .6rem;margin:.3rem 0;white-space:pre-wrap}
</style></head><body>${body}</body></html>`;
}

function sessionListPage(port: number): string {
  const rows = listSessions(100);
  const items = rows
    .map(
      (s) => `<div class="sess" onclick="location.href='/s/${encodeURIComponent(s.id)}'">
  <b>${esc(s.title ?? s.id)}</b>
  <div class="meta">${esc(s.id)} · ${esc(s.cwd)} · ${new Date(s.updated_at).toLocaleString()}</div>
</div>`,
    )
    .join("\n");
  return page(`<h1>fox-agent gateway</h1><p>${rows.length} session(s) · <span class="meta">port ${port}</span></p>${items}`);
}

function sessionPage(id: string): string {
  const s = getSession(id);
  if (!s) return page(`<h1>no session ${esc(id)}</h1><p><a href="/">back</a></p>`);
  const msgs = allMessagesLite(id);
  const transcript = msgs
    .map((m) => `<div class="msg ${esc(m.role)}">[${m.seq}] <b>${esc(m.role)}</b>\n${esc(m.content)}</div>`)
    .join("\n");
  const body = `<h1>${esc(s.title ?? s.id)}</h1>
<p class="meta">${esc(s.id)} · ${esc(s.cwd)} · <a href="/">all sessions</a></p>
<div id="out">${transcript}</div>
<div id="chat">
  <input id="in" placeholder="Message this session… (Enter to send)" autofocus>
</div>
<script>
const id = ${JSON.stringify(id)};
const out = document.getElementById('out');
const input = document.getElementById('in');
input.addEventListener('keydown', async (e) => {
  if (e.key !== 'Enter' || !input.value.trim()) return;
  const text = input.value.trim();
  input.value = '';
  const bubble = document.createElement('div');
  bubble.className = 'bubble user';
  bubble.textContent = '❯ ' + text;
  out.appendChild(bubble);
  const reply = document.createElement('div');
  reply.className = 'bubble assistant';
  out.appendChild(reply);
  out.scrollTop = out.scrollHeight;
  const res = await fetch('/chat/' + encodeURIComponent(id), {
    method: 'POST', headers: {'content-type': 'application/json'},
    body: JSON.stringify({prompt: text})
  });
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const {done, value} = await reader.read();
    if (done) break;
    buf += dec.decode(value, {stream: true});
    let cut;
    while ((cut = buf.indexOf('\\n\\n')) >= 0) {
      const raw = buf.slice(0, cut); buf = buf.slice(cut + 2);
      const data = raw.replace(/^data: /, '');
      try { reply.textContent += JSON.parse(data).delta ?? ''; } catch {}
      out.scrollTop = out.scrollHeight;
    }
  }
});
</script>`;
  return page(body);
}

/** Serve the gateway webUI. Resolves when the server stops (SIGINT/SIGTERM). */
async function serveGateway(port: number, ctx: GatewayCtx): Promise<void> {
  const server: ReturnType<typeof Bun.serve> = Bun.serve({
    port,
    hostname: "127.0.0.1",
    async fetch(req) {
      const url = new URL(req.url);
      const path = url.pathname;
      if (path === "/" || path === "/index.html") return new Response(sessionListPage(server.port ?? 0), { headers: { "content-type": "text/html" } });
      const sessMatch = path.match(/^\/s\/(.+)$/);
      if (sessMatch) return new Response(sessionPage(decodeURIComponent(sessMatch[1])), { headers: { "content-type": "text/html" } });
      const chatMatch = path.match(/^\/chat\/(.+)$/);
      if (chatMatch && req.method === "POST") {
        const id = decodeURIComponent(chatMatch[1]);
        const body = (await req.json().catch(() => ({}))) as { prompt?: string };
        const prompt = String(body.prompt ?? "").trim();
        if (!prompt) return new Response("no prompt", { status: 400 });
        const stream = new ReadableStream({
          async start(controller) {
            const enc = new TextEncoder();
            const send = (delta: string) => controller.enqueue(enc.encode(`data: ${JSON.stringify({ delta })}\n\n`));
            try {
              // resume an existing session, or start a fresh one
              const sessionId = getSession(id) ? id : createSession(process.cwd(), ctx.provider.model).id;
              for await (const ev of runTurnCore(sessionId, ctx.provider, prompt, undefined, {
                maxSteps: ctx.config.maxSteps,
                retryLimit: ctx.config.retryLimit,
                compactAt: ctx.config.compactAt,
                projectInstructions: ctx.config.projectInstructions,
                config: ctx.config,
                chat: resolveChat,
              })) {
                if (ev.type === "text") send(ev.delta);
                else if (ev.type === "done") break;
              }
            } catch (e) {
              send(`\n[error: ${(e as Error).message ?? e}]`);
            }
            controller.close();
          },
        });
        return new Response(stream, { headers: { "content-type": "text/event-stream" } });
      }
      return new Response("not found", { status: 404 });
    },
  });
  console.error(`fox-agent gateway: http://127.0.0.1:${server.port}/ (Ctrl+C to stop)`);
  await new Promise<void>((resolve) => {
    const stop = () => {
      server.stop();
      resolve();
    };
    process.on("SIGINT", stop);
    process.on("SIGTERM", stop);
  });
}

export const gatewayPlugin: FoxPlugin = {
  name: "bundled:gateway",
  cliCommand: {
    name: "gateway",
    description: "serve a webUI over your sessions (list, read, chat) — fox gateway [--port N]",
    run: async (args, rawCtx) => {
      const ctx = rawCtx as GatewayCtx;
      const portIdx = args.indexOf("--port");
      const port = portIdx >= 0 ? Number(args[portIdx + 1]) || 0 : Number(args.find((a) => /^\d+$/.test(a)) ?? 0) || 0;
      await serveGateway(port, ctx);
    },
  },
};
