![harness bench dashboard](bench/bench.svg)

| agent | bundle | `--version` | TUI 1st byte | TUI 1st input | input latency 1s | idle PSS |
|---|---|---|---|---|---|---|
| **fox-agent** | 99 MB | 12 ms | **15 ms** | **376 ms** | **1 ms** | 35 MB |
| claude code | 267 MB | 8 ms | **200 ms** | — | — | 187 MB |
| codex | 140 MB | 40 ms | **46 ms** | **874 ms** | **1 ms** | 49 MB |
| opencode v2 | 207 MB | 86 ms | **141 ms** | **515 ms** | **72 ms** | 129 MB |
| jcode | 167 MB | 8 ms | **10 ms** | **645 ms** | **0 ms** | 30 MB |
| pi | 140 MB | 221 ms | **293 ms** | **783 ms** | **8 ms** | 132 MB |
| gemini cli | 140 MB | 1375 ms | **1447 ms** | **1470 ms** | **0 ms** | — |
| copilot cli | 140 MB | 99 ms | **743 ms** | — | — | 47 MB |
| crush | 140 MB | 119 ms | **611 ms** | **979 ms** | **72 ms** | 68 MB |
| goose | 308 MB | 6 ms | **6 ms** | **367 ms** | **0 ms** | 105 MB |
| aider | 140 MB | 700 ms | **626 ms** | **1007 ms** | **9 ms** | 67 MB |
| amp | 135 MB | 242 ms | **254 ms** | **627 ms** | **1 ms** | 163 MB |
| cursor-agent | 140 MB | 427 ms | **403 ms** | — | — | 237 MB |
| qwen code | 140 MB | 37 ms | **754 ms** | **1208 ms** | — | 257 MB |
| codebuff | 140 MB | 921 ms | **925 ms** | **1437 ms** | **113 ms** | 58 MB |
| kilo code | 140 MB | 876 ms | **2614 ms** | **6634 ms** | **1516 ms** | 46 MB |
| droid | 293 MB | 107 ms | **136 ms** | **3188 ms** | **740 ms** | 222 MB |
| kimi code | 140 MB | 858 ms | **1007 ms** | **1405 ms** | **4 ms** | 336 MB |
| devin | 200 MB | 3 ms | **23 ms** | **1027 ms** | **1640 ms** | 92 MB |
| cline | 140 MB | 857 ms | **1225 ms** | — | — | 55 MB |
| continue | 140 MB | 1112 ms | — | — | — | 317 MB |
| iflow cli | 140 MB | 1181 ms | **1262 ms** | **2064 ms** | **49 ms** | 56 MB |

<details><summary>full precision · all collected fields</summary>

| agent | version | bin | bundle (MB) | bundle kind | `--version` (ms) | TUI 1st byte (ms) | TUI 1st input (ms) | input latency 1s (ms) | idle PSS (MB) |
|---|---|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.5.0-beta.1 | `/home/runner/work/fox-agent/fox-agent/bin/fox` | 99.0 | bin | 12.5 | 14.7 | 375.8 | 0.7 | 35.3 |
| claude code | 2.1.300 (Claude Code) | `/home/runner/.npm-global/bin/claude` | 267.0 | bin | 8.0 | 199.5 | — | — | 187.2 |
| codex | codex-cli 0.162.1 | `/home/runner/.npm-global/bin/codex` | 140.0 | bin | 39.7 | 45.7 | 874.5 | 0.7 | 49.0 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | `/home/runner/.npm-global/bin/opencode2` | 207.4 | bin | 85.6 | 141.0 | 514.9 | 72.1 | 128.8 |
| jcode | jcode v0.98.1 (1c7426eb1) | `/home/runner/.local/bin/jcode` | 166.8 | bin | 8.1 | 10.2 | 645.4 | 0.4 | 30.5 |
| pi | 1.2.0 | `/home/runner/.npm-global/bin/pi` | 140.0 | bin | 220.9 | 293.3 | 783.3 | 7.7 | 131.5 |
| gemini cli | 0.64.0 | `/home/runner/.npm-global/bin/gemini` | 140.0 | bin | 1374.8 | 1446.7 | 1469.9 | 0.1 | — |
| copilot cli | GitHub Copilot CLI 1.0.98. | `/home/runner/.npm-global/bin/copilot` | 140.0 | bin | 98.6 | 743.1 | — | — | 47.3 |
| crush | crush version v0.98.1 | `/home/runner/.npm-global/bin/crush` | 140.0 | bin | 119.4 | 610.9 | 979.5 | 72.0 | 68.4 |
| goose | 1.54.0 | `/home/runner/.local/bin/goose` | 307.8 | bin | 6.4 | 6.3 | 367.2 | 0.3 | 105.4 |
| aider | aider 0.86.2 | `/home/runner/work/fox-agent/fox-agent/.venv-bench/bin/aider` | 140.0 | bin | 700.2 | 626.0 | 1007.1 | 8.8 | 66.9 |
| amp | 0.0.1792036844-g99022c (released 2026-10-15T04:00:44.000Z, 1 | `/home/runner/.local/bin/amp` | 134.5 | bin | 241.8 | 254.1 | 627.1 | 0.6 | 163.5 |
| cursor-agent | 2026.10.14-941492e | `/home/runner/.local/bin/cursor-agent` | 140.0 | bin | 427.4 | 402.9 | — | — | 237.4 |
| qwen code | 0.25.1 | `/home/runner/.npm-global/bin/qwen` | 140.0 | bin | 36.9 | 754.1 | 1207.5 | — | 257.4 |
| codebuff | 1.0.688 | `/home/runner/.npm-global/bin/codebuff` | 140.0 | bin | 921.4 | 924.6 | 1437.4 | 112.6 | 57.7 |
| kilo code | 7.8.8 | `/home/runner/.npm-global/bin/kilocode` | 140.0 | bin | 875.7 | 2614.4 | 6633.5 | 1516.4 | 46.1 |
| droid | 0.242.0 | `/home/runner/.local/bin/droid` | 292.6 | bin | 106.5 | 135.6 | 3188.2 | 739.7 | 222.2 |
| kimi code | 2.2.0 | `/home/runner/.npm-global/bin/kimi` | 140.0 | bin | 858.2 | 1006.6 | 1404.9 | 4.4 | 335.5 |
| devin | devin 3000.11.92 (7f4e64980e22) | `/home/runner/.local/bin/devin` | 200.4 | bin | 3.4 | 22.8 | 1026.8 | 1640.1 | 92.2 |
| cline | 3.0.71 | `/home/runner/.npm-global/bin/cline` | 140.0 | bin | 856.8 | 1225.2 | — | — | 54.9 |
| continue | 1.5.47 | `/home/runner/.npm-global/bin/cn` | 140.0 | bin | 1111.9 | — | — | — | 316.6 |
| iflow cli | 0.5.19 | `/home/runner/.npm-global/bin/iflow` | 140.0 | bin | 1181.1 | 1261.5 | 2063.9 | 49.1 | 55.5 |

</details>

fox-agent headless vs scripted local provider: time to first token **72 ms**, peak RSS **60 MB**.

_Generated 2026-10-15T05:14:42Z on Linux x86_64 (6.17.0-1022-azure). [How this is measured](#benchmarks) · [raw JSON](bench/results.json)_
