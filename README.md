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
| TUI 1st byte | **20.0** | **#2** of 22 |
| TUI 1st paint | **27.7** | **#2** of 20 |
| TUI 1st input | **199** | **#1** of 9 |
| input latency | **3.7** | **#3** of 8 |
| bundle | **117** | **#4** of 22 |
| idle PSS | **45** | **#2** of 20 |
| `--version` | **7.9** | **#2** of 22 |

fox-agent headless vs scripted local provider: time to first token **60 ms**, peak RSS **57 MB**.

<details><summary>dashboard · every tool, every metric</summary>

![harness bench dashboard](bench/bench.svg)

</details>

<details><summary>full precision · min/p50/p95 per metric</summary>

| agent | version | bundle (MB) | kind | `--version` min/p50/p95 | 1st byte min/p50/p95 | 1st paint min/p50/p95 | 1st input min/p50/p95 | latency min/p50/p95 | signal | idle PSS (MB) | n |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.6.0 | 116.6 | bin | 6.9/7.9/8.1 | 17.0/20.0/21.5 | 25.9/27.7/28.3 | 196.9/199.1/199.6 | 3.4/3.7/3.7 | render | 44.8 | 5 |
| claude code | 2.1.310 (Claude Code) | 291.6 | bin | 8.9/9.8/12.5 | 239.1/247.9/285.6 | 254.1/262.8/300.2 | — | — | render | 173.1 | 5 |
| codex | codex-cli 0.164.0 | 444.4 | pkg | 43.5/44.1/45.9 | 43.6/44.1/44.9 | 346.4/347.0/459.1 | — | — | render | 233.2 | 5 |
| jcode | jcode v0.99.1 (7206efd0c) | 171.3 | bin | 9.4/9.6/9.7 | 11.1/11.3/11.7 | 11.3/11.7/11.7 | 242.4/243.0/366.9 | 2.9/3.0/3.2 | render | 33.8 | 5 |
| pi | 1.4.0 | 111.8 | pkg | 247.0/254.1/254.4 | 319.3/323.7/335.2 | 332.1/341.1/361.9 | 537.1/588.9/597.1 | 3.6/3.9/4.1 | render | 128.4 | 5 |
| pi-bolt | 1.4.0 (Pi-Bolt 1.0.0, linux-x64, JIT off) | 263.2 | bin | 12.0/13.5/14.4 | 36.2/37.6/42.5 | 39.8/42.2/46.6 | 231.0/233.0/237.4 | 3.0/3.0/3.3 | render | 88.8 | 5 |
| gemini cli | 0.65.0 | 102.6 | pkg | 1518.6/1535.0/1535.5 | 1603.5/1614.5/1627.5 | 1603.5/1614.5/1627.5 | — | — | — | — | 5 |
| copilot cli | GitHub Copilot CLI 1.0.103. | 198.5 | pkg | 104.8/105.9/107.7 | 677.4/740.9/966.9 | 972.6/1013.8/1235.9 | — | — | render | 402.2 | 5 |
| crush | crush version v0.98.2 | 128.9 | pkg | 153.1/158.5/159.0 | 442.3/545.6/569.4 | 444.1/547.4/570.9 | — | — | render | 164.6 | 5 |
| aider | aider 0.86.2 | 642.8 | pkg | 804.5/813.6/814.7 | 735.1/744.1/749.9 | 735.7/744.7/750.6 | 929.3/943.4/1038.8 | 5.8/6.0/6.0 | render | 67.5 | 5 |
| amp | 0.0.1792828848-gc7cca4 (released 2026-10-24T08:00:48.000Z, 3 | 161.1 | bin | 213.2/224.9/229.0 | 227.4/228.0/248.5 | 227.4/228.0/248.5 | 397.4/398.4/420.2 | — | — | — | 5 |
| cursor-agent | 2026.10.22-27dcf5f | 583.2 | pkg | 477.5/481.8/493.9 | 457.8/640.4/671.0 | 457.8/457.8/457.8 | — | — | render | 239.4 | 5 |
| qwen code | 0.26.0 | 154.7 | pkg | 36.2/38.9/39.1 | 588.2/593.3/839.4 | 984.6/988.4/1327.7 | — | — | render | 203.3 | 5 |
| codebuff | 1.0.688 | 140.0 | bin | 907.2/912.8/927.2 | 893.9/906.1/918.0 | 1927.5/1940.6/1952.0 | — | — | render | 301.2 | 5 |
| kilo code | 7.8.17 | 718.6 | pkg | 808.1/819.1/832.7 | 2200.5/2241.3/2356.8 | 2200.5/2241.3/2356.8 | 6491.7/6806.7/6964.6 | 11.0/11.4/27.7 | render | 901.5 | 5 |
| droid | 0.249.0 | 319.7 | bin | 90.4/96.6/101.4 | 100.3/104.3/111.7 | — | — | — | render | 273.1 | 5 |
| kimi code | 2.3.1 | 192.3 | bin | 583.2/587.8/595.9 | 747.9/760.1/793.5 | 780.0/792.6/826.6 | — | — | render | 325.8 | 5 |
| devin | devin 3000.11.205 (6dea39440ae3) | 217.5 | bin | 5.4/6.1/6.4 | 24.1/51.2/60.9 | 27.3/53.9/63.4 | — | — | render | 100.0 | 5 |
| cline | 3.0.73 | 330.3 | pkg | 911.1/966.8/995.3 | 1200.3/1237.0/1306.4 | 1200.3/1237.0/1306.4 | — | — | render | 268.5 | 5 |
| continue | 1.5.47 | 82.7 | pkg | 1082.8/1106.4/1114.7 | 11213.2/11230.2/11239.2 | 11236.3/11253.9/11264.1 | — | — | render | 320.4 | 5 |
| iflow cli | 0.5.19 | 180.2 | pkg | 1192.3/1216.5/1229.5 | 1275.9/1292.0/1300.5 | 1317.0/1373.5/1383.5 | 1741.5/1751.7/5498.9 | 47.5/48.1/49.0 | render | 358.4 | 5 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | 207.4 | bin | 83.3/88.0/89.2 | 149.3/176.9/183.5 | 149.3/176.9/183.5 | 1671.9/1724.0/2375.0 | 18.6/20.9/23.9 | render | 125.7 | 5 |

</details>

<details><summary>what could not be measured</summary>

- **amp**: latency: never stopped repainting (no quiet window)
- **claude code**: latency: no input field accepted the keystroke
- **claude code**: ttfi: no input field accepted the keystroke
- **cline**: latency: waiting for login
- **cline**: ttfi: waiting for login
- **codebuff**: latency: no input field accepted the keystroke
- **codebuff**: ttfi: no input field accepted the keystroke
- **codex**: latency: waiting for login
- **codex**: ttfi: waiting for login
- **continue**: latency: no input field accepted the keystroke
- **continue**: ttfi: no input field accepted the keystroke
- **copilot cli**: latency: trust prompt
- **copilot cli**: ttfi: trust prompt
- **crush**: latency: no input field accepted the keystroke
- **crush**: ttfi: no input field accepted the keystroke
- **cursor-agent**: latency: blank screen
- **cursor-agent**: latency: no input field accepted the keystroke
- **cursor-agent**: ttfi: never became interactive (blank screen)
- **cursor-agent**: ttfi: no input field accepted the keystroke
- **devin**: latency: waiting for login
- **devin**: ttfi: waiting for login
- **droid**: latency: blank screen
- **droid**: ttfi: never became interactive (blank screen)
- **gemini cli**: latency: never stopped repainting (no quiet window)
- **gemini cli**: ttfi: never became interactive (blank screen)
- **kimi code**: latency: trust prompt
- **kimi code**: ttfi: trust prompt
- **qwen code**: latency: waiting for login
- **qwen code**: ttfi: waiting for login

</details>

_Generated 2026-10-24T09:12:04Z on Linux x86_64 (6.17.0-1022-azure), load 0.26 on 4 cpu. [Method and caveats](#benchmarks) · [raw JSON](bench/results.json)_
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

The default view is one row per metric -- fox-agent's score on each and its rank in the field. Below it, two folded blocks: the dashboard (every tool, every metric, as one image) and the full-precision record with min/p50/p95 for each tool. When something could not be measured, a third block lists it explicitly.

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
