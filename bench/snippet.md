![bundle size](bench/bundle.svg)
![time to first char](bench/tui-first-char.svg)
![idle memory](bench/memory.svg)

| agent | version | bundle | `--version` | TUI 1st byte | idle PSS |
|---|---|---|---|---|---|
| **fox-agent** | 0.4.0 | 89.1 MB | 12 ms | **15 ms** | 35 MB |
| claude code | 2.1.278 (Claude Code) | 234.1 MB | 8 ms | **206 ms** | 186 MB |
| codex | codex-cli 0.155.1 | 370.5 MB (pkg) | 40 ms | **38 ms** | 49 MB |
| opencode v1 | 1.18.31 | 185.0 MB | 614 ms | **1004 ms** | 361 MB |
| opencode v2 | opencode2 v0.0.0-beta-19271 | 207.4 MB | 83 ms | **133 ms** | 97 MB |
| jcode | jcode v0.86.0 (e589cbe5a) | 0.0 MB (entry) | 9 ms | **11 ms** | 26 MB |
| pi | 0.86.1 | 402.9 MB (pkg) | 227 ms | **289 ms** | 152 MB |
| gemini cli | 0.60.0 | 102.0 MB (pkg) | 1515 ms | **1596 ms** | 146 MB |
| copilot cli | GitHub Copilot CLI 1.0.86. | 166.8 MB (pkg) | 601 ms | **720 ms** | 48 MB |
| crush | crush version v0.95.0 | 122.4 MB (pkg) | 152 ms | **394 ms** | 69 MB |
| goose | 1.51.0 | 312.5 MB | 7 ms | **8 ms** | 26 MB |
| aider | aider 0.86.2 | 642.8 MB (pkg) | 827 ms | **742 ms** | 69 MB |
| amp | n/a (not installed) | — | — | — | — |
| cursor-agent | n/a (not installed) | — | — | — | — |
| qwen code | 0.24.1 | 155.0 MB (pkg) | 38 ms | **1693 ms** | 26 MB |
| codebuff | n/a (not installed) | — | — | — | — |
| kilo code | 7.7.5 | 539.9 MB (pkg) | 1014 ms | **1778 ms** | 46 MB |

fox-agent headless vs scripted local provider: time to first token **57 ms**, peak RSS **58 MB**.

_Generated 2026-09-20T13:40:21Z on Linux x86_64 (6.17.0-1022-azure). [How this is measured](#benchmarks) · [raw JSON](bench/results.json)_
