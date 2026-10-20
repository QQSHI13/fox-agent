![harness bench dashboard](bench/bench.svg)

| agent | bundle | `--version` | TUI 1st byte | TUI 1st input | input latency 1s | idle PSS |
|---|---|---|---|---|---|---|
| **fox-agent** | 99 MB | 16 ms | **18 ms** | **377 ms** | **1 ms** | 35 MB |
| claude code | 289 MB | 10 ms | **224 ms** | — | — | 192 MB |
| codex | 140 MB | 44 ms | **45 ms** | **790 ms** | **1 ms** | 49 MB |
| opencode v2 | 207 MB | 82 ms | **134 ms** | **495 ms** | **62 ms** | 128 MB |
| jcode | 170 MB | 10 ms | **12 ms** | **765 ms** | **0 ms** | 31 MB |
| pi | 140 MB | 236 ms | **311 ms** | **837 ms** | **8 ms** | 131 MB |
| pi-bolt | 261 MB | 11 ms | **39 ms** | **519 ms** | **2 ms** | 96 MB |
| gemini cli | 140 MB | 1465 ms | **1527 ms** | **1553 ms** | **0 ms** | 146 MB |
| copilot cli | 140 MB | 107 ms | **769 ms** | — | — | 47 MB |
| crush | 140 MB | 152 ms | **342 ms** | **842 ms** | **73 ms** | 69 MB |
| goose | 304 MB | 8 ms | **7 ms** | **368 ms** | **0 ms** | 108 MB |
| aider | 140 MB | 784 ms | **708 ms** | **1094 ms** | **10 ms** | 67 MB |
| amp | 135 MB | 252 ms | **256 ms** | **613 ms** | **1 ms** | 163 MB |
| cursor-agent | 140 MB | 429 ms | **415 ms** | — | — | 250 MB |
| qwen code | 140 MB | 38 ms | **803 ms** | **1274 ms** | — | 250 MB |
| codebuff | 140 MB | 893 ms | **867 ms** | **1376 ms** | **111 ms** | 58 MB |
| kilo code | 140 MB | 848 ms | **2463 ms** | **6386 ms** | **1609 ms** | 46 MB |
| droid | 295 MB | 105 ms | **125 ms** | **3237 ms** | **729 ms** | 340 MB |
| kimi code | 192 MB | 561 ms | **728 ms** | **1121 ms** | **4 ms** | 353 MB |
| devin | 200 MB | 4 ms | **24 ms** | **1027 ms** | **1641 ms** | 90 MB |
| cline | 140 MB | 868 ms | **1167 ms** | — | — | 55 MB |
| continue | 140 MB | 1086 ms | — | — | — | 318 MB |
| iflow cli | 140 MB | 1191 ms | **1279 ms** | **2462 ms** | **46 ms** | 56 MB |

<details><summary>full precision · all collected fields</summary>

