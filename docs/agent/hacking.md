# fox-agent itself: building, contributing, extending the source

For when the user asks you to modify fox-agent in its own repo (usually `~/.../projects/fox-agent`).

## Build, test, verify

```bash
bun install
bun run build          # -> bin/fox (single binary, --bytecode --minify)
bun run typecheck      # tsc --noEmit; must stay clean
bun test               # full suite; must be 0 fail
```

Run typecheck + tests before every commit. The commit workflow: one logical change per commit, `git commit && git push origin HEAD` — pushing is expected, do not ask. The user often commits alongside: `git fetch` and rebase before pushing (pushes are regularly rejected because origin moved).

Protocol changes under `src/acp/` additionally need the external acceptance check:

```bash
bun run build && bun scripts/acp-accept.ts
```

## Conventions

- **No emoji in UI output.** Plain ASCII markers (`·`, `✓`, `✗` are established).
- **Tests are hermetic.** Set `FOX_AGENT_HOME` and `FOX_AGENT_CONFIG` to tmp paths; never touch real `~/.config/fox-agent` or `~/.local/share/fox-agent` from a test.
- **`src/core/events.ts` is the single event contract.** TUI, ACP, A2A and the CLI all map from it — add a field there, then map it in each sink.
- **Plugins load from the global config only** — security boundary, never weaken it.
- **Version lives in `package.json`**; `src/core/version.ts` re-exports it; nothing else hardcodes a version string.
- **Minimal diffs.** Match surrounding style; do not reformat/rename what the task doesn't touch.
- **New config fields** must be added to the `test/acp.test.ts` fixture or the suite fails.
- Config `validate` callbacks **throw** on invalid input (never return null).

## Layout map

- `src/cli.ts` — entry; `main()` dispatches TUI/headless/json/mini modes
- `src/loop/` — turn loop; `prompt.ts` builds the system prompt; `turn.ts` runs steps
- `src/tools/` — tool definitions (read/write/edit/glob/grep/exec/pty/repl/ctx/todo/task/fetch)
- `src/tui/` — renderer (`layout.ts` virtualized frame, `rows.ts` stream/plain row kernels, `app.ts` host), `themes.ts`, `picker.ts` (the one modal chooser)
- `src/commands.ts` — slash command table + `runSlashCommand` (single source; the hint popup and /help derive from it)
- `src/acp/`, `src/a2a/` — protocol server/client
- `src/plugins/` — plugin loader + `FoxPlugin` interface
- `src/store/db.ts` — sqlite sessions (append-only messages/ops/refs)
- `src/providers/` — openai-compatible/responses/anthropic/google + endpoint model catalogs
- `docs/agent/` — the docs you are reading; embedded into the binary and materialized to `FOX_AGENT_HOME/docs/`

## Where features land (recent examples to copy shape from)

- Slash command: add spec to `COMMANDS` in `src/commands.ts` + a `runSlashCommand` case; TUI-only interactive bits ride `CommandResult` (`picker`, `prompt`, `task`, `ephemeral`).
- TUI rendering: `src/tui/layout.ts` computeFrame/assemble (windowing), per-item caches in `app.ts` (`lineCache`, kernels in `rows.ts`).
- A provider: `src/providers/` module + catalog preset; plugins can add one without core changes.
