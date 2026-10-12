![harness bench dashboard](bench/bench.svg)

| agent | bundle | `--version` | TUI 1st byte | TUI 1st input | input latency 1s | idle PSS |
|---|---|---|---|---|---|---|
| **fox-agent** | 120 MB | 16 ms | **19 ms** | — | — | 37 MB |
| claude code | 257 MB | 10 ms | **202 ms** | — | — | 188 MB |
| codex | 140 MB | 44 ms | **45 ms** | — | — | 49 MB |
| opencode v2 | 207 MB | 80 ms | **132 ms** | **494 ms** | **53 ms** | 129 MB |
| jcode | 138 MB | 10 ms | **13 ms** | — | — | 27 MB |
| pi | 140 MB | 232 ms | **308 ms** | **834 ms** | **8 ms** | 130 MB |
| gemini cli | 140 MB | 1477 ms | **1547 ms** | **1570 ms** | **0 ms** | 146 MB |
| copilot cli | 140 MB | 104 ms | **748 ms** | — | — | 47 MB |
| crush | 140 MB | 147 ms | **378 ms** | — | — | 69 MB |
| goose | 308 MB | 7 ms | **8 ms** | **225 ms** | **0 ms** | — |
| aider | 140 MB | 774 ms | **703 ms** | **1095 ms** | **10 ms** | 67 MB |
| amp | 134 MB | 233 ms | **248 ms** | **607 ms** | **1 ms** | 161 MB |
| cursor-agent | 140 MB | 443 ms | **419 ms** | — | — | 218 MB |
| qwen code | 140 MB | 38 ms | **800 ms** | — | — | 252 MB |
| codebuff | 140 MB | 882 ms | **867 ms** | — | — | 58 MB |
| kilo code | 140 MB | 829 ms | **2414 ms** | — | — | 46 MB |
| droid | 281 MB | 89 ms | **110 ms** | — | — | 237 MB |
| kimi code | 191 MB | 558 ms | **709 ms** | — | — | 350 MB |
| devin | 195 MB | 4 ms | **49 ms** | — | — | 46 MB |
| cline | 140 MB | 882 ms | **1075 ms** | — | — | 55 MB |
| continue | 140 MB | 1118 ms | — | — | — | 318 MB |
| iflow cli | 140 MB | 1199 ms | **1278 ms** | **2467 ms** | **46 ms** | 56 MB |

<details><summary>full precision · all collected fields</summary>

| agent | version | bin | bundle (MB) | bundle kind | `--version` (ms) | TUI 1st byte (ms) | TUI 1st input (ms) | input latency 1s (ms) | idle PSS (MB) |
|---|---|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.5.0-beta.1 | `/home/runner/work/fox-agent/fox-agent/bin/fox` | 120.4 | bin | 15.7 | 19.1 | — | — | 36.6 |
| claude code | 2.1.296 (Claude Code) | `/home/runner/.npm-global/bin/claude` | 257.1 | bin | 9.7 | 202.0 | — | — | 187.8 |
| codex | codex-cli 0.162.1 | `/home/runner/.npm-global/bin/codex` | 140.0 | bin | 44.1 | 45.3 | — | — | 49.1 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | `/home/runner/.npm-global/bin/opencode2` | 207.4 | bin | 80.3 | 131.7 | 494.1 | 53.1 | 129.2 |
| jcode | jcode v0.95.0 (6487bbd7e) | `/home/runner/.local/bin/jcode` | 138.2 | bin | 9.9 | 12.8 | — | — | 27.2 |
| pi | 1.1.0 | `/home/runner/.npm-global/bin/pi` | 140.0 | bin | 232.1 | 308.2 | 833.7 | 7.8 | 129.8 |
| gemini cli | 0.63.0 | `/home/runner/.npm-global/bin/gemini` | 140.0 | bin | 1476.6 | 1547.1 | 1570.1 | 0.1 | 145.9 |
| copilot cli | GitHub Copilot CLI 1.0.95. | `/home/runner/.npm-global/bin/copilot` | 140.0 | bin | 104.3 | 748.1 | — | — | 47.4 |
| crush | crush version v0.98.1 | `/home/runner/.npm-global/bin/crush` | 140.0 | bin | 146.9 | 377.6 | — | — | 68.5 |
| goose | 1.54.0 | `/home/runner/.local/bin/goose` | 307.8 | bin | 7.5 | 7.6 | 224.7 | 0.1 | — |
| aider | aider 0.86.2 | `/home/runner/work/fox-agent/fox-agent/.venv-bench/bin/aider` | 140.0 | bin | 773.8 | 703.1 | 1095.4 | 9.9 | 66.8 |
| amp | 0.0.1791792883-gf1ab8d (released 2026-10-12T08:14:43.000Z, 3 | `/home/runner/.local/bin/amp` | 134.2 | bin | 232.7 | 248.3 | 607.0 | 0.5 | 160.6 |
| cursor-agent | 2026.10.01-e373342 | `/home/runner/.local/bin/cursor-agent` | 140.0 | bin | 443.3 | 418.7 | — | — | 218.1 |
| qwen code | 0.25.1 | `/home/runner/.npm-global/bin/qwen` | 140.0 | bin | 38.3 | 799.7 | — | — | 252.1 |
| codebuff | 1.0.688 | `/home/runner/.npm-global/bin/codebuff` | 140.0 | bin | 881.7 | 866.8 | — | — | 57.6 |
| kilo code | 7.8.8 | `/home/runner/.npm-global/bin/kilocode` | 140.0 | bin | 828.9 | 2413.6 | — | — | 46.2 |
| droid | 0.238.0 | `/home/runner/.local/bin/droid` | 281.4 | bin | 88.6 | 109.8 | — | — | 236.8 |
| kimi code | 2.1.1 | `/home/runner/.kimi-code/bin/kimi` | 190.8 | bin | 557.6 | 708.6 | — | — | 349.9 |
| devin | devin 3000.11.3 (9c803229faa4) | `/home/runner/.local/bin/devin` | 195.0 | bin | 4.0 | 48.9 | — | — | 46.5 |
| cline | 3.0.70 | `/home/runner/.npm-global/bin/cline` | 140.0 | bin | 881.8 | 1074.6 | — | — | 55.1 |
| continue | 1.5.47 | `/home/runner/.npm-global/bin/cn` | 140.0 | bin | 1118.4 | — | — | — | 318.2 |
| iflow cli | 0.5.19 | `/home/runner/.npm-global/bin/iflow` | 140.0 | bin | 1198.9 | 1277.8 | 2466.7 | 46.4 | 55.7 |

</details>

fox-agent headless vs scripted local provider: time to first token **62 ms**, peak RSS **61 MB**.

_Generated 2026-10-12T09:06:12Z on Linux x86_64 (6.17.0-1022-azure). [How this is measured](#benchmarks) · [raw JSON](bench/results.json)_
