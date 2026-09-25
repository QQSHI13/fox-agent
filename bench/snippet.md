![bundle size](bench/bundle.svg)
![time to first char](bench/tui-first-char.svg)
![time to first input](bench/tui-first-input.svg)
![idle memory](bench/memory.svg)

| agent | version | bundle | `--version` | TUI 1st byte | TUI 1st input | idle PSS |
|---|---|---|---|---|---|---|
| **fox-agent** | 0.5.0-beta.1 | 89.2 MB | 10 ms | **12 ms** | — | 33 MB |
| claude code | 2.1.282 (Claude Code) | 238.8 MB | 8 ms | **145 ms** | — | 173 MB |
| codex | codex-cli 0.156.1 | 386.9 MB (pkg) | 35 ms | **36 ms** | — | 49 MB |
| opencode v1 | 1.18.32 | 185.2 MB | 458 ms | **755 ms** | **32 ms** | 356 MB |
| opencode v2 | opencode2 v0.0.0-beta-19271 | 207.4 MB | 62 ms | **102 ms** | **46 ms** | 124 MB |
| jcode | jcode v0.88.0 (ee4cd3db3) | 130.1 MB | 8 ms | **10 ms** | — | 24 MB |
| pi | 0.87.1 | 403.5 MB (pkg) | 178 ms | **222 ms** | **6 ms** | 146 MB |
| gemini cli | 0.61.0 | 102.1 MB (pkg) | 1134 ms | **1198 ms** | **0 ms** | — |
| copilot cli | GitHub Copilot CLI 1.0.88. | 169.6 MB (pkg) | 468 ms | **561 ms** | — | 47 MB |
| crush | crush version v0.96.1 | 123.7 MB (pkg) | 118 ms | **233 ms** | — | 69 MB |
| goose | 1.52.0 | 300.8 MB | 6 ms | **6 ms** | **0 ms** | — |
| aider | aider 0.86.2 | 642.8 MB (pkg) | 610 ms | **546 ms** | **8 ms** | 67 MB |
| amp | n/a (not installed) | — | — | — | — | — |
| cursor-agent | n/a (not installed) | — | — | — | — | — |
| qwen code | 0.24.5 | 155.0 MB (pkg) | 32 ms | **945 ms** | — | 24 MB |
| codebuff | n/a (not installed) | — | — | — | — | — |
| kilo code | 7.7.9 | 542.5 MB (pkg) | 828 ms | **1468 ms** | **37 ms** | 46 MB |

fox-agent headless vs scripted local provider: time to first token **43 ms**, peak RSS **59 MB**.

_Generated 2026-09-25T00:53:24Z on Linux x86_64 (6.17.0-1022-azure). [How this is measured](#benchmarks) · [raw JSON](bench/results.json)_
