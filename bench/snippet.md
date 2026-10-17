![harness bench dashboard](bench/bench.svg)

| agent | bundle | `--version` | TUI 1st byte | TUI 1st input | input latency 1s | idle PSS |
|---|---|---|---|---|---|---|
| **fox-agent** | 99 MB | 16 ms | **16 ms** | **379 ms** | **1 ms** | 35 MB |
| claude code | 286 MB | 9 ms | **229 ms** | — | — | 190 MB |
| codex | 140 MB | 45 ms | **46 ms** | **805 ms** | **1 ms** | 49 MB |
| opencode v2 | 207 MB | 83 ms | **140 ms** | **500 ms** | **60 ms** | 130 MB |
| jcode | 167 MB | 10 ms | **12 ms** | **771 ms** | **0 ms** | 31 MB |
| pi | 140 MB | 253 ms | **335 ms** | **860 ms** | **9 ms** | 131 MB |
| gemini cli | 140 MB | 1586 ms | **1649 ms** | **1695 ms** | — | 146 MB |
| copilot cli | 140 MB | 105 ms | **801 ms** | — | — | 47 MB |
| crush | 140 MB | 132 ms | **249 ms** | **706 ms** | **73 ms** | 69 MB |
| goose | 304 MB | 8 ms | **8 ms** | **369 ms** | **0 ms** | 108 MB |
| aider | 140 MB | 841 ms | **765 ms** | **1140 ms** | **10 ms** | 67 MB |
| amp | 135 MB | 260 ms | **274 ms** | **627 ms** | **1 ms** | 162 MB |
| cursor-agent | 140 MB | 460 ms | **441 ms** | **806 ms** | — | 238 MB |
| qwen code | 140 MB | 39 ms | **838 ms** | **1330 ms** | — | 236 MB |
| codebuff | 140 MB | 946 ms | **942 ms** | **1472 ms** | **112 ms** | 58 MB |
| kilo code | 140 MB | 872 ms | **2633 ms** | **6623 ms** | **1711 ms** | 46 MB |
| droid | 294 MB | 119 ms | **131 ms** | **3209 ms** | **754 ms** | 277 MB |
| kimi code | 192 MB | 595 ms | **753 ms** | **1158 ms** | **4 ms** | 333 MB |
| devin | 200 MB | 4 ms | **22 ms** | **1027 ms** | **1641 ms** | 99 MB |
| cline | 140 MB | 870 ms | **1173 ms** | — | — | 55 MB |
| continue | 140 MB | 1138 ms | — | — | — | 317 MB |
| iflow cli | 140 MB | 1234 ms | **1329 ms** | **2538 ms** | **46 ms** | 56 MB |

<details><summary>full precision · all collected fields</summary>

| agent | version | bin | bundle (MB) | bundle kind | `--version` (ms) | TUI 1st byte (ms) | TUI 1st input (ms) | input latency 1s (ms) | idle PSS (MB) |
|---|---|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.5.0-beta.1 | `/home/runner/work/fox-agent/fox-agent/bin/fox` | 99.0 | bin | 15.8 | 16.4 | 379.0 | 0.7 | 35.1 |
| claude code | 2.1.302 (Claude Code) | `/home/runner/.npm-global/bin/claude` | 285.8 | bin | 9.3 | 229.1 | — | — | 190.4 |
| codex | codex-cli 0.163.0 | `/home/runner/.npm-global/bin/codex` | 140.0 | bin | 44.7 | 45.6 | 804.6 | 0.6 | 49.1 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | `/home/runner/.npm-global/bin/opencode2` | 207.4 | bin | 82.9 | 139.7 | 499.7 | 60.4 | 129.6 |
| jcode | jcode v0.98.1 (1c7426eb1) | `/home/runner/.local/bin/jcode` | 166.8 | bin | 9.7 | 12.4 | 771.1 | 0.5 | 30.9 |
| pi | 1.3.0 | `/home/runner/.npm-global/bin/pi` | 140.0 | bin | 252.9 | 335.1 | 860.4 | 8.7 | 131.0 |
| gemini cli | 0.64.0 | `/home/runner/.npm-global/bin/gemini` | 140.0 | bin | 1586.0 | 1648.9 | 1695.2 | — | 145.9 |
| copilot cli | GitHub Copilot CLI 1.0.98. | `/home/runner/.npm-global/bin/copilot` | 140.0 | bin | 104.9 | 801.3 | — | — | 47.4 |
| crush | crush version v0.98.1 | `/home/runner/.npm-global/bin/crush` | 140.0 | bin | 131.7 | 248.6 | 706.4 | 72.6 | 68.9 |
| goose | 1.55.0 | `/home/runner/.local/bin/goose` | 304.0 | bin | 8.3 | 8.0 | 368.7 | 0.3 | 108.1 |
| aider | aider 0.86.2 | `/home/runner/work/fox-agent/fox-agent/.venv-bench/bin/aider` | 140.0 | bin | 840.6 | 764.7 | 1139.9 | 10.2 | 66.9 |
| amp | 0.0.1792195263-g037e53 (released 2026-10-17T00:01:03.000Z, 3 | `/home/runner/.local/bin/amp` | 134.9 | bin | 259.6 | 274.1 | 627.3 | 0.6 | 162.0 |
| cursor-agent | 2026.10.16-e3cb207 | `/home/runner/.local/bin/cursor-agent` | 140.0 | bin | 460.4 | 440.8 | 806.3 | — | 237.8 |
| qwen code | 0.25.2 | `/home/runner/.npm-global/bin/qwen` | 140.0 | bin | 39.3 | 837.7 | 1330.4 | — | 236.5 |
| codebuff | 1.0.688 | `/home/runner/.npm-global/bin/codebuff` | 140.0 | bin | 945.8 | 941.8 | 1472.5 | 111.9 | 57.6 |
| kilo code | 7.8.12 | `/home/runner/.npm-global/bin/kilocode` | 140.0 | bin | 872.3 | 2633.5 | 6623.3 | 1710.5 | 46.2 |
| droid | 0.244.0 | `/home/runner/.local/bin/droid` | 294.4 | bin | 118.8 | 131.1 | 3208.8 | 754.1 | 276.7 |
| kimi code | 2.2.0 | `/home/runner/.kimi-code/bin/kimi` | 191.9 | bin | 595.3 | 752.6 | 1157.6 | 4.3 | 332.6 |
| devin | devin 3000.11.92 (7f4e64980e22) | `/home/runner/.local/bin/devin` | 200.4 | bin | 4.3 | 22.3 | 1026.9 | 1640.7 | 99.0 |
| cline | 3.0.72 | `/home/runner/.npm-global/bin/cline` | 140.0 | bin | 869.8 | 1172.9 | — | — | 55.0 |
| continue | 1.5.47 | `/home/runner/.npm-global/bin/cn` | 140.0 | bin | 1137.6 | — | — | — | 316.8 |
| iflow cli | 0.5.19 | `/home/runner/.npm-global/bin/iflow` | 140.0 | bin | 1233.8 | 1329.0 | 2537.9 | 45.6 | 55.6 |

</details>

fox-agent headless vs scripted local provider: time to first token **61 ms**, peak RSS **60 MB**.

_Generated 2026-10-17T03:49:44Z on Linux x86_64 (6.17.0-1022-azure). [How this is measured](#benchmarks) · [raw JSON](bench/results.json)_
