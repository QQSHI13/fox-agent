# fox-agent 🦊

npm: `fox-agent` · command: `fox`

A light coding harness with **agent-controlled context** — the agent edits its own context window natively (`ctx_edit`), no host hacks.

- Full machine control, zero permission prompts (pi-style)
- Production turn loop: step caps, retry/backoff on 429/5xx, parallel tool execution, abort-safe partial persistence, **auto-compaction** near the context limit
- SQLite event-sourced sessions, one database per session: append-only log + view ops + refs (reverts/forks are queries, not rewrites)
- OpenAI-compatible gateway first (tokenguard etc.) + native Anthropic (prompt caching) and Google/Gemini providers
- Tools: read/write/edit (whitespace-tolerant patch engine)/glob/grep (ripgrep when present)/exec (process-group kill)/pty (tmux pipe-pane, resize-proof)/ctx_edit/todowrite/task (delegation over ACP or A2A)/fetch/MCP client. `read` attaches images, audio and video as media when the active model accepts them (gemini: all three; gpt/claude families: images)
- **ACP both ways**: `fox --acp` serves the Agent Client Protocol to Zed/acpx, and fox drives other ACP agents as a client (that is what `task` is built on); agents configured with a `url` are reached over **A2A** (HTTP/JSON-RPC, SSE streaming when offered)
- **Plugins**: one module adds tools, lifecycle hooks (`onSessionStart`/`beforeLLMCall`/`afterTool`) and custom providers; global config only, and a broken one costs a warning rather than the run
- TUI on custom ANSI renderer: streaming markdown, inline `[mN]` markers, slash commands, `!` shell mode, esc interrupt
- Headless: `-p "prompt"` one-shot, `--json` NDJSON event stream, stdin piping — plus a library API (`createAgent`)

## Run

```bash
bun install && bun run build   # -> bin/fox
FOX_AGENT_BASE_URL=... FOX_AGENT_API_KEY=... FOX_AGENT_MODEL=... bin/fox
```

Headless examples:

```bash
fox -p "summarize this repo's layout"            # one-shot answer
fox -p "..." --json                              # NDJSON agent events
echo "explain src/loop/turn.ts" | fox            # piped prompt
fox -c                                           # resume latest session here (picker in a terminal)
fox -c 2                                         # resume by 'fox ls' index, or by id
fox --acp                                        # serve ACP on stdio (see below)
```

## Mouse and selection

fox-agent puts the terminal into button-event tracking, so it owns the mouse while it
runs — including drags, which your terminal's own selection normally handles.

- **click** a thinking block or tool output to fold/unfold it. The toggle fires
  when you *release* the button, so a misdrag never flips it.
- **drag** across the transcript to select; release copies. Selection follows
  what is on screen, so wide characters (CJK, emoji) come back whole and
  trailing padding from wrapping is stripped.
- **ctrl+c** copies a live selection instead of interrupting; press it again
  with nothing selected to abort the turn. **esc** clears the selection first.
- copy tries `powershell.exe` (WSL, UTF-8-safe — `clip.exe` mangles non-ASCII
  through the console codepage), `wl-copy`, `xclip`, `pbcopy`, then OSC 52 — the
  last of which works over SSH with no helper installed.
- your terminal's native selection is still available with the usual override
  key (**shift**-drag in most terminals, **fn** or **option** on macOS).

## Config

Cascade (later wins): defaults ← `~/.config/fox-agent/config.toml` ← project `fox-agent.toml` ← env (`FOX_AGENT_*`) ← CLI flags.
TOML is the only config format — a malformed file fails loudly, naming the file and the parser error, rather
than being silently ignored. (Pre-1.0 `.fox.json` is rejected with a message telling you what to rename.)
Project instructions are loaded from every `AGENTS.md` / `CLAUDE.md` on the path from the filesystem root
down to cwd, each labeled with its own path so relative paths in it resolve against the right directory.

