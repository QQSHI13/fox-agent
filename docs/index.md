# fox-agent

A light coding harness with **agent-controlled context**: the agent edits its own
context window natively, so nothing about what the model sees is hidden behind
host-level hacks.

Full machine control, zero permission prompts. A production turn loop with step
caps, retry/backoff, parallel tool execution, abort-safe partial persistence, and
agent-driven context management with harness-enforced rails. SQLite event-sourced
sessions. An OpenAI-compatible gateway first, plus native Anthropic and Google
providers. TUI and headless modes. ACP in both directions. A plugin system.

```bash
curl -fsSL https://github.com/QQSHI13/fox-agent/raw/main/install.sh | bash
fox
```

No API key? The TUI opens anyway and `/login` walks you through provider, key,
endpoint and model — then writes the global config and takes effect without a
restart.

## What makes it different

<div class="grid cards" markdown>

-   :material-brain:{ .lg .middle } &nbsp; **The agent owns its context**

    ---

    Every message carries a stable `[N]` marker, and the `ctx` tool lets the model
    search, hide and rewrite what it sees — as a view over an append-only log, so
    `/undo` can walk any of it back. No background summarizer deciding what the
    model gets to remember.

-   :material-shield-off-outline:{ .lg .middle } &nbsp; **No permission prompts**

    ---

    `exec`, `pty`, `write`, `edit` and MCP tools run with your full privileges in
    your cwd. A deliberate choice with a matching
    [security model](architecture/security.md) — read it before pointing
    fox-agent at code you did not write.

-   :material-source-branch:{ .lg .middle } &nbsp; **One turn loop, every surface**

    ---

    The TUI, `-p`/`fox json` and ACP all run through the same `runTurnCore`.
    Compaction, hooks and budget behave identically whichever surface drives a
    session.

-   :material-puzzle-outline:{ .lg .middle } &nbsp; **Extensions are plugins, not forks**

    ---

    Tools, lifecycle hooks, providers, themes, MCP servers and delegation targets
    are one module with a default export. The built-ins ship as plugins through
    the same merge path, so they can be shadowed or switched off exactly like
    third-party ones.

-   :material-database-outline:{ .lg .middle } &nbsp; **Sessions are files, not a service**

    ---

    One SQLite database per session, event-sourced: an append-only message log
    plus a view-ops log. Copy it, delete it, export it as a `.zip`, or render it
    as one offline HTML file to show someone.

-   :material-lightning-bolt-outline:{ .lg .middle } &nbsp; **A compiled binary**

    ---

    Straight from source to a single executable, no `dist` intermediates. Bun
    bytecode and minification are for startup, not for shaving a number off a
    benchmark.

-   :material-connection:{ .lg .middle } &nbsp; **ACP in both directions**

    ---

    Be driven by an editor over `fox --acp`, and delegate to a child agent through
    the `task` tool. The sessions are the same SQLite databases either way, so a
    session started in Zed resumes in the TUI.

</div>

## Start here

<div class="grid cards" markdown>

-   :material-download:{ .lg .middle } &nbsp; **[Install](getting-started/install.md)**

    ---

    Prebuilt binary for Linux and macOS, or from source with Bun. Optional extras
    are listed with what each one costs when it is missing.

-   :material-rocket-launch-outline:{ .lg .middle } &nbsp; **[Quickstart](getting-started/quickstart.md)**

    ---

    A provider, a first prompt, and where to go next — including the headless
    modes that make it scriptable.

-   :material-tune:{ .lg .middle } &nbsp; **[Configuration](configuration/index.md)**

    ---

    The cascade from defaults to CLI flags, every key, and the trust rules that
    decide what a project file may set.

-   :material-console:{ .lg .middle } &nbsp; **[Tools](tools/index.md)**

    ---

    What the model can do, and the exact contract of each tool: caps, cwd rules,
    and failure modes.

-   :material-hammer-wrench:{ .lg .middle } &nbsp; **[Plugins](plugins/index.md)**

    ---

    One module, one default export. Hooks are additive by design, and a plugin can
    wrap a built-in tool instead of replacing it.

-   :material-lifebuoy:{ .lg .middle } &nbsp; **[Troubleshooting](troubleshooting.md)**

    ---

    Grouped by how loud the failure is — won't start, warns and continues, or
    quietly slower than you expected.

</div>

## The documentation map

| Section | For |
|---|---|
| [Getting Started](getting-started/install.md) | Install, first run, headless use |
| [CLI and slash commands](reference/cli.md) | Every flag, subcommand and `/command` |
| [Configuration](configuration/index.md) | The config cascade, every key, env vars |
| [Tools](tools/index.md) | What the model can do, and the contract of each tool |
| [The TUI](tui/index.md) | Keybindings, mouse, steering, themes |
| [Plugins](plugins/index.md) | Writing and managing a plugin |
| [Sessions](sessions/index.md) | Where state lives, forks, prune, delete, export |
| [Protocols](protocols/index.md) | ACP (server and client) |
| [Architecture](architecture/index.md) | Layout, the event contract, the turn loop |
| [Security model](architecture/security.md) | What "no sandbox" actually means |
| [Troubleshooting](troubleshooting.md) | Diagnosing a failure from its symptom |

## Performance

Harness startup, footprint and idle memory, measured against the field by the
[`bench` workflow](https://github.com/QQSHI13/fox-agent/actions/workflows/bench.yml)
and committed to [`bench/`](https://github.com/QQSHI13/fox-agent/tree/main/bench).

Each run splices its results into the top of the README, so the numbers there are
the latest run rather than figures typed by hand; the method and the honest
caveats are documented in the README's Benchmarks section.

## License

[Apache-2.0](https://github.com/QQSHI13/fox-agent/blob/main/LICENSE).
