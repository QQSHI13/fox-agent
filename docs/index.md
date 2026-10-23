# fox-agent

A light coding harness with **agent-controlled context**: the agent edits its own
context window natively, so nothing about what the model sees is hidden behind
host-level hacks.

Full machine control, zero permission prompts. A production turn loop with step
caps, retry/backoff, parallel tool execution, abort-safe partial persistence and
auto-compaction near the context limit. SQLite event-sourced sessions. An
OpenAI-compatible gateway first, plus native Anthropic and Google providers. TUI
and headless modes. ACP in both directions. A plugin system.

## Start here

- **[Install](getting-started/install.md)** — prebuilt binary or from source.
- **[Quickstart](getting-started/quickstart.md)** — a provider, a first prompt,
  and where to go next.

## What makes it different

**The agent owns its context.** Every message carries a stable `[N]` marker, and
the `ctx` tool lets the model search, hide and rewrite what it sees — as a view
over an append-only log, so `/undo` can walk any of it back. No summary-only
compaction, no "the harness decided what you get to remember".

**No permission prompts.** `exec`, `pty`, `write`, `edit` and MCP tools run with
your full user privileges in your cwd. That is a deliberate design choice with a
matching [security model](architecture/index.md#security-model) — read it before
pointing fox-agent at code you did not write.

**One turn loop, three protocols.** The TUI, `-p`/`fox json`, ACP and A2A all run
through the same `runTurnCore`. Compaction, hooks and budget behave identically
whichever surface drives a session.

**Extensions are plugins, not forks.** Tools, lifecycle hooks, providers, themes,
MCP servers and delegation targets are one module with a default export. The
built-ins (`pty`, `todo`, `fetch`, `repl`, `task`, `lsp`, `question`, `cost`, the
API formats, the MCP bridge) ship as plugins through the same merge path, so they
can be shadowed or switched off exactly like third-party ones.

## Documentation map

| Section | For |
|---|---|
| [Configuration](configuration/index.md) | The config cascade, every key, env vars |
| [Tools](tools/index.md) | What the model can do, and the contract of each tool |
| [The TUI](tui/index.md) | Keybindings, mouse, themes |
| [Plugins](plugins/index.md) | Writing and managing a plugin |
| [Sessions](sessions/index.md) | Where state lives, forks, prune, delete |
| [Protocols](protocols/index.md) | ACP (server and client), A2A |
| [Architecture](architecture/index.md) | Layout, the event contract, the security model |

## Performance

Harness startup, footprint and idle memory, measured against the field by the
[`bench` workflow](https://github.com/QQSHI13/fox-agent/actions/workflows/bench.yml)
and committed to [`bench/`](https://github.com/QQSHI13/fox-agent/tree/main/bench).
Each run splices its results into the top of the README, so the numbers there are
the latest run rather than figures typed by hand; the method and the honest
caveats are documented in the README's Benchmarks section.

## License

[Apache-2.0](https://github.com/QQSHI13/fox-agent/blob/main/LICENSE)
