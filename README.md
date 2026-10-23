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
| TUI 1st byte | **15 ms** | **#3** of 23 |
| TUI 1st input | — | — |
| input latency | — | — |
| bundle | **117 MB** | **#4** of 23 |
| idle PSS | **36 MB** | **#2** of 22 |
| `--version` | **7 ms** | **#2** of 23 |

fox-agent headless vs scripted local provider: time to first token **53 ms**, peak RSS **57 MB**.

<details><summary>every tool, every metric</summary>

![harness bench dashboard](bench/bench.svg)

| agent | bundle | `--version` | TUI 1st byte | TUI 1st input | input latency | signal | idle PSS |
|---|---|---|---|---|---|---|---|
| **fox-agent** | 117 MB | 7 ms | 15 ms | — | — | render | 36 MB |
| claude code | 293 MB | 12 ms | 244 ms | — | — | render | 196 MB |
| codex | 444 MB | 42 ms | 45 ms | — | — | render | 49 MB |
| opencode v2 | 207 MB | 81 ms | 138 ms | 500 ms | 67 ms | render | 131 MB |
| jcode | 171 MB | 9 ms | 12 ms | — | — | render | 32 MB |
| pi | 112 MB | 254 ms | 330 ms | 826 ms | 8 ms | render | 130 MB |
| pi-bolt | 262 MB | 12 ms | 43 ms | 523 ms | 2 ms | render | 97 MB |
| gemini cli | 103 MB | 1556 ms | 1630 ms | 1664 ms | 0 ms | kernel-echo (tty) | 146 MB |
| copilot cli | 198 MB | 107 ms | 799 ms | — | — | render | 47 MB |
| crush | 129 MB | 135 ms | 597 ms | — | — | render | 69 MB |
| goose | 304 MB | 7 ms | 8 ms | 236 ms | — | kernel-echo (tty) | — |
| aider | 643 MB | 843 ms | 758 ms | 1142 ms | 11 ms | render | 67 MB |
| amp | 161 MB | 226 ms | 224 ms | 584 ms | 1 ms | render | 140 MB |
| cursor-agent | 583 MB | 478 ms | 461 ms | — | — | render | 253 MB |
| qwen code | 155 MB | 38 ms | 830 ms | — | — | render | 240 MB |
| codebuff | 140 MB | 940 ms | 908 ms | — | — | render | 58 MB |
| kilo code | 719 MB | 838 ms | 2269 ms | — | — | render | 46 MB |
| droid | 319 MB | 111 ms | 149 ms | — | — | render | 346 MB |
| kimi code | 192 MB | 594 ms | 756 ms | — | — | render | 330 MB |
| devin | 217 MB | 4 ms | 23 ms | — | — | render | 93 MB |
| cline | 330 MB | 933 ms | 1144 ms | — | — | render | 55 MB |
| continue | 83 MB | 1136 ms | 1334 ms | — | — | render | 320 MB |
| iflow cli | 180 MB | 1235 ms | 1312 ms | 2518 ms | 47 ms | render | 56 MB |

</details>

<details><summary>full precision · all collected fields</summary>

