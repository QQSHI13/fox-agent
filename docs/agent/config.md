# fox-agent configuration

Config cascade (later wins): defaults <- `~/.config/fox-agent/config.toml` (global) <- project `fox-agent.toml` <- env (`FOX_AGENT_*`) <- CLI flags.

TOML is the only format. A malformed file fails loudly naming the file and parser error — it is never silently ignored. Unknown keys and non-URL `baseUrl` values surface as warnings.

## Editing the config yourself (the agent's own config)

You (the agent) are expected to edit config files with your ordinary `edit`/`write` tools when the user asks ("switch model to X for this project", "turn off diagnostics here"). Rules:

- **Global config** (`~/.config/fox-agent/config.toml`): provider profiles, apiKey, plugins, themes, agents. Changes need `/reload` (or a restart) to apply to the running session.
- **Project config** (`fox-agent.toml` in the project root): project-local overrides — model, diagnostics, tool caps, LSP servers, agents. NEVER put `plugins` here: plugins load from the global config only, by security boundary (a project file must not be able to run code in the agent's process). A project `plugins` array is ignored with a warning.
- **Validate before you finish**: `bun -e 'await import(".../src/core/config.ts")'`-style checks are not enough — config `validate` callbacks **throw** on invalid input. After editing, run `/reload` in the session or load the config headlessly to confirm it parses.
- If you add a NEW config field in the fox-agent source tree itself, it must also be added to the fixture in `test/acp.test.ts` or the suite fails.

Quick knobs the user can change without files: `/settings` (list), `/settings key=value` (validated, saved globally, applied live), `/settings key=` (reset). Model/theme/reasoning have their own commands (`/model`, `/theme`, `/thinking`) that save globally.

## Key fields

```toml
provider = "openai-compatible"        # active provider slot
model = "..."                          # active model
baseUrl = "..."  apiKey = "..."        # fallback creds for the flat slot
reasoningEffort = "low|medium|high"
theme = "default"                      # theme name (see themes doc)
tuiRich = true                         # markdown rendering
tuiScrollbar = true
tuiScrollStep = 3                      # rows per wheel notch
tuiFrameMs = 16                        # frame budget
statusBar = "cwd provider model ctx"   # space-separated segment template
debug = false                          # /debug on|off|tail + slow-frame logging
maxSteps = 0                           # 0 = unlimited
retryLimit = 3                         # 429/5xx retries
requestTimeoutMs = 120000
compactAt = 0.85                       # context fraction that triggers compaction
compactAtTokens = 0                    # absolute token ceiling (0 = off)
toolOutputCap = 40000
diagnostics = true                     # post-edit LSP diagnostics

[providers.<name>]                     # named profiles; `provider = "<name>"` selects
format = "openai-compatible"           # | openai-responses | anthropic | google
baseUrl = "..." ; apiKey = "..." ; defaultModel = "..."
                                       # apiKey/headers resolve "$ENV", "${ENV}", "!cmd"

[plugins]                              # GLOBAL config ONLY
myplugin = "/abs/path.ts"              # module default-exports FoxPlugin

[lsp.typescript]                       # extra language servers (ts/py/rust built in)
command = "..." ; args = [...] ; extensions = [".ts"]

[agents.<name>]                        # `task` delegation targets
command = "..."                        # ACP-spawned agent
# url = "..."                          # or remote A2A agent
```

## Environment variables

`FOX_AGENT_MODEL`, `FOX_AGENT_BASE_URL`, `FOX_AGENT_API_KEY`, `FOX_AGENT_PROVIDER`, `FOX_AGENT_MAX_STEPS`, `FOX_AGENT_COMPACT_AT`, `FOX_AGENT_COMPACT_AT_TOKENS`, `FOX_AGENT_RETRY_LIMIT`, `FOX_AGENT_REQUEST_TIMEOUT_MS`, `FOX_AGENT_DIAGNOSTICS`, `FOX_AGENT_HOME` (state dir, default `~/.local/share/fox-agent`), `FOX_AGENT_CONFIG` (override global config path — tests/sandboxes).

`OPENAI_BASE_URL`/`OPENAI_API_KEY`/`ANTHROPIC_API_KEY`/`GEMINI_API_KEY`/`GOOGLE_API_KEY` are honored as fallbacks.

apiKey and headers values resolve `"$ENV"`, `"${ENV}"`, and `"!cmd"` (command output, cached per process) — use these instead of pasting secrets into files.
