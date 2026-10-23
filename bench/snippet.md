| metric | fox-agent | rank |
|---|---|---|
| TUI 1st byte | **17 ms** | **#3** of 22 |
| TUI 1st input | **377 ms** | **#2** of 18 |
| input latency | **1 ms** | **#9** of 18 |
| bundle | **118 MB** | **#4** of 23 |
| idle PSS | **36 MB** | **#2** of 23 |
| `--version` | **7 ms** | **#3** of 23 |

fox-agent headless vs scripted local provider: time to first token **59 ms**, peak RSS **62 MB**.

<details><summary>every tool, every metric</summary>

![harness bench dashboard](bench/bench.svg)

| agent | bundle | `--version` | TUI 1st byte | TUI 1st input | input latency | idle PSS |
|---|---|---|---|---|---|---|
| **fox-agent** | 118 MB | 7 ms | 17 ms | 377 ms | 1 ms | 36 MB |
| claude code | 293 MB | 13 ms | 245 ms | — | — | 196 MB |
| codex | 430 MB | 41 ms | 43 ms | 844 ms | 0 ms | 49 MB |
| opencode v2 | 207 MB | 85 ms | 141 ms | 508 ms | 0 ms | 131 MB |
| jcode | 171 MB | 9 ms | 11 ms | 765 ms | 0 ms | 32 MB |
| pi | 112 MB | 247 ms | 319 ms | 805 ms | 8 ms | 132 MB |
| pi-bolt | 262 MB | 14 ms | 39 ms | 517 ms | 2 ms | 97 MB |
| gemini cli | 103 MB | 1493 ms | 1565 ms | 1586 ms | 0 ms | 146 MB |
| copilot cli | 198 MB | 102 ms | 761 ms | — | — | 47 MB |
| crush | 129 MB | 128 ms | 427 ms | 873 ms | 73 ms | 69 MB |
| goose | 304 MB | 7 ms | 7 ms | 374 ms | 0 ms | 109 MB |
| aider | 643 MB | 789 ms | 732 ms | 1125 ms | 10 ms | 67 MB |
| amp | 161 MB | 201 ms | 214 ms | 574 ms | 2 ms | 137 MB |
| cursor-agent | 583 MB | 471 ms | 438 ms | — | — | 251 MB |
| qwen code | 155 MB | 36 ms | 825 ms | 1285 ms | 0 ms | 247 MB |
| codebuff | 140 MB | 876 ms | 852 ms | 1352 ms | 0 ms | 58 MB |
| kilo code | 719 MB | 776 ms | 2169 ms | 6231 ms | 2588 ms | 46 MB |
| droid | 319 MB | 111 ms | 103 ms | 3209 ms | 1892 ms | 290 MB |
| kimi code | 192 MB | 575 ms | 728 ms | 1141 ms | 4 ms | 331 MB |
| devin | 200 MB | 4 ms | 21 ms | 1026 ms | 143 ms | 96 MB |
| cline | 330 MB | 892 ms | 1114 ms | — | — | 55 MB |
| continue | 83 MB | 1088 ms | — | — | — | 317 MB |
| iflow cli | 180 MB | 1229 ms | 1310 ms | 2485 ms | 0 ms | 56 MB |

</details>

<details><summary>full precision · all collected fields</summary>

