| metric | fox-agent | rank |
|---|---|---|
| TUI 1st byte | **19 ms** | **#3** of 22 |
| TUI 1st input | — | — |
| input latency | — | — |
| bundle | **117 MB** | **#4** of 23 |
| idle PSS | **36 MB** | **#2** of 22 |
| `--version` | **8 ms** | **#3** of 23 |

fox-agent headless vs scripted local provider: time to first token **50 ms**, peak RSS **56 MB**.

<details><summary>every tool, every metric</summary>

![harness bench dashboard](bench/bench.svg)

| agent | bundle | `--version` | TUI 1st byte | TUI 1st input | input latency | signal | idle PSS |
|---|---|---|---|---|---|---|---|
| **fox-agent** | 117 MB | 8 ms | 19 ms | — | — | render | 36 MB |
| claude code | 293 MB | 12 ms | 234 ms | — | — | render | 196 MB |
| codex | 444 MB | 45 ms | 47 ms | — | — | render | 245 MB |
| opencode v2 | 207 MB | 83 ms | 133 ms | 16801 ms | 60 ms | render | 129 MB |
| jcode | 171 MB | 11 ms | 14 ms | — | — | render | 32 MB |
| pi | 112 MB | 246 ms | 316 ms | 847 ms | 9 ms | render | 132 MB |
| pi-bolt | 263 MB | 13 ms | 39 ms | 516 ms | 2 ms | render | 87 MB |
| gemini cli | 103 MB | 1481 ms | 1570 ms | 1579 ms | 1 ms | — | 333 MB |
| copilot cli | 198 MB | 107 ms | 796 ms | — | — | render | 303 MB |
| crush | 129 MB | 153 ms | 416 ms | 17174 ms | 16324 ms | render | 155 MB |
| goose | 304 MB | 8 ms | 8 ms | 258 ms | 1 ms | render | — |
| aider | 643 MB | 791 ms | 707 ms | 1094 ms | 10 ms | render | 67 MB |
| amp | 161 MB | 195 ms | 206 ms | 579 ms | 1 ms | render | 138 MB |
| cursor-agent | 583 MB | 448 ms | 429 ms | 17164 ms | 16006 ms | render | 253 MB |
| qwen code | 155 MB | 39 ms | 810 ms | — | — | render | 249 MB |
| codebuff | 140 MB | 937 ms | 904 ms | — | — | render | 234 MB |
| kilo code | 719 MB | 833 ms | 2215 ms | 18870 ms | 16047 ms | render | 353 MB |
| droid | 319 MB | 114 ms | 98 ms | — | — | render | 276 MB |
| kimi code | 192 MB | 561 ms | 725 ms | — | — | render | 328 MB |
| devin | 217 MB | 4 ms | 23 ms | — | — | render | 102 MB |
| cline | 330 MB | 924 ms | 1234 ms | — | — | render | 232 MB |
| continue | 83 MB | 1079 ms | — | — | 1 ms | kernel-echo (tty) | 319 MB |
| iflow cli | 180 MB | 1207 ms | 1273 ms | 2476 ms | 51 ms | render | 295 MB |

</details>

<details><summary>full precision · all collected fields</summary>