Env vars: `FOX_AGENT_MODEL`, `FOX_AGENT_BASE_URL`, `FOX_AGENT_API_KEY`, `FOX_AGENT_PROVIDER` (`openai-compatible` | `anthropic` | `google` | a plugin-registered name), `FOX_AGENT_MAX_STEPS`, `FOX_AGENT_COMPACT_AT`, `FOX_AGENT_RETRY_LIMIT`, `FOX_AGENT_REQUEST_TIMEOUT_MS`, `FOX_AGENT_DIAGNOSTICS` (`0`/`false`/`no` turns off post-edit diagnostics), `FOX_AGENT_HOME` (state dir, default `~/.local/share/fox-agent`). `OPENAI_BASE_URL` / `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `GEMINI_API_KEY` / `GOOGLE_API_KEY` are honored as fallbacks.

No key at all? The TUI opens anyway and `/login` walks you through provider, key, base URL and model as an
interactive wizard (the key is typed masked), writes `~/.config/fox-agent/config.toml` and takes effect without
a restart. Headless clients use kv pairs instead: `/login provider=<p> key=<k> [baseUrl=<u>] [model=<m>]`.

`FOX_AGENT_REQUEST_TIMEOUT_MS` (default `120000`, `0` disables) bounds **time without progress**, not total
request duration: the clock is rearmed on every streamed chunk, so a model that reasons or writes for
ten minutes is fine, while one that goes quiet past the window fails with a retriable
`provider timed out after Ns with no response`. Lower it if you are pointing fox-agent at a flaky gateway.

`fox-agent.toml` example:

```toml
model = "kimi-k2"
maxSteps = 0              # turn step cap; 0 (the default) = unlimited
compactAt = 0.85
retryLimit = 3
requestTimeoutMs = 120000
diagnostics = true          # report type errors after each edit (default true)

# Plugins are read from the GLOBAL config only — a plugin runs in fox-agent's own
# process with your credentials, so a project file cannot introduce one.
# (In ~/.config/fox-agent/config.toml; ignored with a warning if put in fox-agent.toml.)
plugins = ["~/my-fox-plugin.ts"]

[mcpServers.fs]
command = "npx"
args = ["-y", "@modelcontextprotocol/server-fs", "/tmp"]

# Agents the `task` tool may delegate to, by name. "default" is fox-agent itself
# and is always available; it cannot be rebound here. The protocol follows the
# entry's shape: `command` spawns a child and speaks ACP, `url` reaches a
# running agent over HTTP and speaks A2A.
[agents.reviewer]
command = "some-other-acp-agent"
args = ["--acp"]

[agents.remote]
url = "https://agent.example.com"
headers = { authorization = "Bearer token" }

# Extra language servers for diagnostics. TypeScript, Python and Rust are
# built in; a table here adds a language or overrides a built-in by extension.
[lsp.gopls]
command = "gopls"
extensions = [".go"]        # "go" works too
rootMarkers = ["go.mod"]    # nearest ancestor holding one becomes the project root
```

## Diagnostics after every edit

`edit` and `write` report what the change broke, in the tool result, without the model asking:

```
edited src/loop/turn.ts (1 replacement)
diagnostics (typescript, 1 error):
  src/loop/turn.ts:214:9 error 2322  Type 'number' is not assignable to type 'string'.
