![bundle size](bench/bundle.svg)
![time to first char](bench/tui-first-char.svg)
![time to first input](bench/tui-first-input.svg)
![idle memory](bench/memory.svg)

| agent | version | bundle | `--version` | TUI 1st byte | TUI 1st input | idle PSS |
|---|---|---|---|---|---|---|
| **fox-agent** | 0.5.0-beta.1 | 89.3 MB | 13 ms | **15 ms** | — | 36 MB |
| claude code | 2.1.292 (Claude Code) | 251.5 MB | 9 ms | **202 ms** | — | 184 MB |
| codex | codex-cli 0.160.1 | 446.8 MB (pkg) | 42 ms | **44 ms** | — | 49 MB |
| opencode v1 | 1.18.35 | 185.7 MB | 611 ms | **979 ms** | **44 ms** | 365 MB |
| opencode v2 | opencode2 v0.0.0-beta-19271 | 207.4 MB | 81 ms | **133 ms** | **64 ms** | 127 MB |
| jcode | jcode v0.91.0 (439a243bb) | 135.1 MB | 9 ms | **12 ms** | — | 27 MB |
| pi | 1.0.4 | 123.1 MB (pkg) | 234 ms | **317 ms** | **8 ms** | 130 MB |
| gemini cli | 0.63.0 | 102.3 MB (pkg) | 1511 ms | **1597 ms** | **0 ms** | 146 MB |
| copilot cli | GitHub Copilot CLI 1.0.92. | 180.1 MB (pkg) | 103 ms | **834 ms** | — | 47 MB |
| crush | crush version v0.97.1 | 128.5 MB (pkg) | 154 ms | **267 ms** | — | 69 MB |
| goose | 1.53.0 | 298.7 MB | 7 ms | **7 ms** | **0 ms** | — |
| aider | aider 0.86.2 | 642.8 MB (pkg) | 784 ms | **728 ms** | **11 ms** | 67 MB |
| amp | n/a (not installed) | — | — | — | — | — |
| cursor-agent | n/a (not installed) | — | — | — | — | — |
| qwen code | 0.25.0 | 146.2 MB (pkg) | 37 ms | **807 ms** | — | 245 MB |
| codebuff | n/a (not installed) | — | — | — | — | — |
| kilo code | 7.8.3 | 542.3 MB (pkg) | 990 ms | **1802 ms** | **49 ms** | 46 MB |

fox-agent headless vs scripted local provider: time to first token **57 ms**, peak RSS **64 MB**.

_Generated 2026-10-07T05:41:36Z on Linux x86_64 (6.17.0-1022-azure). [How this is measured](#benchmarks) · [raw JSON](bench/results.json)_
