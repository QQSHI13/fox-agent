![harness bench dashboard](bench/bench.svg)

| agent | bundle | `--version` | TUI 1st byte | TUI 1st input | input latency 1s | idle PSS |
|---|---|---|---|---|---|---|
| **fox-agent** | 99 MB | 12 ms | **14 ms** | **373 ms** | **1 ms** | 38 MB |
| claude code | 289 MB | 9 ms | **155 ms** | — | — | 192 MB |
| codex | 140 MB | 33 ms | **34 ms** | **822 ms** | **0 ms** | 48 MB |
| opencode v2 | 207 MB | 59 ms | **92 ms** | **453 ms** | **43 ms** | 123 MB |
| jcode | 170 MB | 8 ms | **11 ms** | **676 ms** | **0 ms** | 35 MB |
| pi | 140 MB | 156 ms | **203 ms** | **722 ms** | **5 ms** | 132 MB |
| pi-bolt | 261 MB | 9 ms | **31 ms** | **511 ms** | **1 ms** | 97 MB |
| gemini cli | 140 MB | 970 ms | **1004 ms** | **1075 ms** | **0 ms** | — |
| copilot cli | 140 MB | 70 ms | **530 ms** | — | — | 46 MB |
| crush | 140 MB | 125 ms | **396 ms** | **793 ms** | **40 ms** | 67 MB |
| goose | 304 MB | 6 ms | **6 ms** | **367 ms** | **0 ms** | 109 MB |
| aider | 140 MB | 493 ms | **426 ms** | **807 ms** | **6 ms** | 68 MB |
| amp | 135 MB | 169 ms | **164 ms** | **538 ms** | **0 ms** | 164 MB |
| cursor-agent | 140 MB | 300 ms | **277 ms** | — | — | 249 MB |
| qwen code | 140 MB | 27 ms | **510 ms** | **923 ms** | — | 292 MB |
| codebuff | 140 MB | 598 ms | **562 ms** | **1099 ms** | **108 ms** | 57 MB |
| kilo code | 140 MB | 566 ms | **1595 ms** | **4614 ms** | **673 ms** | 45 MB |
| droid | 295 MB | 53 ms | **62 ms** | **3114 ms** | **666 ms** | 285 MB |
| kimi code | 192 MB | 395 ms | **503 ms** | **895 ms** | **3 ms** | 354 MB |
| devin | 200 MB | 3 ms | **19 ms** | **1022 ms** | **1641 ms** | 71 MB |
| cline | 140 MB | 619 ms | **847 ms** | — | — | 53 MB |
| continue | 140 MB | 745 ms | — | — | — | 318 MB |
| iflow cli | 140 MB | 806 ms | **848 ms** | **1620 ms** | **44 ms** | 57 MB |

<details><summary>full precision · all collected fields</summary>

