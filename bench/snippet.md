![bundle size](bench/bundle.svg)
![time to first char](bench/tui-first-char.svg)
![idle memory](bench/memory.svg)

| agent | version | bundle | `--version` | TUI 1st byte | idle PSS |
|---|---|---|---|---|---|
| **fox-agent** | 0.4.0 | 89.0 MB | 10 ms | **11 ms** | 34 MB |
| claude code | 2.1.274 (Claude Code) | 230.6 MB | 7 ms | **166 ms** | 183 MB |
| codex | codex-cli 0.154.0 | 339.1 MB (pkg) | 34 ms | **30 ms** | 49 MB |
| opencode v1 | 1.18.31 | 185.0 MB | 472 ms | **789 ms** | 353 MB |
| opencode v2 | opencode2 v0.0.0-beta-19271 | 207.4 MB | 63 ms | **109 ms** | 96 MB |
| jcode | jcode v0.84.0 (57d587899) | 0.0 MB (entry) | 7 ms | **8 ms** | 29 MB |
| pi | 0.85.1 | 415.1 MB (pkg) | 227 ms | **271 ms** | 132 MB |
| gemini cli | 0.60.0 | 102.0 MB (pkg) | 1139 ms | **1215 ms** | — |
| copilot cli | GitHub Copilot CLI 1.0.85. | 166.5 MB (pkg) | 462 ms | **562 ms** | 47 MB |
| crush | crush version v0.95.0 | 122.4 MB (pkg) | 117 ms | **508 ms** | 69 MB |
| goose | 1.50.1 | 314.6 MB | 5 ms | **5 ms** | 26 MB |
| aider | aider 0.86.2 | 642.8 MB (pkg) | 584 ms | **529 ms** | 69 MB |
| amp | n/a (not installed) | — | — | — | — |
| cursor-agent | n/a (not installed) | — | — | — | — |
| qwen code | 0.24.0 | 140.7 MB (pkg) | 29 ms | **1230 ms** | 26 MB |
| codebuff | n/a (not installed) | — | — | — | — |
| kilo code | 7.7.3 | 539.9 MB (pkg) | 828 ms | **1428 ms** | 46 MB |

fox-agent headless vs scripted local provider: time to first token **61 ms**, peak RSS **58 MB**.

_Generated 2026-09-17T11:49:17Z on Linux x86_64 (6.17.0-1022-azure). [How this is measured](#benchmarks) · [raw JSON](bench/results.json)_
