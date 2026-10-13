![harness bench dashboard](bench/bench.svg)

| agent | bundle | `--version` | TUI 1st byte | TUI 1st input | input latency 1s | idle PSS |
|---|---|---|---|---|---|---|
| **fox-agent** | 120 MB | 15 ms | **16 ms** | **378 ms** | **1 ms** | 37 MB |
| claude code | 257 MB | 8 ms | **205 ms** | — | — | 188 MB |
| codex | 140 MB | 41 ms | **44 ms** | **815 ms** | **2 ms** | 49 MB |
| opencode v2 | 207 MB | 75 ms | **131 ms** | **497 ms** | **66 ms** | 129 MB |
| jcode | 138 MB | 8 ms | **10 ms** | **583 ms** | **1 ms** | 28 MB |
| pi | 140 MB | 225 ms | **300 ms** | **794 ms** | **9 ms** | 132 MB |
| gemini cli | 140 MB | 1415 ms | **1484 ms** | **1502 ms** | **0 ms** | 143 MB |
| copilot cli | 140 MB | 96 ms | **730 ms** | — | — | 47 MB |
| crush | 140 MB | 138 ms | **562 ms** | **930 ms** | **74 ms** | 69 MB |
| goose | 308 MB | 6 ms | **7 ms** | **367 ms** | **0 ms** | 105 MB |
| aider | 140 MB | 727 ms | **652 ms** | **1036 ms** | **10 ms** | 67 MB |
| amp | 134 MB | 233 ms | **246 ms** | **605 ms** | **0 ms** | 162 MB |
| cursor-agent | 140 MB | 423 ms | **414 ms** | — | — | 214 MB |
| qwen code | 140 MB | 36 ms | **769 ms** | **1246 ms** | — | 252 MB |
| codebuff | 140 MB | 932 ms | **914 ms** | **1442 ms** | **112 ms** | 58 MB |
| kilo code | 140 MB | 887 ms | **2587 ms** | **6475 ms** | **1451 ms** | 46 MB |
| droid | 292 MB | 95 ms | **106 ms** | **3190 ms** | **726 ms** | 220 MB |
| kimi code | 191 MB | 571 ms | **705 ms** | **1095 ms** | **4 ms** | 350 MB |
| devin | 195 MB | 3 ms | **38 ms** | **1041 ms** | **641 ms** | 49 MB |
| cline | 140 MB | 881 ms | **1133 ms** | — | — | 55 MB |
| continue | 140 MB | 1047 ms | — | — | — | 317 MB |
| iflow cli | 140 MB | 1124 ms | **1225 ms** | **2000 ms** | **47 ms** | 56 MB |

<details><summary>full precision · all collected fields</summary>

| agent | version | bin | bundle (MB) | bundle kind | `--version` (ms) | TUI 1st byte (ms) | TUI 1st input (ms) | input latency 1s (ms) | idle PSS (MB) |
|---|---|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.5.0-beta.1 | `/home/runner/work/fox-agent/fox-agent/bin/fox` | 120.4 | bin | 15.4 | 15.8 | 378.1 | 0.5 | 36.6 |
| claude code | 2.1.296 (Claude Code) | `/home/runner/.npm-global/bin/claude` | 257.1 | bin | 8.2 | 205.1 | — | — | 187.6 |
| codex | codex-cli 0.162.1 | `/home/runner/.npm-global/bin/codex` | 140.0 | bin | 40.8 | 43.6 | 815.2 | 1.6 | 49.0 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | `/home/runner/.npm-global/bin/opencode2` | 207.4 | bin | 74.6 | 130.7 | 497.4 | 66.5 | 129.3 |
| jcode | jcode v0.95.0 (6487bbd7e) | `/home/runner/.local/bin/jcode` | 138.2 | bin | 7.5 | 9.9 | 582.9 | 0.6 | 27.7 |
| pi | 1.2.0 | `/home/runner/.npm-global/bin/pi` | 140.0 | bin | 224.9 | 299.7 | 794.0 | 8.6 | 131.9 |
| gemini cli | 0.63.0 | `/home/runner/.npm-global/bin/gemini` | 140.0 | bin | 1414.8 | 1484.2 | 1501.7 | 0.1 | 143.2 |
| copilot cli | GitHub Copilot CLI 1.0.96. | `/home/runner/.npm-global/bin/copilot` | 140.0 | bin | 96.2 | 730.4 | — | — | 47.3 |
| crush | crush version v0.98.1 | `/home/runner/.npm-global/bin/crush` | 140.0 | bin | 137.6 | 561.6 | 930.3 | 73.6 | 68.9 |
| goose | 1.54.0 | `/home/runner/.local/bin/goose` | 307.8 | bin | 6.2 | 6.6 | 367.3 | 0.4 | 104.8 |
| aider | aider 0.86.2 | `/home/runner/work/fox-agent/fox-agent/.venv-bench/bin/aider` | 140.0 | bin | 726.6 | 651.9 | 1035.7 | 10.3 | 66.9 |
| amp | 0.0.1791878731-g2f7fd0 (released 2026-10-13T08:05:31.000Z, 1 | `/home/runner/.local/bin/amp` | 134.4 | bin | 233.0 | 246.4 | 605.0 | 0.5 | 162.3 |
| cursor-agent | 2026.10.01-e373342 | `/home/runner/.local/bin/cursor-agent` | 140.0 | bin | 422.6 | 414.3 | — | — | 214.3 |
| qwen code | 0.25.1 | `/home/runner/.npm-global/bin/qwen` | 140.0 | bin | 36.0 | 768.8 | 1245.7 | — | 252.5 |
| codebuff | 1.0.688 | `/home/runner/.npm-global/bin/codebuff` | 140.0 | bin | 931.7 | 914.3 | 1441.9 | 112.1 | 57.6 |
| kilo code | 7.8.8 | `/home/runner/.npm-global/bin/kilocode` | 140.0 | bin | 886.9 | 2587.0 | 6475.1 | 1451.1 | 46.2 |
| droid | 0.240.0 | `/home/runner/.local/bin/droid` | 291.7 | bin | 95.4 | 106.4 | 3189.7 | 726.1 | 220.4 |
| kimi code | 2.1.1 | `/home/runner/.kimi-code/bin/kimi` | 190.8 | bin | 570.8 | 705.1 | 1095.3 | 4.5 | 350.5 |
| devin | devin 3000.11.3 (9c803229faa4) | `/home/runner/.local/bin/devin` | 195.0 | bin | 2.8 | 38.1 | 1040.9 | 641.1 | 48.6 |
| cline | 3.0.71 | `/home/runner/.npm-global/bin/cline` | 140.0 | bin | 880.6 | 1133.1 | — | — | 55.0 |
| continue | 1.5.47 | `/home/runner/.npm-global/bin/cn` | 140.0 | bin | 1047.0 | — | — | — | 317.0 |
| iflow cli | 0.5.19 | `/home/runner/.npm-global/bin/iflow` | 140.0 | bin | 1124.4 | 1224.9 | 1999.6 | 47.3 | 55.5 |

</details>

fox-agent headless vs scripted local provider: time to first token **64 ms**, peak RSS **61 MB**.

_Generated 2026-10-13T09:36:57Z on Linux x86_64 (6.17.0-1022-azure). [How this is measured](#benchmarks) · [raw JSON](bench/results.json)_
