| metric | fox-agent | rank |
|---|---|---|
| TUI 1st byte | **16 ms** | **#3** of 22 |
| TUI 1st input | **377 ms** | **#2** of 18 |
| input latency | **1 ms** | **#9** of 18 |
| bundle | **118 MB** | **#4** of 23 |
| idle PSS | **37 MB** | **#2** of 23 |
| `--version` | **7 ms** | **#2** of 23 |

fox-agent headless vs scripted local provider: time to first token **58 ms**, peak RSS **62 MB**.

<details><summary>every tool, every metric</summary>

![harness bench dashboard](bench/bench.svg)

| agent | bundle | `--version` | TUI 1st byte | TUI 1st input | input latency | idle PSS |
|---|---|---|---|---|---|---|
| **fox-agent** | 118 MB | 7 ms | 16 ms | 377 ms | 1 ms | 37 MB |
| claude code | 293 MB | 10 ms | 240 ms | — | — | 196 MB |
| codex | 430 MB | 43 ms | 44 ms | 812 ms | 0 ms | 49 MB |
| opencode v2 | 207 MB | 79 ms | 132 ms | 502 ms | 0 ms | 130 MB |
| jcode | 171 MB | 10 ms | 13 ms | 770 ms | 0 ms | 31 MB |
| pi | 112 MB | 258 ms | 338 ms | 870 ms | 9 ms | 130 MB |
| pi-bolt | 262 MB | 14 ms | 42 ms | 521 ms | 2 ms | 97 MB |
| gemini cli | 103 MB | 1508 ms | 1599 ms | 1677 ms | 0 ms | 146 MB |
| copilot cli | 198 MB | 110 ms | 819 ms | — | — | 47 MB |
| crush | 129 MB | 183 ms | 288 ms | 734 ms | 73 ms | 69 MB |
| goose | 304 MB | 8 ms | 8 ms | 368 ms | 0 ms | 109 MB |
| aider | 643 MB | 842 ms | 764 ms | 1154 ms | 10 ms | 67 MB |
| amp | 161 MB | 209 ms | 226 ms | 592 ms | 3 ms | 138 MB |
| cursor-agent | 583 MB | 477 ms | 442 ms | — | — | 247 MB |
| qwen code | 155 MB | 38 ms | 831 ms | 1311 ms | 0 ms | 242 MB |
| codebuff | 140 MB | 903 ms | 883 ms | 1390 ms | 0 ms | 58 MB |
| kilo code | 719 MB | 810 ms | 2200 ms | 6023 ms | 2607 ms | 46 MB |
| droid | 319 MB | 130 ms | 105 ms | 625 ms | 1896 ms | 346 MB |
| kimi code | 192 MB | 582 ms | 746 ms | 1131 ms | 4 ms | 355 MB |
| devin | 200 MB | 4 ms | 22 ms | 1026 ms | 142 ms | 91 MB |
| cline | 330 MB | 872 ms | 1117 ms | — | — | 55 MB |
| continue | 83 MB | 1072 ms | — | — | — | 317 MB |
| iflow cli | 180 MB | 1181 ms | 1265 ms | 2473 ms | 0 ms | 56 MB |

</details>

<details><summary>full precision · all collected fields</summary>

