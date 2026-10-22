/**
 * Gateway server — a persistent WebSocket gateway for fox-agent's sessions.
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
 * - The UI (`ui.html`, `ui.js`, `md.js`) sits beside this file and is read at
 *   runtime, so neither the UI nor this server is part of the compiled binary.
 * - Other plugins extend the gateway through their `gateway` field (see
 *   `GatewayContribution` in src/plugins/types.ts): RPC methods, HTTP routes and
 *   sandboxed UI panels, namespaced by plugin name. The gateway is therefore not
 *   just this plugin's UI — it is the web surface plugins share.
 *
 * `createGateway` returns a handle (port, stop) so tests and embedding hosts can
 * drive it without signals; `runGateway` is the CLI wrapper.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { clampLimit, isPaged, pageMessages, type LiteMessage } from "./paging.ts";

/**
 * The host API shape this server uses (a subset of fox-agent's `FoxHostApi`).
 *
 * Declared here rather than imported: the plugin is a separate program on disk
 * and gets the API through `globalThis`. The cost is that a host that grows a
 * method is invisible to `tsc` here — which is why `test/gateway-protocol.test.ts`
 * drives every branch against a stub host.
 */
interface HostApi {
  version: string;
  provider: { model: string };
  debug: {
    at(level: "off" | "error" | "warn" | "info" | "debug" | "trace", category: string, message: string, detail?: unknown): void;
    info(category: string, message: string, detail?: unknown): void;
    warn(category: string, message: string, detail?: unknown): void;
    error(category: string, message: string, detail?: unknown): void;
    path(): string;
    tail(lines?: number): string;
  };
  sessions: {
    list(limit?: number): { id: string; title: string | null; cwd: string; model: string; updated_at: number }[];
    get(id: string): { id: string; title: string | null; cwd: string; model: string; updated_at: number } | null;
    messages(id: string): { role: string; content: string; seq: number }[];
    create(cwd?: string): { id: string };
  };
  turn(sessionId: string, prompt: string, signal?: AbortSignal): AsyncGenerator<{ type: string; [k: string]: unknown }>;
  commands: {
    list(): { name: string; desc: string; usage?: string; arg?: boolean; mutates?: boolean }[];
    run(sessionId: string, input: string): Promise<{ output?: string; newSessionId?: string; handled: boolean }>;
  };
  /** live plugin list, for the `gateway` contributions of OTHER plugins */
  plugins?: { active(): GatewayPlugin[] };
}

/** The bit of a plugin this server reads: its name and its gateway contribution. */
interface GatewayPlugin {
  name: string;
  gateway?: {
    methods?: Record<string, (params: unknown, ctx: MethodContext) => unknown | Promise<unknown>>;
    routes?: Record<string, (req: Request) => Response | Promise<Response>>;
    panels?: Record<string, { title: string; html: string | (() => string) }>;
  };
}

interface MethodContext {
  sessionId?: string;
  plugin: string;
  broadcast(event: Record<string, unknown>): void;
}

function host(): HostApi {
  const h = (globalThis as { foxHost?: HostApi }).foxHost;
  if (!h) throw new Error("fox-agent host API not installed — plugins run under the CLI, which publishes it");
  return h;
}

// ---- wire protocol ----

/**
 * One parsed client frame.
 *
 * Deliberately not a per-method discriminated union: this switch is dispatched
 * over a name that arrives as untrusted JSON, and the `default` branch forwards
 * `plugin.<name>.<method>` RPCs whose names the gateway cannot know. Typing each
 * case would fight the parser for no gain — the params are validated where they
 * are used, and an unknown method is an error rather than a crash.
 */
interface ClientMsg {
  id: number;
  method: string;
  params?: { id?: string; cwd?: string; sessionId?: string; prompt?: string; input?: string; lines?: number; before?: unknown; limit?: unknown } & Record<string, unknown>;
}

