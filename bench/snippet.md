![harness bench dashboard](bench/bench.svg)

| agent | bundle | `--version` | TUI 1st byte | TUI 1st input | input latency 1s | idle PSS |
|---|---|---|---|---|---|---|
| **fox-agent** | 99 MB | 15 ms | **17 ms** | **378 ms** | **1 ms** | 38 MB |
| claude code | 289 MB | 11 ms | **243 ms** | — | — | 192 MB |
| codex | 140 MB | 42 ms | **44 ms** | **799 ms** | **2 ms** | 48 MB |
| opencode v2 | 207 MB | 84 ms | **135 ms** | **497 ms** | **60 ms** | 126 MB |
| jcode | 170 MB | 10 ms | **12 ms** | **763 ms** | **0 ms** | 35 MB |
| pi | 140 MB | 251 ms | **324 ms** | **851 ms** | **9 ms** | 133 MB |
| pi-bolt | 261 MB | 13 ms | **43 ms** | **520 ms** | **2 ms** | 96 MB |
| gemini cli | 140 MB | 1556 ms | **1635 ms** | **1685 ms** | **0 ms** | 146 MB |
| copilot cli | 140 MB | 105 ms | **800 ms** | — | — | 46 MB |
| crush | 140 MB | 154 ms | **400 ms** | **850 ms** | **72 ms** | 68 MB |
| goose | 304 MB | 8 ms | **8 ms** | **368 ms** | **0 ms** | 109 MB |
| aider | 140 MB | 783 ms | **728 ms** | **1123 ms** | **10 ms** | 68 MB |
| amp | 135 MB | 250 ms | **263 ms** | **615 ms** | **1 ms** | 165 MB |
| cursor-agent | 140 MB | 447 ms | **440 ms** | **808 ms** | — | 249 MB |
| qwen code | 140 MB | 41 ms | **835 ms** | **1314 ms** | — | 244 MB |
| codebuff | 140 MB | 905 ms | **905 ms** | **1408 ms** | **111 ms** | 56 MB |
| kilo code | 140 MB | 840 ms | **2571 ms** | **6644 ms** | **1709 ms** | 45 MB |
| droid | 295 MB | 111 ms | **135 ms** | **3220 ms** | **780 ms** | 284 MB |
| kimi code | 192 MB | 608 ms | **787 ms** | **1184 ms** | **5 ms** | 351 MB |
| devin | 200 MB | 4 ms | **24 ms** | **1030 ms** | **1641 ms** | 71 MB |
| cline | 140 MB | 905 ms | **1152 ms** | — | — | 53 MB |
| continue | 140 MB | 1129 ms | — | — | — | 316 MB |
| iflow cli | 140 MB | 1250 ms | **1348 ms** | **2551 ms** | **47 ms** | 54 MB |

<details><summary>full precision · all collected fields</summary>

