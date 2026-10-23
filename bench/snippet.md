| metric | fox-agent | rank |
|---|---|---|
| TUI 1st byte | **19 ms** | **#3** of 22 |
| TUI 1st input | **379 ms** | **#2** of 18 |
| input latency | **1 ms** | **#9** of 17 |
| bundle | **118 MB** | **#4** of 23 |
| idle PSS | **35 MB** | **#2** of 22 |
| `--version` | **8 ms** | **#2** of 23 |

fox-agent headless vs scripted local provider: time to first token **68 ms**, peak RSS **61 MB**.

<details><summary>every tool, every metric</summary>

![harness bench dashboard](bench/bench.svg)

| agent | bundle | `--version` | TUI 1st byte | TUI 1st input | input latency | idle PSS |
|---|---|---|---|---|---|---|
| **fox-agent** | 118 MB | 8 ms | 19 ms | 379 ms | 1 ms | 35 MB |
| claude code | 293 MB | 14 ms | 271 ms | — | — | 196 MB |
| codex | 430 MB | 45 ms | 47 ms | 804 ms | 1 ms | 49 MB |
| opencode v2 | 207 MB | 83 ms | 139 ms | 503 ms | 0 ms | 129 MB |
| jcode | 171 MB | 10 ms | 13 ms | 779 ms | 1 ms | 32 MB |
| pi | 112 MB | 263 ms | 340 ms | 880 ms | 9 ms | 132 MB |
| pi-bolt | 262 MB | 13 ms | 46 ms | 522 ms | 2 ms | 97 MB |
| gemini cli | 103 MB | 1593 ms | 1702 ms | 1708 ms | 0 ms | 146 MB |
| copilot cli | 198 MB | 110 ms | 831 ms | — | — | 47 MB |
| crush | 129 MB | 144 ms | 259 ms | 710 ms | 73 ms | 68 MB |
| goose | 304 MB | 8 ms | 8 ms | 369 ms | 0 ms | 109 MB |
| aider | 643 MB | 847 ms | 759 ms | 1169 ms | 11 ms | 67 MB |
| amp | 161 MB | 233 ms | 242 ms | 606 ms | 1 ms | 138 MB |
| cursor-agent | 583 MB | 514 ms | 460 ms | — | — | 248 MB |
| qwen code | 155 MB | 40 ms | 887 ms | 1389 ms | 0 ms | 227 MB |
| codebuff | 140 MB | 1050 ms | 1007 ms | 1526 ms | 0 ms | 58 MB |
| kilo code | 661 MB | 909 ms | 2717 ms | 7277 ms | — | — |
| droid | 319 MB | 127 ms | 163 ms | 3276 ms | 1893 ms | 351 MB |
| kimi code | 192 MB | 628 ms | 792 ms | 1222 ms | 5 ms | 354 MB |
| devin | 200 MB | 4 ms | 22 ms | 1028 ms | 142 ms | 96 MB |
| cline | 330 MB | 939 ms | 1220 ms | — | — | 55 MB |
| continue | 83 MB | 1165 ms | — | — | — | 316 MB |
| iflow cli | 180 MB | 1271 ms | 1344 ms | 2565 ms | 0 ms | 56 MB |

</details>

<details><summary>full precision · all collected fields</summary>

