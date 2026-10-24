# fox-agent

[![CI](https://github.com/QQSHI13/fox-agent/actions/workflows/ci.yml/badge.svg)](https://github.com/QQSHI13/fox-agent/actions/workflows/ci.yml)
[![bench](https://github.com/QQSHI13/fox-agent/actions/workflows/bench.yml/badge.svg)](https://github.com/QQSHI13/fox-agent/actions/workflows/bench.yml)
[![release](https://img.shields.io/github/v/release/QQSHI13/fox-agent?include_prereleases)](https://github.com/QQSHI13/fox-agent/releases)
[![license](https://img.shields.io/badge/license-Apache--2.0-blue)](LICENSE)
[![built with bun](https://img.shields.io/badge/built%20with-bun-black)](https://bun.sh)

A light coding harness with **agent-controlled context** -- the agent edits its own context window natively (`ctx_edit`), no host hacks.

Full machine control, zero permission prompts. Production turn loop with step caps, retry/backoff, parallel tool execution, abort-safe partial persistence, and auto-compaction near the context limit. SQLite event-sourced sessions. OpenAI-compatible gateway first plus native Anthropic and Google providers. TUI and headless modes. ACP both ways. Plugin system.

```bash
curl -fsSL https://github.com/QQSHI13/fox-agent/raw/main/install.sh | bash   # -> /usr/local/bin/fox
fox
```

No key? The TUI opens anyway and `/login` walks you through provider setup.

---

## Performance

<!-- bench:start -->
| metric | fox-agent | rank |
|---|---|---|
| TUI 1st byte | **106** | **#1** of 7 |
| TUI 1st paint | **162** | **#1** of 7 |
| TUI 1st input | **480** | **#1** of 7 |
| input latency | **28.8** | **#4** of 7 |
| bundle | **117** | **#2** of 7 |
| idle PSS | **21** | **#1** of 7 |
| `--version` | **53.0** | **#3** of 7 |

fox-agent headless vs scripted local provider: time to first token **427 ms**, peak RSS **53 MB**.

<details><summary>every tool, every metric</summary>

![harness bench dashboard](bench/bench.svg)

| agent | bundle | 1st byte | 1st paint | 1st input | input latency | signal | idle PSS |
|---|---|---|---|---|---|---|---|
| **fox-agent** | 117 MB | 106 ms | 162 ms | 480 ms | 29 ms | render | 21 MB |
| claude code | 242 MB | 1820 ms | 2559 ms | 4285 ms | 61 ms | render | 247 MB |
| codex | — | — | — | — | — | — | — |
| jcode | 135 MB | 3699 ms | 3700 ms | 4501 ms | 15 ms | render | 32 MB |
| pi | 23 MB | 1739 ms | 1815 ms | 2159 ms | 24 ms | render | 78 MB |
| pi-bolt | 260 MB | 467 ms | 488 ms | 705 ms | 10 ms | render | 119 MB |
| gemini cli | — | — | — | — | — | — | — |
| copilot cli | — | — | — | — | — | — | — |
| crush | — | — | — | — | — | — | — |
| aider | — | — | — | — | — | — | — |
| amp | — | — | — | — | — | — | — |
| cursor-agent | — | — | — | — | — | — | — |
| qwen code | — | — | — | — | — | — | — |
| codebuff | — | — | — | — | — | — | — |
| kilo code | — | — | — | — | — | — | — |
| droid | — | — | — | — | — | — | — |
| kimi code | 192 MB | 9281 ms | 9777 ms | 10279 ms | 142 ms | render | 412 MB |
| devin | — | — | — | — | — | — | — |
| cline | — | — | — | — | — | — | — |
| continue | — | — | — | — | — | — | — |
| iflow cli | — | — | — | — | — | — | — |
| opencode v2 | 240 MB | 908 ms | 2737 ms | 3288 ms | 88 ms | render | 107 MB |

</details>

<details><summary>full precision · min/p50/p95 per metric</summary>

| agent | version | bundle (MB) | kind | `--version` min/p50/p95 | 1st byte min/p50/p95 | 1st paint min/p50/p95 | 1st input min/p50/p95 | latency min/p50/p95 | signal | idle PSS (MB) | n |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.6.0 | 116.6 | bin | 31.5/53.0/57.2 | 72.9/106.1/192.5 | 133.4/162.1/242.9 | 402.6/480.4/535.6 | 21.2/28.8/53.8 | render | 21.4 | 5 |
| claude code | 2.1.286 (Claude Code) | 241.7 | bin | 29.1/33.0/37.5 | 1478.6/1819.9/4073.9 | 2188.5/2559.1/5148.6 | 3795.7/4285.2/7152.9 | 43.3/61.0/90.7 | render | 247.3 | 5 |
| codex | n/a (not installed) | — | — | — | — | — | — | — | — | — | — |
| jcode | jcode v0.91.0 (439a243bb) | 135.1 | bin | 54.8/67.7/70.4 | 3353.2/3699.2/4249.2 | 3353.2/3699.7/4249.6 | 4166.4/4500.8/4889.9 | 10.7/14.8/22.3 | render | 31.9 | 5 |
| pi | 1.0.4 | 22.8 | pkg | 869.8/1282.2/1921.2 | 1353.7/1738.7/2078.6 | 1407.9/1815.4/2131.0 | 1694.2/2158.7/2478.8 | 11.5/23.7/33.7 | render | 77.7 | 5 |
| pi-bolt | 1.3.0 (Pi-Bolt 0.9.5, linux-x64, JIT off) | 260.4 | bin | 32.7/35.5/37.1 | 359.2/466.7/1362.4 | 374.3/488.0/1424.6 | 586.6/705.1/1715.6 | 8.2/9.8/14.1 | render | 118.7 | 5 |
| gemini cli | n/a (not installed) | — | — | — | — | — | — | — | — | — | — |
| copilot cli | n/a (not installed) | — | — | — | — | — | — | — | — | — | — |
| crush | n/a (not installed) | — | — | — | — | — | — | — | — | — | — |
| aider | n/a (not installed) | — | — | — | — | — | — | — | — | — | — |
| amp | n/a (not installed) | — | — | — | — | — | — | — | — | — | — |
| cursor-agent | n/a (not installed) | — | — | — | — | — | — | — | — | — | — |
| qwen code | n/a (not installed) | — | — | — | — | — | — | — | — | — | — |
| codebuff | n/a (not installed) | — | — | — | — | — | — | — | — | — | — |
| kilo code | n/a (not installed) | — | — | — | — | — | — | — | — | — | — |
| droid | n/a (not installed) | — | — | — | — | — | — | — | — | — | — |
| kimi code | 2.3.1 | 192.3 | bin | 2843.8/7958.5/8677.1 | 5345.8/9281.3/14170.6 | 5635.5/9776.9/14780.1 | 6056.5/10279.2/17084.3 | 74.5/142.2/763.1 | render | 412.4 | 5 |
| devin | n/a (not installed) | — | — | — | — | — | — | — | — | — | — |
| cline | n/a (not installed) | — | — | — | — | — | — | — | — | — | — |
| continue | n/a (not installed) | — | — | — | — | — | — | — | — | — | — |
| iflow cli | n/a (not installed) | — | — | — | — | — | — | — | — | — | — |
| opencode v2 | opencode v2.1.4 | 240.4 | bin | 328.0/368.1/405.0 | 630.2/907.9/952.5 | 2493.2/2737.0/3314.6 | 2859.5/3288.4/3763.7 | 64.3/87.8/140.7 | render | 107.0 | 5 |

</details>

_Generated 2026-10-24T05:57:12Z on Linux x86_64 (6.18.33.2-microsoft-standard-WSL2), load 7.24 on 4 cpu. [Method and caveats](#benchmarks) · [raw JSON](bench/results.json)_
<!-- bench:end -->

---

## Quick Start

**Prebuilt binary (recommended)** -- Linux and macOS, x64 and arm64:

```bash
curl -fsSL https://github.com/QQSHI13/fox-agent/raw/main/install.sh | bash
```

Binaries self-update with `fox upgrade` (`--beta` for prereleases, `fox upgrade <version>` to pin); downloads are SHA-256 verified and the previous binary is kept as `.fox-previous`.

**From source** (requires [Bun](https://bun.sh) >= 1.4.0):

```bash
git clone https://github.com/QQSHI13/fox-agent.git
cd fox-agent
bun install && bun run build      # -> bin/fox
```

Then point it at a provider:

```bash
export FOX_AGENT_BASE_URL=https://your-provider.com/v1
export FOX_AGENT_API_KEY=sk-...
export FOX_AGENT_MODEL=gpt-4o
fox
```

More: [install options](docs/getting-started/install.md) · [quickstart](docs/getting-started/quickstart.md).

## Usage

```bash
fox                                              # TUI
fox -p "summarize this repo's layout"            # one-shot answer
fox json -p "..."                                # NDJSON agent events
echo "explain src/loop/turn.ts" | fox            # piped prompt
fox mini                                         # plain streaming REPL, no TUI
fox -c                                           # resume latest session
fox acp                                          # serve ACP on stdio
```

`fox -c <n>` indexes the same list `fox ls` prints (most recently worked-in
first, across all directories), resolved through one shared resolver so a
listing and the resume it feeds cannot disagree. The index is a *position*, so
it shifts as you work elsewhere -- script against the id instead: `fox -c <id>`.
The interactive picker (`fox -c` with no argument) lists only *this directory*
by default; press `a` there to widen to all directories.

## Features

- **Tools**: read/write/edit (whitespace-tolerant patch engine)/glob/grep (ripgrep when present)/exec (process-group kill)/pty (tmux, resize-proof)/repl (in-process JS scratchpad)/ctx (search/stats/hide/rewrite your own context)/todo/task (delegation over ACP or A2A)/fetch/MCP client. `read` attaches images, audio and video as media when the active model accepts them.
- **ACP both ways**: `fox --acp` serves the protocol to Zed/acpx; fox also drives other ACP agents as a client (what `task` is built on). Agents configured with a `url` are reached over **A2A**.
- **Plugins**: one module adds tools, lifecycle hooks and custom providers. Global config only.
- **200+ providers** via the models.dev catalog -- `/login` presets prefill endpoint, env var and model lists. Any OpenAI-compatible/Responses, Anthropic or Gemini endpoint works too.
- **Steering mid-turn**: queue messages (stacked above the input; ctrl+up withdraws the last) or ctrl+s to inject after the current tool finishes.
- **TUI on a custom ANSI renderer**: streaming markdown, inline `[N]` message markers, slash commands, `!` shell mode, esc interrupt, mouse selection, themes.
- **Headless**: `-p`, `fox json`, stdin piping, `fox mini`, plus a library API (`createAgent`).
- **SQLite event-sourced sessions**: one database per session; append-only log + view ops + refs, so reverts and forks are queries rather than rewrites.
- **Production turn loop**: step caps, retry/backoff on 429/5xx, parallel tool execution, abort-safe partial persistence, auto-compaction.

---

## Benchmarks

The [Performance](#performance) block is generated by the [`bench` workflow](https://github.com/QQSHI13/fox-agent/actions/workflows/bench.yml) (weekly, on every push, and on demand) and committed to [`bench/`](bench/), so what you see is the latest run rather than numbers typed by hand. Raw data: [`bench/results.json`](bench/results.json).

The default view is one row per metric -- fox-agent's score on each and its rank in the field. The per-tool grid, the graph dashboard, the full-precision record and an explicit list of what could not be measured are folded behind the `<details>` blocks above.

What each metric means:

- **TUI 1st byte**: a real interactive launch -- the binary started in a pty with no args, timed from `exec` to the first byte it writes. Several tools short-circuit `--version` before loading their bundle, so `--version` flatters them; first byte does not.
- **TUI 1st paint**: same launch, to the first printable glyph *outside an escape sequence*. A TUI's first byte is usually cursor bookkeeping (`fox` writes `\e[?1049h\e[?25l` before compositing anything), which is why byte and paint are reported separately instead of one standing in for the other.
- **TUI 1st input**: same launch, timed from `exec` until a typed probe is rendered -- the probe is typed as soon as the app owns the tty (termios `ECHO` off) and has stopped writing.
- **Input latency**: the same measurement once already interactive (ready, settle, type, render) -- the keystroke round-trip alone, with startup cost removed.
- **`--version`**: the harness floor, kept for reference.
- **Bundle**: full install footprint -- the binary for native executables (following launcher wrappers to the binary they hand off to, including wrappers that compute their target at runtime from a version file), the package directory for script CLIs (weighing only a 2 KB loader shim would pretend node and node_modules are free).
- **Idle PSS**: resident cost of the whole process tree at rest, before any model traffic.
- **Time to first token** (fox-agent only): spawn to first text event of a headless `fox -p … --json` turn against the repo's scripted local provider -- no key, no network. Competitors need real credentials for a turn, so there is no honest cross-tool TTFT.

Reading the numbers honestly:

- These measure the *harness*, not the model -- turn latency is dominated by your provider, and every tool here talks to the same APIs.
- **Published numbers are p50, with min and p95 beside them in `bench/table.md`.** Best-of-N alone is not enough: a single lucky launch is not the typical experience, and the spread is often the story (one release of `opencode` measured 101 ms at its best and 1539 ms at p95).
- **A timeout is never a measurement.** A probe that never lands is recorded as a failure, excluded from the statistics, and listed under "what could not be measured" -- it is not published as a slow time and it is not ranked.
- Non-whitespace content on screen is required before typing: a TUI that has taken the tty but painted nothing yet will swallow the keystroke, and typing into it measures the app's boot, not its input handling.
- A tool not installed on the bench machine is an `n/a` row, never an estimate, and is excluded from rank counts rather than ranked last. A row with fewer than three successful samples is reported but not ranked: one lucky launch is not a comparison.
- Ranks are "1 + how many tools were strictly faster", so ties share a rank.
- **Input latency is only comparable between tools that render their own echo.** A tool in cooked mode has the tty line discipline echo each byte before the app wakes -- measured: `cat` in a pty times ~0.3 ms with no UI at all. That number describes the kernel, not the tool, so each row records an `input_signal` (`render` or `kernel-echo`) and ranks are computed within the `render` class only.
- Durations come from a forkless byte stream (`tmux pipe-pane` into a FIFO), not from polling. That matters more than it sounds: the earlier version polled `tmux capture-pane` once per sample, which forks tmux at 9-17 ms a go, so its numbers carried a ~22 ms floor and a jitter it never declared.
- Numbers move with machine load -- `bench/results.json` records the load average and CPU count alongside the rows, because the same tool measured 2.9 s and 10.3 s for first byte on the same box under different load.
- Per-turn behavior -- context handling, tool latency, compaction -- is what actually distinguishes coding agents, and no startup number captures it.

Reproduce locally (measures whatever is on your `PATH`):

```bash
bun run bench                                                   # build + measure; writes bench/
python3 scripts/bench/bench.py --quick --out /tmp/bench         # 2 launches, for smoke tests
python3 scripts/bench/bench.py --only fox-agent,jcode           # a subset of the field
python3 scripts/bench/bench.py --self-test                       # verify the rig itself
```

---

## Configuration

Cascade (later wins): defaults <- `~/.config/fox-agent/config.toml` <- project `fox-agent.toml` <- env (`FOX_AGENT_*`) <- CLI flags. TOML is the only format; a malformed file fails loudly, naming the file and the parser error.

`/settings` lists the scalar knobs with current values, `/settings key=value` changes one (validated, saved globally, applied live), `/settings key=` resets it.

```toml
model = "kimi-k2"
provider = "openrouter"   # a [providers.*] profile name, or a bare API format
maxSteps = 0              # turn step cap; 0 (default) = unlimited
compactAt = 0.85
retryLimit = 3

# Plugins load from the GLOBAL config only -- a plugin runs in fox-agent's own
# process with your credentials, so a project file cannot introduce one.
plugins = ["~/my-fox-plugin.ts"]

# Named provider profiles; apiKey/headers resolve "$ENV" and "!cmd".
[providers.openrouter]
format = "openai-compatible"
baseUrl = "https://openrouter.ai/api/v1"
apiKey = "$OPENROUTER_API_KEY"
defaultModel = "moonshotai/kimi-k2"

[mcpServers.fs]
command = "npx"
args = ["-y", "@modelcontextprotocol/server-fs", "/tmp"]

# Agents the `task` tool may delegate to.
[agents.reviewer]
command = "some-other-acp-agent"
args = ["--acp"]
```

Full reference: [configuration](docs/configuration/index.md) · [environment variables](docs/configuration/environment-variables.md) · [providers and profiles](docs/configuration/providers.md).

### Environment variables

| Variable | Description |
|---|---|
| `FOX_AGENT_MODEL` | Model to use |
| `FOX_AGENT_BASE_URL` | Provider base URL |
| `FOX_AGENT_API_KEY` | API key |
| `FOX_AGENT_PROVIDER` | `openai-compatible` / `openai-responses` / `anthropic` / `google` / plugin name |
| `FOX_AGENT_MAX_STEPS` | Turn step cap (0 = unlimited) |
| `FOX_AGENT_COMPACT_AT` | Context compaction threshold (fraction of the window) |
| `FOX_AGENT_RETRY_LIMIT` | Retry count on 429/5xx |
| `FOX_AGENT_REQUEST_TIMEOUT_MS` | Timeout without progress (default 120000, 0 disables) |
| `FOX_AGENT_HOME` | State dir (default `~/.local/share/fox-agent`) |

`OPENAI_*` / `ANTHROPIC_API_KEY` / `GEMINI_API_KEY` / `GOOGLE_API_KEY` are honored as fallbacks. Unknown keys and non-URL `baseUrl` values surface as warnings, not silent ignores.

`FOX_AGENT_REQUEST_TIMEOUT_MS` bounds **time without progress**, not total duration: the clock is rearmed on every streamed chunk, so a model that reasons for ten minutes is fine while one that goes quiet fails with a retriable error.

---

## Mouse and Selection

fox-agent takes button-event tracking, so it owns the mouse while it runs -- including drags.

- **click** a thinking block or tool output to fold/unfold (fires on *release*, so a misdrag never flips it).
- **drag** across the transcript to select; release copies. Wide characters come back whole.
- **ctrl+c** copies a live selection instead of interrupting; press again with nothing selected to abort the turn. **esc** clears it first.
- Copy tries `powershell.exe` (WSL, UTF-8-safe), `wl-copy`, `xclip`, `pbcopy`, then OSC 52 (works over SSH with no helper).
- Your terminal's native selection still works with the usual override (**shift**-drag, **fn**/**option** on macOS).

## Diagnostics After Every Edit

`edit` and `write` report what the change broke, in the tool result, without the model asking:

```
edited src/loop/turn.ts (1 replacement)
diagnostics (typescript, 1 error):
  src/loop/turn.ts:214:9 error 2322  Type 'number' is not assignable to type 'string'.
```

Servers are found on `PATH`, started on demand, and kept warm. Built in: `typescript-language-server`, `pyright-langserver`, `rust-analyzer`; add others with `[lsp.*]`. Only errors and warnings are reported (capped at 12 per edit) -- hints are dropped on purpose, since "declared but never read" fires legitimately whenever a helper is written in one edit and called in the next.

Everything degrades to silence rather than a failed edit. Turn it off with `diagnostics = false`. Two silent-failure traps: `typescript-language-server` won't start unless `typescript` resolves from the project root, and a file outside `tsconfig.json`'s `include` gets zero diagnostics with no complaint.

## ACP (Agent Client Protocol)

fox speaks ACP in both directions over the same `runTurnCore` the TUI uses -- there is no second loop. As a server, sessions are the real thing: `session/new`, `list`, `load`, `resume`, `fork`, `delete` and `close` map onto the same SQLite databases, so a session started in Zed shows up in `fox ls`. As a client, `task` delegates to another agent -- a spawned `fox --acp` child by default, or any agent named in `[agents.*]` (reached over A2A when configured with a `url`).

Two things a client should know: fox **never** sends `session/request_permission` (it is a no-prompt harness), and it does not use the client's `fs/*` or `terminal/*` -- its own tools must behave identically with no client attached.

Protocol changes need the external check, which drives the real [`acpx`](https://www.npmjs.com/package/acpx) client against `bin/fox` -- the in-process tests share one SDK's idea of the wire format and cannot catch a wrong field name:

```bash
bun run build && bun scripts/acp-accept.ts     # 38 checks
```

Full detail: [ACP](docs/protocols/acp.md) · [A2A](docs/protocols/a2a.md) · [sessions and ACP](docs/agent/sessions-acp.md).

## Plugins

A plugin is one module whose default export is a `FoxPlugin`. It can add tools, hook the turn loop, register providers and themes, pack MCP servers and delegation targets, and add slash commands.

```ts
// ~/my-fox-plugin.ts
import type { FoxPlugin } from "fox-agent";

const plugin: FoxPlugin = {
  name: "mine",
  tools: [{
    def: { name: "ping", description: "...", parameters: { type: "object", properties: {} } },
    async run(args, ctx) { return { ok: true, output: "pong" }; },
  }],
  hooks: {
    onSessionStart({ sessionId, cwd, model }) { /* once per session's first turn */ },
    beforeLLMCall({ sessionId, step, messages, tools }) { return { appendSystem: "extra guidance" }; },
    afterTool({ sessionId, name, args, ok, output }) { return { output: `[seen] ${output}` }; },
  },
};
export default plugin;
```

Load it from your **global** config only:

```toml
plugins = ["~/my-fox-plugin.ts"]     # ~ expands; relative paths resolve against cwd
```

**Why global-only**: every other extension point spawns a *child process*, but a plugin is imported into fox-agent's own process and gets your whole environment, API key included. So "clone a repo, cd in, run fox" must not be able to execute that repo's code.

Hooks are **additive by design**: `beforeLLMCall` can only append to the system prompt and `afterTool` can only replace one tool's output text -- neither can reorder or drop messages, because `renderContext` guarantees every `tool_call` is followed by its `tool_result`. Keep appends byte-stable across steps: the system prompt is the provider's cached prefix, so injecting a clock or counter re-bills it and every message behind it on every step.

`pty`, `todo`, `fetch`, `repl`, each API format and the MCP bridge all ship as plugins (`bundled:pty`, `bundled:anthropic`, ...), so a user plugin can shadow or `disabledPlugins` can switch off a bundled capability the same way. `/plugin` (or `fox plugin`) lists everything and flips it; failure is always a warning, never a throw.

Full detail: [plugins](docs/plugins/index.md) · [plugin authoring](docs/agent/plugins.md).

## Sessions on Disk

One SQLite database per session, so a session can be copied, deleted or corrupted without touching any other. `index.db` only holds the session list and is rebuildable from `sessions/`.

```
$FOX_AGENT_HOME (default ~/.local/share/fox-agent)
  index.db              session list (id, cwd, model, title, timestamps)
  sessions/<id>.db      messages + view ops + refs + usage + kv for one session
  locks/<id>.json       open-session markers (read-only mode for a second opener)
  pty/                  tmux pipe-pane output logs
```

`/fork` is therefore a file copy. `/delete <id|n> yes` removes a session's database and index row together; it refuses the session you are currently in (`/new` first). `/prune` reclaims the disk auto-compaction leaves behind: compaction only *hides* messages so `/undo` can bring them back, while `/prune yes` deletes those bodies for good and runs `VACUUM`.

Full detail: [sessions](docs/sessions/index.md).

## exec vs pty: Opposite cwd Rules

Deliberately different, and both are load-bearing:

- **`exec` never drifts.** Every call re-resolves from the session's directory, so a `cd` in one command cannot change where the next runs. `workdir` is per-call and never sticky.
- **`pty` starts there and may drift.** The tmux-backed shell keeps whatever directory, environment and processes it has been given -- that persistence is the point (`cd build && make`, servers, REPLs). If the tmux session vanished, the next call says so rather than handing back a pristine shell that looks unchanged.

Full detail: [exec and pty](docs/tools/exec-pty.md).

## Security Model

fox-agent is a **trusted-workspace** tool. Read this before pointing it at code you didn't write.

- **No sandbox, no permission prompts.** `exec`, `pty`, `write`, `edit` and MCP tools run with your full user privileges in your cwd.
- **Prompt injection is the real risk.** Tool output -- file contents, `fetch` responses, MCP replies -- enters the context as data the model acts on, so a repo or web page can attempt to steer the agent. Treat a session on untrusted input as equivalent to running that input's code.
- **No credential stripping.** Children (`exec`, `pty`, MCP servers, language servers, ACP agents) inherit `process.env` unfiltered -- keys live in `~/.bashrc` and the agent can read those directly, so stripping `*_API_KEY` was theater.
- **Session data is local and unencrypted**: full transcripts and tool output in SQLite under `FOX_AGENT_HOME`; `pty/` holds raw shell logs.
- **A plugin is code inside fox-agent**, not a child -- which is why `plugins` is read from the global config only.
- **Trust gate.** On TUI start fox-agent shows the working directory and asks whether the folder is trusted (one keypress). In an **untrusted** directory, project executable sections (`[mcpServers.*]` / `[agents.*]` / `[lsp.*]` / `[providers.*]` incl. `!cmd`) plus project `baseUrl`/`apiKey` are ignored with warnings; safe keys still apply. Headless/ACP never prompt -- they run restricted instead. `AGENTS.md`/`CLAUDE.md` and any file the agent reads can still steer it.
- **`fetch` cannot reach the local network.** Loopback/private/link-local hosts and cloud metadata are refused, every redirect hop is re-checked. Set `FOX_AGENT_ALLOW_PRIVATE_FETCH=1` to fetch local URLs deliberately.

Run it in a container or VM for anything you don't trust.

## Layout

```
src/
  core/       config cascade (TOML), on-disk paths, errors, event vocabulary
  store/      per-session sqlite (messages/ops/refs/kv), session index, forks, prune
  context/    view projection + pairing repair, rendering, budgets, compaction
  loop/       turn manager (retries, parallel tools, step caps), system prompt
  providers/  openai-compatible/responses + anthropic + google, models.dev catalog
  acp/        ACP server, ACP client, event mapping
  lsp/        language server pool, frame codec, diagnostic formatting
  tools/      builtins + MCP bridge + registry
  plugins/    plugin loader + public FoxPlugin/PluginHooks types
  tui/        ANSI renderer + app
  sdk.ts      library entry (createAgent)
test/         bun test suites
scripts/      acp-accept.ts -- drives bin/fox --acp with a real external ACP client
```

Architecture notes: [docs/architecture](docs/architecture/index.md).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). The short version:

```bash
bun install
bun run build
bun run typecheck    # must be clean
bun test             # must be 0 failures
```

Protocol changes under `src/acp/` additionally need `bun run build && bun scripts/acp-accept.ts`.

## Star History

<a href="https://star-history.com/#QQSHI13/fox-agent&Date">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=QQSHI13/fox-agent&type=Date&theme=dark" />
    <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=QQSHI13/fox-agent&type=Date" />
    <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=QQSHI13/fox-agent&type=Date" />
  </picture>
</a>

## License

[Apache-2.0](LICENSE)
