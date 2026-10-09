![harness bench dashboard](bench/bench.svg)

| agent | version | bundle | `--version` | TUI 1st byte | TUI 1st input | idle PSS |
|---|---|---|---|---|---|---|
| **fox-agent** | 0.5.0-beta.1 | 89.8 MB | 14 ms | **17 ms** | — | 38 MB |
| claude code | 2.1.295 (Claude Code) | 256.1 MB | 10 ms | **212 ms** | — | 187 MB |
| codex | codex-cli 0.162.0 | 140.0 MB | 45 ms | **45 ms** | — | 49 MB |
| opencode v2 | opencode2 v0.0.0-beta-19271 | 207.4 MB | 83 ms | **130 ms** | **60 ms** | 128 MB |
| jcode | jcode v0.93.0 (9948f0e8c) | 137.0 MB | 11 ms | **14 ms** | — | 27 MB |
| pi | 1.1.0 | 140.0 MB | 234 ms | **305 ms** | **8 ms** | 132 MB |
| gemini cli | 0.63.0 | 140.0 MB | 1470 ms | **1544 ms** | **0 ms** | 146 MB |
| copilot cli | GitHub Copilot CLI 1.0.94. | 140.0 MB | 105 ms | **758 ms** | — | 47 MB |
| crush | crush version v0.98.1 | 140.0 MB | 134 ms | **436 ms** | — | 69 MB |
| goose | 1.54.0 | 307.8 MB | 8 ms | **8 ms** | **0 ms** | — |
| aider | aider 0.86.2 | 140.0 MB | 810 ms | **710 ms** | **10 ms** | 67 MB |
| amp | 0.0.1791547250-gb79b2a (released 2026-10-09T12:00:50.000Z, 1 | 134.1 MB | 231 ms | **246 ms** | **1 ms** | 159 MB |
| cursor-agent | 2026.10.01-e373342 | 140.0 MB | 441 ms | **417 ms** | — | 218 MB |
| qwen code | 0.25.0 | 140.0 MB | 40 ms | **782 ms** | — | 245 MB |
| codebuff | 1.0.688 | 140.0 MB | 964 ms | **907 ms** | — | 58 MB |
| kilo code | 7.8.8 | 140.0 MB | 867 ms | **2588 ms** | **36 ms** | 46 MB |
| droid | 0.237.0 | 279.0 MB | 88 ms | **110 ms** | — | 233 MB |
| kimi code | 2.1.1 | 190.8 MB | 568 ms | **727 ms** | **14 ms** | 353 MB |
| devin | devin 3000.11.3 (9c803229faa4) | 195.0 MB | 4 ms | **50 ms** | — | 48 MB |
| cline | 3.0.70 | 140.0 MB | 870 ms | **1133 ms** | — | 55 MB |
| continue | 1.5.47 | 140.0 MB | 1108 ms | — | — | 319 MB |
| iflow cli | 0.5.19 | 140.0 MB | 1193 ms | **1278 ms** | **47 ms** | 56 MB |

fox-agent headless vs scripted local provider: time to first token **56 ms**, peak RSS **67 MB**.

_Generated 2026-10-09T14:17:00Z on Linux x86_64 (6.17.0-1022-azure). [How this is measured](#benchmarks) · [raw JSON](bench/results.json)_