| agent | version | bin | bundle (MB) | bundle kind | `--version` (ms) | TUI 1st byte (ms) | TUI 1st input (ms) | input latency (ms) | idle PSS (MB) |
|---|---|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.6.0 | `/home/runner/work/fox-agent/fox-agent/bin/fox` | 117.5 | bin | 7.8 | 18.7 | 379.2 | 0.6 | 34.9 |
| claude code | 2.1.309 (Claude Code) | `/home/runner/.npm-global/bin/claude` | 293.5 | bin | 13.7 | 270.7 | — | — | 196.1 |
| codex | codex-cli 0.163.0 | `/home/runner/.npm-global/bin/codex` | 430.0 | pkg | 44.7 | 47.3 | 804.1 | 0.7 | 49.1 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | `/home/runner/.npm-global/bin/opencode2` | 207.4 | bin | 82.7 | 139.3 | 502.6 | 0.1 | 128.9 |
| jcode | jcode v0.99.1 (7206efd0c) | `/home/runner/.local/bin/jcode` | 171.3 | bin | 9.7 | 12.7 | 778.5 | 0.5 | 31.9 |
| pi | 1.4.0 | `/home/runner/.npm-global/bin/pi` | 111.8 | pkg | 262.8 | 340.2 | 879.9 | 8.6 | 132.3 |
| pi-bolt | 1.4.0 (Pi-Bolt 0.9.9, linux-x64, JIT off) | `/home/runner/.local/bin/pi-bolt` | 262.0 | bin | 13.4 | 45.8 | 522.2 | 1.8 | 96.5 |
| gemini cli | 0.65.0 | `/home/runner/.npm-global/bin/gemini` | 102.6 | pkg | 1592.6 | 1702.3 | 1707.8 | 0.1 | 146.1 |
| copilot cli | GitHub Copilot CLI 1.0.103. | `/home/runner/.npm-global/bin/copilot` | 198.5 | pkg | 109.7 | 831.0 | — | — | 47.4 |
| crush | crush version v0.98.1 | `/home/runner/.npm-global/bin/crush` | 128.7 | pkg | 143.8 | 259.5 | 709.6 | 72.5 | 68.2 |
| goose | 1.55.0 | `/home/runner/.local/bin/goose` | 304.0 | bin | 8.2 | 8.2 | 368.6 | 0.2 | 108.7 |
| aider | aider 0.86.2 | `/home/runner/work/fox-agent/fox-agent/.venv-bench/bin/aider` | 642.8 | pkg | 847.4 | 758.9 | 1168.6 | 10.6 | 66.9 |
| amp | 0.0.1792713681-g9b55f0 (released 2026-10-23T00:01:21.000Z, 3 | `/home/runner/.local/bin/amp` | 161.0 | bin | 233.2 | 241.6 | 605.7 | 0.6 | 138.3 |
| cursor-agent | 2026.10.22-27dcf5f | `/home/runner/.local/bin/cursor-agent` | 583.2 | pkg | 514.0 | 459.7 | — | — | 248.1 |
| qwen code | 0.26.0 | `/home/runner/.npm-global/bin/qwen` | 154.7 | pkg | 39.7 | 887.3 | 1388.7 | 0.1 | 227.3 |
| codebuff | 1.0.688 | `/home/runner/.npm-global/bin/codebuff` | 140.0 | bin | 1049.6 | 1006.7 | 1526.3 | 0.1 | 57.6 |
| kilo code | 7.8.15 | `/home/runner/.npm-global/bin/kilocode` | 661.5 | pkg | 909.2 | 2717.0 | 7276.7 | — | — |
| droid | 0.248.0 | `/home/runner/.local/bin/droid` | 319.2 | bin | 126.9 | 163.3 | 3275.7 | 1893.3 | 350.9 |
| kimi code | 2.3.0 | `/home/runner/.kimi-code/bin/kimi` | 192.5 | bin | 628.0 | 792.2 | 1222.1 | 4.5 | 354.4 |
| devin | devin 3000.11.92 (7f4e64980e22) | `/home/runner/.local/bin/devin` | 200.4 | bin | 4.5 | 22.4 | 1028.4 | 142.4 | 95.8 |
| cline | 3.0.73 | `/home/runner/.npm-global/bin/cline` | 330.3 | pkg | 939.0 | 1220.1 | — | — | 55.0 |
| continue | 1.5.47 | `/home/runner/.npm-global/bin/cn` | 82.7 | pkg | 1164.5 | — | — | — | 316.2 |
| iflow cli | 0.5.19 | `/home/runner/.npm-global/bin/iflow` | 180.2 | pkg | 1270.6 | 1344.2 | 2564.9 | 0.1 | 55.7 |

</details>

_Generated 2026-10-23T03:41:34Z on Linux x86_64 (6.17.0-1022-azure). [Method and caveats](#benchmarks) · [raw JSON](bench/results.json)_
