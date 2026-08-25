# fox 🦊

npm: `fox-agent` · command: `fox`

A light coding harness with **agent-controlled context** — the agent edits its own context window natively (`ctx_edit`), no host hacks.

- Full machine control, zero permission prompts (pi-style)
- Production turn loop: step caps, retry/backoff on 429/5xx, parallel tool execution, abort-safe partial persistence, **auto-compaction** near the context limit
- SQLite event-sourced sessions, one database per session: append-only log + view ops + refs (reverts/forks are queries, not rewrites)
- OpenAI-compatible gateway first (tokenguard etc.) + native Anthropic provider with prompt caching
- Tools: read/write/edit (whitespace-tolerant patch engine)/glob/grep (ripgrep when present)/exec (process-group kill)/pty (tmux pipe-pane, resize-proof)/ctx_edit/todowrite/task (delegation over ACP)/fetch/MCP client
- **ACP both ways**: `fox --acp` serves the Agent Client Protocol to Zed/acpx, and fox drives other ACP agents as a client (that is what `task` is built on)
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
fox --acp                                        # serve ACP on stdio (see below)
```

## Config

Cascade (later wins): defaults ← `~/.config/fox/config.toml` ← project `fox.toml` ← env (`FOX_*`) ← CLI flags.
TOML is the only config format — a malformed file fails loudly, naming the file and the parser error, rather
than being silently ignored. (Pre-1.0 `.fox.json` is rejected with a message telling you what to rename.)
Project instructions are loaded from `AGENTS.md` / `CLAUDE.md` walking up from cwd.

Env vars: `FOX_MODEL`, `FOX_BASE_URL`, `FOX_API_KEY`, `FOX_PROVIDER`, `FOX_MAX_STEPS`, `FOX_COMPACT_AT`, `FOX_RETRY_LIMIT`, `FOX_REQUEST_TIMEOUT_MS`, `FOX_HOME` (state dir, default `~/.local/share/fox`). `OPENAI_BASE_URL` / `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` are honored as fallbacks.

`FOX_REQUEST_TIMEOUT_MS` (default `120000`, `0` disables) bounds **time without progress**, not total
request duration: the clock is rearmed on every streamed chunk, so a model that reasons or writes for
ten minutes is fine, while one that goes quiet past the window fails with a retriable
`provider timed out after Ns with no response`. Lower it if you are pointing fox at a flaky gateway.

`fox.toml` example:

```toml
model = "kimi-k2"
maxSteps = 40
compactAt = 0.85
requestTimeoutMs = 120000

[mcpServers.fs]
command = "npx"
args = ["-y", "@modelcontextprotocol/server-fs", "/tmp"]

