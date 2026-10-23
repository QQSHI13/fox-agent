# fox-agent configuration

Config cascade (later wins): defaults <- `~/.config/fox-agent/config.toml` (global) <- project `fox-agent.toml` <- env (`FOX_AGENT_*`) <- CLI flags.

TOML is the only format. A malformed file fails loudly naming the file and parser error — it is never silently ignored. Unknown keys and non-URL `baseUrl` values surface as warnings.

## Editing the config yourself (the agent's own config)

You (the agent) are expected to edit config files with your ordinary `edit`/`write` tools when the user asks ("switch model to X for this project", "turn off diagnostics here"). Rules:

- **Global config** (`~/.config/fox-agent/config.toml`): provider profiles, apiKey, plugins, themes, agents. Changes need `/reload` (or a restart) to apply to the running session.
- **Project config** (`fox-agent.toml` in the project root): project-local overrides — model, diagnostics, tool caps, LSP servers, agents. NEVER put `plugins` here: plugins load from the global config only, by security boundary (a project file must not be able to run code in the agent's process). A project `plugins` array is ignored with a warning.
- **Validate before you finish**: `bun -e 'await import(".../src/core/config.ts")'`-style checks are not enough — config `validate` callbacks **throw** on invalid input. After editing, run `/reload` in the session or load the config headlessly to confirm it parses.
- If you add a NEW config field in the fox-agent source tree itself, it must also be added to the fixture in `test/acp.test.ts` or the suite fails.
- `edit`/`write` are type-checked; the known key set lives in `KNOWN_KEYS` in `src/core/config.ts` — an unrecognized key warns rather than silently vanishing.

Quick knobs the user can change without files: `/settings` (list), `/settings key=value` (validated, saved globally, applied live), `/settings key=` (reset). Model/theme/reasoning have their own commands (`/model`, `/theme`, `/thinking`) that save globally.

## Key fields

```toml
provider = "openai-compatible"        # active provider slot, or a [providers.*] name
model = "..."                          # active model
baseUrl = "..."  apiKey = "..."        # fallback creds for the flat slot
reasoningEffort = "off|minimal|low|medium|high|xhigh"   # one scale; each provider maps it
                                                       # to its own knob. `off` is an
                                                       # explicit "do not reason"; unset
                                                       # lets the provider default rule.
theme = "default"                      # theme name (see themes doc)
statusBar = "cwd provider model ctx cost"  # space-separated segment template
tuiScrollbar = true                    # dedicated scrollbar column
tuiScrollStep = 2                      # rows per wheel notch
tuiFrameMs = 16                        # frame budget
tuiCollapsedChars = 240                # folded tool output keeps this much
tuiKeptChars = 4000                    # character budget kept per collapsed block
contextMarkers = true                  # show [N] node markers
debug = false                          # /debug on|off|tail + slow-frame logging
maxSteps = 0                           # 0 = unlimited
retryLimit = 3                         # 429/5xx retries
requestTimeoutMs = 120000              # time WITHOUT progress, re-armed per chunk
compactAt = 0.85                       # context fraction that triggers compaction
compactAtTokens = 0                    # absolute token ceiling (0 = off)
toolOutputCap = 30000                  # per-tool-result character cap
readCap = 50000                        # `read` ceiling before it demands offset/limit
sessionListLimit = 50                  # rows `fox ls` / the picker list
acpHistory = "full"                    # session/load replay: "full" | "last" | <trailing node count>
diagnostics = true                     # post-edit LSP diagnostics

plugins = ["~/my-plugin.ts"]           # ARRAY of file paths — GLOBAL config only
disabledPlugins = ["pty", "mcp"]       # bundled or user names, short or bundled:-prefixed

[providers.<name>]                     # named profiles; `provider = "<name>"` selects
format = "openai-compatible"           # | openai-responses | anthropic | google
baseUrl = "..." ; apiKey = "..." ; defaultModel = "..."
                                       # apiKey/headers resolve "$ENV", "${ENV}", "!cmd"

[[providers.<name>.models]]            # describe a model no endpoint or catalog knows
id = "..." ; name = "..." ; contextWindow = 262144 ; maxOutput = 16384
reasoning = false ; input = ["text", "image"] ; costIn = 0.6 ; costOut = 2.5
sampling = { temperature = 1.0, top_p = 0.95 }

[mcpServers.<name>]                    # spawn an MCP server; its tools join the registry
command = "..." ; args = [...] ; env = { ... }

[lsp.<name>]                           # extra language servers (ts/py/rust built in)
command = "..." ; args = [...] ; extensions = [".ts"] ; rootMarkers = ["tsconfig.json"]

[agents.<name>]                        # `task` delegation targets
command = "..."                        # spawn an ACP child
# url = "..."                          # or a remote A2A agent
```

There is no `[plugins]` table — `plugins` is a plain array of paths.

## Trust

On interactive TUI start the working directory is confirmed (`y`/`n`/`c`, one keypress) and recorded in `$FOX_AGENT_HOME/trusted_dirs`; `--trust` skips it. In an **untrusted** directory a project config's `[mcpServers.*]`, `[agents.*]`, `[lsp.*]`, `[providers.*]` (incl. `!cmd`) and project `baseUrl`/`apiKey` are ignored with warnings; safe keys still apply. Headless/ACP never prompt — they run restricted. `FOX_AGENT_NO_TRUST_CHECK=1` skips the prompt for scripts.

## Environment variables

`FOX_AGENT_MODEL`, `FOX_AGENT_BASE_URL`, `FOX_AGENT_API_KEY`, `FOX_AGENT_PROVIDER`, `FOX_AGENT_MAX_STEPS`, `FOX_AGENT_COMPACT_AT`, `FOX_AGENT_COMPACT_AT_TOKENS`, `FOX_AGENT_RETRY_LIMIT`, `FOX_AGENT_REQUEST_TIMEOUT_MS`, `FOX_AGENT_DIAGNOSTICS`, `FOX_AGENT_HOME` (state dir, default `~/.local/share/fox-agent`), `FOX_AGENT_CONFIG` (override global config path — tests/sandboxes), `FOX_AGENT_DEBUG`, `FOX_AGENT_TRACE`, `FOX_AGENT_FRAMEPROFILE`, `FOX_AGENT_NO_TRUST_CHECK`, `FOX_AGENT_NO_RESUME_HINT`, `FOX_AGENT_MODELS_OFFLINE`, `FOX_AGENT_MODELS_CACHE`, `FOX_AGENT_ANTHROPIC_CACHE`, `FOX_AGENT_ALLOW_PRIVATE_FETCH`, `FOX_AGENT_DELEGATION_DEPTH` (harness-set).

`OPENAI_BASE_URL`/`OPENAI_API_KEY`/`ANTHROPIC_API_KEY`/`GEMINI_API_KEY`/`GOOGLE_API_KEY` are honored as fallbacks.

apiKey and headers values resolve `"$ENV"`, `"${ENV}"`, and `"!cmd"` (command output, cached per process) — use these instead of pasting secrets into files.
