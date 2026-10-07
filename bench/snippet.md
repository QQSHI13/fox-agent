![bundle size](bench/bundle.svg)
![time to first char](bench/tui-first-char.svg)
![time to first input](bench/tui-first-input.svg)
![idle memory](bench/memory.svg)

| agent | version | bundle | `--version` | TUI 1st byte | TUI 1st input | idle PSS |
|---|---|---|---|---|---|---|
| **fox-agent** | 0.5.0-beta.1 | 89.4 MB | 8 ms | **10 ms** | — | 33 MB |
| claude code | 2.1.292 (Claude Code) | 251.5 MB | 7 ms | **122 ms** | — | 184 MB |
| codex | codex-cli 0.160.1 | 446.8 MB (pkg) | 28 ms | **29 ms** | — | 49 MB |
| opencode v1 | 1.18.35 | 185.7 MB | 342 ms | **557 ms** | **23 ms** | 361 MB |
| opencode v2 | opencode2 v0.0.0-beta-19271 | 207.4 MB | 51 ms | **78 ms** | **37 ms** | 125 MB |
| jcode | jcode v0.91.0 (439a243bb) | 135.1 MB | 6 ms | **8 ms** | — | 27 MB |
| pi | 1.0.4 | 123.1 MB (pkg) | 134 ms | **174 ms** | **4 ms** | 132 MB |
| gemini cli | 0.63.0 | 102.3 MB (pkg) | 833 ms | **891 ms** | **0 ms** | — |
| copilot cli | GitHub Copilot CLI 1.0.92. | 180.1 MB (pkg) | 63 ms | **486 ms** | — | 47 MB |
| crush | crush version v0.97.1 | 128.5 MB (pkg) | 90 ms | **374 ms** | — | 68 MB |
| goose | 1.53.0 | 298.7 MB | 5 ms | **5 ms** | **0 ms** | — |
| aider | aider 0.86.2 | 642.8 MB (pkg) | 436 ms | **390 ms** | **5 ms** | 67 MB |
| amp | n/a (not installed) | — | — | — | — | — |
| cursor-agent | n/a (not installed) | — | — | — | — | — |
| qwen code | 0.25.0 | 146.2 MB (pkg) | 23 ms | **452 ms** | — | 293 MB |
| codebuff | n/a (not installed) | — | — | — | — | — |
| kilo code | 7.8.3 | 542.3 MB (pkg) | 603 ms | **1015 ms** | **24 ms** | 46 MB |

fox-agent headless vs scripted local provider: time to first token **38 ms**, peak RSS **64 MB**.

_Generated 2026-10-07T11:12:50Z on Linux x86_64 (6.17.0-1022-azure). [How this is measured](#benchmarks) · [raw JSON](bench/results.json)_
