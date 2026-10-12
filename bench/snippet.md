![harness bench dashboard](bench/bench.svg)

| agent | bundle | `--version` | TUI 1st byte | TUI 1st input | input latency 1s | idle PSS |
|---|---|---|---|---|---|---|
| **fox-agent** | 120 MB | 12 ms | **13 ms** | — | — | 36 MB |
| claude code | 257 MB | 5 ms | **155 ms** | — | — | 187 MB |
| codex | 140 MB | 31 ms | **34 ms** | — | — | 49 MB |
| opencode v2 | 207 MB | 61 ms | **100 ms** | **470 ms** | **49 ms** | 124 MB |
| jcode | 138 MB | 6 ms | **8 ms** | — | — | 28 MB |
| pi | 140 MB | 162 ms | **218 ms** | **716 ms** | **6 ms** | 132 MB |
| gemini cli | 140 MB | 1003 ms | **1080 ms** | **1103 ms** | — | — |
| copilot cli | 140 MB | 70 ms | **552 ms** | — | — | 47 MB |
| crush | 140 MB | 100 ms | **412 ms** | — | — | 69 MB |
| goose | 308 MB | 5 ms | **5 ms** | **159 ms** | — | — |
| aider | 140 MB | 523 ms | **449 ms** | **831 ms** | **7 ms** | 67 MB |
| amp | 134 MB | 194 ms | **194 ms** | **554 ms** | **1 ms** | 164 MB |
| cursor-agent | 140 MB | 301 ms | **289 ms** | — | — | 218 MB |
| qwen code | 140 MB | 27 ms | **561 ms** | — | — | 291 MB |
| codebuff | 140 MB | 705 ms | **695 ms** | — | — | 58 MB |
| kilo code | 140 MB | 634 ms | **1809 ms** | — | — | 46 MB |
| droid | 281 MB | 68 ms | **75 ms** | — | — | 228 MB |
| kimi code | 191 MB | 409 ms | **575 ms** | — | — | 351 MB |
| devin | 195 MB | 2 ms | **30 ms** | — | — | 47 MB |
| cline | 140 MB | 707 ms | **927 ms** | — | — | 55 MB |
| continue | 140 MB | 780 ms | — | — | — | 317 MB |
| iflow cli | 140 MB | 850 ms | **905 ms** | **1706 ms** | **47 ms** | 58 MB |

<details><summary>full precision · all collected fields</summary>

| agent | version | bin | bundle (MB) | bundle kind | `--version` (ms) | TUI 1st byte (ms) | TUI 1st input (ms) | input latency 1s (ms) | idle PSS (MB) |
|---|---|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.5.0-beta.1 | `/home/runner/work/fox-agent/fox-agent/bin/fox` | 120.4 | bin | 11.7 | 12.6 | — | — | 36.2 |
| claude code | 2.1.296 (Claude Code) | `/home/runner/.npm-global/bin/claude` | 257.1 | bin | 5.5 | 154.7 | — | — | 187.2 |
| codex | codex-cli 0.162.1 | `/home/runner/.npm-global/bin/codex` | 140.0 | bin | 31.1 | 33.6 | — | — | 49.1 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | `/home/runner/.npm-global/bin/opencode2` | 207.4 | bin | 60.9 | 100.5 | 470.3 | 48.6 | 123.8 |
| jcode | jcode v0.95.0 (6487bbd7e) | `/home/runner/.local/bin/jcode` | 138.2 | bin | 6.4 | 7.8 | — | — | 27.5 |
| pi | 1.1.0 | `/home/runner/.npm-global/bin/pi` | 140.0 | bin | 162.1 | 218.0 | 715.9 | 6.1 | 131.8 |
| gemini cli | 0.63.0 | `/home/runner/.npm-global/bin/gemini` | 140.0 | bin | 1003.5 | 1079.9 | 1103.1 | — | — |
| copilot cli | GitHub Copilot CLI 1.0.95. | `/home/runner/.npm-global/bin/copilot` | 140.0 | bin | 70.0 | 551.8 | — | — | 47.3 |
| crush | crush version v0.98.1 | `/home/runner/.npm-global/bin/crush` | 140.0 | bin | 100.4 | 411.5 | — | — | 68.6 |
| goose | 1.54.0 | `/home/runner/.local/bin/goose` | 307.8 | bin | 5.1 | 4.6 | 158.7 | — | — |
| aider | aider 0.86.2 | `/home/runner/work/fox-agent/fox-agent/.venv-bench/bin/aider` | 140.0 | bin | 522.5 | 448.8 | 831.0 | 6.7 | 66.9 |
| amp | 0.0.1791792883-gf1ab8d (released 2026-10-12T08:14:43.000Z, 4 | `/home/runner/.local/bin/amp` | 134.2 | bin | 194.1 | 194.5 | 553.6 | 0.6 | 164.4 |
| cursor-agent | 2026.10.01-e373342 | `/home/runner/.local/bin/cursor-agent` | 140.0 | bin | 301.4 | 289.5 | — | — | 218.0 |
| qwen code | 0.25.1 | `/home/runner/.npm-global/bin/qwen` | 140.0 | bin | 26.7 | 561.2 | — | — | 291.1 |
| codebuff | 1.0.688 | `/home/runner/.npm-global/bin/codebuff` | 140.0 | bin | 705.1 | 694.6 | — | — | 57.6 |
| kilo code | 7.8.8 | `/home/runner/.npm-global/bin/kilocode` | 140.0 | bin | 634.2 | 1809.1 | — | — | 46.1 |
| droid | 0.238.0 | `/home/runner/.local/bin/droid` | 281.4 | bin | 68.1 | 74.6 | — | — | 228.4 |
| kimi code | 2.1.1 | `/home/runner/.kimi-code/bin/kimi` | 190.8 | bin | 408.8 | 574.8 | — | — | 350.8 |
| devin | devin 3000.11.3 (9c803229faa4) | `/home/runner/.local/bin/devin` | 195.0 | bin | 2.2 | 29.6 | — | — | 46.6 |
| cline | 3.0.70 | `/home/runner/.npm-global/bin/cline` | 140.0 | bin | 706.8 | 927.2 | — | — | 55.0 |
| continue | 1.5.47 | `/home/runner/.npm-global/bin/cn` | 140.0 | bin | 780.2 | — | — | — | 316.8 |
| iflow cli | 0.5.19 | `/home/runner/.npm-global/bin/iflow` | 140.0 | bin | 849.9 | 904.8 | 1706.1 | 46.7 | 57.8 |

</details>

fox-agent headless vs scripted local provider: time to first token **46 ms**, peak RSS **60 MB**.

_Generated 2026-10-12T12:39:03Z on Linux x86_64 (6.17.0-1022-azure). [How this is measured](#benchmarks) · [raw JSON](bench/results.json)_
