![harness bench dashboard](bench/bench.svg)

| agent | bundle | `--version` | TUI 1st byte | TUI 1st input | input latency 1s | idle PSS |
|---|---|---|---|---|---|---|
| **fox-agent** | 99 MB | 16 ms | **19 ms** | **377 ms** | **1 ms** | 38 MB |
| claude code | 291 MB | 11 ms | **240 ms** | — | — | 194 MB |
| codex | 140 MB | 45 ms | **47 ms** | **895 ms** | **2 ms** | 48 MB |
| opencode v2 | 207 MB | 93 ms | **155 ms** | **511 ms** | **64 ms** | 127 MB |
| jcode | 170 MB | 10 ms | **13 ms** | **769 ms** | **0 ms** | 36 MB |
| pi | 140 MB | 262 ms | **357 ms** | **840 ms** | **8 ms** | 132 MB |
| pi-bolt | 261 MB | 12 ms | **45 ms** | **523 ms** | **2 ms** | 96 MB |
| gemini cli | 140 MB | 1597 ms | **1748 ms** | **1746 ms** | — | 145 MB |
| copilot cli | 140 MB | 108 ms | **807 ms** | — | — | 46 MB |
| crush | 140 MB | 162 ms | **551 ms** | **1005 ms** | **73 ms** | 68 MB |
| goose | 304 MB | 8 ms | **8 ms** | **368 ms** | **0 ms** | 110 MB |
| aider | 140 MB | 785 ms | **729 ms** | **1109 ms** | **10 ms** | 68 MB |
| amp | 135 MB | 253 ms | **259 ms** | **621 ms** | **1 ms** | 166 MB |
| cursor-agent | 140 MB | 471 ms | **449 ms** | **808 ms** | — | 249 MB |
| qwen code | 140 MB | 39 ms | **836 ms** | **1309 ms** | — | 247 MB |
| codebuff | 140 MB | 903 ms | **873 ms** | **1376 ms** | **110 ms** | 56 MB |
| kilo code | 140 MB | 839 ms | **2502 ms** | **6631 ms** | **1766 ms** | 45 MB |
| droid | 295 MB | 113 ms | **135 ms** | **1207 ms** | **744 ms** | 287 MB |
| kimi code | 192 MB | 625 ms | **858 ms** | **1259 ms** | **4 ms** | 351 MB |
| devin | 200 MB | 5 ms | **24 ms** | **1029 ms** | **1641 ms** | 71 MB |
| cline | 140 MB | 1007 ms | **1373 ms** | — | — | 53 MB |
| continue | 140 MB | 1205 ms | — | — | — | 315 MB |
| iflow cli | 140 MB | 1326 ms | **1429 ms** | **2631 ms** | **47 ms** | 54 MB |

<details><summary>full precision · all collected fields</summary>