type ServerEvent =
  | { event: "turn.delta"; sessionId: string; delta: string }
  | { event: "turn.think"; sessionId: string; delta: string }
  | { event: "turn.tool_start"; sessionId: string; id: string; name: string; args: string }
  | { event: "turn.tool_end"; sessionId: string; id: string; name?: string; args?: string; output: string; ok: boolean }
  | { event: "turn.status"; sessionId: string; state: "started" | "completed" | "failed" | "cancelled" };

/** A client worth sending to: the socket's own send plus a liveness flag. */
interface Client {
  send(data: string): void;
}

const esc = (s: unknown) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// The UI is an ON-DISK asset beside this file — deliberately not imported, so
// it stays out of the compiled binary. An allowlist (not a path join) because
// this is the only file-serving surface in the harness: a traversal bug here
// would hand out `~/.config/fox-agent/config.toml`, keys included.
const here = dirname(new URL(import.meta.url).pathname);
const ASSETS: Record<string, string> = {
  "/ui.js": "ui.js",
  "/md.js": "md.js",
};
const TYPES: Record<string, string> = {
  ".js": "text/javascript; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
};

function asset(path: string): Response | null {
  const file = ASSETS[path];
  if (!file) return null;
  try {
    const body = readFileSync(join(here, file), "utf8");
    const ext = file.slice(file.lastIndexOf("."));
    return new Response(body, {
      headers: { "content-type": TYPES[ext] ?? "application/octet-stream", "cache-control": "no-cache" },
    });
  } catch {
    return new Response(`asset ${file} not found beside server.ts`, { status: 404 });
  }
}

function loadUi(model: string, version: string): string {
  try {
    return readFileSync(join(here, "ui.html"), "utf8")
      .replaceAll("%MODEL%", esc(model))
      .replaceAll("%VERSION%", esc(version));
  } catch {
    return "<!doctype html><title>fox-agent gateway</title><p>gateway UI not found at " + esc(join(here, "ui.html")) + "</p>";
  }
}

/** Live turns, so a second client (or a cancel) can see and stop them. */
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
  h.debug.info("gateway", `turn started ${sessionId}`, prompt.slice(0, 200));
  push({ event: "turn.status", sessionId, state: "started" });
  // A turn always ends in exactly one terminal status, or a client is left with a
  // spinner and a disabled composer forever. The generator can end WITHOUT a
  // `done` event (an aborted stream that does not throw), and then the old code
  // fell out of the loop silently — so the fallback is here, not in each branch.
  let settled = false;
  const end = (state: "completed" | "failed" | "cancelled") => {
    if (settled) return;
    settled = true;
    push({ event: "turn.status", sessionId, state });
  };
  try {
    for await (const ev of h.turn(sessionId, prompt, ctl.signal)) {
      if (ev.type === "text") push({ event: "turn.delta", sessionId, delta: String(ev.delta ?? "") });
      else if (ev.type === "reasoning") push({ event: "turn.think", sessionId, delta: String(ev.delta ?? "") });
      else if (ev.type === "tool_start") push({ event: "turn.tool_start", sessionId, id: String(ev.id), name: String(ev.name), args: String(ev.args ?? "") });
      else if (ev.type === "tool_end")
        push({
          event: "turn.tool_end",
          sessionId,
          id: String(ev.id),
          name: typeof ev.name === "string" ? ev.name : undefined,
          args: typeof ev.args === "string" ? ev.args : undefined,
          output: String(ev.output ?? ""),
          ok: ev.ok !== false,
        });
      else if (ev.type === "done") {
        end(ev.reason === "error" ? "failed" : ctl.signal.aborted ? "cancelled" : "completed");
        break;
      }
    }
    end(ctl.signal.aborted ? "cancelled" : "completed");
  } catch (e) {
    if (ctl.signal.aborted) {
      h.debug.info("gateway", `turn cancelled ${sessionId}`);
      end("cancelled");
    } else {
      h.debug.error("gateway", `turn failed ${sessionId}`, (e as Error)?.stack ?? String(e));
      push({ event: "turn.delta", sessionId, delta: `\n[error: ${(e as Error)?.message ?? e}]` });
      end("failed");
    }
  } finally {
    running.delete(sessionId);
  }
}

