# foxc 🦊

npm: `@qqshi13/foxc` · command: `foxc`

A light coding harness with **agent-controlled context** — the agent edits its own context window natively (`ctx_edit`), no host hacks.

- Full machine control, zero permission prompts (pi-style)
- SQLite event-sourced sessions: append-only log + view ops + refs (reverts/branches are queries, not rewrites)
- TUI on @opentui/solid: streaming markdown, inline `[mN]` message markers, slash commands, `!` shell mode, esc interrupt
- OpenAI-compatible provider endpoint (point it at tokenguard or anything else)

## Run

```bash
bun install && bun run build   # -> bin/foxc (+ libopentui.so sidecar)
FOXC_BASE_URL=... FOXC_API_KEY=... FOXC_MODEL=... bin/foxc
```

## Roadmap
- v1: loop · 7 tools · sessions · TUI · MCP client
- v2: ACP server · LSP
- v3: A2A · OpenAI-compat server endpoint · web UI

MIT
