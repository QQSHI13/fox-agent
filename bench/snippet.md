![bundle size](bench/bundle.svg)
![time to first char](bench/tui-first-char.svg)
![time to first input](bench/tui-first-input.svg)
![idle memory](bench/memory.svg)

| agent | version | bundle | `--version` | TUI 1st byte | TUI 1st input | idle PSS |
|---|---|---|---|---|---|---|
| **fox-agent** | 0.5.0-beta.1 | 89.2 MB | 13 ms | **15 ms** | — | 35 MB |
| claude code | 2.1.283 (Claude Code) | 241.6 MB | 8 ms | **191 ms** | — | 172 MB |
| codex | codex-cli 0.158.0 | 444.1 MB (pkg) | 41 ms | **43 ms** | — | 49 MB |
| opencode v1 | 1.18.33 | 185.4 MB | 596 ms | **982 ms** | **45 ms** | 365 MB |
| opencode v2 | opencode2 v0.0.0-beta-19271 | 207.4 MB | 84 ms | **136 ms** | **66 ms** | 128 MB |
| jcode | jcode v0.89.0 (9929ee0ea) | 131.5 MB | 9 ms | **11 ms** | — | 27 MB |
| pi | 0.87.1 | 403.5 MB (pkg) | 231 ms | **290 ms** | **7 ms** | 142 MB |
| gemini cli | 0.61.0 | 102.1 MB (pkg) | 1514 ms | **1598 ms** | **0 ms** | 146 MB |
| copilot cli | GitHub Copilot CLI 1.0.88. | 169.6 MB (pkg) | 600 ms | **728 ms** | — | 48 MB |
| crush | crush version v0.96.1 | 123.7 MB (pkg) | 153 ms | **287 ms** | — | 69 MB |
| goose | 1.52.0 | 300.8 MB | 7 ms | **7 ms** | **0 ms** | — |
| aider | aider 0.86.2 | 642.8 MB (pkg) | 795 ms | **730 ms** | **10 ms** | 67 MB |
| amp | n/a (not installed) | — | — | — | — | — |
| cursor-agent | n/a (not installed) | — | — | — | — | — |
| qwen code | 0.24.6 | 138.1 MB (pkg) | 37 ms | **768 ms** | — | 249 MB |
| codebuff | n/a (not installed) | — | — | — | — | — |
| kilo code | 7.8.1 | 542.5 MB (pkg) | 997 ms | **1859 ms** | **49 ms** | 46 MB |

fox-agent headless vs scripted local provider: time to first token **52 ms**, peak RSS **59 MB**.

_Generated 2026-09-28T13:51:52Z on Linux x86_64 (6.17.0-1022-azure). [How this is measured](#benchmarks) · [raw JSON](bench/results.json)_