| agent | version | bin | bundle (MB) | bundle kind | `--version` (ms) | TUI 1st byte (ms) | TUI 1st input (ms) | input latency 1s (ms) | idle PSS (MB) |
|---|---|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.6.0 | `/home/runner/work/fox-agent/fox-agent/bin/fox` | 99.1 | bin | 15.8 | 17.8 | 377.3 | 0.7 | 35.4 |
| claude code | 2.1.304 (Claude Code) | `/home/runner/.npm-global/bin/claude` | 288.7 | bin | 10.1 | 223.7 | — | — | 192.1 |
| codex | codex-cli 0.163.0 | `/home/runner/.npm-global/bin/codex` | 140.0 | bin | 43.5 | 45.1 | 790.2 | 0.6 | 49.1 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | `/home/runner/.npm-global/bin/opencode2` | 207.4 | bin | 82.0 | 134.0 | 494.9 | 61.5 | 128.2 |
| jcode | jcode v0.99.0 (774613c90) | `/home/runner/.local/bin/jcode` | 169.6 | bin | 9.6 | 12.4 | 764.9 | 0.3 | 31.1 |
| pi | 1.3.0 | `/home/runner/.npm-global/bin/pi` | 140.0 | bin | 235.8 | 310.6 | 837.2 | 7.9 | 131.2 |
| pi-bolt | 1.3.0 (Pi-Bolt 0.9.6, linux-x64, JIT off) | `/home/runner/.local/bin/pi-bolt` | 261.1 | bin | 11.3 | 39.2 | 518.8 | 1.7 | 96.4 |
| gemini cli | 0.64.0 | `/home/runner/.npm-global/bin/gemini` | 140.0 | bin | 1465.3 | 1526.9 | 1552.7 | 0.1 | 145.9 |
| copilot cli | GitHub Copilot CLI 1.0.100. | `/home/runner/.npm-global/bin/copilot` | 140.0 | bin | 106.6 | 769.0 | — | — | 47.4 |
| crush | crush version v0.98.1 | `/home/runner/.npm-global/bin/crush` | 140.0 | bin | 151.6 | 342.0 | 842.3 | 72.7 | 68.6 |
| goose | 1.55.0 | `/home/runner/.local/bin/goose` | 304.0 | bin | 7.7 | 7.4 | 368.2 | 0.2 | 108.4 |
| aider | aider 0.86.2 | `/home/runner/work/fox-agent/fox-agent/.venv-bench/bin/aider` | 140.0 | bin | 784.1 | 708.1 | 1093.6 | 9.8 | 66.9 |
| amp | 0.0.1792470027-g8c393d (released 2026-10-20T04:20:27.000Z, 2 | `/home/runner/.local/bin/amp` | 135.1 | bin | 251.7 | 256.2 | 612.8 | 0.5 | 162.7 |
| cursor-agent | 2026.10.19-6bbf2c4 | `/home/runner/.local/bin/cursor-agent` | 140.0 | bin | 428.7 | 415.1 | — | — | 250.2 |
| qwen code | 0.25.3 | `/home/runner/.npm-global/bin/qwen` | 140.0 | bin | 38.5 | 803.5 | 1274.4 | — | 250.2 |
| codebuff | 1.0.688 | `/home/runner/.npm-global/bin/codebuff` | 140.0 | bin | 893.5 | 867.4 | 1376.4 | 110.7 | 57.6 |
| kilo code | 7.8.15 | `/home/runner/.npm-global/bin/kilocode` | 140.0 | bin | 848.3 | 2462.6 | 6385.7 | 1609.4 | 46.2 |
| droid | 0.245.0 | `/home/runner/.local/bin/droid` | 295.5 | bin | 105.1 | 124.8 | 3236.5 | 728.7 | 339.7 |
| kimi code | 2.2.0 | `/home/runner/.kimi-code/bin/kimi` | 191.9 | bin | 561.1 | 728.4 | 1120.9 | 4.3 | 352.5 |
| devin | devin 3000.11.92 (7f4e64980e22) | `/home/runner/.local/bin/devin` | 200.4 | bin | 4.2 | 24.4 | 1027.4 | 1641.0 | 89.8 |
| cline | 3.0.73 | `/home/runner/.npm-global/bin/cline` | 140.0 | bin | 868.1 | 1167.2 | — | — | 55.0 |
| continue | 1.5.47 | `/home/runner/.npm-global/bin/cn` | 140.0 | bin | 1086.1 | — | — | — | 318.4 |
| iflow cli | 0.5.19 | `/home/runner/.npm-global/bin/iflow` | 140.0 | bin | 1191.2 | 1279.5 | 2461.7 | 45.7 | 55.6 |

</details>

fox-agent headless vs scripted local provider: time to first token **56 ms**, peak RSS **60 MB**.

_Generated 2026-10-20T06:37:16Z on Linux x86_64 (6.17.0-1022-azure). [How this is measured](#benchmarks) · [raw JSON](bench/results.json)_