```

Servers are found on `PATH` and started on demand, one per project root, then kept warm — measured on this
repo, a cold `typescript-language-server` takes ~4s to first answer and ~1s per edit after that, against
11.5s for `tsc --noEmit`. Built in: `typescript-language-server` (ts/tsx/js/jsx/mjs/cjs),
`pyright-langserver` (py/pyi), `rust-analyzer` (rs). Add others with `[lsp.*]`.

Only **errors and warnings** are reported, capped at 12 per edit. Hints are dropped on purpose: "declared but
never read" fires legitimately whenever a helper is written in one edit and called in the next, and reporting
it trains the model to chase noise. Multi-line messages (TS overload dumps, rustc explanations) are collapsed
to their first line.

Everything here degrades to silence rather than to a failed edit — no server installed, a server that won't
start, one that hangs, a project too big to analyze in time: the edit still succeeded, and it is reported as
such. When no language server applies, fox-agent falls back to its own bracket-balance check. Turn the whole thing
off with `diagnostics = false` or `FOX_AGENT_DIAGNOSTICS=0`.

Two traps worth knowing if diagnostics stay suspiciously quiet, both of which fail *silently* rather than
erroring: `typescript-language-server` refuses to start unless `typescript` resolves from the project root
(`npm i -D typescript`), and a file outside `tsconfig.json`'s `include` gets zero diagnostics with no
complaint.

## ACP (Agent Client Protocol)

fox-agent speaks ACP in both directions, over the same `runTurnCore` the TUI uses — there is no second loop.

**As an agent (server).** `fox --acp` serves ACP on stdio, so any ACP client can drive it:

```jsonc
// Zed settings.json
"agent_servers": { "fox-agent": { "command": "fox", "args": ["--acp"] } }
```

Sessions are the real thing, not a protocol shim: `session/new`, `list`, `load`, `resume`, `fork`, `delete`
and `close` all map onto the same per-session SQLite databases the TUI writes, so a session started in Zed
shows up in `fox ls` and resumes in the TUI. Tool calls, thoughts, token usage and compaction stream as
native ACP updates; `session/cancel` aborts the turn.

Two things a client should know:

- **fox-agent never sends `session/request_permission`.** It is a no-prompt harness (see the security model), so
  tools just run. You will not be asked to approve anything.
- **fox-agent does not use the client's `fs/*` or `terminal/*`.** Its own `read`/`write`/`exec`/`pty` must behave
  identically with no client attached at all, and the exec/pty cwd contracts above are fox-agent's own.

**Verifying a protocol change.** The in-repo ACP tests pair fox-agent's agent to a client *in the same process*,
which means both ends share one SDK's idea of the wire format — a wrong field name or a capability that is
advertised but mishandled passes all of them. `scripts/acp-accept.ts` is the check that cannot: it builds
`bin/fox`, starts a scripted local provider (no API key, no network), and drives the binary with the real
external [`acpx`](https://www.npmjs.com/package/acpx) client.

```bash
bun run build && bun scripts/acp-accept.ts     # 38 checks
```

It covers `initialize` (protocol version and every advertised session capability), `session/new`,
`session/prompt` streaming to `stopReason: "end_turn"`, the `tool_call{pending}` →
`tool_call_update{completed}` pair with the file verified on disk, `session/list` answered by the agent
rather than by acpx's own records, and — by a direct spawn-and-read of fox-agent's stdout rather than by reading
acpx's output — that **every line fox-agent writes to stdout is a JSON frame**. That last one has to be a direct
probe: acpx's `--json-strict` governs *acpx's* stderr, and its ndjson reader silently skips a line it cannot
parse, so a stray `console.log` in the server is invisible from the outside. Run this after any change to
`src/acp/`. `test/acp.live.test.ts` runs it under `bun test` when both acpx and `bin/fox` are present, and
skips with a reason when they are not.

**As a client.** `task` delegates to another agent — by default a spawned `fox --acp` child with the *full* tool
registry, in its own process and its own session, or any agent named in `[agents.*]`. The protocol follows the
entry's shape: `command` spawns a child and speaks ACP (tool calls stream into the parent's UI live), `url` reaches
a running agent over HTTP and speaks A2A (the final report arrives when the remote task completes). A delegated
agent is a
peer, not a reduced-privilege subagent: nothing is withheld from it, including `task` itself, which is why
delegation depth is capped at 3 (`FOX_AGENT_DELEGATION_DEPTH` carries it across the process boundary). The child's
session id is recorded so lineage stays visible.

Unlike `exec`/`pty`/MCP children, an ACP child is **not** given a credential-stripped env — it is a harness
whose whole job is to call a model. What keeps that safe is that the model never chooses the command: it
picks a name from `[agents.*]` or gets fox-agent itself.

## Plugins

A plugin is one module with a default export. It can add tools, hook the turn loop, and register providers:

```ts
// ~/my-fox-plugin.ts
import type { FoxPlugin } from "fox-agent";

const plugin: FoxPlugin = {
  name: "mine",                    // required; every warning about this plugin is keyed on it

  // structurally identical to a built-in tool — no adapter layer
  tools: [{
    def: { name: "ping", description: "…", parameters: { type: "object", properties: {} } },
    async run(args, ctx) { return { ok: true, output: "pong" }; },
  }],

  hooks: {
    onSessionStart({ sessionId, cwd, model }) { /* fires once, on a session's first turn */ },
    beforeLLMCall({ sessionId, step, messages, tools }) { return { appendSystem: "extra guidance" }; },
    afterTool({ sessionId, name, args, ok, output }) { return { output: `[seen] ${output}` }; },
  },

  providers: {
    // keyed by the `provider` config value, so `provider = "mine-gateway"` resolves here
    async *["mine-gateway"](cfg, messages, tools, signal) { /* yield StreamEvents */ },
  },
};
export default plugin;
```

Load it from your **global** config only:

```toml
# ~/.config/fox-agent/config.toml
plugins = ["~/my-fox-plugin.ts"]     # ~ expands; relative paths resolve against cwd
```

**Why global-only.** A `plugins` entry in a project `fox-agent.toml` is ignored, with a warning saying so. Every
other extension point — `[mcpServers.*]`, `[agents.*]`, `[lsp.*]` — spawns a *child process* through
`childEnv()`, which strips `*_API_KEY` and `FOX_AGENT_AUTH*`. A plugin cannot be sandboxed that way: it is imported
into fox-agent's own process and gets your whole environment, including your API key. So "clone a repo, cd in, run
fox" must not be able to execute that repo's code. Naming a plugin is a decision about your machine, and it
lives in the file only you write.

**Hooks are additive by design.** `beforeLLMCall` can only *append* to the system prompt and `afterTool` can
only *replace one tool's output text* — neither can reorder or drop messages. That is deliberate:
`renderContext` guarantees every assistant `tool_call` is followed by its `tool_result`, and a provider
hard-400s on an orphan. A hook that returned a message array would put that invariant in every plugin
author's hands, with a failure that surfaces as an opaque API error naming nothing. `messages` is still passed
in full, to decide *with*.

`afterTool` runs between the tool and the transcript write, so the patched text is the only version in the
system — what gets stored, what the model reads on the next step, and what the `tool_end` event reports are
the same string.

A plugin tool needs no prompt work; `buildSystemPrompt` derives its roster from the live registry, so the tool
appears automatically. A plugin registering a name that already exists shadows it and the collision is
reported as a warning — allowed, but never silent. Redefining a built-in *provider* name is not allowed.

**Failure is always a warning, never a throw.** A plugin that throws at import, exports the wrong shape, or
points at a missing file costs you one `warn` line at the top of the turn — the same treatment an unreachable
MCP server gets. A hook that throws mid-turn is caught per call, so a typo in `afterTool` cannot take down a
turn that has already done real work.

A plugin tool can also ask the user questions mid-run: `ctx.ui` is a `UiBridge` with `select` (an option
menu), `input` (a text field, optionally masked) and `wizard` (a multi-step mix of both). It exists only on
interactive hosts — check for it and treat a `undefined` answer as "the user cancelled".

The types (`FoxPlugin`, `PluginHooks`, and the context/patch types for each hook) are re-exported from
`fox-agent`, alongside `Tool`, `ToolContext`, `ok`/`fail`, `ChatFn` and `UiBridge`/`UiStep`.

## Sessions on disk

One SQLite database per session, so a session can be copied, deleted or corrupted without touching any
other. `index.db` only holds the session list and is rebuildable from `sessions/`.

```
$FOX_AGENT_HOME (default ~/.local/share/fox-agent)
  index.db              session list (id, cwd, model, title, timestamps)
  sessions/<id>.db      messages + view ops + refs + usage + kv for one session
  pty/                  tmux pipe-pane output logs
