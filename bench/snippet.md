![bundle size](bench/bundle.svg)
![time to first char](bench/tui-first-char.svg)
![time to first input](bench/tui-first-input.svg)
![idle memory](bench/memory.svg)

| agent | version | bundle | `--version` | TUI 1st byte | TUI 1st input | idle PSS |
|---|---|---|---|---|---|---|
| **fox-agent** | 0.5.0-beta.1 | 89.2 MB | 13 ms | **14 ms** | — | 35 MB |
| claude code | 2.1.285 (Claude Code) | 240.3 MB | 10 ms | **200 ms** | — | 177 MB |
| codex | codex-cli 0.159.2 | 444.4 MB (pkg) | 43 ms | **44 ms** | — | 49 MB |
| opencode v1 | 1.18.33 | 185.4 MB | 591 ms | **983 ms** | **42 ms** | 363 MB |
| opencode v2 | opencode2 v0.0.0-beta-19271 | 207.4 MB | 84 ms | **137 ms** | **62 ms** | 129 MB |
| jcode | jcode v0.89.3 (de65ade33) | 132.5 MB | 9 ms | **11 ms** | — | 27 MB |
| pi | 0.99.1 | 411.2 MB (pkg) | 238 ms | **304 ms** | **7 ms** | 133 MB |
| gemini cli | 0.62.0 | 102.2 MB (pkg) | 1534 ms | **1623 ms** | **0 ms** | 145 MB |
| copilot cli | GitHub Copilot CLI 1.0.89. | 174.1 MB (pkg) | 100 ms | **902 ms** | — | 47 MB |
| crush | crush version v0.97.1 | 128.5 MB (pkg) | 152 ms | **566 ms** | — | 69 MB |
| goose | 1.52.0 | 300.8 MB | 7 ms | **7 ms** | **0 ms** | — |
| aider | aider 0.86.2 | 642.8 MB (pkg) | 841 ms | **750 ms** | **11 ms** | 67 MB |
| amp | n/a (not installed) | — | — | — | — | — |
| cursor-agent | n/a (not installed) | — | — | — | — | — |
| qwen code | 0.24.7 | 139.1 MB (pkg) | 38 ms | **804 ms** | — | 247 MB |
| codebuff | n/a (not installed) | — | — | — | — | — |
| kilo code | 7.8.1 | 542.5 MB (pkg) | 967 ms | **1839 ms** | **46 ms** | 46 MB |

fox-agent headless vs scripted local provider: time to first token **56 ms**, peak RSS **58 MB**.

_Generated 2026-09-30T11:58:35Z on Linux x86_64 (6.17.0-1022-azure). [How this is measured](#benchmarks) · [raw JSON](bench/results.json)_
