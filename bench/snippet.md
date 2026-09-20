![bundle size](bench/bundle.svg)
![time to first char](bench/tui-first-char.svg)
![idle memory](bench/memory.svg)

| agent | version | bundle | `--version` | TUI 1st byte | idle PSS |
|---|---|---|---|---|---|
| **fox-agent** | 0.4.0 | 89.1 MB | 9 ms | **11 ms** | 35 MB |
| claude code | 2.1.278 (Claude Code) | 234.1 MB | 6 ms | **151 ms** | 186 MB |
| codex | codex-cli 0.155.1 | 370.5 MB (pkg) | 32 ms | **29 ms** | 49 MB |
| opencode v1 | 1.18.31 | 185.0 MB | 407 ms | **650 ms** | 359 MB |
| opencode v2 | opencode2 v0.0.0-beta-19271 | 207.4 MB | 68 ms | **111 ms** | 97 MB |
| jcode | jcode v0.86.0 (e589cbe5a) | 0.0 MB (entry) | 7 ms | **9 ms** | 26 MB |
| pi | 0.86.1 | 402.9 MB (pkg) | 145 ms | **186 ms** | 146 MB |
| gemini cli | 0.60.0 | 102.0 MB (pkg) | 968 ms | **1002 ms** | — |
| copilot cli | GitHub Copilot CLI 1.0.86. | 166.8 MB (pkg) | 402 ms | **471 ms** | 47 MB |
| crush | crush version v0.95.0 | 122.4 MB (pkg) | 98 ms | **392 ms** | 68 MB |
| goose | 1.51.0 | 312.5 MB | 6 ms | **6 ms** | 25 MB |
| aider | aider 0.86.2 | 642.8 MB (pkg) | 542 ms | **464 ms** | 69 MB |
| amp | n/a (not installed) | — | — | — | — |
| cursor-agent | n/a (not installed) | — | — | — | — |
| qwen code | 0.24.1 | 155.0 MB (pkg) | 29 ms | **1056 ms** | 27 MB |
| codebuff | n/a (not installed) | — | — | — | — |
| kilo code | 7.7.5 | 539.9 MB (pkg) | 715 ms | **1242 ms** | 46 MB |

fox-agent headless vs scripted local provider: time to first token **43 ms**, peak RSS **58 MB**.

_Generated 2026-09-20T14:17:28Z on Linux x86_64 (6.17.0-1022-azure). [How this is measured](#benchmarks) · [raw JSON](bench/results.json)_
