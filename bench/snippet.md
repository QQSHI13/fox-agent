![bundle size](bench/bundle.svg)
![time to first char](bench/tui-first-char.svg)
![time to first input](bench/tui-first-input.svg)
![idle memory](bench/memory.svg)

| agent | version | bundle | `--version` | TUI 1st byte | TUI 1st input | idle PSS |
|---|---|---|---|---|---|---|
| **fox-agent** | 0.5.0-beta.1 | 89.3 MB | 12 ms | **14 ms** | — | 36 MB |
| claude code | 2.1.289 (Claude Code) | 246.1 MB | 9 ms | **194 ms** | — | 180 MB |
| codex | codex-cli 0.160.0 | 446.7 MB (pkg) | 40 ms | **42 ms** | — | 49 MB |
| opencode v1 | 1.18.34 | 185.6 MB | 590 ms | **989 ms** | **39 ms** | 364 MB |
| opencode v2 | opencode2 v0.0.0-beta-19271 | 207.4 MB | 82 ms | **135 ms** | **67 ms** | 126 MB |
| jcode | jcode v0.90.0 (a7f005e8c) | 132.6 MB | 9 ms | **11 ms** | — | 26 MB |
| pi | 1.0.2 | 123.0 MB (pkg) | 231 ms | **309 ms** | **8 ms** | 132 MB |
| gemini cli | 0.62.0 | 102.2 MB (pkg) | 1498 ms | **1569 ms** | **0 ms** | 146 MB |
| copilot cli | GitHub Copilot CLI 1.0.91. | 178.6 MB (pkg) | 95 ms | **851 ms** | — | 48 MB |
| crush | crush version v0.97.1 | 128.5 MB (pkg) | 149 ms | **266 ms** | — | 69 MB |
| goose | 1.53.0 | 298.7 MB | 7 ms | **7 ms** | **0 ms** | — |
| aider | aider 0.86.2 | 642.8 MB (pkg) | 789 ms | **726 ms** | **11 ms** | 67 MB |
| amp | n/a (not installed) | — | — | — | — | — |
| cursor-agent | n/a (not installed) | — | — | — | — | — |
| qwen code | 0.24.7 | 139.1 MB (pkg) | 37 ms | **785 ms** | — | 247 MB |
| codebuff | n/a (not installed) | — | — | — | — | — |
| kilo code | 7.8.3 | 542.3 MB (pkg) | 971 ms | **1788 ms** | **50 ms** | 46 MB |

fox-agent headless vs scripted local provider: time to first token **58 ms**, peak RSS **64 MB**.

_Generated 2026-10-04T08:43:38Z on Linux x86_64 (6.17.0-1022-azure). [How this is measured](#benchmarks) · [raw JSON](bench/results.json)_
