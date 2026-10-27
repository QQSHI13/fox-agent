# gateway — the web surface, and the extension point for other plugins

`fox gateway [--port N]` serves a chat UI at TUI parity and a WebSocket API over
the same engine the terminal drives. Two audiences:

- **people** — a product-grade web UI (themes, responsive, keyboard, a11y)
- **other plugins** — a namespaced corner of that UI to extend (`gateway` field
  on a plugin; see [Extending](#extending-the-gateway))

Files:

| file | role |
|---|---|
| `index.ts` | the plugin entry and `fox gateway` subcommand |
| `server.ts` | the HTTP + WebSocket server, RPC dispatch, plugin mounting |
| `paging.ts` | degenerate-case-proof transcript pagination (pure, tested) |
| `ui.html` | markup + all CSS (theme tokens at the top) |
| `ui.js` | the app |
| `md.js` | the vendored markdown renderer (no CDN, no dependency) |

The UI is an **on-disk asset**, read at runtime and never bundled into
`bin/fox` — that is the point of the gateway being a plugin. Editing `ui.html`
needs no rebuild, only a browser reload.

## Protocol

Connect to `ws://<host>/ws`. Requests carry an `id`; the reply repeats it.

```ts
{ id: 1, method: "session.list" }
{ id: 2, method: "session.get",   params: { id, before?, limit? } }
{ id: 3, method: "session.new",   params: { cwd? } }
{ id: 4, method: "turn.send",     params: { sessionId, prompt } }
{ id: 5, method: "turn.cancel",   params: { sessionId } }
{ id: 6, method: "command.list" }
{ id: 7, method: "command.run",   params: { sessionId, input } }
{ id: 9, method: "plugin.list" }
{ id: 10, method: "plugin.<name>.<method>", params? }   // another plugin's RPC
```

Replies are `{ id, result }` or `{ id, error: { message } }`. A frame that is not
valid JSON gets a bare `{ error }` — there is no id to answer. **Every request
answers**: a handler that throws becomes an error reply, so a client never waits
on a promise that cannot settle.

Unsolicited events carry no numeric id:

```ts
{ event: "turn.delta",      sessionId, delta }
{ event: "turn.think",      sessionId, delta }
{ event: "turn.tool_start", sessionId, id, name, args }
{ event: "turn.tool_end",   sessionId, id, name?, args?, output, ok }
{ event: "turn.status",     sessionId, state: "started"|"completed"|"failed"|"cancelled" }
```

Note `turn.tool_*` carry `id` as a **string** call id while replies carry `id` as
a **number**. Dispatch on the type, not on the presence of `id`.

A turn always ends with exactly one terminal `turn.status`, including when the
generator ends without a `done` event and when a cancel races the end.

### Paging

`session.get` with no `before`/`limit` returns the **whole** transcript (the v1
shape). With either one set it returns the newest `limit` messages (default 50,
capped at 500) and `hasMore`, plus `total`:

```ts
{ ...session, messages: [{ role, content, seq }], hasMore, total }
```

`before` is an exclusive `seq` cursor: pass the `seq` of the oldest message you
hold to load the page before it. The slicing happens in this plugin, not in the
host API, so an older `bin/fox` still pages correctly under a newer gateway.

### HTTP

| path | what |
|---|---|
| `/` | the UI (`%MODEL%` / `%VERSION%` substituted) |
| `/ui.js`, `/md.js` | static assets, allowlisted by name |
| `/health` | `{ ok, version, model, sessions, running, uptimeMs }` |
| `/plugin/<name>/<path>` | a plugin's HTTP route |
| `/plugin/<name>/<panel>.html` | a plugin's UI panel document |
| `/api/sessions`, `/api/session/<id>`, `POST /api/new` | convenience JSON |

### Slash commands

`command.run` runs the **TUI's own** command surface through the host API, so
the two never drift. Commands marked `mutates` (in `src/commands.ts`) are refused
here with a message pointing at the terminal: they rewrite the global config,
replace the provider, or delete another session's database, and a web button for
`/login` or `/upgrade` is a foot-gun, not a feature. Read-only commands
(`/help`, `/sessions`, `/usage`, `/view`, `/todo`, …) run normally.

## Extending the gateway

Any plugin may contribute to the web surface. Declare a `gateway` field on your
plugin's default export — nothing else to register:

```ts
export const name = "demo";

export const gateway = {
  // RPC: reachable as plugin.demo.status
  methods: {
    status: async (params, ctx) => {
      ctx.broadcast({ event: "plugin.demo.tick", at: Date.now() }); // push to every client
      return { ok: true, sessionId: ctx.sessionId ?? null };
    },
  },
  // HTTP: GET /plugin/demo/info
  routes: {
    info: () => Response.json({ hello: "world" }),
  },
  // UI: a tab in the gateway's side panel, at /plugin/demo/status.html
  panels: {
    status: { title: "Demo status", html: "<!doctype html><p>hi</p>" },
  },
};
```

Everything is namespaced by your plugin's `name`, so contributions cannot
collide. All three parts are optional. `ctx` gives a method the `sessionId` the
client called from, your plugin name, and `broadcast()` for unsolicited events.

### Panels are sandboxed

A panel document is served from the gateway's origin but rendered in an
`<iframe sandbox="allow-scripts allow-forms">` — **no `allow-same-origin`** — so
it runs in an opaque origin and cannot read the gateway page, its state, the
session list, or `localStorage`. Verified in a browser: `contentDocument` and
`contentWindow` both throw `SecurityError`.

A panel talks to the gateway over a **`MessagePort`** handed to it on load, not
over `window.postMessage`:

```js
// inside the panel
let port = null;
const pending = new Map();
let seq = 0;

addEventListener("message", (e) => {
  if (e.data && e.data.type === "fox.hello" && e.ports[0]) {
    port = e.ports[0];
    port.onmessage = (ev) => {
      const d = ev.data;
      if (d.type === "fox.reply" && pending.has(d.id)) {
        const [resolve, reject] = pending.get(d.id);
        pending.delete(d.id);
        d.error ? reject(new Error(d.error)) : resolve(d.result);
      }
    };
    // e.data also carries { plugin, theme, model }
  }
});

function rpc(method, params) {
  return new Promise((resolve, reject) => {
    const id = "r" + ++seq;
    pending.set(id, [resolve, reject]);
    port.postMessage({ type: "fox.rpc", id, method, params });
  });
}
```

Why a port instead of `window.postMessage`: a sandboxed frame has an **opaque
origin**, so a window message can only be addressed with `targetOrigin: "*"`,
which means "whoever occupies that frame when it is delivered". If the panel
document ever navigated, the new document would receive replies meant for the
panel. A `MessagePort` is bound to the document that received it and dies with
it, so the only `"*"` message is the one-shot handshake that transfers the port.

`method` is appended to **your** plugin's namespace by the gateway, so a panel
can only ever reach its own plugin's methods — it cannot name another plugin's
RPC.

## How this was verified

`bun test test/gateway-protocol.test.ts test/gateway-markdown.test.ts` — 77 tests,
hermetic (`FOX_AGENT_HOME`/`FOX_AGENT_CONFIG` to a tmp dir), driving a **real
socket** against a **stub host** so the unhappy paths are reachable: a generator
that ends without `done`, a throwing turn, cancel mid-stream, a throwing
command, one client closing while another is connected, a 5,000-message session,
a plugin route/method that throws.

In a real browser (`chrome-devtools`), against `./bin/fox gateway`: streaming,
cancel, tool cards, the slash palette, the session switcher, light/dark, a
390×844 viewport with the drawer, server-kill → banner → auto-reconnect, a
6,855-message session paging 5 times, `plugin.list`, a sandboxed panel calling a
plugin method and receiving an error.

Known gaps are listed in the PR description rather than here — this file
documents the contract, which is the part other plugins code against.
