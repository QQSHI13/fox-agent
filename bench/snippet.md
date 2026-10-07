![bundle size](bench/bundle.svg)
![time to first char](bench/tui-first-char.svg)
![time to first input](bench/tui-first-input.svg)
![idle memory](bench/memory.svg)

| agent | version | bundle | `--version` | TUI 1st byte | TUI 1st input | idle PSS |
|---|---|---|---|---|---|---|
| **fox-agent** | 0.5.0-beta.1 | 89.4 MB | 13 ms | **16 ms** | — | 33 MB |
| claude code | 2.1.292 (Claude Code) | 251.5 MB | 9 ms | **211 ms** | — | 184 MB |
| codex | codex-cli 0.160.1 | 446.8 MB (pkg) | 43 ms | **43 ms** | — | 49 MB |
| opencode v1 | 1.18.35 | 185.7 MB | 611 ms | **1001 ms** | **42 ms** | 366 MB |
| opencode v2 | opencode2 v0.0.0-beta-19271 | 207.4 MB | 82 ms | **137 ms** | **70 ms** | 126 MB |
| jcode | jcode v0.91.0 (439a243bb) | 135.1 MB | 9 ms | **11 ms** | — | 27 MB |
| pi | 1.0.4 | 123.1 MB (pkg) | 238 ms | **315 ms** | **8 ms** | 132 MB |
| gemini cli | 0.63.0 | 102.3 MB (pkg) | 1526 ms | **1605 ms** | **0 ms** | 146 MB |
| copilot cli | GitHub Copilot CLI 1.0.92. | 180.1 MB (pkg) | 104 ms | **860 ms** | — | 48 MB |
| crush | crush version v0.97.1 | 128.5 MB (pkg) | 153 ms | **279 ms** | — | 69 MB |
| goose | 1.53.0 | 298.7 MB | 7 ms | **7 ms** | **0 ms** | — |
| aider | aider 0.86.2 | 642.8 MB (pkg) | 814 ms | **740 ms** | **11 ms** | 67 MB |
| amp | n/a (not installed) | — | — | — | — | — |
| cursor-agent | n/a (not installed) | — | — | — | — | — |
| qwen code | 0.25.0 | 146.2 MB (pkg) | 38 ms | **811 ms** | — | 256 MB |
| codebuff | n/a (not installed) | — | — | — | — | — |
| kilo code | 7.8.3 | 542.3 MB (pkg) | 1006 ms | **1819 ms** | **53 ms** | 46 MB |

fox-agent headless vs scripted local provider: time to first token **62 ms**, peak RSS **64 MB**.

_Generated 2026-10-07T10:16:19Z on Linux x86_64 (6.17.0-1022-azure). [How this is measured](#benchmarks) · [raw JSON](bench/results.json)_
