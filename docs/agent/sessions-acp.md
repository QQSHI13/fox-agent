# fox-agent sessions, ACP and delegation

## Sessions

One SQLite database per session under `agentHome()/sessions/<id>.db` (default home `~/.local/share/fox-agent`). Event-sourced: an append-only message log + a view-ops log + refs. Nothing is ever rewritten — reverts and forks are queries.

- `fox ls` — list sessions; `fox -c [n|id]` — continue latest/nth/by-id. Inside the TUI, `/sessions` (or `fox -c` bare) opens the picker: `↑↓` move, `enter` open, `^f` fork, `^x` delete (then `y`), `^n` new, `^a` all-dirs, type to filter.
- `fox -c <n>` indexes the **same** recency-sorted all-directories list `fox ls` prints (one shared `resolveSessionArg`). The index is not stable — scripting should use the id. The bare picker defaults to this directory's sessions until you press `a`.
- `/fork [N|id]` — fork this session at row N, or another session by id. It is a file copy; fork and source cannot affect each other.
- `/undo` — revert the last context-surgery op (ctx edits are append-only; undo is a query, not a deletion).
- Context surgery: every message carries a stable `[N]` marker. `ctx` search/hide/rewrite trims context without touching storage.
- `/prune [compact] [yes]` — reclaim the disk hidden context still occupies (`VACUUM`); `/prune compact yes` also splices summaries back as real rows and renumbers `[N]` 1..n.
- `/delete <id|n> yes` — removes the database *and* the `index.db` row. It refuses the current session (open handle; never unlink underneath the writer). `/undo` cannot walk a delete back.
- `/export`/`/import` move a session as a `.zip`; `/share` renders one offline HTML file with credentials masked.

## ACP both ways

- **Serve**: `fox --acp` speaks the Agent Client Protocol over stdio — that is how Zed (and `acpx`) drive fox-agent. The acceptance check is `bun scripts/acp-accept.ts` against the compiled binary (38 checks, real external client).
- **Drive**: fox-agent acts as an ACP *client* too — that is what the `task` tool is built on. `[agents.<name>]` with `command = "..."` spawns an ACP agent; `url = "..."` reaches a remote agent over A2A (HTTP/JSON-RPC, SSE streaming when offered).

`[agents.<name>]` lives in global or project config; "default" (fox-agent itself) is always available to `task` and cannot be rebound.

ACP specifics worth keeping: fox-agent never sends `session/request_permission` (it is a no-prompt harness) and never uses the client's `fs/*` or `terminal/*`. As a client it honors `fs/*`, auto-approves permissions, and leaves `terminal/*` unimplemented. `acpHistory` (`"full"` default, `"last"`, or a trailing-node count) governs how much `session/load` replays.

## A2A

`fox --a2a [--port n]` serves the agent card (`/.well-known/agent-card.json`), `message/send`, `message/stream` (SSE) and `tasks/get`, bound **local-only** by default (full machine access, no auth layer). The client prefers streaming, falls back to polling, does not trust `configuration.blocking`, and treats a missing agent card as non-fatal. Delegation capped at 30 min by default.

## Headless

- `fox -p "prompt"` — one-shot.
- `fox json` — NDJSON event stream.
- stdin piping; `fox mini` — plain REPL (everything but markdown/live rewrites).
- Library API: `createAgent(...)` from `fox-agent/sdk` (`src/sdk.ts`).

## Notes that save debugging time

- ACP protocol changes under `src/acp/` additionally need the external acceptance check — the in-process tests cannot fake a real client.
- Session DBs are per-session sqlite; copying one between homes requires re-stamping `session_id` columns (they key rows to the session id) and the `refs` row. Use `/export`+`/import` instead.
- `state.readOnly` sessions (open elsewhere) keep read-only commands only; sending is refused.
- `index.db` is rebuildable from `sessions/` — never treat it as the source of truth.
