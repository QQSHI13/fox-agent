![harness bench dashboard](bench/bench.svg)

| agent | version | bundle | `--version` | TUI 1st byte | TUI 1st input | idle PSS |
|---|---|---|---|---|---|---|
| **fox-agent** | 0.5.0-beta.1 | 89.8 MB | 12 ms | **15 ms** | — | 38 MB |
| claude code | 2.1.295 (Claude Code) | 256.1 MB | 8 ms | **173 ms** | — | 187 MB |
| codex | codex-cli 0.162.0 | 140.0 MB | 34 ms | **37 ms** | — | 49 MB |
| opencode v2 | opencode2 v0.0.0-beta-19271 | 207.4 MB | 64 ms | **107 ms** | **49 ms** | 126 MB |
| jcode | jcode v0.93.0 (9948f0e8c) | 137.0 MB | 8 ms | **10 ms** | — | 27 MB |
| pi | 1.1.0 | 140.0 MB | 178 ms | **237 ms** | **6 ms** | 131 MB |
| gemini cli | 0.63.0 | 140.0 MB | 1129 ms | **1199 ms** | **0 ms** | — |
| copilot cli | GitHub Copilot CLI 1.0.94. | 140.0 MB | 82 ms | **602 ms** | — | 47 MB |
| crush | crush version v0.98.1 | 140.0 MB | 115 ms | **390 ms** | — | 69 MB |
| goose | 1.54.0 | 307.8 MB | 6 ms | **6 ms** | **0 ms** | — |
| aider | aider 0.86.2 | 140.0 MB | 609 ms | **545 ms** | **8 ms** | 67 MB |
| amp | 0.0.1791547250-gb79b2a (released 2026-10-09T12:00:50.000Z, 1 | 134.1 MB | 190 ms | **194 ms** | **0 ms** | 158 MB |
| cursor-agent | 2026.10.01-e373342 | 140.0 MB | 339 ms | **332 ms** | — | 213 MB |
| qwen code | 0.25.0 | 140.0 MB | 30 ms | **613 ms** | — | 298 MB |
| codebuff | 1.0.688 | 140.0 MB | 740 ms | **713 ms** | — | 58 MB |
| kilo code | 7.8.8 | 140.0 MB | 658 ms | **1939 ms** | **27 ms** | 46 MB |
| droid | 0.237.0 | 279.0 MB | 85 ms | **70 ms** | — | 225 MB |
| kimi code | 2.1.1 | 190.8 MB | 449 ms | **560 ms** | **12 ms** | 353 MB |
| devin | devin 3000.11.3 (9c803229faa4) | 195.0 MB | 3 ms | **38 ms** | — | 49 MB |
| cline | 3.0.70 | 140.0 MB | 694 ms | **872 ms** | — | 55 MB |
| continue | 1.5.47 | 140.0 MB | 855 ms | — | — | 318 MB |
| iflow cli | 0.5.19 | 140.0 MB | 924 ms | **992 ms** | **44 ms** | 58 MB |

fox-agent headless vs scripted local provider: time to first token **51 ms**, peak RSS **67 MB**.

_Generated 2026-10-09T13:40:18Z on Linux x86_64 (6.17.0-1022-azure). [How this is measured](#benchmarks) · [raw JSON](bench/results.json)_