| agent | version | bin | bundle (MB) | bundle kind | `--version` (ms) | TUI 1st byte (ms) | TUI 1st input (ms) | input latency (ms) | idle PSS (MB) |
|---|---|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.6.0 | `/home/runner/work/fox-agent/fox-agent/bin/fox` | 117.5 | bin | 7.3 | 16.6 | 376.5 | 0.6 | 36.2 |
| claude code | 2.1.309 (Claude Code) | `/home/runner/.npm-global/bin/claude` | 293.5 | bin | 12.9 | 244.6 | — | — | 196.0 |
| codex | codex-cli 0.163.0 | `/home/runner/.npm-global/bin/codex` | 430.0 | pkg | 40.8 | 43.0 | 844.3 | 0.4 | 49.1 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | `/home/runner/.npm-global/bin/opencode2` | 207.4 | bin | 85.1 | 141.3 | 507.8 | 0.1 | 131.0 |
| jcode | jcode v0.99.1 (7206efd0c) | `/home/runner/.local/bin/jcode` | 171.3 | bin | 8.6 | 11.2 | 764.9 | 0.4 | 32.3 |
| pi | 1.4.0 | `/home/runner/.npm-global/bin/pi` | 111.8 | pkg | 246.9 | 319.2 | 805.4 | 8.3 | 131.7 |
| pi-bolt | 1.4.0 (Pi-Bolt 0.9.9, linux-x64, JIT off) | `/home/runner/.local/bin/pi-bolt` | 262.0 | bin | 14.1 | 38.8 | 516.6 | 1.7 | 96.6 |
| gemini cli | 0.65.0 | `/home/runner/.npm-global/bin/gemini` | 102.6 | pkg | 1493.0 | 1564.8 | 1585.9 | 0.1 | 146.0 |
| copilot cli | GitHub Copilot CLI 1.0.103. | `/home/runner/.npm-global/bin/copilot` | 198.5 | pkg | 102.5 | 761.0 | — | — | 47.4 |
| crush | crush version v0.98.1 | `/home/runner/.npm-global/bin/crush` | 128.7 | pkg | 128.1 | 426.5 | 873.2 | 73.1 | 69.1 |
| goose | 1.55.0 | `/home/runner/.local/bin/goose` | 304.0 | bin | 6.9 | 6.8 | 373.6 | 0.2 | 109.0 |
| aider | aider 0.86.2 | `/home/runner/work/fox-agent/fox-agent/.venv-bench/bin/aider` | 642.8 | pkg | 788.9 | 731.5 | 1125.2 | 10.3 | 66.8 |
| amp | 0.0.1792713681-g9b55f0 (released 2026-10-23T00:01:21.000Z, 3 | `/home/runner/.local/bin/amp` | 161.0 | bin | 201.2 | 213.8 | 574.4 | 1.8 | 137.2 |
| cursor-agent | 2026.10.22-27dcf5f | `/home/runner/.local/bin/cursor-agent` | 583.2 | pkg | 471.4 | 437.8 | — | — | 251.2 |
| qwen code | 0.26.0 | `/home/runner/.npm-global/bin/qwen` | 154.7 | pkg | 36.4 | 825.1 | 1285.1 | 0.1 | 247.0 |
| codebuff | 1.0.688 | `/home/runner/.npm-global/bin/codebuff` | 140.0 | bin | 875.7 | 852.1 | 1351.8 | 0.1 | 57.6 |
| kilo code | 7.8.17 | `/home/runner/.npm-global/bin/kilocode` | 718.6 | pkg | 775.6 | 2168.8 | 6230.7 | 2588.1 | 46.2 |
| droid | 0.248.0 | `/home/runner/.local/bin/droid` | 319.2 | bin | 110.5 | 102.7 | 3208.7 | 1892.5 | 290.1 |
| kimi code | 2.3.0 | `/home/runner/.kimi-code/bin/kimi` | 192.5 | bin | 575.0 | 728.2 | 1141.0 | 4.1 | 331.3 |
| devin | devin 3000.11.92 (7f4e64980e22) | `/home/runner/.local/bin/devin` | 200.4 | bin | 4.0 | 21.3 | 1025.6 | 142.8 | 95.7 |
| cline | 3.0.73 | `/home/runner/.npm-global/bin/cline` | 330.3 | pkg | 891.8 | 1114.2 | — | — | 55.1 |
| continue | 1.5.47 | `/home/runner/.npm-global/bin/cn` | 82.7 | pkg | 1088.2 | — | — | — | 317.1 |
| iflow cli | 0.5.19 | `/home/runner/.npm-global/bin/iflow` | 180.2 | pkg | 1228.5 | 1309.5 | 2485.4 | 0.1 | 55.7 |

</details>

_Generated 2026-10-23T04:07:36Z on Linux x86_64 (6.17.0-1022-azure). [Method and caveats](#benchmarks) · [raw JSON](bench/results.json)_