```

`/fork` is therefore a file copy — the fork and its source cannot affect each other afterward.

**`/delete <id|n> yes`** removes a session's database and its index row together. It refuses the session you
are currently in — its database handle is open and the turn loop is appending to it, so unlinking the file
underneath would leave fox-agent writing into a vanished inode with nothing to show for it. `/new` first, then
delete. Unlike `/prune`, `/undo` cannot walk this back. (Bare `/delete` in the TUI opens the session picker,
which has its own delete-with-confirm key.)

**`/prune`** reclaims the disk that auto-compaction leaves behind. Compaction only *hides* messages (so
`/undo` can bring them back); their text stays in the log. `/prune` reports what it would delete and
changes nothing; `/prune yes` deletes those bodies for good and runs `VACUUM`. In the TUI a bare `/prune`
asks with a menu instead of the two-step. It never changes what the
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
  session directory is gone by the time the shell starts, tmux silently opens in `$HOME` — fox-agent reports where
  it actually landed rather than claiming the directory it asked for.

## Security model

fox-agent is a **trusted-workspace** tool. Read this before pointing it at code you didn't write.

- **No sandbox, no permission prompts.** `exec`, `pty`, `write`, `edit` and MCP tools run with your full user privileges in your cwd. Anything the model decides to run, runs.
- **Prompt injection is the real risk.** Tool output — file contents, `fetch` responses, MCP server replies — enters the context as data the model acts on. A repo or web page can therefore attempt to steer the agent. Treat a fox-agent session on untrusted input as equivalent to running that input's code.
- **API keys are stripped from child processes.** `exec`, `pty` (tmux) and MCP servers get a filtered env (`src/core/childenv.ts`): `FOX_AGENT_API_KEY`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `*_API_KEY` and `FOX_AGENT_AUTH*` are removed. Everything else in your env is inherited, so other secrets there are still visible to tools. **ACP agents spawned by `task` are the exception** — they need a key to call a model at all, and the model cannot choose which command runs (see the ACP section).
- **Session data is local and unencrypted**: one SQLite file per session under `FOX_AGENT_HOME`, containing full transcripts and tool output. `pty/` additionally holds raw shell output logs. Delete a session with `/delete <id> yes` in the TUI or ACP `session/delete` (`deleteSession` in the SDK), which removes the file *and* its `index.db` row; removing only the file leaves it listed as an empty session.
- **MCP servers are arbitrary executables** you configure by command line; fox-agent spawns them and trusts their tool descriptions.
- **A plugin is not a child process — it is code inside fox-agent.** It is imported into fox-agent's own process with your full environment, API key included, and can do anything fox-agent can. That is why `plugins` is read from `~/.config/fox-agent/config.toml` only and ignored (with a warning) in a project `fox-agent.toml`: cloning a repo and running fox in it must never execute that repo's code. Vet a plugin the way you would vet a shell profile.
- **Language servers are spawned automatically** when diagnostics are on (the default): a built-in server found on `PATH`, or any command you name in `[lsp.*]`, started in the project root and shown the contents of files fox-agent edits. Servers get the same key-stripped env as `exec`. Unlike MCP, no server runs unless it is already installed — but a `PATH` you don't control means a program you don't control. `diagnostics = false` disables it.

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
  lsp/        language server pool, frame codec, diagnostic formatting
  tools/      builtins + MCP bridge + registry
  plugins/    plugin loader + the public FoxPlugin/PluginHooks types
  tui/        ANSI renderer + app
  sdk.ts      library entry (createAgent)
test/         bun test suites (projection, turn manager, patch engine, acp, lsp, plugins, ...)
scripts/      acp-accept.ts — drives bin/fox --acp with a real external ACP client
```
