# Task brief: rebuild the fox-agent gateway web UI

You are working in `/home/qq/.openclaw/workspace/projects/fox-agent` — a TypeScript/Bun
coding-agent harness. Your job is to **rewrite the web chat UI** of the `gateway` plugin.

The current UI works but is thin: it is a single 24 KB HTML file with inline CSS + JS,
one dark theme, no responsive layout, no accessibility, no tests, and it loads `marked`
from a CDN (which breaks offline). The owner considers it a demo, not a product.

**Deliverable: a web UI that a normal user would actually want to use.**

---

## What exists today (read these first)

| file | what it is |
|---|---|
| `plugins/gateway/ui.html` | **the file you are rewriting** — the whole UI (HTML + CSS + JS inline) |
| `plugins/gateway/server.ts` | the WebSocket server (the protocol you speak) |
| `plugins/gateway/index.ts` | the plugin entry: `fox gateway [--port N]` |
| `src/gateway/host.ts` | the host API the server calls (sessions, turn, commands) |

**Read all four completely before writing anything.** The server is the contract; do not
change its behavior except where the brief says to.

## Non-negotiable constraints

1. **The UI must stay an on-disk asset, not bundled into the binary.** The whole point of
   the gateway being a plugin is that `bin/fox` stays small and the UI is a file on disk
   next to the server. Do not import the UI into TypeScript, and do not add a bundler step
   that emits it into `src/`.
2. **No new runtime dependencies.** The harness has one JS runtime (Bun) and ships a
   single binary. `marked` is currently loaded from `cdn.jsdelivr.net` — that is a bug
   (the gateway is useless offline and the CDN is a supply-chain surface). **Vendor a
   minimal markdown renderer inline** (a few dozen lines is fine: bold, italic, code,
   fenced code blocks, links, lists, headings, blockquotes, tables) or write a tiny
   self-contained one. No other CDN, no npm packages.
3. **Do not touch `src/loop/`, `src/store/`, `src/providers/`, or the turn engine.** The UI
   is a view; the engine is the truth.
