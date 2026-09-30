![bundle size](bench/bundle.svg)
![time to first char](bench/tui-first-char.svg)
![time to first input](bench/tui-first-input.svg)
![idle memory](bench/memory.svg)

| agent | version | bundle | `--version` | TUI 1st byte | TUI 1st input | idle PSS |
|---|---|---|---|---|---|---|
| **fox-agent** | 0.5.0-beta.1 | 89.2 MB | 13 ms | **15 ms** | — | 35 MB |
| claude code | 2.1.285 (Claude Code) | 240.3 MB | 9 ms | **191 ms** | — | 176 MB |
| codex | codex-cli 0.159.2 | 444.4 MB (pkg) | 44 ms | **44 ms** | — | 49 MB |
| opencode v1 | 1.18.33 | 185.4 MB | 587 ms | **962 ms** | **41 ms** | 366 MB |
| opencode v2 | opencode2 v0.0.0-beta-19271 | 207.4 MB | 82 ms | **134 ms** | **62 ms** | 128 MB |
| jcode | jcode v0.89.3 (de65ade33) | 132.5 MB | 10 ms | **12 ms** | — | 26 MB |
| pi | 0.99.1 | 411.2 MB (pkg) | 229 ms | **290 ms** | **7 ms** | 133 MB |
| gemini cli | 0.62.0 | 102.2 MB (pkg) | 1441 ms | **1521 ms** | **0 ms** | 145 MB |
| copilot cli | GitHub Copilot CLI 1.0.89. | 174.1 MB (pkg) | 104 ms | **879 ms** | — | 48 MB |
| crush | crush version v0.97.1 | 128.5 MB (pkg) | 150 ms | **392 ms** | — | 69 MB |
| goose | 1.52.0 | 300.8 MB | 7 ms | **7 ms** | **0 ms** | — |
| aider | aider 0.86.2 | 642.8 MB (pkg) | 790 ms | **705 ms** | **10 ms** | 67 MB |
| amp | n/a (not installed) | — | — | — | — | — |
| cursor-agent | n/a (not installed) | — | — | — | — | — |
| qwen code | 0.24.7 | 139.1 MB (pkg) | 39 ms | **774 ms** | — | 247 MB |
| codebuff | n/a (not installed) | — | — | — | — | — |
| kilo code | 7.8.1 | 542.5 MB (pkg) | 984 ms | **1701 ms** | **52 ms** | 46 MB |

fox-agent headless vs scripted local provider: time to first token **49 ms**, peak RSS **59 MB**.

_Generated 2026-09-30T11:25:32Z on Linux x86_64 (6.17.0-1022-azure). [How this is measured](#benchmarks) · [raw JSON](bench/results.json)_
