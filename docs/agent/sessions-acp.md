# fox-agent sessions, ACP and delegation

## Sessions

One SQLite database per session under `agentHome()/sessions/<id>.db` (default home `~/.local/share/fox-agent`). Event-sourced: an append-only message log + a view-ops log + refs. Nothing is ever rewritten — reverts and forks are queries.

- `fox ls` — list sessions; `fox -c [n|id]` — continue latest/nth/by-id. Inside the TUI, `/sessions` (or `fox -c` bare) opens the picker: `↑↓` move, `enter` open, `^f` fork, `^x` delete (then `y`), `^n` new, `^a` all-dirs, type to filter.
- `/fork [N|id]` — fork this session at row N, or another session by id. The fork shares history up to the point and diverges after.
- `/undo` — revert the last context-surgery op (`ctx` edits are append-only; undo is a query, not a deletion).
- Context surgery: every message carries a stable `[N]` marker. `ctx` search/hide/rewrite trims context without touching storage.

## ACP both ways

- **Serve**: `fox --acp` speaks the Agent Client Protocol over stdio — that is how Zed (and `acpx`) drive fox-agent. The acceptance check is `bun scripts/acp-accept.ts` against the compiled binary.
- **Drive**: fox-agent acts as an ACP *client* too — that is what the `task` tool is built on. `[agents.<name>]` with `command = "..."` spawns an ACP agent; `url = "..."` reaches a remote agent over A2A (HTTP/JSON-RPC, SSE streaming when offered).

`[agents.<name>]` lives in global or project config; "default" (fox-agent itself) is always available to `task`.

## Headless

- `fox -p "prompt"` — one-shot.
- `fox json` — NDJSON event stream.
- stdin piping; `fox mini` — plain REPL (everything but markdown/live rewrites).
- Library API: `createAgent(...)` from `fox-agent` source (`src/sdk.ts`).

## Notes that save debugging time

- ACP protocol changes under `src/acp/` additionally need the external acceptance check — the in-process tests cannot fake a real client.
- Session DBs are per-session sqlite; copying one between homes requires re-stamping `session_id` columns (they key rows to the session id) and the `refs` row.
- `state.readOnly` sessions (open elsewhere) keep read-only commands only; sending is refused.