| agent | version | bin | bundle (MB) | bundle kind | `--version` (ms) | TUI 1st byte (ms) | TUI 1st input (ms) | input latency 1s (ms) | idle PSS (MB) |
|---|---|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.6.0 | `/home/runner/work/fox-agent/fox-agent/bin/fox` | 99.1 | bin | 15.9 | 19.0 | 377.0 | 0.6 | 37.6 |
| claude code | 2.1.306 (Claude Code) | `/home/runner/.npm-global/bin/claude` | 290.5 | bin | 11.0 | 240.2 | — | — | 193.7 |
| codex | codex-cli 0.163.0 | `/home/runner/.npm-global/bin/codex` | 140.0 | bin | 45.2 | 47.4 | 895.1 | 1.7 | 47.6 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | `/home/runner/.npm-global/bin/opencode2` | 207.4 | bin | 93.1 | 154.7 | 511.5 | 64.1 | 127.4 |
| jcode | jcode v0.99.0 (774613c90) | `/home/runner/.local/bin/jcode` | 169.6 | bin | 10.2 | 13.0 | 769.1 | 0.4 | 36.1 |
| pi | 1.3.0 | `/home/runner/.npm-global/bin/pi` | 140.0 | bin | 261.8 | 357.2 | 840.3 | 8.2 | 131.9 |
| pi-bolt | 1.3.0 (Pi-Bolt 0.9.6, linux-x64, JIT off) | `/home/runner/.local/bin/pi-bolt` | 261.1 | bin | 12.1 | 44.7 | 523.1 | 1.7 | 96.3 |
| gemini cli | 0.65.0 | `/home/runner/.npm-global/bin/gemini` | 140.0 | bin | 1596.5 | 1748.2 | 1745.9 | — | 145.5 |
| copilot cli | GitHub Copilot CLI 1.0.101. | `/home/runner/.npm-global/bin/copilot` | 140.0 | bin | 108.5 | 806.5 | — | — | 45.9 |
| crush | crush version v0.98.1 | `/home/runner/.npm-global/bin/crush` | 140.0 | bin | 161.8 | 551.1 | 1004.8 | 72.7 | 67.9 |
| goose | 1.55.0 | `/home/runner/.local/bin/goose` | 304.0 | bin | 8.0 | 7.5 | 368.1 | 0.2 | 110.0 |
| aider | aider 0.86.2 | `/home/runner/work/fox-agent/fox-agent/.venv-bench/bin/aider` | 140.0 | bin | 785.5 | 729.0 | 1109.5 | 10.3 | 67.7 |
| amp | 0.0.1792540877-gcc084c (released 2026-10-21T00:01:17.000Z, 3 | `/home/runner/.local/bin/amp` | 135.0 | bin | 253.4 | 258.8 | 621.3 | 0.5 | 166.5 |
| cursor-agent | 2026.10.19-6bbf2c4 | `/home/runner/.local/bin/cursor-agent` | 140.0 | bin | 470.7 | 448.5 | 808.4 | — | 248.9 |
| qwen code | 0.25.3 | `/home/runner/.npm-global/bin/qwen` | 140.0 | bin | 39.5 | 835.7 | 1309.1 | — | 247.2 |
| codebuff | 1.0.688 | `/home/runner/.npm-global/bin/codebuff` | 140.0 | bin | 903.2 | 873.3 | 1375.9 | 110.3 | 56.5 |
| kilo code | 7.8.15 | `/home/runner/.npm-global/bin/kilocode` | 140.0 | bin | 838.8 | 2501.6 | 6630.8 | 1765.7 | 44.8 |
| droid | 0.245.0 | `/home/runner/.local/bin/droid` | 295.5 | bin | 112.8 | 135.1 | 1206.5 | 744.1 | 287.2 |
| kimi code | 2.2.0 | `/home/runner/.kimi-code/bin/kimi` | 191.9 | bin | 624.6 | 857.6 | 1259.2 | 4.5 | 351.0 |
| devin | devin 3000.11.92 (7f4e64980e22) | `/home/runner/.local/bin/devin` | 200.4 | bin | 4.6 | 24.5 | 1029.2 | 1641.0 | 71.2 |
| cline | 3.0.73 | `/home/runner/.npm-global/bin/cline` | 140.0 | bin | 1007.2 | 1372.7 | — | — | 53.3 |
| continue | 1.5.47 | `/home/runner/.npm-global/bin/cn` | 140.0 | bin | 1205.2 | — | — | — | 315.5 |
| iflow cli | 0.5.19 | `/home/runner/.npm-global/bin/iflow` | 140.0 | bin | 1326.4 | 1429.5 | 2631.4 | 47.2 | 53.9 |

</details>

fox-agent headless vs scripted local provider: time to first token **66 ms**, peak RSS **64 MB**.

_Generated 2026-10-21T03:57:20Z on Linux x86_64 (7.0.0-1017-azure). [How this is measured](#benchmarks) · [raw JSON](bench/results.json)_
