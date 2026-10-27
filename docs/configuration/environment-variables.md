# Environment variables

Every `FOX_AGENT_*` variable is also reachable through config; env wins over both
config files and loses to CLI flags.

## Provider

| Variable | Meaning |
|---|---|
| `FOX_AGENT_MODEL` | Model id |
| `FOX_AGENT_BASE_URL` | Provider base URL |
| `FOX_AGENT_API_KEY` | API key |
| `FOX_AGENT_PROVIDER` | `openai-compatible` / `openai-responses` / `anthropic` / `google` / a plugin name |

These are also honored as **fallbacks** when the `FOX_AGENT_*` form is unset:

`OPENAI_BASE_URL`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`,
`GOOGLE_API_KEY`.

## Turn loop

| Variable | Meaning |
|---|---|
| `FOX_AGENT_MAX_STEPS` | Turn step cap (`0` = unlimited) |
| `FOX_AGENT_RETRY_LIMIT` | Retry count on 429/5xx |
| `FOX_AGENT_COMPACT_WARN_AT` | Fraction of the window at which the header tells the agent to compact (default `0.8`) |
| `FOX_AGENT_COMPACT_CTX_ONLY_AT` | Fraction at which every tool except `ctx` is disabled (default `0.9`) |
| `FOX_AGENT_REQUEST_TIMEOUT_MS` | Time without progress before a request is aborted (default `120000`, `0` disables) |
| `FOX_AGENT_DELEGATION_DEPTH` | Carried across the process boundary so nesting stops at 3. Set by the harness, not by you |

## Behaviour and state

| Variable | Meaning |
|---|---|
| `FOX_AGENT_HOME` | State dir — sessions, index, pty logs, materialized docs. Default `~/.local/share/fox-agent` |
| `FOX_AGENT_CONFIG` | Override the global config path. Tests and sandboxes use this; the writer always goes through it |
| `FOX_AGENT_DIAGNOSTICS` | `0`/`false`/`no` turns off post-edit diagnostics |
| `FOX_AGENT_TRACE` | Write the screen's frame dumps (`<path>.grid`) for TUI render bugs |
| `FOX_AGENT_FRAMEPROFILE` | Write per-frame phase timings for TUI performance work |
| `FOX_AGENT_NO_TRUST_CHECK` | `1` skips the trusted-directory prompt (scripts, CI). `0`/`false` also skips |
| `FOX_AGENT_NO_RESUME_HINT` | Suppress the "resume this session" hint on exit |
| `FOX_AGENT_MODELS_OFFLINE` | Never reach the network for the models.dev catalog |
| `FOX_AGENT_MODELS_CACHE` | Alternate path for the catalog cache |
| `FOX_AGENT_ANTHROPIC_CACHE` | Control Anthropic prompt caching |

## Network safety

| Variable | Meaning |
|---|---|
| `FOX_AGENT_ALLOW_PRIVATE_FETCH` | `1` lets the `fetch` tool reach loopback/private/link-local hosts. Off by default — see the [security model](../architecture/index.md#security-model) |

## Terminal

`NO_COLOR` is respected by `fox ls`, `fox plugin` and `fox --help`, which paint
only when stdout is a TTY.
