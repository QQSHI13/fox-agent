![bundle size](bench/bundle.svg)
![time to first char](bench/tui-first-char.svg)
![idle memory](bench/memory.svg)

| agent | version | bundle | `--version` | TUI 1st byte | idle PSS |
|---|---|---|---|---|---|
| **fox-agent** | 0.4.0 | 89.1 MB | 12 ms | **14 ms** | 36 MB |
| claude code | 2.1.278 (Claude Code) | 234.1 MB | 8 ms | **200 ms** | 186 MB |
| codex | codex-cli 0.155.1 | 370.5 MB (pkg) | 40 ms | **38 ms** | 49 MB |
| opencode v1 | 1.18.31 | 185.0 MB | 618 ms | **1019 ms** | 362 MB |
| opencode v2 | opencode2 v0.0.0-beta-19271 | 207.4 MB | 83 ms | **136 ms** | 97 MB |
| jcode | jcode v0.86.0 (e589cbe5a) | 0.0 MB (entry) | 9 ms | **11 ms** | 27 MB |
| pi | 0.86.1 | 402.9 MB (pkg) | 227 ms | **286 ms** | 151 MB |
| gemini cli | 0.60.0 | 102.0 MB (pkg) | 1519 ms | **1586 ms** | 146 MB |
| copilot cli | GitHub Copilot CLI 1.0.86. | 166.8 MB (pkg) | 609 ms | **728 ms** | 48 MB |
| crush | crush version v0.96.0 | 123.7 MB (pkg) | 164 ms | **320 ms** | 68 MB |
| goose | 1.51.0 | 312.5 MB | 8 ms | **8 ms** | 25 MB |
| aider | aider 0.86.2 | 642.8 MB (pkg) | 820 ms | **735 ms** | 67 MB |
| amp | n/a (not installed) | — | — | — | — |
| cursor-agent | n/a (not installed) | — | — | — | — |
| qwen code | 0.24.2 | 154.1 MB (pkg) | 36 ms | **1648 ms** | 27 MB |
| codebuff | n/a (not installed) | — | — | — | — |
| kilo code | 7.7.6 | 540.3 MB (pkg) | 1052 ms | **1851 ms** | 46 MB |

fox-agent headless vs scripted local provider: time to first token **54 ms**, peak RSS **58 MB**.

_Generated 2026-09-21T12:58:05Z on Linux x86_64 (6.17.0-1022-azure). [How this is measured](#benchmarks) · [raw JSON](bench/results.json)_
