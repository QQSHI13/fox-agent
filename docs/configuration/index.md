# Configuration

## The cascade

Later wins:

```
defaults  <-  ~/.config/fox-agent/config.toml  <-  project fox-agent.toml  <-  env (FOX_AGENT_*)  <-  CLI flags
```

TOML is the only config format. A malformed file **fails loudly**, naming the
file and the parser error, rather than being silently ignored — a typo in a
config used to make it indistinguishable from no config at all. Unknown keys and
non-URL `baseUrl` values surface as warnings, not silent ignores.

The relative paths *inside* either file (plugin and LSP commands, say) resolve
against the file that named them, not against your cwd.

## Editing without a file

`/settings` lists the scalar knobs with their current values.

```
/settings                     # list everything
/settings compactWarnAt=0.7   # validated, saved to the global config, applied live
/settings compactWarnAt=      # reset to the default
```

Covers `maxSteps`, `retryLimit`, `compactWarnAt`, `compactCtxOnlyAt`,
`requestTimeoutMs`, `toolOutputCap`, `readCap`, `sessionListLimit`,
`tuiCollapsedChars`, `tuiKeptChars`, `tuiScrollStep`, `statusBar`, `debug`,
`tuiFrameMs`, `contextMarkers` and `acpHistory`.

Model, theme and reasoning effort have their own commands (`/model`, `/theme`,
`/thinking`) because each opens a chooser and saves globally.

## The keys

### Provider and model

| Key | Meaning |
|---|---|
| `provider` | The active provider *slot* — a profile name, or a bare wire format (`openai-compatible`, `openai-responses`, `anthropic`, `google`, or a plugin-registered name) |
| `model` | The active model id |
| `baseUrl`, `apiKey` | Fallback credentials for the flat slot; a profile's own values win |
| `reasoningEffort` | `off` / `minimal` / `low` / `medium` / `high` / `xhigh`, mapped per provider. `off` is an explicit "do not reason"; unset lets the provider default rule |
| `[providers.<name>]` | Named profiles, side by side. See [Providers](providers.md) |

### Turn loop

| Key | Default | Meaning |
|---|---|---|
| `maxSteps` | `0` | Tool-call steps per turn; `0` = unlimited |
| `retryLimit` | `3` | Retries on 429/5xx, with backoff |
| `requestTimeoutMs` | `120000` | Bound on **time without progress**, not total duration (see below) |
| `compactWarnAt` | `0.8` | Context fraction at which the runtime header tells the agent to compact |
| `compactCtxOnlyAt` | `0.9` | Context fraction at which every tool except `ctx` is disabled |
| `toolOutputCap` | `30000` | Per-tool-result character cap |
| `readCap` | `50000` | `read` ceiling before it refuses and asks for `offset`/`limit` |

### TUI

| Key | Default | Meaning |
|---|---|---|
| `theme` | `"default"` | Preset name, or a plugin-registered theme |
| `tuiScrollbar` | `true` | Dedicated scrollbar column |
| `tuiScrollStep` | `2` | Rows per wheel notch |
| `tuiFrameMs` | `16` | Frame budget; overruns are logged when `debug` is on |
| `tuiCollapsedChars` | `240` | Folded tool output keeps this much |
| `tuiKeptChars` | `4000` | Total character budget kept per collapsed block |
| `statusBar` | `"cwd provider model ctx cost"` | Space-separated segment template; plugin names from `statusSegments` work here too. Narrow terminals drop whole segments left-to-right |
| `contextMarkers` | `true` | Show `[N]` node markers in the transcript |
| `debug` | `false` | Verbose diagnostics + slow-frame logging to `debug.log` (`/debug on\|off\|tail`) |

### Protocols and delegation

| Key | Default | Meaning |
|---|---|---|
| `acpHistory` | `"full"` | How much history `session/load` replays: `"full"`, `"last"` (latest exchange only), or a trailing-node count |
| `[agents.<name>]` | — | `task` delegation targets: `command` = spawn an ACP child, `url` = a remote A2A agent. `default` is fox-agent itself and is always available |
| `[mcpServers.<name>]` | — | MCP servers to spawn; their tools join the registry |
| `[lsp.<name>]` | — | Extra language servers beyond the three built in |