| agent | version | bin | bundle (MB) | bundle kind | `--version` (ms) | TUI 1st byte (ms) | TUI 1st input (ms) | input latency 1s (ms) | idle PSS (MB) |
|---|---|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.6.0 | `/home/runner/work/fox-agent/fox-agent/bin/fox` | 99.1 | bin | 12.0 | 14.0 | 373.1 | 0.6 | 37.7 |
| claude code | 2.1.304 (Claude Code) | `/home/runner/.npm-global/bin/claude` | 288.7 | bin | 8.6 | 155.0 | — | — | 192.0 |
| codex | codex-cli 0.163.0 | `/home/runner/.npm-global/bin/codex` | 140.0 | bin | 33.5 | 33.8 | 821.9 | 0.5 | 47.5 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | `/home/runner/.npm-global/bin/opencode2` | 207.4 | bin | 58.6 | 92.2 | 452.6 | 42.7 | 122.9 |
| jcode | jcode v0.99.0 (774613c90) | `/home/runner/.local/bin/jcode` | 169.6 | bin | 7.7 | 10.6 | 676.3 | 0.3 | 35.2 |
| pi | 1.3.0 | `/home/runner/.npm-global/bin/pi` | 140.0 | bin | 156.1 | 202.8 | 722.4 | 5.4 | 132.1 |
| pi-bolt | 1.3.0 (Pi-Bolt 0.9.6, linux-x64, JIT off) | `/home/runner/.local/bin/pi-bolt` | 261.1 | bin | 9.4 | 30.9 | 510.8 | 1.4 | 96.6 |
| gemini cli | 0.64.0 | `/home/runner/.npm-global/bin/gemini` | 140.0 | bin | 970.5 | 1004.5 | 1075.0 | 0.1 | — |
| copilot cli | GitHub Copilot CLI 1.0.100. | `/home/runner/.npm-global/bin/copilot` | 140.0 | bin | 70.3 | 529.7 | — | — | 45.8 |
| crush | crush version v0.98.1 | `/home/runner/.npm-global/bin/crush` | 140.0 | bin | 125.3 | 396.2 | 793.0 | 40.2 | 67.3 |
| goose | 1.55.0 | `/home/runner/.local/bin/goose` | 304.0 | bin | 6.2 | 6.0 | 366.7 | 0.1 | 109.4 |
| aider | aider 0.86.2 | `/home/runner/work/fox-agent/fox-agent/.venv-bench/bin/aider` | 140.0 | bin | 492.7 | 425.6 | 806.8 | 5.8 | 67.7 |
| amp | 0.0.1792470027-g8c393d (released 2026-10-20T04:20:27.000Z, 2 | `/home/runner/.local/bin/amp` | 135.1 | bin | 169.1 | 164.0 | 538.3 | 0.5 | 163.8 |
| cursor-agent | 2026.10.19-6bbf2c4 | `/home/runner/.local/bin/cursor-agent` | 140.0 | bin | 299.7 | 277.2 | — | — | 248.7 |
| qwen code | 0.25.3 | `/home/runner/.npm-global/bin/qwen` | 140.0 | bin | 27.4 | 509.9 | 923.3 | — | 291.9 |
| codebuff | 1.0.688 | `/home/runner/.npm-global/bin/codebuff` | 140.0 | bin | 597.5 | 562.5 | 1099.1 | 108.1 | 56.7 |
| kilo code | 7.8.15 | `/home/runner/.npm-global/bin/kilocode` | 140.0 | bin | 565.7 | 1595.0 | 4614.4 | 673.3 | 44.8 |
| droid | 0.245.0 | `/home/runner/.local/bin/droid` | 295.5 | bin | 53.0 | 61.8 | 3114.4 | 666.1 | 285.4 |
| kimi code | 2.2.0 | `/home/runner/.kimi-code/bin/kimi` | 191.9 | bin | 395.1 | 502.7 | 894.7 | 3.0 | 353.7 |
| devin | devin 3000.11.92 (7f4e64980e22) | `/home/runner/.local/bin/devin` | 200.4 | bin | 3.4 | 19.1 | 1022.4 | 1640.9 | 71.3 |
| cline | 3.0.73 | `/home/runner/.npm-global/bin/cline` | 140.0 | bin | 619.5 | 847.1 | — | — | 53.3 |
| continue | 1.5.47 | `/home/runner/.npm-global/bin/cn` | 140.0 | bin | 744.5 | — | — | — | 317.8 |
| iflow cli | 0.5.19 | `/home/runner/.npm-global/bin/iflow` | 140.0 | bin | 805.9 | 848.1 | 1619.9 | 43.9 | 56.8 |

</details>

fox-agent headless vs scripted local provider: time to first token **43 ms**, peak RSS **64 MB**.

_Generated 2026-10-20T06:45:28Z on Linux x86_64 (7.0.0-1017-azure). [How this is measured](#benchmarks) · [raw JSON](bench/results.json)_