| agent | version | bin | bundle (MB) | bundle kind | `--version` (ms) | TUI 1st byte (ms) | TUI 1st input (ms) | input latency 1s (ms) | idle PSS (MB) |
|---|---|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.6.0 | `/home/runner/work/fox-agent/fox-agent/bin/fox` | 99.1 | bin | 15.3 | 17.1 | 377.8 | 0.7 | 37.8 |
| claude code | 2.1.304 (Claude Code) | `/home/runner/.npm-global/bin/claude` | 288.7 | bin | 10.8 | 243.0 | — | — | 192.3 |
| codex | codex-cli 0.163.0 | `/home/runner/.npm-global/bin/codex` | 140.0 | bin | 42.3 | 44.0 | 799.3 | 1.6 | 47.7 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | `/home/runner/.npm-global/bin/opencode2` | 207.4 | bin | 84.0 | 135.1 | 497.0 | 59.6 | 125.6 |
| jcode | jcode v0.99.0 (774613c90) | `/home/runner/.local/bin/jcode` | 169.6 | bin | 9.7 | 12.3 | 763.1 | 0.3 | 34.9 |
| pi | 1.3.0 | `/home/runner/.npm-global/bin/pi` | 140.0 | bin | 251.2 | 323.7 | 851.5 | 8.5 | 132.7 |
| pi-bolt | 1.3.0 (Pi-Bolt 0.9.6, linux-x64, JIT off) | `/home/runner/.local/bin/pi-bolt` | 261.1 | bin | 12.8 | 42.8 | 520.2 | 1.6 | 96.3 |
| gemini cli | 0.64.0 | `/home/runner/.npm-global/bin/gemini` | 140.0 | bin | 1556.1 | 1634.7 | 1684.6 | 0.1 | 145.6 |
| copilot cli | GitHub Copilot CLI 1.0.100. | `/home/runner/.npm-global/bin/copilot` | 140.0 | bin | 105.5 | 800.1 | — | — | 45.9 |
| crush | crush version v0.98.1 | `/home/runner/.npm-global/bin/crush` | 140.0 | bin | 154.2 | 399.7 | 849.7 | 72.3 | 67.6 |
| goose | 1.55.0 | `/home/runner/.local/bin/goose` | 304.0 | bin | 7.8 | 7.8 | 368.1 | 0.2 | 108.9 |
| aider | aider 0.86.2 | `/home/runner/work/fox-agent/fox-agent/.venv-bench/bin/aider` | 140.0 | bin | 783.1 | 728.2 | 1122.9 | 10.3 | 67.7 |
| amp | 0.0.1792497638-g7b4b42 (released 2026-10-20T12:00:38.000Z, 1 | `/home/runner/.local/bin/amp` | 135.0 | bin | 250.1 | 263.3 | 615.3 | 0.5 | 165.1 |
| cursor-agent | 2026.10.19-6bbf2c4 | `/home/runner/.local/bin/cursor-agent` | 140.0 | bin | 447.2 | 440.3 | 808.3 | — | 248.6 |
| qwen code | 0.25.3 | `/home/runner/.npm-global/bin/qwen` | 140.0 | bin | 40.6 | 835.1 | 1314.4 | — | 244.2 |
| codebuff | 1.0.688 | `/home/runner/.npm-global/bin/codebuff` | 140.0 | bin | 905.2 | 905.4 | 1408.1 | 110.7 | 56.5 |
| kilo code | 7.8.15 | `/home/runner/.npm-global/bin/kilocode` | 140.0 | bin | 840.5 | 2571.1 | 6644.0 | 1709.1 | 44.9 |
| droid | 0.245.0 | `/home/runner/.local/bin/droid` | 295.5 | bin | 110.9 | 135.3 | 3219.5 | 779.8 | 284.1 |
| kimi code | 2.2.0 | `/home/runner/.kimi-code/bin/kimi` | 191.9 | bin | 607.6 | 787.3 | 1184.2 | 4.6 | 350.6 |
| devin | devin 3000.11.92 (7f4e64980e22) | `/home/runner/.local/bin/devin` | 200.4 | bin | 4.3 | 23.8 | 1029.6 | 1640.9 | 70.9 |
| cline | 3.0.73 | `/home/runner/.npm-global/bin/cline` | 140.0 | bin | 905.4 | 1151.9 | — | — | 53.4 |
| continue | 1.5.47 | `/home/runner/.npm-global/bin/cn` | 140.0 | bin | 1128.7 | — | — | — | 315.6 |
| iflow cli | 0.5.19 | `/home/runner/.npm-global/bin/iflow` | 140.0 | bin | 1250.3 | 1348.4 | 2550.6 | 46.9 | 53.9 |

</details>

fox-agent headless vs scripted local provider: time to first token **62 ms**, peak RSS **64 MB**.

_Generated 2026-10-20T13:34:23Z on Linux x86_64 (7.0.0-1017-azure). [How this is measured](#benchmarks) · [raw JSON](bench/results.json)_
