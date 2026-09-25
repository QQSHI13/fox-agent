![bundle size](bench/bundle.svg)
![time to first char](bench/tui-first-char.svg)
![time to first input](bench/tui-first-input.svg)
![idle memory](bench/memory.svg)

| agent | version | bundle | `--version` | TUI 1st byte | TUI 1st input | idle PSS |
|---|---|---|---|---|---|---|
| **fox-agent** | 0.5.0-beta.1 | 89.2 MB | 12 ms | **15 ms** | — | 36 MB |
| claude code | 2.1.282 (Claude Code) | 238.8 MB | 9 ms | **181 ms** | — | 173 MB |
| codex | codex-cli 0.156.1 | 386.9 MB (pkg) | 43 ms | **44 ms** | — | 49 MB |
| opencode v1 | 1.18.32 | 185.2 MB | 574 ms | **934 ms** | **39 ms** | 365 MB |
| opencode v2 | opencode2 v0.0.0-beta-19271 | 207.4 MB | 78 ms | **128 ms** | **62 ms** | 128 MB |
| jcode | jcode v0.88.0 (ee4cd3db3) | 130.1 MB | 10 ms | **12 ms** | — | 24 MB |
| pi | 0.87.1 | 403.5 MB (pkg) | 219 ms | **279 ms** | **7 ms** | 145 MB |
| gemini cli | 0.61.0 | 102.1 MB (pkg) | 1420 ms | **1505 ms** | **0 ms** | 146 MB |
| copilot cli | GitHub Copilot CLI 1.0.88. | 169.6 MB (pkg) | 578 ms | **690 ms** | — | 47 MB |
| crush | crush version v0.96.1 | 123.7 MB (pkg) | 151 ms | **563 ms** | — | 69 MB |
| goose | 1.52.0 | 300.8 MB | 7 ms | **7 ms** | **0 ms** | — |
| aider | aider 0.86.2 | 642.8 MB (pkg) | 768 ms | **701 ms** | **10 ms** | 67 MB |
| amp | n/a (not installed) | — | — | — | — | — |
| cursor-agent | n/a (not installed) | — | — | — | — | — |
| qwen code | 0.24.5 | 155.0 MB (pkg) | 38 ms | **1126 ms** | — | 27 MB |
| codebuff | n/a (not installed) | — | — | — | — | — |
| kilo code | 7.7.9 | 542.5 MB (pkg) | 982 ms | **1676 ms** | **48 ms** | 46 MB |

fox-agent headless vs scripted local provider: time to first token **45 ms**, peak RSS **58 MB**.

_Generated 2026-09-25T01:17:59Z on Linux x86_64 (6.17.0-1022-azure). [How this is measured](#benchmarks) · [raw JSON](bench/results.json)_
