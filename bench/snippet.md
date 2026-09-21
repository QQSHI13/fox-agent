![bundle size](bench/bundle.svg)
![time to first char](bench/tui-first-char.svg)
![idle memory](bench/memory.svg)

| agent | version | bundle | `--version` | TUI 1st byte | idle PSS |
|---|---|---|---|---|---|
| **fox-agent** | 0.4.0 | 89.1 MB | 12 ms | **15 ms** | 36 MB |
| claude code | 2.1.278 (Claude Code) | 234.1 MB | 9 ms | **228 ms** | 185 MB |
| codex | codex-cli 0.155.1 | 370.5 MB (pkg) | 43 ms | **38 ms** | 49 MB |
| opencode v1 | 1.18.31 | 185.0 MB | 612 ms | **1004 ms** | 359 MB |
| opencode v2 | opencode2 v0.0.0-beta-19271 | 207.4 MB | 82 ms | **140 ms** | 97 MB |
| jcode | jcode v0.86.0 (e589cbe5a) | 0.0 MB (entry) | 10 ms | **11 ms** | 25 MB |
| pi | 0.86.1 | 402.9 MB (pkg) | 232 ms | **296 ms** | 145 MB |
| gemini cli | 0.60.0 | 102.0 MB (pkg) | 1565 ms | **1631 ms** | 146 MB |
| copilot cli | GitHub Copilot CLI 1.0.86. | 166.8 MB (pkg) | 606 ms | **727 ms** | 48 MB |
| crush | crush version v0.96.0 | 123.7 MB (pkg) | 167 ms | **562 ms** | 69 MB |
| goose | 1.51.0 | 312.5 MB | 8 ms | **8 ms** | 25 MB |
| aider | aider 0.86.2 | 642.8 MB (pkg) | 827 ms | **746 ms** | 69 MB |
| amp | n/a (not installed) | — | — | — | — |
| cursor-agent | n/a (not installed) | — | — | — | — |
| qwen code | 0.24.2 | 154.1 MB (pkg) | 37 ms | **1637 ms** | 26 MB |
| codebuff | n/a (not installed) | — | — | — | — |
| kilo code | 7.7.5 | 539.9 MB (pkg) | 1012 ms | **1816 ms** | 46 MB |

fox-agent headless vs scripted local provider: time to first token **52 ms**, peak RSS **58 MB**.

_Generated 2026-09-21T12:30:29Z on Linux x86_64 (6.17.0-1022-azure). [How this is measured](#benchmarks) · [raw JSON](bench/results.json)_
