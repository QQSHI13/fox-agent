![harness bench dashboard](bench/bench.svg)

| agent | bundle | `--version` | TUI 1st byte | TUI 1st input | input latency 1s | idle PSS |
|---|---|---|---|---|---|---|
| **fox-agent** | 99 MB | 29 ms | **37 ms** | **401 ms** | **1 ms** | 15 MB |
| claude code | 242 MB | 12 ms | **746 ms** | **2314 ms** | **23 ms** | 257 MB |
| codex | — | — | — | — | — | — |
| opencode v2 | 139 MB | 502 ms | **1339 ms** | **1976 ms** | **706 ms** | 84 MB |
| jcode | 135 MB | 19 ms | **2038 ms** | **5372 ms** | **1 ms** | 18 MB |
| pi | 139 MB | 390 ms | **1615 ms** | **1864 ms** | **29 ms** | 48 MB |
| gemini cli | — | — | — | — | — | — |
| copilot cli | — | — | — | — | — | — |
| crush | — | — | — | — | — | — |
| goose | — | — | — | — | — | — |
| aider | — | — | — | — | — | — |
| amp | — | — | — | — | — | — |
| cursor-agent | — | — | — | — | — | — |
| qwen code | — | — | — | — | — | — |
| codebuff | — | — | — | — | — | — |
| kilo code | — | — | — | — | — | — |
| droid | — | — | — | — | — | — |
| kimi code | 191 MB | 2835 ms | **2887 ms** | **5674 ms** | **15 ms** | 162 MB |
| devin | — | — | — | — | — | — |
| cline | — | — | — | — | — | — |
| continue | — | — | — | — | — | — |
| iflow cli | — | — | — | — | — | — |

<details><summary>full precision · all collected fields</summary>

| agent | version | bin | bundle (MB) | bundle kind | `--version` (ms) | TUI 1st byte (ms) | TUI 1st input (ms) | input latency 1s (ms) | idle PSS (MB) |
|---|---|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.6.0 | `/home/qq/.openclaw/workspace/projects/fox-agent/bin/fox` | 99.0 | bin | 29.0 | 36.9 | 401.1 | 1.2 | 15.2 |
| claude code | 2.1.286 (Claude Code) | `/home/qq/.local/bin/claude` | 241.7 | bin | 11.7 | 746.0 | 2313.7 | 23.3 | 257.4 |
| codex | n/a (not installed) | — | — | — | — | — | — | — | — |
| opencode v2 | opencode v2.0.29 | `/home/qq/.opencode/bin/opencode2` | 139.4 | bin | 502.0 | 1339.2 | 1975.5 | 706.4 | 83.8 |
| jcode | jcode v0.91.0 (439a243bb) | `/home/qq/.local/bin/jcode` | 135.1 | bin | 19.5 | 2038.2 | 5372.5 | 1.0 | 18.0 |
| pi | 1.0.4 | `/home/qq/.local/bin/pi` | 139.4 | bin | 390.3 | 1614.8 | 1864.4 | 28.9 | 48.3 |
| gemini cli | n/a (not installed) | — | — | — | — | — | — | — | — |
| copilot cli | n/a (not installed) | — | — | — | — | — | — | — | — |
| crush | n/a (not installed) | — | — | — | — | — | — | — | — |
| goose | n/a (not installed) | — | — | — | — | — | — | — | — |
| aider | n/a (not installed) | — | — | — | — | — | — | — | — |
| amp | n/a (not installed) | — | — | — | — | — | — | — | — |
| cursor-agent | n/a (not installed) | — | — | — | — | — | — | — | — |
| qwen code | n/a (not installed) | — | — | — | — | — | — | — | — |
| codebuff | n/a (not installed) | — | — | — | — | — | — | — | — |
| kilo code | n/a (not installed) | — | — | — | — | — | — | — | — |
| droid | n/a (not installed) | — | — | — | — | — | — | — | — |
| kimi code | 2.1.1 | `/home/qq/.kimi-code/bin/kimi` | 190.8 | bin | 2835.5 | 2886.7 | 5674.0 | 15.4 | 162.4 |
| devin | n/a (not installed) | — | — | — | — | — | — | — | — |
| cline | n/a (not installed) | — | — | — | — | — | — | — | — |
| continue | n/a (not installed) | — | — | — | — | — | — | — | — |
| iflow cli | n/a (not installed) | — | — | — | — | — | — | — | — |

</details>

fox-agent headless vs scripted local provider: time to first token **13382 ms**, peak RSS **172 MB**.

_Generated 2026-10-18T11:28:17Z on Linux x86_64 (6.18.33.2-microsoft-standard-WSL2). [How this is measured](#benchmarks) · [raw JSON](bench/results.json)_