/** Static call: what every client can be told about a session, paging aside. */
function sessionMeta(id: string) {
  const s = host().sessions.get(id);
  if (!s) return null;
  return { id: s.id, title: s.title, cwd: s.cwd, model: s.model, updated_at: s.updated_at };
}

export interface GatewayOptions {
  port?: number;
  hostname?: string;
  /** called once the socket is bound — the only way to learn a `port: 0` port */
  onListen?: (port: number) => void;
  /** abort to stop the server (tests use this; the CLI uses signals) */
  signal?: AbortSignal;
}

export interface GatewayHandle {
  port: number;
  hostname: string;
  /** every currently connected client, for tests and for embedding hosts */
  clients: () => number;
  stop(): Promise<void>;
}

/**
 * Start the gateway. Resolves once the socket is bound (so a caller can connect
 * immediately and a test does not sleep-and-hope); `stop()` closes it.
 */
export async function createGateway(opts: GatewayOptions = {}): Promise<GatewayHandle> {
  const h = host();
  // Keyed by socket, not a Set cleared on close: one tab closing must not
  // silence the broadcast for every other tab.
  const clients = new Map<object, Client>();

  const broadcastTo = (data: string) => {
    for (const c of clients.values()) {
      try {
        c.send(data);
      } catch {
        /* a dead socket is removed by its own close handler */
      }
    }
  };

  /** Contributions from every loaded plugin that has a `gateway` field. */
  const contributions = (): GatewayPlugin[] =>
    (h.plugins?.active() ?? []).filter((p) => p?.gateway && typeof p.name === "string");

  const server = Bun.serve<{ remoteId: string }>({
    port: opts.port ?? 0,
    hostname: opts.hostname ?? "127.0.0.1",
    async fetch(req, serverUp) {
      const url = new URL(req.url);
      const path = url.pathname;

      if (path === "/ws") {
        const ok = serverUp.upgrade(req, { data: { remoteId: `${Math.random().toString(36).slice(2)}` } });
        return ok ? undefined : new Response("websocket upgrade failed", { status: 400 });
      }
      if (path === "/" || path === "/index.html") {
        return new Response(loadUi(h.provider.model, h.version), {
          headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" },
        });
      }
      const a = asset(path);
      if (a) return a;

      // Plugin HTTP routes: /plugin/<name>/<path>. Mounted BEFORE the built-in
      // /api surface would ever be matched by hand, and never allowed to shadow
      // the gateway's own paths (the check above already ran).
      const pm = path.match(/^\/plugin\/([^/]+)\/(.+)$/);
      if (pm) {
        const name = decodeURIComponent(pm[1]);
        const rest = decodeURIComponent(pm[2]);
        const p = contributions().find((c) => c.name === name);
        // a panel is a route with an implicit HTML handler: /plugin/<n>/<id>.html
        if (rest.endsWith(".html")) {
          const id = rest.slice(0, -".html".length);
          const panel = p?.gateway?.panels?.[id];
          if (panel) {
            try {
              const html = typeof panel.html === "function" ? panel.html() : panel.html;
              return new Response(html, {
                headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" },
              });
            } catch (e) {
              return new Response(`panel '${id}' failed: ${esc((e as Error)?.message ?? e)}`, { status: 500 });
            }
          }
        }
        const route = p?.gateway?.routes?.[rest.replace(/^\//, "")];
        if (route) {
          try {
            return await route(req);
          } catch (e) {
            h.debug.error("gateway", `plugin route failed ${name}/${rest}`, (e as Error)?.stack ?? String(e));
            return Response.json({ error: (e as Error)?.message ?? String(e) }, { status: 500 });
          }
        }
        return new Response("no such plugin route", { status: 404 });
      }

      // A liveness probe: the UI's disconnected banner and any monitoring want a
      // cheap "is the engine behind this gateway alive" answer.
      if (path === "/health") {
        return Response.json({
          ok: true,
          version: h.version,
          model: h.provider.model,
          sessions: h.sessions.list(1).length > 0,
          running: [...running.keys()],
          uptimeMs: Math.round(performance.now()),
        });
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
        clients.set(ws, { send: (d) => ws.send(d) });
        host().debug.info("gateway", "client connected", `clients=${clients.size}`);
      },
      close(ws) {
        clients.delete(ws);
        host().debug.info("gateway", "client disconnected", `clients=${clients.size}`);
      },
      async message(ws, raw) {
        let msg: ClientMsg;
        try {
          msg = JSON.parse(String(raw));
        } catch {
          host().debug.warn("gateway", "malformed message", String(raw).slice(0, 200));
          // No `id` to answer: a bare {error} is the only honest reply, and the
          // client's pending-map cannot confuse it with a real response.
          ws.send(JSON.stringify({ error: { message: "malformed JSON" } }));
          return;
        }
        host().debug.info("gateway", `rpc ${msg.method}`, `id=${msg.id}`);
        const reply = (result: unknown) => ws.send(JSON.stringify({ id: msg.id, result }));
        // Failures must carry the id. A throw used to escape this handler and
        // leave the client waiting for a reply that never came, until its own
        // timeout — the request looked "slow" instead of broken.
        const fail = (e: unknown) => {
          const message = (e as Error)?.message ?? String(e);
          host().debug.warn("gateway", `rpc ${msg.method} failed`, message);
          ws.send(JSON.stringify({ id: msg.id, error: { message } }));
        };
        const broadcast = (ev: ServerEvent) => broadcastTo(JSON.stringify(ev));

        try {
          switch (msg.method) {
            case "session.list":
              reply(h.sessions.list(100));
              break;
            case "session.get": {
              const p = (msg as { params?: { id?: string; before?: unknown; limit?: unknown } }).params ?? {};
              if (!p.id) {
                reply(null);
                break;
              }
              const meta = sessionMeta(p.id);
              if (!meta) {
                reply(null);
                break;
              }
              const all = h.sessions.messages(p.id) as LiteMessage[];
              if (!isPaged(p)) {
                // v1 shape exactly: whole transcript, no hasMore. A client that
                // sends no params must not start seeing a truncated session.
                reply({ ...meta, messages: all });
                break;
              }
              const page = pageMessages(all, p);
              reply({ ...meta, messages: page.messages, hasMore: page.hasMore, total: all.length });
              break;
            }
            case "session.new":
              reply(h.sessions.create((msg as { params?: { cwd?: string } }).params?.cwd));
              break;
            case "turn.send": {
              const sessionId = String(msg.params?.sessionId ?? "");
              const prompt = String(msg.params?.prompt ?? "");
              if (!sessionId || !prompt) throw new Error("turn.send needs sessionId and prompt");
              if (running.has(sessionId)) {
                throw new Error("a turn is already running in this session");
              }
              if (!h.sessions.get(sessionId)) throw new Error(`no such session: ${sessionId}`);
              void runTurn(sessionId, prompt, broadcast);
              reply({ ok: true });
              break;
            }
            case "turn.cancel": {
              const ctl = running.get(String(msg.params?.sessionId ?? ""));
              // not an error: cancelling a turn that already ended is a no-op,
              // and the double-click case must not show the user a failure
              ctl?.abort();
              reply({ ok: true, wasRunning: !!ctl });
              break;
            }
            case "command.list":
              // the TUI's slash commands — the UI shows them as hints and can run
              // them, so the web surface and the terminal surface stay ONE thing
              reply(h.commands.list());
              break;
            case "command.run": {
              // run one slash command against a session (the TUI's own runner, via
              // the host API) — /help, /sessions, /todo, /usage, /view, …
              const sessionId = String(msg.params?.sessionId ?? "");
              const input = String(msg.params?.input ?? "");
              const word = input.trim().split(/\s+/)[0].toLowerCase();
              // Commands that only PRINT were fine headless already. The rest
              // mutate the harness (the global config, another session's db) and
              // some REPLACE the process's provider — behind a browser button
              // that is a foot-gun, so they are refused with a reason.
              const spec = h.commands.list().find((c) => c.name.toLowerCase() === word);
              if (!spec) throw new Error(`unknown command: ${word}`);
              if (spec.mutates) {
                throw new Error(
                  `${spec.name} changes the harness, so it is terminal-only — run it in the TUI (this web surface runs read-only commands)`,
                );
              }
              reply(await h.commands.run(sessionId, input));
              break;
            }
            case "debug.log": {
              // the debug panel's content — the SAME log the harness writes, so the
              // web surface is also the debugging surface
              const n = clampLimit((msg as { params?: { lines?: number } }).params?.lines ?? 200);
              reply({ path: h.debug.path(), lines: h.debug.tail(Math.min(n, 5000)) });
              break;
            }
            case "plugin.list": {
              // What other plugins contribute, so the UI can build its panels and
              // the extension surface is discoverable instead of documented-only.
              reply(
                contributions().map((p) => ({
                  name: p.name,
                  methods: Object.keys(p.gateway?.methods ?? {}),
                  routes: Object.keys(p.gateway?.routes ?? {}),
                  panels: Object.entries(p.gateway?.panels ?? {}).map(([id, panel]) => ({
                    id,
                    title: panel.title,
                    url: `/plugin/${encodeURIComponent(p.name)}/${encodeURIComponent(id)}.html`,
                  })),
                })),
              );
              break;
            }
            default: {
              // `plugin.<name>.<method>` — another plugin's own RPC, namespaced by
              // its name. Unknown methods fall through to a named error so a typo
              // in a panel says which plugin could not serve it.
              const pm = msg.method.match(/^plugin\.([^.]+)\.(.+)$/);
              if (pm) {
                const [, name, method] = pm;
                const p = contributions().find((c) => c.name === name);
                const fn = p?.gateway?.methods?.[method];
                if (!fn) throw new Error(`no method '${method}' on plugin '${name}'`);
                const params = (msg as { params?: unknown }).params;
                const sessionId =
                  params && typeof params === "object" && "sessionId" in params
                    ? String((params as { sessionId?: unknown }).sessionId ?? "")
                    : undefined;
                reply(
                  await fn(params, {
                    sessionId: sessionId || undefined,
                    plugin: name,
                    broadcast: (event) => broadcastTo(JSON.stringify(event)),
                  }),
                );
                break;
              }
              throw new Error(`unknown method: ${msg.method}`);
            }
          }
        } catch (e) {
          fail(e);
        }
      },
    },
  });

  const handle: GatewayHandle = {
    port: server.port as number,
    hostname: server.hostname ?? "127.0.0.1",
    clients: () => clients.size,
    stop: async () => {
      for (const ctl of running.values()) ctl.abort();
      server.stop(true);
    },
  };
  opts.onListen?.(handle.port);
  return handle;
}

/**
 * Serve the gateway from the CLI (`fox gateway [--port N]`). Resolves when the
 * server stops; SIGINT/SIGTERM and `opts.signal` both stop it.
 */
export async function runGateway(opts: GatewayOptions = {}): Promise<void> {
  const gw = await createGateway(opts);
  console.error(`fox-agent gateway: http://${gw.hostname}:${gw.port}/  (Ctrl+C to stop)`);
  await new Promise<void>((resolve) => {
    let done = false;
    const stop = () => {
      if (done) return;
      done = true;
      void gw.stop().then(resolve);
    };
    process.on("SIGINT", stop);
    process.on("SIGTERM", stop);
    opts.signal?.addEventListener("abort", stop);
  });
}
