![harness bench dashboard](bench/bench.svg)

| agent | bundle | `--version` | TUI 1st byte | TUI 1st input | input latency 1s | idle PSS |
|---|---|---|---|---|---|---|
| **fox-agent** | 120 MB | 16 ms | **18 ms** | **380 ms** | **1 ms** | 36 MB |
| claude code | 257 MB | 9 ms | **237 ms** | — | — | 188 MB |
| codex | 140 MB | 41 ms | **44 ms** | **774 ms** | **0 ms** | 49 MB |
| opencode v2 | 207 MB | 81 ms | **134 ms** | **508 ms** | **67 ms** | 129 MB |
| jcode | 138 MB | 10 ms | **13 ms** | **717 ms** | **0 ms** | 28 MB |
| pi | 140 MB | 238 ms | **315 ms** | **849 ms** | **8 ms** | 132 MB |
| gemini cli | 140 MB | 1548 ms | **1599 ms** | **1611 ms** | — | 146 MB |
| copilot cli | 140 MB | 102 ms | **797 ms** | — | — | 47 MB |
| crush | 140 MB | 127 ms | **271 ms** | **723 ms** | **73 ms** | 69 MB |
| goose | 308 MB | 8 ms | **7 ms** | **368 ms** | **0 ms** | 105 MB |
| aider | 140 MB | 791 ms | **740 ms** | **1121 ms** | **10 ms** | 67 MB |
| amp | 134 MB | 245 ms | **253 ms** | **620 ms** | **1 ms** | 160 MB |
| cursor-agent | 140 MB | 443 ms | **428 ms** | — | — | 218 MB |
| qwen code | 140 MB | 37 ms | **824 ms** | **1297 ms** | — | 245 MB |
| codebuff | 140 MB | 889 ms | **890 ms** | **1387 ms** | **115 ms** | 58 MB |
| kilo code | 140 MB | 829 ms | **2509 ms** | **6435 ms** | **1526 ms** | 46 MB |
| droid | 292 MB | 120 ms | **139 ms** | **3186 ms** | **728 ms** | 223 MB |
| kimi code | 191 MB | 580 ms | **716 ms** | **1108 ms** | **4 ms** | 349 MB |
| devin | 195 MB | 4 ms | **48 ms** | **1052 ms** | **641 ms** | 49 MB |
| cline | 140 MB | 845 ms | **1213 ms** | — | — | 55 MB |
| continue | 140 MB | 1118 ms | — | — | — | 316 MB |
| iflow cli | 140 MB | 1218 ms | **1292 ms** | **2530 ms** | **47 ms** | 56 MB |

<details><summary>full precision · all collected fields</summary>

| agent | version | bin | bundle (MB) | bundle kind | `--version` (ms) | TUI 1st byte (ms) | TUI 1st input (ms) | input latency 1s (ms) | idle PSS (MB) |
|---|---|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.5.0-beta.1 | `/home/runner/work/fox-agent/fox-agent/bin/fox` | 120.4 | bin | 16.5 | 18.2 | 379.6 | 0.7 | 36.4 |
| claude code | 2.1.296 (Claude Code) | `/home/runner/.npm-global/bin/claude` | 257.1 | bin | 9.2 | 237.2 | — | — | 187.5 |
| codex | codex-cli 0.162.1 | `/home/runner/.npm-global/bin/codex` | 140.0 | bin | 41.1 | 43.6 | 773.6 | 0.5 | 49.1 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | `/home/runner/.npm-global/bin/opencode2` | 207.4 | bin | 81.0 | 134.4 | 507.9 | 67.2 | 129.3 |
| jcode | jcode v0.95.0 (6487bbd7e) | `/home/runner/.local/bin/jcode` | 138.2 | bin | 10.3 | 12.8 | 717.3 | 0.4 | 27.8 |
| pi | 1.2.0 | `/home/runner/.npm-global/bin/pi` | 140.0 | bin | 237.8 | 315.0 | 849.0 | 8.5 | 132.0 |
| gemini cli | 0.63.0 | `/home/runner/.npm-global/bin/gemini` | 140.0 | bin | 1548.1 | 1599.2 | 1611.2 | — | 145.8 |
| copilot cli | GitHub Copilot CLI 1.0.96. | `/home/runner/.npm-global/bin/copilot` | 140.0 | bin | 102.3 | 796.8 | — | — | 47.3 |
| crush | crush version v0.98.1 | `/home/runner/.npm-global/bin/crush` | 140.0 | bin | 127.3 | 271.3 | 723.4 | 72.8 | 68.5 |
| goose | 1.54.0 | `/home/runner/.local/bin/goose` | 307.8 | bin | 7.5 | 7.4 | 368.1 | 0.3 | 104.8 |
| aider | aider 0.86.2 | `/home/runner/work/fox-agent/fox-agent/.venv-bench/bin/aider` | 140.0 | bin | 791.4 | 739.6 | 1120.8 | 10.2 | 66.8 |
| amp | 0.0.1791864325-g52e626 (released 2026-10-13T04:05:25.000Z, 4 | `/home/runner/.local/bin/amp` | 134.4 | bin | 245.4 | 252.8 | 620.2 | 0.6 | 160.2 |
| cursor-agent | 2026.10.01-e373342 | `/home/runner/.local/bin/cursor-agent` | 140.0 | bin | 443.0 | 427.6 | — | — | 218.2 |
| qwen code | 0.25.1 | `/home/runner/.npm-global/bin/qwen` | 140.0 | bin | 36.5 | 823.9 | 1296.6 | — | 245.5 |
| codebuff | 1.0.688 | `/home/runner/.npm-global/bin/codebuff` | 140.0 | bin | 889.0 | 890.3 | 1386.9 | 114.8 | 57.6 |
| kilo code | 7.8.8 | `/home/runner/.npm-global/bin/kilocode` | 140.0 | bin | 828.7 | 2509.0 | 6434.8 | 1525.5 | 46.2 |
| droid | 0.240.0 | `/home/runner/.local/bin/droid` | 291.7 | bin | 119.9 | 139.3 | 3185.8 | 727.6 | 223.0 |
| kimi code | 2.1.1 | `/home/runner/.kimi-code/bin/kimi` | 190.8 | bin | 579.6 | 716.1 | 1107.7 | 4.4 | 349.1 |
| devin | devin 3000.11.3 (9c803229faa4) | `/home/runner/.local/bin/devin` | 195.0 | bin | 3.7 | 48.0 | 1052.1 | 641.0 | 48.5 |
| cline | 3.0.70 | `/home/runner/.npm-global/bin/cline` | 140.0 | bin | 844.9 | 1213.0 | — | — | 55.0 |
| continue | 1.5.47 | `/home/runner/.npm-global/bin/cn` | 140.0 | bin | 1117.7 | — | — | — | 316.4 |
| iflow cli | 0.5.19 | `/home/runner/.npm-global/bin/iflow` | 140.0 | bin | 1217.6 | 1292.4 | 2529.5 | 46.6 | 55.6 |

</details>

fox-agent headless vs scripted local provider: time to first token **65 ms**, peak RSS **60 MB**.

_Generated 2026-10-13T08:23:06Z on Linux x86_64 (6.17.0-1022-azure). [How this is measured](#benchmarks) · [raw JSON](bench/results.json)_