# ACP agents the `task` tool may delegate to, by name. "default" is fox itself
# and is always available; it cannot be rebound here.
[agents.reviewer]
command = "some-other-acp-agent"
args = ["--acp"]
```

## ACP (Agent Client Protocol)

fox speaks ACP in both directions, over the same `runTurnCore` the TUI uses — there is no second loop.

**As an agent (server).** `fox --acp` serves ACP on stdio, so any ACP client can drive it:

```jsonc
// Zed settings.json
"agent_servers": { "fox": { "command": "fox", "args": ["--acp"] } }
```

Sessions are the real thing, not a protocol shim: `session/new`, `list`, `load`, `resume`, `fork`, `delete`
and `close` all map onto the same per-session SQLite databases the TUI writes, so a session started in Zed
shows up in `fox ls` and resumes in the TUI. Tool calls, thoughts, token usage and compaction stream as
native ACP updates; `session/cancel` aborts the turn.

Two things a client should know:

- **fox never sends `session/request_permission`.** It is a no-prompt harness (see the security model), so
  tools just run. You will not be asked to approve anything.
- **fox does not use the client's `fs/*` or `terminal/*`.** Its own `read`/`write`/`exec`/`pty` must behave
  identically with no client attached at all, and the exec/pty cwd contracts above are fox's own.

**As a client.** `task` delegates to a child ACP agent — by default another `fox --acp` with the *full* tool
registry, in its own process and its own session, or any agent named in `[agents.*]`. A delegated agent is a
peer, not a reduced-privilege subagent: nothing is withheld from it, including `task` itself, which is why
delegation depth is capped at 3 (`FOX_DELEGATION_DEPTH` carries it across the process boundary). The child's
tool calls stream into the parent's UI live, and its session id is recorded so lineage stays visible.

Unlike `exec`/`pty`/MCP children, an ACP child is **not** given a credential-stripped env — it is a harness
whose whole job is to call a model. What keeps that safe is that the model never chooses the command: it
picks a name from `[agents.*]` or gets fox itself.

## Sessions on disk

One SQLite database per session, so a session can be copied, deleted or corrupted without touching any
other. `index.db` only holds the session list and is rebuildable from `sessions/`.

```
$FOX_HOME (default ~/.local/share/fox)
  index.db              session list (id, cwd, model, title, timestamps)
  sessions/<id>.db      messages + view ops + refs + usage + kv for one session
  pty/                  tmux pipe-pane output logs
```

`/fork` is therefore a file copy — the fork and its source cannot affect each other afterward.

**`/prune`** reclaims the disk that auto-compaction leaves behind. Compaction only *hides* messages (so
`/undo` can bring them back); their text stays in the log. `/prune` reports what it would delete and
changes nothing; `/prune yes` deletes those bodies for good and runs `VACUUM`. It never changes what the
model sees: each compacted span keeps its first row as an empty stub, because that is the row the summary
line is rendered against.

## exec vs pty: opposite cwd rules

Deliberately different, and both are load-bearing:

- **`exec` never drifts.** Every call re-resolves from the session's directory, so a `cd` in one command
  cannot change where the next one runs. `workdir` is per-call and never sticky.
- **`pty` starts there and may drift.** The tmux-backed shell opens in the session directory and then keeps
  whatever directory, environment and running processes it has been given — that persistence is the point
  (`cd build && make`, servers, REPLs). If the tmux session disappears (server killed, reboot), the next
  call says so explicitly instead of handing back a pristine shell that looks unchanged. Likewise, if the
  session directory is gone by the time the shell starts, tmux silently opens in `$HOME` — fox reports where
  it actually landed rather than claiming the directory it asked for.

## Security model

fox is a **trusted-workspace** tool. Read this before pointing it at code you didn't write.

- **No sandbox, no permission prompts.** `exec`, `pty`, `write`, `edit` and MCP tools run with your full user privileges in your cwd. Anything the model decides to run, runs.
- **Prompt injection is the real risk.** Tool output — file contents, `fetch` responses, MCP server replies — enters the context as data the model acts on. A repo or web page can therefore attempt to steer the agent. Treat a fox session on untrusted input as equivalent to running that input's code.
- **API keys are stripped from child processes.** `exec`, `pty` (tmux) and MCP servers get a filtered env (`src/core/childenv.ts`): `FOX_API_KEY`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `*_API_KEY` and `FOX_AUTH*` are removed. Everything else in your env is inherited, so other secrets there are still visible to tools. **ACP agents spawned by `task` are the exception** — they need a key to call a model at all, and the model cannot choose which command runs (see the ACP section).
- **Session data is local and unencrypted**: one SQLite file per session under `FOX_HOME`, containing full transcripts and tool output. `pty/` additionally holds raw shell output logs. Delete a session with ACP `session/delete` (or `deleteSession` in the SDK), which removes the file *and* its `index.db` row; removing only the file leaves it listed as an empty session.
- **MCP servers are arbitrary executables** you configure by command line; fox spawns them and trusts their tool descriptions.

Run it in a container or VM for anything you don't trust.

## Layout

```
src/
  core/       config cascade (TOML), on-disk paths, structured errors, event vocabulary
  store/      per-session sqlite (messages/ops/refs/kv), session index, forks, prune
  context/    view projection + pairing repair, rendering, budgets, compaction
  loop/       turn manager (retries, parallel tools, step caps), system prompt
  providers/  openai-compatible + anthropic (cache_control), model registry
  acp/        ACP server (fox --acp), ACP client (drives other agents), event mapping
  tools/      builtins + MCP bridge + registry
  tui/        ANSI renderer + app
  sdk.ts      library entry (createAgent)
test/         bun test suites (projection, turn manager, patch engine, acp, ...)
```

## Roadmap
- v1 tails: MCP live-test
- v1.5: Plugin API (tools + lifecycle hooks + custom providers)
- v2: LSP diagnostics
- v3: A2A · OpenAI-compat server endpoint · web UI

MIT