| agent | version | bin | bundle (MB) | bundle kind | `--version` (ms) | TUI 1st byte (ms) | TUI 1st input (ms) | input latency (ms) | signal | idle PSS (MB) |
|---|---|---|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.6.0 | `/home/runner/work/fox-agent/fox-agent/bin/fox` | 116.6 | bin | 8.0 | 18.7 | — | — | render | 35.9 |
| claude code | 2.1.309 (Claude Code) | `/home/runner/.npm-global/bin/claude` | 293.5 | bin | 12.1 | 233.7 | — | — | render | 196.3 |
| codex | codex-cli 0.164.0 | `/home/runner/.npm-global/bin/codex` | 444.4 | pkg | 45.0 | 47.0 | — | — | render | 244.5 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | `/home/runner/.npm-global/bin/opencode2` | 207.4 | bin | 83.0 | 133.3 | 16800.9 | 59.9 | render | 128.5 |
| jcode | jcode v0.99.1 (7206efd0c) | `/home/runner/.local/bin/jcode` | 171.3 | bin | 10.7 | 13.7 | — | — | render | 31.9 |
| pi | 1.4.0 | `/home/runner/.npm-global/bin/pi` | 111.8 | pkg | 246.0 | 316.2 | 847.1 | 8.7 | render | 131.8 |
| pi-bolt | 1.4.0 (Pi-Bolt 1.0.0, linux-x64, JIT off) | `/home/runner/.local/bin/pi-bolt` | 263.2 | bin | 13.4 | 38.5 | 516.0 | 2.3 | render | 87.0 |
| gemini cli | 0.65.0 | `/home/runner/.npm-global/bin/gemini` | 102.6 | pkg | 1481.1 | 1569.9 | 1578.9 | 0.9 | — | 333.0 |
| copilot cli | GitHub Copilot CLI 1.0.103. | `/home/runner/.npm-global/bin/copilot` | 198.5 | pkg | 107.3 | 796.1 | — | — | render | 303.0 |
| crush | crush version v0.98.2 | `/home/runner/.npm-global/bin/crush` | 128.9 | pkg | 152.6 | 415.8 | 17174.3 | 16323.9 | render | 155.0 |
| goose | 1.55.0 | `/home/runner/.local/bin/goose` | 304.0 | bin | 8.0 | 8.0 | 258.1 | 0.9 | render | — |
| aider | aider 0.86.2 | `/home/runner/work/fox-agent/fox-agent/.venv-bench/bin/aider` | 642.8 | pkg | 791.0 | 706.8 | 1093.9 | 10.4 | render | 66.8 |
| amp | 0.0.1792756861-g6187a2 (released 2026-10-23T12:01:01.000Z, 3 | `/home/runner/.local/bin/amp` | 161.0 | bin | 194.6 | 206.2 | 578.6 | 1.3 | render | 138.0 |
| cursor-agent | 2026.10.22-27dcf5f | `/home/runner/.local/bin/cursor-agent` | 583.2 | pkg | 447.6 | 429.3 | 17164.2 | 16006.2 | render | 252.6 |
| qwen code | 0.26.0 | `/home/runner/.npm-global/bin/qwen` | 154.7 | pkg | 39.0 | 809.8 | — | — | render | 248.8 |
| codebuff | 1.0.688 | `/home/runner/.npm-global/bin/codebuff` | 140.0 | bin | 937.3 | 904.5 | — | — | render | 233.9 |
| kilo code | 7.8.17 | `/home/runner/.npm-global/bin/kilocode` | 718.6 | pkg | 832.6 | 2214.7 | 18870.4 | 16047.3 | render | 353.4 |
| droid | 0.248.0 | `/home/runner/.local/bin/droid` | 319.2 | bin | 113.9 | 98.0 | — | — | render | 275.9 |
| kimi code | 2.3.1 | `/home/runner/.kimi-code/bin/kimi` | 192.3 | bin | 561.2 | 725.2 | — | — | render | 328.5 |
| devin | devin 3000.11.205 (6dea39440ae3) | `/home/runner/.local/bin/devin` | 217.5 | bin | 4.3 | 23.2 | — | — | render | 101.8 |
| cline | 3.0.73 | `/home/runner/.npm-global/bin/cline` | 330.3 | pkg | 923.9 | 1234.2 | — | — | render | 232.2 |
| continue | 1.5.47 | `/home/runner/.npm-global/bin/cn` | 82.7 | pkg | 1079.0 | — | — | 1.0 | kernel-echo | 318.5 |
| iflow cli | 0.5.19 | `/home/runner/.npm-global/bin/iflow` | 180.2 | pkg | 1206.6 | 1272.6 | 2476.2 | 50.9 | render | 295.4 |

</details>

_Generated 2026-10-23T16:22:29Z on Linux x86_64 (6.17.0-1022-azure). [Method and caveats](#benchmarks) · [raw JSON](bench/results.json)_
