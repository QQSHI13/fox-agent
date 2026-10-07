![bundle size](bench/bundle.svg)
![time to first char](bench/tui-first-char.svg)
![time to first input](bench/tui-first-input.svg)
![idle memory](bench/memory.svg)

| agent | version | bundle | `--version` | TUI 1st byte | TUI 1st input | idle PSS |
|---|---|---|---|---|---|---|
| **fox-agent** | 0.5.0-beta.1 | 89.4 MB | 14 ms | **16 ms** | — | 33 MB |
| claude code | 2.1.292 (Claude Code) | 251.5 MB | 9 ms | **217 ms** | — | 184 MB |
| codex | codex-cli 0.160.1 | 446.8 MB (pkg) | 42 ms | **44 ms** | — | 49 MB |
| opencode v1 | 1.18.35 | 185.7 MB | 591 ms | **987 ms** | **46 ms** | 366 MB |
| opencode v2 | opencode2 v0.0.0-beta-19271 | 207.4 MB | 79 ms | **132 ms** | **61 ms** | 127 MB |
| jcode | jcode v0.91.0 (439a243bb) | 135.1 MB | 9 ms | **12 ms** | — | 27 MB |
| pi | 1.0.4 | 123.1 MB (pkg) | 232 ms | **303 ms** | **8 ms** | 130 MB |
| gemini cli | 0.63.0 | 102.3 MB (pkg) | 1513 ms | **1599 ms** | **0 ms** | 146 MB |
| copilot cli | GitHub Copilot CLI 1.0.92. | 180.1 MB (pkg) | 100 ms | **835 ms** | — | 48 MB |
| crush | crush version v0.97.1 | 128.5 MB (pkg) | 153 ms | **527 ms** | — | 69 MB |
| goose | 1.53.0 | 298.7 MB | 7 ms | **7 ms** | **0 ms** | — |
| aider | aider 0.86.2 | 642.8 MB (pkg) | 781 ms | **722 ms** | **11 ms** | 67 MB |
| amp | n/a (not installed) | — | — | — | — | — |
| cursor-agent | n/a (not installed) | — | — | — | — | — |
| qwen code | 0.25.0 | 146.2 MB (pkg) | 37 ms | **786 ms** | — | 250 MB |
| codebuff | n/a (not installed) | — | — | — | — | — |
| kilo code | 7.8.8 | 653.7 MB (pkg) | 815 ms | **2454 ms** | **41 ms** | 46 MB |

fox-agent headless vs scripted local provider: time to first token **55 ms**, peak RSS **64 MB**.

_Generated 2026-10-07T12:45:31Z on Linux x86_64 (6.17.0-1022-azure). [How this is measured](#benchmarks) · [raw JSON](bench/results.json)_
