/**
 * Gateway plugin — `fox gateway [--port N]` serves a web chat UI over fox-agent's
 * sessions, so you can talk to any session from a browser.
 *
 * The first surface is a local web UI (not a chat-platform gateway like
 * Discord/Telegram — that can layer on later). Turns run in-process through the
 * same `runTurnCore` engine the TUI uses, streamed to the browser over SSE: the
 * reply renders token-by-token, and tool calls show as an activity line. Sessions
 * are read straight from the store; a chat posts a prompt and streams the turn.
 *
 * Binds local-only by default (full machine access; no auth). Not for untrusted
 * networks.
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

const PAGE = [
'<!doctype html><html lang="en"><head><meta charset="utf-8">',
'<meta name="viewport" content="width=device-width, initial-scale=1">',
'<title>fox-agent</title>',
'<style>',
'*{box-sizing:border-box;margin:0;padding:0}',
'body{font-family:ui-sans-serif,system-ui,-apple-system,sans-serif;height:100vh;display:flex;background:#0d1117;color:#e6edf3}',
'#side{width:260px;border-right:1px solid #21262d;display:flex;flex-direction:column;background:#010409}',
'#side header{padding:14px 16px;border-bottom:1px solid #21262d;display:flex;justify-content:space-between;align-items:center}',
'#side h1{font-size:15px;font-weight:600}',
'#side .new{background:#238636;color:#fff;border:none;border-radius:6px;padding:5px 10px;font-size:12px;cursor:pointer}',
'#sessions{flex:1;overflow-y:auto;padding:8px}',
'.sess{padding:9px 11px;border-radius:8px;cursor:pointer;margin-bottom:2px}',
'.sess:hover{background:#161b22}',
'.sess.active{background:#1f6feb22;border-left:2px solid #1f6feb}',
'.sess .t{font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
'.sess .m{font-size:11px;color:#8b949e;margin-top:2px}',
'#main{flex:1;display:flex;flex-direction:column;min-width:0}',
'#head{padding:13px 20px;border-bottom:1px solid #21262d;font-size:14px;color:#c9d1d9;display:flex;align-items:center;gap:8px}',
'#head .model{font-size:11px;color:#8b949e;background:#161b22;padding:2px 8px;border-radius:10px}',
'#log{flex:1;overflow-y:auto;padding:20px}',
'.msg{max-width:820px;margin:0 auto 14px;display:flex;gap:10px}',
'.avatar{width:28px;height:28px;border-radius:50%;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700}',
'.msg.user .avatar{background:#1f6feb}',
'.msg.agent .avatar{background:#238636}',
'.msg .body{flex:1;min-width:0}',
'.msg .who{font-size:11px;color:#8b949e;margin-bottom:4px}',
'.bubble{padding:10px 13px;border-radius:12px;font-size:14px;line-height:1.55;white-space:pre-wrap;word-wrap:break-word}',
'.msg.user .bubble{background:#1f6feb22}',
'.msg.agent .bubble{background:#161b22}',
'.tool{max-width:820px;margin:0 auto 10px;padding:6px 12px;font-size:12px;color:#8b949e;background:#161b2280;border-radius:8px;font-family:ui-monospace,monospace;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
'.tool b{color:#c9d1d9}',
'#composer{padding:16px 20px;border-top:1px solid #21262d}',
'#box{max-width:820px;margin:0 auto;display:flex;gap:10px}',
'#in{flex:1;background:#161b22;border:1px solid #30363d;border-radius:10px;padding:11px 14px;color:#e6edf3;font-size:14px;resize:none;font-family:inherit}',
'#in:focus{outline:none;border-color:#1f6feb}',
'#send{background:#1f6feb;color:#fff;border:none;border-radius:10px;padding:0 18px;font-size:14px;cursor:pointer}',
'#send:disabled{opacity:.5;cursor:default}',
'.typing{color:#8b949e;font-style:italic}',
'</style></head><body>',
'<aside id="side"><header><h1>fox-agent</h1><button class="new" onclick="newSession()">+ New</button></header><div id="sessions"></div></aside>',
'<section id="main"><header id="head"><span id="title">Select a session</span><span class="model" id="model"></span></header>',
'<div id="log"></div>',
'<footer id="composer"><div id="box"><textarea id="in" rows="1" placeholder="Message fox-agent… (Enter to send, Shift+Enter for newline)"></textarea><button id="send" onclick="send()">Send</button></div></footer></section>',
'<script>',
'const SID = () => document.querySelector(".sess.active")?.dataset.id;',
'const esc = s => String(s??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");',
'const MODEL = %MODEL%;',
'document.getElementById("model").textContent = MODEL;',
'async function loadSessions(activeId){',
'  const list = await (await fetch("/api/sessions")).json();',
'  const el = document.getElementById("sessions");',
'  el.innerHTML = list.map(s => `<div class="sess ${s.id===activeId?"active":""}" data-id="${s.id}" onclick="openSession(\"${s.id}\")"><div class="t">${esc(s.title||s.id)}</div><div class="m">${esc(s.cwd)} · ${new Date(s.updated_at).toLocaleString()}</div></div>`).join("");',
'}',
'async function newSession(){ const s = await (await fetch("/api/new",{method:"POST"})).json(); await loadSessions(s.id); openSession(s.id); }',
'async function openSession(id){',
'  await loadSessions(id);',
'  const s = await (await fetch("/api/session/"+encodeURIComponent(id))).json();',
'  document.getElementById("title").textContent = s.title || s.id;',
'  const log = document.getElementById("log");',
'  log.innerHTML = (s.messages||[]).map(m => `<div class="msg ${m.role==="user"?"user":"agent"}"><div class="avatar">${m.role==="user"?"Q":"F"}</div><div class="body"><div class="who">${m.role}</div><div class="bubble">${esc(m.content)}</div></div></div>`).join("");',
'  log.scrollTop = log.scrollHeight;',
'  document.getElementById("in").focus();',
'}',
'function bubble(role){ const log=document.getElementById("log"); const d=document.createElement("div"); d.className="msg "+role; d.innerHTML=`<div class="avatar">${role==="user"?"Q":"F"}</div><div class="body"><div class="who">${role}</div><div class="bubble"></div></div>`; log.appendChild(d); log.scrollTop=log.scrollHeight; return d.querySelector(".bubble"); }',
'function toolLine(name,args){ const log=document.getElementById("log"); const d=document.createElement("div"); d.className="tool"; d.innerHTML=`<b>⚙ ${esc(name)}</b> ${esc((args||"").slice(0,120))}`; log.appendChild(d); log.scrollTop=log.scrollHeight; }',
'const input=document.getElementById("in");',
'input.addEventListener("keydown",e=>{ if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send();} });',
'async function send(){',
'  const id=SID(); if(!id) return;',
'  const text=input.value.trim(); if(!text) return;',
'  input.value=""; document.getElementById("send").disabled=true;',
'  bubble("user").textContent=text;',
'  const reply=bubble("agent"); reply.innerHTML=\'<span class="typing">thinking…</span>\';',
'  try{',
'    const res=await fetch("/chat/"+encodeURIComponent(id),{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({prompt:text})});',
'    const rd=res.body.getReader(),dec=new TextDecoder(); let buf="",first=true;',
'    for(;;){ const r=await rd.read(); if(r.done)break; buf+=dec.decode(r.value,{stream:true}); let c;',
'      while((c=buf.indexOf("\n\n"))>=0){ const raw=buf.slice(0,c); buf=buf.slice(c+2); const d=raw.replace(/^data: /,"");',
'        try{ const ev=JSON.parse(d);',
'          if(ev.type==="text"){ if(first){reply.textContent="";first=false;} reply.textContent+=ev.delta; scroll(); }',
'          else if(ev.type==="tool"){ toolLine(ev.name,ev.args); }',
'          else if(ev.type==="done"){ reply.classList.remove("typing"); }',
'        }catch{} } }',
'    if(first) reply.textContent="(no reply)";',
'  }catch(e){ reply.textContent="Error: "+e.message; }',
'  document.getElementById("send").disabled=false; await loadSessions(id); input.focus();',
'  function scroll(){ const l=document.getElementById("log"); l.scrollTop=l.scrollHeight; }',
'}',
'loadSessions();',
'</script></body></html>',
].join("\n");

function sessionList(): { id: string; title: string | null; cwd: string; updated_at: number }[] {
  return listSessions(100).map((s) => ({ id: s.id, title: s.title, cwd: s.cwd, updated_at: s.updated_at }));
}

function transcript(id: string): { role: string; content: string }[] {
  if (!getSession(id)) return [];
  return allMessagesLite(id).map((m) => ({ role: m.role, content: m.content }));
}

/** Serve the gateway web chat. Resolves when the server stops (SIGINT/SIGTERM). */
async function serveGateway(port: number, ctx: GatewayCtx): Promise<void> {
  const server: ReturnType<typeof Bun.serve> = Bun.serve({
    port,
    hostname: "127.0.0.1",
    async fetch(req) {
      const url = new URL(req.url);
      const path = url.pathname;
      // Main app shell (single-page chat UI).
      if (path === "/" || path === "/index.html") {
        return new Response(PAGE.replace("%MODEL%", JSON.stringify(ctx.provider.model)), { headers: { "content-type": "text/html" } });
      }
      // Session APIs.
      if (path === "/api/sessions") return Response.json(sessionList());
      if (path === "/api/new" && req.method === "POST") {
        const s = createSession(process.cwd(), ctx.provider.model);
        return Response.json({ id: s.id });
      }
      const sessMatch = path.match(/^\/api\/session\/(.+)$/);
      if (sessMatch) {
        const id = decodeURIComponent(sessMatch[1]);
        const s = getSession(id);
        if (!s) return Response.json({ error: "no session" }, { status: 404 });
        return Response.json({ id: s.id, title: s.title, cwd: s.cwd, messages: transcript(id) });
      }
      // Chat: run a turn, stream text + tool events over SSE.
      const chatMatch = path.match(/^\/chat\/(.+)$/);
      if (chatMatch && req.method === "POST") {
        const id = decodeURIComponent(chatMatch[1]);
        const body = (await req.json().catch(() => ({}))) as { prompt?: string };
        const prompt = String(body.prompt ?? "").trim();
        if (!prompt) return new Response("no prompt", { status: 400 });
        const stream = new ReadableStream({
          async start(controller) {
            const enc = new TextEncoder();
            const send = (ev: unknown) => controller.enqueue(enc.encode(`data: ${JSON.stringify(ev)}\n\n`));
            try {
              const sessionId = getSession(id) ? id : createSession(process.cwd(), ctx.provider.model).id;
              for await (const ev of runTurnCore(sessionId, ctx.provider, prompt, undefined, {
                maxSteps: ctx.config.maxSteps,
                retryLimit: ctx.config.retryLimit,
                compactWarnAt: ctx.config.compactWarnAt,
                compactCtxOnlyAt: ctx.config.compactCtxOnlyAt,
                projectInstructions: ctx.config.projectInstructions,
                config: ctx.config,
                chat: resolveChat,
              })) {
                if (ev.type === "text") send({ type: "text", delta: ev.delta });
                else if (ev.type === "tool_start") send({ type: "tool", name: ev.name, args: ev.args });
                else if (ev.type === "done") send({ type: "done", reason: ev.reason });
              }
            } catch (e) {
              send({ type: "text", delta: `\n[error: ${(e as Error).message ?? e}]` });
              send({ type: "done", reason: "error" });
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
    description: "web chat UI over your sessions — fox gateway [--port N]",
    run: async (args, rawCtx) => {
      const ctx = rawCtx as GatewayCtx & { flags?: Map<string, string | boolean> };
      const flagPort = ctx.flags?.get("port");
      const portIdx = args.indexOf("--port");
      const port =
        (typeof flagPort === "string" ? Number(flagPort) : 0) ||
        (portIdx >= 0 ? Number(args[portIdx + 1]) : 0) ||
        Number(args.find((a) => /^\d+$/.test(a)) ?? 0) ||
        0;
      await serveGateway(port, ctx);
    },
  },
};
