| metric | fox-agent | rank |
|---|---|---|
| TUI 1st byte | **17 ms** | **#3** of 22 |
| TUI 1st input | **380 ms** | **#2** of 18 |
| input latency | **1 ms** | **#10** of 18 |
| bundle | **118 MB** | **#4** of 23 |
| idle PSS | **36 MB** | **#2** of 23 |
| `--version` | **8 ms** | **#2** of 23 |

fox-agent headless vs scripted local provider: time to first token **58 ms**, peak RSS **62 MB**.

<details><summary>every tool, every metric</summary>

![harness bench dashboard](bench/bench.svg)

| agent | bundle | `--version` | TUI 1st byte | TUI 1st input | input latency | idle PSS |
|---|---|---|---|---|---|---|
| **fox-agent** | 118 MB | 8 ms | 17 ms | 380 ms | 1 ms | 36 MB |
| claude code | 293 MB | 12 ms | 244 ms | — | — | 196 MB |
| codex | 430 MB | 45 ms | 46 ms | 877 ms | 0 ms | 49 MB |
| opencode v2 | 207 MB | 82 ms | 135 ms | 498 ms | 0 ms | 128 MB |
| jcode | 171 MB | 10 ms | 13 ms | 790 ms | 0 ms | 32 MB |
| pi | 112 MB | 243 ms | 322 ms | 809 ms | 0 ms | 130 MB |
| pi-bolt | 262 MB | 13 ms | 40 ms | 521 ms | 2 ms | 97 MB |
| gemini cli | 103 MB | 1460 ms | 1548 ms | 1577 ms | 0 ms | 146 MB |
| copilot cli | 198 MB | 109 ms | 786 ms | — | — | 47 MB |
| crush | 129 MB | 134 ms | 537 ms | 968 ms | 73 ms | 69 MB |
| goose | 304 MB | 8 ms | 8 ms | 368 ms | 0 ms | 109 MB |
| aider | 643 MB | 805 ms | 716 ms | 1122 ms | 10 ms | 67 MB |
| amp | 161 MB | 197 ms | 214 ms | 577 ms | 1 ms | 138 MB |
| cursor-agent | 583 MB | 472 ms | 440 ms | — | — | 251 MB |
| qwen code | 155 MB | 40 ms | 813 ms | 1290 ms | 0 ms | 250 MB |
| codebuff | 140 MB | 947 ms | 866 ms | 1371 ms | 0 ms | 58 MB |
| kilo code | 719 MB | 797 ms | 2110 ms | 6067 ms | 2691 ms | 46 MB |
| droid | 319 MB | 119 ms | 91 ms | 3198 ms | 1892 ms | 288 MB |
| kimi code | 192 MB | 565 ms | 739 ms | 1111 ms | 4 ms | 355 MB |
| devin | 200 MB | 4 ms | 23 ms | 1033 ms | 142 ms | 89 MB |
| cline | 330 MB | 879 ms | 1169 ms | — | — | 55 MB |
| continue | 83 MB | 1148 ms | — | — | — | 318 MB |
| iflow cli | 180 MB | 1226 ms | 1308 ms | 2485 ms | 0 ms | 56 MB |

</details>

<details><summary>full precision · all collected fields</summary>

