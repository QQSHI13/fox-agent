# Tools — the exact contract

Two facts shape the whole set: **nothing is withheld** (`exec` runs anything with
the user's privileges, so no other tool is a sandbox boundary), and **most tools
are bundled plugins**, so each can be shadowed or switched off with
`disabledPlugins`.

## Roster

Core (`src/tools/index.ts` → `baseRegistry`): `read`, `write`, `edit`, `glob`,
`grep`, `exec`, `ctx`.

Bundled plugins (`src/plugins/bundled.ts`): `pty`, `todo`, `fetch`, `repl`,
`task`, `question`, `lsp`, `mcp` (bridge), `cost` (no tool, one command + status
segment), `gateway` (no tool, a subcommand).

Plugin names to disable: `pty`, `todo`, `fetch`, `repl`, `task`, `question`, `lsp`,
`mcp`, `cost`, `gateway`, and the provider formats `openai-compatible`,
`openai-responses`, `anthropic`, `google`. Short or `bundled:`-prefixed both work.

## Paths and cwd

Every tool taking a path accepts a **relative** one, resolved against the
session's cwd. `exec`'s `workdir` is per-call and never sticky; `pty`'s shell
starts in the session directory and then keeps whatever directory it is given.
Both behaviours are deliberate — see the human docs' `tools/exec-pty.md` if you
are changing them.

## Per-tool notes worth knowing before you edit one

- **`read`** — line-numbered output is load-bearing: `edit`'s exact-match anchors
  depend on it. Files over `readCap` are refused, not truncated. Media attaches
  only if the model accepts that kind (`modelAcceptsMedia`).
- **`edit`** — whitespace-tolerant fallback match; `edits[]` applies in order.
  Requires a **unique** match unless `replaceAll`; failure must name the anchor.
- **`write`** and **`edit`** both report post-edit diagnostics in the result.
  Diagnostics degrade to silence, never to a failed edit.
- **`exec`** — kills the **process group** (TERM then KILL at 1.5s). `full: true`
  lifts the per-call output cap. `timeout_ms` default 120000.
- **`ctx`** — view only; storage never written. `delete_by_query` requires
  `all: true` when the pattern matches everything visible. Ops batch in one call.
- **`pty`** — tmux-backed; `keys` is literal (`^c` = ctrl+c, `"\n"` = enter). It
  must report a vanished tmux session and a `$HOME` fallback explicitly rather
  than pretending the shell is intact. Released via `onSessionEnd`.
- **`repl`** — in-process `vm`; real host globals. `tools.call(name, args)` bypasses
  the turn loop's `beforeTool`/`afterTool` hooks. Nesting capped at 3.
- **`task`** — foreground only; protocol follows the `[agents.*]` entry's shape
  (`command` → ACP, `url` → A2A). Delegation depth capped at 3 via
  `FOX_AGENT_DELEGATION_DEPTH`. `default` cannot be rebound.
- **`question`** — fails fast when `ctx.ui` is absent (headless), telling the model
  to decide itself. Never blocks on an answer that cannot come.
- **`fetch`** — refuses loopback/private/link-local/metadata, re-checks **every**
  redirect hop, caps bodies mid-stream. `FOX_AGENT_ALLOW_PRIVATE_FETCH=1` overrides.

## Adding a tool

A tool is `{ def: ToolDef, run(args, ctx) → ToolResult | string }`. Prefer a
**bundled plugin** over a `baseRegistry` entry: it gets shadowing, `disabledPlugins`
and the `onSessionEnd` lifecycle for free, and `buildSystemPrompt` derives the
roster from the live registry so no prompt edit is needed. A tool that needs state
per session keys it on `ctx.sessionId` and releases it in `onSessionEnd`.

Return `ok(output)` / `fail("error: …")` from `src/tools/types.ts`. Errors are
`fail`, not throws — a throw is caught but loses the message the model needs.