4. **Plain ASCII in source comments, no emoji** (the project's convention). The UI itself
   may use whatever glyphs render well in a browser.
5. **Keep the WebSocket protocol** as it is, except for the additive change below.

## The protocol (verified against `plugins/gateway/server.ts`)

Connect to `ws://<host>/ws`. Client → server:

```ts
{ id: number, method: "session.list" }
{ id: number, method: "session.get",   params: { id: string } }
{ id: number, method: "session.new",    params: { cwd?: string } }
{ id: number, method: "turn.send",      params: { sessionId: string, prompt: string } }
{ id: number, method: "turn.cancel",    params: { sessionId: string } }
{ id: number, method: "command.list" }
{ id: number, method: "command.run",    params: { sessionId: string, input: string } }
```

Server → client: `{ id, result }` for a reply, `{ id, error: { message } }` for a failure,
and **unsolicited** events (no `id`):

```ts
{ event: "turn.delta",     sessionId, delta }
{ event: "turn.think",     sessionId, delta }
{ event: "turn.tool_start",sessionId, id, name, args }
{ event: "turn.tool_end",  sessionId, id, output, ok }
{ event: "turn.status",    sessionId, state: "started" | "completed" | "failed" | "cancelled" }
```

Result shapes:

- `session.list` → `{ id, title, cwd, model, updated_at }[]` (up to 100, newest first)
- `session.get` → `{ id, title, cwd, model, updated_at, messages: { role, content, seq }[] }`
- `session.new` → `{ id }`
- `command.list` → `{ name, desc, usage?, arg? }[]` (the TUI's own slash commands)
- `command.run` → `{ handled, output?, newSessionId? }`

`role` is one of `user` / `assistant` / `think` / `tool`. A message's `content` is the
plain text (markdown for assistant messages).

## What is wrong with the current UI (the owner's complaints — fix these)

1. **Past sessions did not show.** Root cause found: the old code called `loadSessions()`
   *before* the WebSocket was open, so the RPC was sent into a closed socket and its
   promise never resolved. The current file already fixes this (RPCs queue until open) —
   **keep that fix**, and make it robust (a timeout, a visible reconnect state, a
   "retry" affordance when the socket is down).
2. **No cwd** — the session list must show the working directory (shorten `~` paths).
3. **No switcher** — a modal session picker with its own filter, opened from the header.
4. **No slash-command hints** — the current file autocompletes from `command.list`. Keep
   it, and make it good: keyboard navigation, a visible selected row, and the command's
   `usage` shown.
5. **It does not feel like a product.** Specifically: no light/dark theme, no responsive
   layout (it must work on a phone), no keyboard shortcuts beyond the basics, no
   accessibility (labels, focus management, `prefers-reduced-motion`), no empty states, no
   loading states, no optimistic feedback, no error recovery UI beyond a Retry button.

## The bar

Treat this as a **product**, not a page. Concretely, the finished UI should have:

- **Layout**: a session sidebar (resizable/collapsible on narrow screens), a header with
  the session title + cwd + model + a switcher button, the transcript, and a composer.
  On a narrow viewport the sidebar becomes a drawer.
- **Transcript**: rendered markdown, user vs. assistant distinction, **thinking blocks**
  (collapsible, and not shown by default), **tool calls as cards** (name, args summary,
  output, expandable, with the ok/fail state), streaming text that does not re-render the
  whole transcript on every token, and a scroll that stays pinned to the bottom unless the
  user has scrolled up (with a "jump to latest" affordance when they have).
- **Composer**: multi-line input, `Enter` sends, `Shift+Enter` newlines, a `/` command
  palette, a disabled state while a turn is running, and a **Stop** button that calls
  `turn.cancel`.
- **Session management**: create, switch, and a live indicator for a session with a
  running turn (the server broadcasts `turn.*` for every session; events for a background
  session must not corrupt the current view).
- **States**: no session selected, empty session, disconnected/reconnecting, request
  failed (with Retry), command output, and a run that failed.
- **Theme**: light and dark, following the OS by default, with a manual override that
  persists in `localStorage`.
- **Accessibility**: semantic elements, focus rings, `aria-live` for the streaming
  region, keyboard-reachable everything, and `prefers-reduced-motion` respected.

## The one additive protocol change you MAY make

The server currently returns the whole transcript for a session. For a long session that
is a lot of JSON, and the UI renders it all at once. Add **pagination** to `session.get`:

```ts
{ id: number, method: "session.get", params: { id: string, before?: number, limit?: number } }
// → { id, title, cwd, model, updated_at, messages: {role,content,seq}[], hasMore: boolean }
```

`before` = a `seq` cursor (return messages with `seq` strictly less than it), `limit`
default 50. When `before` is omitted, return the NEWEST `limit` messages. Keep the current
behavior when the params are absent, so nothing else breaks.

If you change the server, keep the plugin's own style and the file's comment conventions
(this codebase explains *why* in comments).

## How to verify (this is the part people skip — do not skip it)

1. `bun run typecheck` → 0 errors. The plugin is TypeScript; `bun run build` must succeed.
2. **Drive the real thing.** Start the server and exercise it from a script, not by eye:
   ```bash
   ./bin/fox gateway --port 41560 &
   # then connect with a WebSocket client and assert the RPCs + events
   ```
   The current UI's bugs (sessions not loading) were invisible to unit tests and obvious
   in a real browser. **Test the real flow end to end.**
3. **Open it in a real browser** and use it: create a session, send a message, watch the
   stream, expand a tool card, run a slash command, open the switcher, disconnect and
   reconnect. Screenshot or describe what you verified.
   The `chrome-devtools` MCP server is available for browser automation.
4. **Test the unhappy paths**: the server is down (does the UI say so?), a session has
   5,000 messages (does it stay usable?), a tool returns 10 KB of output, a turn is
   cancelled mid-stream, a command returns an error.
5. **A narrow viewport** (phone width) and **light mode** — check both.

## Constraints on your deliverable

- The UI is **one file** (`plugins/gateway/ui.html`) or a small set of files in
  `plugins/gateway/` served by the server. If you split it, add a tiny static handler to
  `server.ts` — keep it simple, and keep the UI loadable as a plain file.
- **Write tests.** The repo has `bun test` with hermetic tests (set `FOX_AGENT_HOME` to a
  tmp dir; never touch the real `~/.config/fox-agent`). At minimum, test the protocol
  layer you add (pagination) and any pure JS you extract from the UI (a markdown
  renderer is very testable — put it in its own file under `plugins/gateway/` and test it
  against the CommonMark examples).
- **Do not push to `main`.** Work on a branch (e.g. `feature/gateway-ui-v2`), commit
  there with clear messages, and report the branch name. The owner reviews and merges.
  Never force-push to `main`; never rewrite shared history.

## Report back

- What you built, and the decisions behind the main choices.
- What you verified, and HOW (commands run, what you saw).
- What is still rough or missing.
- Any protocol change you made, and why it is backward-compatible.

Be honest about what you did not test. A feature you claim works but did not run is worse
than one you left out.