| agent | version | bin | bundle (MB) | bundle kind | `--version` (ms) | TUI 1st byte (ms) | TUI 1st input (ms) | input latency (ms) | idle PSS (MB) |
|---|---|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.6.0 | `/home/runner/work/fox-agent/fox-agent/bin/fox` | 117.5 | bin | 7.7 | 16.8 | 380.5 | 0.6 | 36.2 |
| claude code | 2.1.309 (Claude Code) | `/home/runner/.npm-global/bin/claude` | 293.5 | bin | 11.8 | 244.4 | — | — | 196.3 |
| codex | codex-cli 0.163.0 | `/home/runner/.npm-global/bin/codex` | 430.0 | pkg | 44.5 | 45.7 | 877.0 | 0.2 | 49.1 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | `/home/runner/.npm-global/bin/opencode2` | 207.4 | bin | 82.1 | 135.1 | 498.5 | 0.1 | 128.2 |
| jcode | jcode v0.99.1 (7206efd0c) | `/home/runner/.local/bin/jcode` | 171.3 | bin | 9.8 | 12.8 | 790.3 | 0.4 | 32.0 |
| pi | 1.4.0 | `/home/runner/.npm-global/bin/pi` | 111.8 | pkg | 242.8 | 321.6 | 809.1 | 0.1 | 129.5 |
| pi-bolt | 1.4.0 (Pi-Bolt 0.9.9, linux-x64, JIT off) | `/home/runner/.local/bin/pi-bolt` | 262.0 | bin | 13.5 | 39.7 | 520.8 | 1.7 | 96.6 |
| gemini cli | 0.65.0 | `/home/runner/.npm-global/bin/gemini` | 102.6 | pkg | 1459.8 | 1548.3 | 1576.7 | 0.1 | 146.1 |
| copilot cli | GitHub Copilot CLI 1.0.103. | `/home/runner/.npm-global/bin/copilot` | 198.5 | pkg | 108.9 | 786.4 | — | — | 47.4 |
| crush | crush version v0.98.1 | `/home/runner/.npm-global/bin/crush` | 128.7 | pkg | 133.7 | 536.8 | 968.2 | 73.3 | 68.8 |
| goose | 1.55.0 | `/home/runner/.local/bin/goose` | 304.0 | bin | 8.1 | 8.1 | 368.5 | 0.2 | 109.4 |
| aider | aider 0.86.2 | `/home/runner/work/fox-agent/fox-agent/.venv-bench/bin/aider` | 642.8 | pkg | 805.4 | 715.8 | 1122.0 | 9.9 | 66.9 |
| amp | 0.0.1792713681-g9b55f0 (released 2026-10-23T00:01:21.000Z, 3 | `/home/runner/.local/bin/amp` | 161.0 | bin | 197.3 | 214.2 | 576.9 | 0.6 | 138.3 |
| cursor-agent | 2026.10.22-27dcf5f | `/home/runner/.local/bin/cursor-agent` | 583.2 | pkg | 472.1 | 439.7 | — | — | 250.8 |
| qwen code | 0.26.0 | `/home/runner/.npm-global/bin/qwen` | 154.7 | pkg | 40.0 | 812.5 | 1289.8 | 0.1 | 250.2 |
| codebuff | 1.0.688 | `/home/runner/.npm-global/bin/codebuff` | 140.0 | bin | 946.8 | 865.5 | 1370.6 | 0.1 | 57.5 |
| kilo code | 7.8.17 | `/home/runner/.npm-global/bin/kilocode` | 718.6 | pkg | 796.7 | 2110.1 | 6066.8 | 2691.1 | 46.2 |
| droid | 0.248.0 | `/home/runner/.local/bin/droid` | 319.2 | bin | 118.8 | 91.5 | 3197.9 | 1891.5 | 288.4 |
| kimi code | 2.3.0 | `/home/runner/.kimi-code/bin/kimi` | 192.5 | bin | 564.9 | 738.7 | 1111.0 | 4.0 | 355.1 |
| devin | devin 3000.11.92 (7f4e64980e22) | `/home/runner/.local/bin/devin` | 200.4 | bin | 4.0 | 23.5 | 1032.9 | 142.2 | 89.1 |
| cline | 3.0.73 | `/home/runner/.npm-global/bin/cline` | 330.3 | pkg | 879.2 | 1169.4 | — | — | 55.0 |
| continue | 1.5.47 | `/home/runner/.npm-global/bin/cn` | 82.7 | pkg | 1148.5 | — | — | — | 318.1 |
| iflow cli | 0.5.19 | `/home/runner/.npm-global/bin/iflow` | 180.2 | pkg | 1226.2 | 1308.1 | 2485.3 | 0.1 | 55.6 |

</details>

_Generated 2026-10-23T03:49:57Z on Linux x86_64 (6.17.0-1022-azure). [Method and caveats](#benchmarks) · [raw JSON](bench/results.json)_
