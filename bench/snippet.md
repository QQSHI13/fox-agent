![bundle size](bench/bundle.svg)
![time to first char](bench/tui-first-char.svg)
![time to first input](bench/tui-first-input.svg)
![idle memory](bench/memory.svg)

| agent | version | bundle | `--version` | TUI 1st byte | TUI 1st input | idle PSS |
|---|---|---|---|---|---|---|
| **fox-agent** | 0.5.0-beta.1 | 89.7 MB | 9 ms | **11 ms** | — | 37 MB |
| claude code | 2.1.293 (Claude Code) | 252.8 MB | 6 ms | **157 ms** | — | 185 MB |
| codex | codex-cli 0.161.0 | 450.4 MB (pkg) | 36 ms | **39 ms** | — | 49 MB |
| opencode v1 | 1.18.35 | 185.7 MB | 452 ms | **740 ms** | **36 ms** | 356 MB |
| opencode v2 | opencode2 v0.0.0-beta-19271 | 207.4 MB | 66 ms | **110 ms** | **55 ms** | 126 MB |
| jcode | jcode v0.91.0 (439a243bb) | 135.1 MB | 7 ms | **9 ms** | — | 27 MB |
| pi | 1.1.0 | 123.3 MB (pkg) | 176 ms | **232 ms** | **6 ms** | 131 MB |
| gemini cli | 0.63.0 | 102.3 MB (pkg) | 1110 ms | **1186 ms** | **0 ms** | — |
| copilot cli | GitHub Copilot CLI 1.0.93. | 181.6 MB (pkg) | 80 ms | **659 ms** | — | 47 MB |
| crush | crush version v0.97.1 | 128.5 MB (pkg) | 116 ms | **406 ms** | — | 69 MB |
| goose | 1.53.0 | 298.7 MB | 5 ms | **5 ms** | — | — |
| aider | aider 0.86.2 | 642.8 MB (pkg) | 558 ms | **491 ms** | **8 ms** | 67 MB |
| amp | n/a (not installed) | — | — | — | — | — |
| cursor-agent | n/a (not installed) | — | — | — | — | — |
| qwen code | 0.25.0 | 146.2 MB (pkg) | 30 ms | **612 ms** | — | 288 MB |
| codebuff | n/a (not installed) | — | — | — | — | — |
| kilo code | 7.8.8 | 653.7 MB (pkg) | 662 ms | **1990 ms** | **34 ms** | 46 MB |

fox-agent headless vs scripted local provider: time to first token **61 ms**, peak RSS **66 MB**.

_Generated 2026-10-08T11:29:10Z on Linux x86_64 (6.17.0-1022-azure). [How this is measured](#benchmarks) · [raw JSON](bench/results.json)_