| agent | version | bin | bundle (MB) | bundle kind | `--version` (ms) | TUI 1st byte (ms) | TUI 1st input (ms) | input latency (ms) | signal | idle PSS (MB) |
|---|---|---|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.6.0 | `/home/runner/work/fox-agent/fox-agent/bin/fox` | 116.6 | bin | 6.8 | 15.5 | — | — | render | 36.1 |
| claude code | 2.1.309 (Claude Code) | `/home/runner/.npm-global/bin/claude` | 293.5 | bin | 11.6 | 243.9 | — | — | render | 195.9 |
| codex | codex-cli 0.164.0 | `/home/runner/.npm-global/bin/codex` | 444.4 | pkg | 41.7 | 45.0 | — | — | render | 49.1 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | `/home/runner/.npm-global/bin/opencode2` | 207.4 | bin | 81.1 | 138.3 | 499.7 | 66.7 | render | 131.1 |
| jcode | jcode v0.99.1 (7206efd0c) | `/home/runner/.local/bin/jcode` | 171.3 | bin | 9.2 | 11.9 | — | — | render | 32.1 |
| pi | 1.4.0 | `/home/runner/.npm-global/bin/pi` | 111.8 | pkg | 254.1 | 329.9 | 825.7 | 8.4 | render | 130.2 |
| pi-bolt | 1.4.0 (Pi-Bolt 0.9.9, linux-x64, JIT off) | `/home/runner/.local/bin/pi-bolt` | 262.0 | bin | 12.5 | 42.8 | 522.9 | 1.8 | render | 96.7 |
| gemini cli | 0.65.0 | `/home/runner/.npm-global/bin/gemini` | 102.6 | pkg | 1556.2 | 1630.2 | 1663.9 | 0.1 | kernel-echo | 146.1 |
| copilot cli | GitHub Copilot CLI 1.0.103. | `/home/runner/.npm-global/bin/copilot` | 198.5 | pkg | 107.2 | 799.0 | — | — | render | 47.3 |
| crush | crush version v0.98.1 | `/home/runner/.npm-global/bin/crush` | 128.7 | pkg | 135.2 | 597.4 | — | — | render | 68.8 |
| goose | 1.55.0 | `/home/runner/.local/bin/goose` | 304.0 | bin | 7.5 | 8.1 | 236.0 | — | kernel-echo | — |
| aider | aider 0.86.2 | `/home/runner/work/fox-agent/fox-agent/.venv-bench/bin/aider` | 642.8 | pkg | 842.7 | 757.8 | 1141.6 | 10.6 | render | 66.9 |
| amp | 0.0.1792756861-g6187a2 (released 2026-10-23T12:01:01.000Z, 1 | `/home/runner/.local/bin/amp` | 161.0 | bin | 226.1 | 224.1 | 584.1 | 0.9 | render | 139.7 |
| cursor-agent | 2026.10.22-27dcf5f | `/home/runner/.local/bin/cursor-agent` | 583.2 | pkg | 478.4 | 461.2 | — | — | render | 252.6 |
| qwen code | 0.26.0 | `/home/runner/.npm-global/bin/qwen` | 154.7 | pkg | 37.9 | 829.8 | — | — | render | 239.5 |
| codebuff | 1.0.688 | `/home/runner/.npm-global/bin/codebuff` | 140.0 | bin | 939.9 | 907.5 | — | — | render | 57.6 |
| kilo code | 7.8.17 | `/home/runner/.npm-global/bin/kilocode` | 718.6 | pkg | 837.7 | 2269.0 | — | — | render | 46.2 |
| droid | 0.248.0 | `/home/runner/.local/bin/droid` | 319.2 | bin | 111.1 | 149.5 | — | — | render | 346.2 |
| kimi code | 2.3.1 | `/home/runner/.kimi-code/bin/kimi` | 192.3 | bin | 594.4 | 755.9 | — | — | render | 329.6 |
| devin | devin 3000.11.205 (6dea39440ae3) | `/home/runner/.local/bin/devin` | 217.5 | bin | 4.5 | 22.9 | — | — | render | 93.1 |
| cline | 3.0.73 | `/home/runner/.npm-global/bin/cline` | 330.3 | pkg | 933.3 | 1144.0 | — | — | render | 54.9 |
| continue | 1.5.47 | `/home/runner/.npm-global/bin/cn` | 82.7 | pkg | 1136.2 | 1333.5 | — | — | render | 319.9 |
| iflow cli | 0.5.19 | `/home/runner/.npm-global/bin/iflow` | 180.2 | pkg | 1234.8 | 1312.4 | 2518.3 | 47.1 | render | 55.5 |

</details>

_Generated 2026-10-23T13:51:18Z on Linux x86_64 (6.17.0-1022-azure). [Method and caveats](#benchmarks) · [raw JSON](bench/results.json)_
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

The default view is six rows -- fox-agent's score on each metric and its rank in the field. The per-tool grid, the graph dashboard and the full-precision record are folded behind the two `<details>` blocks above.

What each metric means:

- **TUI 1st byte**: a real interactive launch -- the binary started under a PTY with no args, timed to its first output byte, best of 5. Several tools short-circuit `--version` before loading their bundle, so `--version` flatters them; first byte does not.
- **TUI 1st input**: same launch, then a probe string typed the moment the app goes quiet, timed until the probe *text is rendered on screen*, best of 3.
- **Input latency**: the same measurement once already interactive (ready, 500ms settle, type, render) -- the keystroke round-trip alone, with startup cost removed.
- **`--version`**: the harness floor, best of 4, kept for reference.
- **Bundle**: full install footprint -- the binary for native executables (following launcher wrappers to the binary they hand off to), the package directory for script CLIs (weighing only a 2 KB loader shim would pretend node and node_modules are free).
- **Idle PSS**: resident cost of the TUI at rest after a 1.5s settle, before any model traffic.
- **Time to first token** (fox-agent only): spawn to first text event of a headless `fox -p … --json` turn against the repo's scripted local provider -- no key, no network. Competitors need real credentials for a turn, so there is no honest cross-tool TTFT.

Reading the numbers honestly:

- These measure the *harness*, not the model -- turn latency is dominated by your provider, and every tool here talks to the same APIs.
- A tool not installed on the bench machine is an `n/a` row, never an estimate, and is excluded from rank counts rather than ranked last.
- Ranks are "1 + how many tools were strictly faster", so ties share a rank.
- **Input latency is only comparable between tools that render their own echo.** A tool in cooked mode has the tty line discipline echo each byte before the app wakes -- measured: `cat` in a PTY times ~0.3 ms with no UI at all. That number describes the kernel, not the tool, so each row records an `input_signal` (`render`, `kernel-echo`, or `log-marker`) and ranks are computed within the `render` class only. Both input metrics wait for the probe *text*, never for the first byte: a TUI emits cursor-control bytes (fox sends `\e[?25l`) before compositing, and a periodic status repaint can land after a keystroke, so "first output after a keypress" measures neither.
- Per-turn behavior -- context handling, tool latency, compaction -- is what actually distinguishes coding agents, and no startup number captures it.

Reproduce locally (measures whatever is on your `PATH`):

```bash
bun run bench                                                   # build + measure; writes bench/
python3 scripts/bench/bench.py --quick --out /tmp/bench         # 2 probes, for smoke tests
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
