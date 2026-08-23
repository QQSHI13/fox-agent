# fox 🦊

npm: `fox-agent` · command: `fox`

A light coding harness with **agent-controlled context** — the agent edits its own context window natively (`ctx_edit`), no host hacks.

- Full machine control, zero permission prompts (pi-style)
- Production turn loop: step caps, retry/backoff on 429/5xx, parallel tool execution, abort-safe partial persistence, **auto-compaction** near the context limit
- SQLite event-sourced sessions: append-only log + view ops + refs (reverts/forks are queries, not rewrites)
- OpenAI-compatible gateway first (tokenguard etc.) + native Anthropic provider with prompt caching
- Tools: read/write/edit (whitespace-tolerant patch engine)/glob/grep (ripgrep when present)/exec (process-group kill)/pty (tmux pipe-pane, resize-proof)/ctx_edit/todowrite/task (subagents)/fetch/MCP client
- TUI on custom ANSI renderer: streaming markdown, inline `[mN]` markers, slash commands, `!` shell mode, esc interrupt
- Headless: `-p "prompt"` one-shot, `--json` NDJSON event stream, stdin piping — plus a library API (`createAgent`)

## Run

```bash
bun install && bun run build   # -> bin/fox
FOX_BASE_URL=... FOX_API_KEY=... FOX_MODEL=... bin/fox
```

Headless examples:

```bash
fox -p "summarize this repo's layout"            # one-shot answer
fox -p "..." --json                              # NDJSON agent events
echo "explain src/loop/turn.ts" | fox            # piped prompt
fox -c                                           # resume latest session here
```

## Config

Cascade (lowest wins first): defaults ← env (`FOX_*`) ← `~/.config/fox/config.json` ← project `.fox.json` ← CLI flags.
Project instructions are loaded from `AGENTS.md` / `CLAUDE.md` walking up from cwd.

`.fox.json` example:

```json
{
  "model": "kimi-k2",
  "maxSteps": 40,
  "compactAt": 0.85,
  "mcpServers": {
    "fs": { "command": "npx", "args": ["-y", "@modelcontextprotocol/server-fs", "/tmp"] }
  }
}
```

## Layout

```
src/
  core/       config cascade, structured errors, event vocabulary
  store/      sqlite log (messages/ops/refs/kv), forks, append-only undo
  context/    view projection + pairing repair, rendering, budgets, compaction
  loop/       turn manager (retries, parallel tools, step caps), system prompt
  providers/  openai-compatible + anthropic (cache_control), model registry
  tools/      builtins + MCP bridge + registry
  tui/        ANSI renderer + app
  sdk.ts      library entry (createAgent)
test/         bun test suites (projection, turn manager, patch engine, ...)
```

## Roadmap
- v1 tails: MCP live-test, pty hardening, thinking expand/toggle
- v1.5: Plugin API (tools + lifecycle hooks + custom providers)
- v2: ACP server · LSP diagnostics
- v3: A2A · OpenAI-compat server endpoint · web UI

MIT
