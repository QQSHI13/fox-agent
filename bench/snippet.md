![bundle size](bench/bundle.svg)
![time to first char](bench/tui-first-char.svg)
![idle memory](bench/memory.svg)

| agent | version | bundle | `--version` | TUI 1st byte | idle PSS |
|---|---|---|---|---|---|
| **fox-agent** | 0.5.0-beta.1 | 89.2 MB | 12 ms | **14 ms** | 36 MB |
| claude code | 2.1.278 (Claude Code) | 234.1 MB | 8 ms | **198 ms** | 185 MB |
| codex | codex-cli 0.155.1 | 370.5 MB (pkg) | 40 ms | **38 ms** | 49 MB |
| opencode v1 | 1.18.31 | 185.0 MB | 593 ms | **978 ms** | 363 MB |
| opencode v2 | opencode2 v0.0.0-beta-19271 | 207.4 MB | 81 ms | **132 ms** | 97 MB |
| jcode | jcode v0.86.0 (e589cbe5a) | 0.0 MB (entry) | 9 ms | **11 ms** | 26 MB |
| pi | 0.86.1 | 402.9 MB (pkg) | 225 ms | **286 ms** | 149 MB |
| gemini cli | 0.60.0 | 102.0 MB (pkg) | 1496 ms | **1577 ms** | 146 MB |
| copilot cli | GitHub Copilot CLI 1.0.86. | 166.8 MB (pkg) | 580 ms | **692 ms** | 47 MB |
| crush | crush version v0.96.0 | 123.7 MB (pkg) | 153 ms | **584 ms** | 69 MB |
| goose | 1.51.0 | 312.5 MB | 7 ms | **7 ms** | 26 MB |
| aider | aider 0.86.2 | 642.8 MB (pkg) | 784 ms | **728 ms** | 69 MB |
| amp | n/a (not installed) | — | — | — | — |
| cursor-agent | n/a (not installed) | — | — | — | — |
| qwen code | 0.24.2 | 154.1 MB (pkg) | 36 ms | **1588 ms** | 27 MB |
| codebuff | n/a (not installed) | — | — | — | — |
| kilo code | 7.7.6 | 540.3 MB (pkg) | 971 ms | **1726 ms** | 46 MB |

fox-agent headless vs scripted local provider: time to first token **50 ms**, peak RSS **59 MB**.

_Generated 2026-09-21T13:20:55Z on Linux x86_64 (6.17.0-1022-azure). [How this is measured](#benchmarks) · [raw JSON](bench/results.json)_