| agent | version | bin | bundle (MB) | bundle kind | `--version` (ms) | TUI 1st byte (ms) | TUI 1st input (ms) | input latency (ms) | idle PSS (MB) |
|---|---|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.6.0 | `/home/runner/work/fox-agent/fox-agent/bin/fox` | 117.5 | bin | 6.9 | 16.3 | 377.5 | 0.5 | 36.7 |
| claude code | 2.1.309 (Claude Code) | `/home/runner/.npm-global/bin/claude` | 293.5 | bin | 10.4 | 239.7 | — | — | 196.2 |
| codex | codex-cli 0.163.0 | `/home/runner/.npm-global/bin/codex` | 430.0 | pkg | 42.5 | 44.2 | 812.1 | 0.4 | 49.1 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | `/home/runner/.npm-global/bin/opencode2` | 207.4 | bin | 79.3 | 131.9 | 502.5 | 0.1 | 129.9 |
| jcode | jcode v0.99.1 (7206efd0c) | `/home/runner/.local/bin/jcode` | 171.3 | bin | 9.7 | 12.6 | 770.4 | 0.5 | 31.5 |
| pi | 1.4.0 | `/home/runner/.npm-global/bin/pi` | 111.8 | pkg | 258.2 | 337.9 | 870.1 | 8.7 | 130.3 |
| pi-bolt | 1.4.0 (Pi-Bolt 0.9.9, linux-x64, JIT off) | `/home/runner/.local/bin/pi-bolt` | 262.0 | bin | 13.6 | 41.6 | 521.1 | 1.6 | 96.9 |
| gemini cli | 0.65.0 | `/home/runner/.npm-global/bin/gemini` | 102.6 | pkg | 1507.7 | 1598.6 | 1677.0 | 0.1 | 146.2 |
| copilot cli | GitHub Copilot CLI 1.0.103. | `/home/runner/.npm-global/bin/copilot` | 198.5 | pkg | 110.3 | 818.5 | — | — | 47.4 |
| crush | crush version v0.98.1 | `/home/runner/.npm-global/bin/crush` | 128.7 | pkg | 182.8 | 287.9 | 734.2 | 73.1 | 68.8 |
| goose | 1.55.0 | `/home/runner/.local/bin/goose` | 304.0 | bin | 7.8 | 7.7 | 368.5 | 0.3 | 108.6 |
| aider | aider 0.86.2 | `/home/runner/work/fox-agent/fox-agent/.venv-bench/bin/aider` | 642.8 | pkg | 841.8 | 763.9 | 1153.9 | 10.4 | 67.0 |
| amp | 0.0.1792713681-g9b55f0 (released 2026-10-23T00:01:21.000Z, 3 | `/home/runner/.local/bin/amp` | 161.0 | bin | 209.5 | 226.2 | 592.5 | 2.9 | 138.0 |
| cursor-agent | 2026.10.22-27dcf5f | `/home/runner/.local/bin/cursor-agent` | 583.2 | pkg | 477.2 | 442.1 | — | — | 246.6 |
| qwen code | 0.26.0 | `/home/runner/.npm-global/bin/qwen` | 154.7 | pkg | 37.6 | 831.3 | 1310.6 | 0.1 | 241.7 |
| codebuff | 1.0.688 | `/home/runner/.npm-global/bin/codebuff` | 140.0 | bin | 903.3 | 882.9 | 1390.0 | 0.1 | 57.6 |
| kilo code | 7.8.17 | `/home/runner/.npm-global/bin/kilocode` | 718.6 | pkg | 809.9 | 2199.7 | 6023.0 | 2606.5 | 46.2 |
| droid | 0.248.0 | `/home/runner/.local/bin/droid` | 319.2 | bin | 130.2 | 104.8 | 625.0 | 1895.9 | 346.4 |
| kimi code | 2.3.0 | `/home/runner/.kimi-code/bin/kimi` | 192.5 | bin | 582.3 | 746.0 | 1130.8 | 4.1 | 354.8 |
| devin | devin 3000.11.92 (7f4e64980e22) | `/home/runner/.local/bin/devin` | 200.4 | bin | 4.3 | 21.7 | 1026.1 | 141.9 | 90.7 |
| cline | 3.0.73 | `/home/runner/.npm-global/bin/cline` | 330.3 | pkg | 871.9 | 1117.2 | — | — | 55.1 |
| continue | 1.5.47 | `/home/runner/.npm-global/bin/cn` | 82.7 | pkg | 1071.8 | — | — | — | 317.0 |
| iflow cli | 0.5.19 | `/home/runner/.npm-global/bin/iflow` | 180.2 | pkg | 1180.8 | 1265.0 | 2473.2 | 0.1 | 55.6 |

</details>

_Generated 2026-10-23T03:52:18Z on Linux x86_64 (6.17.0-1022-azure). [Method and caveats](#benchmarks) · [raw JSON](bench/results.json)_
