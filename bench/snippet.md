![harness bench dashboard](bench/bench.svg)

| agent | bundle | `--version` | TUI 1st byte | TUI 1st input | input latency 1s | idle PSS |
|---|---|---|---|---|---|---|
| **fox-agent** | 99 MB | 11 ms | **11 ms** | — | — | 34 MB |
| claude code | 257 MB | 6 ms | **169 ms** | — | — | 187 MB |
| codex | 140 MB | 35 ms | **36 ms** | — | — | 49 MB |
| opencode v2 | 207 MB | 64 ms | **110 ms** | **472 ms** | **53 ms** | 128 MB |
| jcode | 137 MB | 7 ms | **8 ms** | — | — | 27 MB |
| pi | 140 MB | 175 ms | **236 ms** | **723 ms** | **7 ms** | 131 MB |
| gemini cli | 140 MB | 1140 ms | **1217 ms** | **1235 ms** | — | — |
| copilot cli | 140 MB | 79 ms | **604 ms** | — | — | 47 MB |
| crush | 140 MB | 113 ms | **485 ms** | — | — | 68 MB |
| goose | 308 MB | 5 ms | **5 ms** | **158 ms** | **0 ms** | — |
| aider | 140 MB | 583 ms | **524 ms** | **907 ms** | **8 ms** | 67 MB |
| amp | 134 MB | 194 ms | **198 ms** | **560 ms** | **1 ms** | 159 MB |
| cursor-agent | 140 MB | 341 ms | **332 ms** | — | — | 217 MB |
| qwen code | 140 MB | 29 ms | **612 ms** | — | — | 287 MB |
| codebuff | 140 MB | 746 ms | **732 ms** | — | — | 58 MB |
| kilo code | 140 MB | 712 ms | **2055 ms** | — | — | 46 MB |
| droid | 281 MB | 75 ms | **113 ms** | — | — | 227 MB |
| kimi code | 191 MB | 442 ms | **549 ms** | **964 ms** | **7 ms** | 353 MB |
| devin | 195 MB | 2 ms | **32 ms** | — | — | 47 MB |
| cline | 140 MB | 754 ms | **938 ms** | — | — | 55 MB |
| continue | 140 MB | 858 ms | — | — | — | 317 MB |
| iflow cli | 140 MB | 927 ms | **992 ms** | **1808 ms** | **46 ms** | 58 MB |

<details><summary>full precision · all collected fields</summary>

| agent | version | bin | bundle (MB) | bundle kind | `--version` (ms) | TUI 1st byte (ms) | TUI 1st input (ms) | input latency 1s (ms) | idle PSS (MB) |
|---|---|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.5.0-beta.1 | `/home/runner/work/fox-agent/fox-agent/bin/fox` | 98.9 | bin | 10.7 | 11.4 | — | — | 33.9 |
| claude code | 2.1.296 (Claude Code) | `/home/runner/.npm-global/bin/claude` | 257.1 | bin | 6.3 | 168.9 | — | — | 187.4 |
| codex | codex-cli 0.162.1 | `/home/runner/.npm-global/bin/codex` | 140.0 | bin | 34.6 | 35.8 | — | — | 49.0 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | `/home/runner/.npm-global/bin/opencode2` | 207.4 | bin | 64.3 | 109.8 | 472.3 | 53.2 | 127.7 |
| jcode | jcode v0.94.0 (b6c63ff04) | `/home/runner/.local/bin/jcode` | 137.1 | bin | 6.6 | 8.1 | — | — | 27.0 |
| pi | 1.1.0 | `/home/runner/.npm-global/bin/pi` | 140.0 | bin | 175.5 | 236.1 | 722.9 | 6.7 | 130.9 |
| gemini cli | 0.63.0 | `/home/runner/.npm-global/bin/gemini` | 140.0 | bin | 1139.7 | 1217.2 | 1235.4 | — | — |
| copilot cli | GitHub Copilot CLI 1.0.95. | `/home/runner/.npm-global/bin/copilot` | 140.0 | bin | 79.2 | 604.4 | — | — | 47.3 |
| crush | crush version v0.98.1 | `/home/runner/.npm-global/bin/crush` | 140.0 | bin | 112.5 | 484.6 | — | — | 68.5 |
| goose | 1.54.0 | `/home/runner/.local/bin/goose` | 307.8 | bin | 5.1 | 5.1 | 157.7 | 0.1 | — |
| aider | aider 0.86.2 | `/home/runner/work/fox-agent/fox-agent/.venv-bench/bin/aider` | 140.0 | bin | 583.0 | 524.4 | 907.1 | 8.1 | 66.9 |
| amp | 0.0.1791705634-g3bdda1 (released 2026-10-11T08:00:34.000Z, 1 | `/home/runner/.local/bin/amp` | 134.2 | bin | 194.4 | 197.9 | 559.8 | 0.5 | 158.9 |
| cursor-agent | 2026.10.01-e373342 | `/home/runner/.local/bin/cursor-agent` | 140.0 | bin | 341.0 | 332.3 | — | — | 217.2 |
| qwen code | 0.25.0 | `/home/runner/.npm-global/bin/qwen` | 140.0 | bin | 29.2 | 611.5 | — | — | 286.5 |
| codebuff | 1.0.688 | `/home/runner/.npm-global/bin/codebuff` | 140.0 | bin | 745.8 | 732.2 | — | — | 57.6 |
| kilo code | 7.8.8 | `/home/runner/.npm-global/bin/kilocode` | 140.0 | bin | 711.6 | 2054.7 | — | — | 46.2 |
| droid | 0.238.0 | `/home/runner/.local/bin/droid` | 281.4 | bin | 75.2 | 112.8 | — | — | 226.8 |
| kimi code | 2.1.1 | `/home/runner/.kimi-code/bin/kimi` | 190.8 | bin | 442.2 | 548.8 | 964.0 | 7.4 | 353.0 |
| devin | devin 3000.11.3 (9c803229faa4) | `/home/runner/.local/bin/devin` | 195.0 | bin | 2.2 | 32.4 | — | — | 46.7 |
| cline | 3.0.70 | `/home/runner/.npm-global/bin/cline` | 140.0 | bin | 754.4 | 937.8 | — | — | 54.9 |
| continue | 1.5.47 | `/home/runner/.npm-global/bin/cn` | 140.0 | bin | 858.3 | — | — | — | 317.1 |
| iflow cli | 0.5.19 | `/home/runner/.npm-global/bin/iflow` | 140.0 | bin | 927.2 | 992.4 | 1808.4 | 46.3 | 57.8 |

</details>

fox-agent headless vs scripted local provider: time to first token **54 ms**, peak RSS **60 MB**.

_Generated 2026-10-11T09:57:49Z on Linux x86_64 (6.17.0-1022-azure). [How this is measured](#benchmarks) · [raw JSON](bench/results.json)_