### Extensions

| Key | Meaning |
|---|---|
| `plugins` | Plugin file paths. **Global config only** — see below |
| `disabledPlugins` | Names switched off entirely, bundled or user (`"pty"`, `"bundled:pty"`, `"mcp"`, `"anthropic"`, …) |

### Diagnostics

| Key | Default | Meaning |
|---|---|---|
| `diagnostics` | `true` | Report type errors in `edit`/`write` results |

## Request timeout

`requestTimeoutMs` bounds **time without progress**, not total request duration:
the clock re-arms on every streamed chunk. A model that reasons or writes for ten
minutes is fine; one that goes quiet past the window fails with a retriable
`provider timed out after Ns with no response`. Lower it if you point fox-agent
at a flaky gateway.

## `plugins` is global-only

A `plugins` entry in a project `fox-agent.toml` is **ignored, with a warning
saying so**. Every other extension point (`[mcpServers.*]`, `[agents.*]`,
`[lsp.*]`) spawns a *child process*; a plugin is imported into fox-agent's own
process and gets your whole environment, API key included. So "clone a repo, cd
in, run fox" must not be able to execute that repo's code. Naming a plugin is a
decision about your machine, and it lives in the file only you write.

## Project instructions

`AGENTS.md` and `CLAUDE.md` are loaded from **every** directory on the path from
the filesystem root down to your cwd, each labeled with its own path so relative
paths inside it resolve against the right directory. `/init` analyzes the repo
and writes or updates an `AGENTS.md` for you.

## Trusted vs untrusted directories

On interactive TUI start, fox-agent shows the working directory and asks whether
the folder is trusted (`y` / `n` / `c`, one keypress). Trusted directories are
recorded in `$FOX_AGENT_HOME/trusted_dirs`; `--trust` skips the prompt.

In an **untrusted** directory, the project config's executable sections —
`[mcpServers.*]`, `[agents.*]`, `[lsp.*]`, `[providers.*]` (including `!cmd`
values) — plus project `baseUrl`/`apiKey` are ignored with warnings. Safe keys
(model, theme, caps) still apply. Headless and ACP runs never prompt; they run
restricted instead. `FOX_AGENT_NO_TRUST_CHECK=1` skips the check for scripts.

## Full example

```toml
model = "kimi-k2"
provider = "openrouter"      # a [providers.*] profile name, or a bare wire format
maxSteps = 0                 # 0 = unlimited
compactWarnAt = 0.8          # header says: compact now
compactCtxOnlyAt = 0.9       # only ctx stays callable past this
retryLimit = 3
requestTimeoutMs = 120000
diagnostics = true

# Plugins are read from the GLOBAL config only (see above). In
# ~/.config/fox-agent/config.toml; ignored with a warning here.
# plugins = ["~/my-fox-plugin.ts"]

[providers.openrouter]
format = "openai-compatible"
baseUrl = "https://openrouter.ai/api/v1"
apiKey = "$OPENROUTER_API_KEY"       # "$ENV" / "${ENV}" / "!cmd"
headers = { "x-title" = "fox-agent" }
defaultModel = "moonshotai/kimi-k2"

[[providers.openrouter.models]]      # describe a model no endpoint or catalog knows
id = "moonshotai/kimi-k2"
name = "Kimi K2"
contextWindow = 262144
maxOutput = 16384
reasoning = false
input = ["text", "image"]
costIn = 0.6
costOut = 2.5
sampling = { temperature = 1.0, top_p = 0.95 }

[mcpServers.fs]
command = "npx"
args = ["-y", "@modelcontextprotocol/server-fs", "/tmp"]

# Agents the `task` tool may delegate to. "default" (fox-agent itself) is always available.
[agents.reviewer]
command = "some-other-acp-agent"
args = ["--acp"]

[agents.remote]
url = "https://agent.example.com"
headers = { authorization = "Bearer token" }

[lsp.gopls]
command = "gopls"
extensions = [".go"]
rootMarkers = ["go.mod"]
```
