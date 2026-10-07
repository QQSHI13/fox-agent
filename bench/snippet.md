![bundle size](bench/bundle.svg)
![time to first char](bench/tui-first-char.svg)
![time to first input](bench/tui-first-input.svg)
![idle memory](bench/memory.svg)

| agent | version | bundle | `--version` | TUI 1st byte | TUI 1st input | idle PSS |
|---|---|---|---|---|---|---|
| **fox-agent** | 0.5.0-beta.1 | 89.3 MB | 11 ms | **12 ms** | — | 33 MB |
| claude code | 2.1.289 (Claude Code) | 246.1 MB | 7 ms | **170 ms** | — | 180 MB |
| codex | codex-cli 0.160.0 | 446.7 MB (pkg) | 33 ms | **35 ms** | — | 49 MB |
| opencode v1 | 1.18.34 | 185.6 MB | 495 ms | **801 ms** | **36 ms** | 352 MB |
| opencode v2 | opencode2 v0.0.0-beta-19271 | 207.4 MB | 68 ms | **111 ms** | **58 ms** | 128 MB |
| jcode | jcode v0.90.1 (b0e48d8aa) | 134.7 MB | 7 ms | **8 ms** | — | 27 MB |
| pi | 1.0.3 | 123.0 MB (pkg) | 180 ms | **247 ms** | **7 ms** | 133 MB |
| gemini cli | 0.62.0 | 102.2 MB (pkg) | 1166 ms | **1242 ms** | **0 ms** | — |
| copilot cli | GitHub Copilot CLI 1.0.91. | 178.6 MB (pkg) | 86 ms | **698 ms** | — | 47 MB |
| crush | crush version v0.97.1 | 128.5 MB (pkg) | 126 ms | **514 ms** | — | 68 MB |
| goose | 1.53.0 | 298.7 MB | 6 ms | **6 ms** | **0 ms** | — |
| aider | aider 0.86.2 | 642.8 MB (pkg) | 580 ms | **533 ms** | **8 ms** | 67 MB |
| amp | n/a (not installed) | — | — | — | — | — |
| cursor-agent | n/a (not installed) | — | — | — | — | — |
| qwen code | 0.25.0 | 146.2 MB (pkg) | 28 ms | **614 ms** | — | 305 MB |
| codebuff | n/a (not installed) | — | — | — | — | — |
| kilo code | 7.8.3 | 542.3 MB (pkg) | 838 ms | **1513 ms** | **42 ms** | 46 MB |

fox-agent headless vs scripted local provider: time to first token **53 ms**, peak RSS **64 MB**.

_Generated 2026-10-05T14:35:07Z on Linux x86_64 (6.17.0-1022-azure). [How this is measured](#benchmarks) · [raw JSON](bench/results.json)_
