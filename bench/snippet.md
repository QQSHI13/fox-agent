![bundle size](bench/bundle.svg)
![time to first char](bench/tui-first-char.svg)
![idle memory](bench/memory.svg)

| agent | version | bundle | `--version` | TUI 1st byte | idle PSS |
|---|---|---|---|---|---|
| **fox-agent** | 0.4.0 | 89.1 MB | 11 ms | **13 ms** | 35 MB |
| claude code | 2.1.276 (Claude Code) | 232.1 MB | 9 ms | **163 ms** | 184 MB |
| codex | codex-cli 0.155.0 | 370.6 MB (pkg) | 37 ms | **33 ms** | 49 MB |
| opencode v1 | 1.18.31 | 185.0 MB | 454 ms | **757 ms** | 354 MB |
| opencode v2 | opencode2 v0.0.0-beta-19271 | 207.4 MB | 66 ms | **110 ms** | 97 MB |
| jcode | jcode v0.84.0 (57d587899) | 0.0 MB (entry) | 8 ms | **11 ms** | 29 MB |
| pi | 0.85.1 | 415.1 MB (pkg) | 225 ms | **274 ms** | 148 MB |
| gemini cli | 0.60.0 | 102.0 MB (pkg) | 1172 ms | **1254 ms** | — |
| copilot cli | GitHub Copilot CLI 1.0.86. | 166.8 MB (pkg) | 469 ms | **588 ms** | 47 MB |
| crush | crush version v0.95.0 | 122.4 MB (pkg) | 122 ms | **409 ms** | 68 MB |
| goose | 1.51.0 | 312.5 MB | 7 ms | **7 ms** | 26 MB |
| aider | aider 0.86.2 | 642.8 MB (pkg) | 634 ms | **560 ms** | 69 MB |
| amp | n/a (not installed) | — | — | — | — |
| cursor-agent | n/a (not installed) | — | — | — | — |
| qwen code | 0.24.0 | 140.7 MB (pkg) | 32 ms | **1250 ms** | 26 MB |
| codebuff | n/a (not installed) | — | — | — | — |
| kilo code | 7.7.5 | 539.9 MB (pkg) | 789 ms | **1393 ms** | 46 MB |

fox-agent headless vs scripted local provider: time to first token **42 ms**, peak RSS **58 MB**.

_Generated 2026-09-18T12:32:59Z on Linux x86_64 (6.17.0-1022-azure). [How this is measured](#benchmarks) · [raw JSON](bench/results.json)_
