![harness bench dashboard](bench/bench.svg)

| agent | bundle | `--version` | TUI 1st byte | TUI 1st input | input latency 1s | idle PSS |
|---|---|---|---|---|---|---|
| **fox-agent** | 99 MB | 11 ms | **13 ms** | **375 ms** | **1 ms** | 35 MB |
| claude code | 286 MB | 6 ms | **179 ms** | — | — | 190 MB |
| codex | 140 MB | 35 ms | **40 ms** | **801 ms** | **1 ms** | 49 MB |
| opencode v2 | 207 MB | 68 ms | **118 ms** | **479 ms** | **54 ms** | 127 MB |
| jcode | 167 MB | 6 ms | **8 ms** | **607 ms** | **0 ms** | 30 MB |
| pi | 140 MB | 193 ms | **257 ms** | **758 ms** | **7 ms** | 132 MB |
| gemini cli | 140 MB | 1188 ms | **1271 ms** | **1289 ms** | **0 ms** | — |
| copilot cli | 140 MB | 82 ms | **628 ms** | — | — | 47 MB |
| crush | 140 MB | 136 ms | **419 ms** | **844 ms** | **55 ms** | 69 MB |
| goose | 304 MB | 6 ms | **6 ms** | **366 ms** | **0 ms** | 108 MB |
| aider | 140 MB | 609 ms | **544 ms** | **923 ms** | **8 ms** | 67 MB |
| amp | 135 MB | 206 ms | **222 ms** | **599 ms** | **1 ms** | 165 MB |
| cursor-agent | 140 MB | 353 ms | **341 ms** | — | — | 235 MB |
| qwen code | 140 MB | 31 ms | **649 ms** | **1085 ms** | — | 290 MB |
| codebuff | 140 MB | 788 ms | **773 ms** | **1270 ms** | **107 ms** | 58 MB |
| kilo code | 140 MB | 748 ms | **2201 ms** | **5741 ms** | **1149 ms** | 46 MB |
| droid | 294 MB | 81 ms | **112 ms** | **3156 ms** | **724 ms** | 277 MB |
| kimi code | 192 MB | 466 ms | **602 ms** | **984 ms** | **4 ms** | 357 MB |
| devin | 200 MB | 3 ms | **18 ms** | **1024 ms** | **1641 ms** | 92 MB |
| cline | 140 MB | 809 ms | **996 ms** | — | — | 55 MB |
| continue | 140 MB | 906 ms | — | — | — | 319 MB |
| iflow cli | 140 MB | 972 ms | **1040 ms** | **1796 ms** | **47 ms** | 58 MB |

<details><summary>full precision · all collected fields</summary>

| agent | version | bin | bundle (MB) | bundle kind | `--version` (ms) | TUI 1st byte (ms) | TUI 1st input (ms) | input latency 1s (ms) | idle PSS (MB) |
|---|---|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.5.0-beta.1 | `/home/runner/work/fox-agent/fox-agent/bin/fox` | 99.0 | bin | 11.5 | 12.9 | 374.9 | 0.6 | 35.1 |
| claude code | 2.1.302 (Claude Code) | `/home/runner/.npm-global/bin/claude` | 285.8 | bin | 6.3 | 178.7 | — | — | 190.1 |
| codex | codex-cli 0.163.0 | `/home/runner/.npm-global/bin/codex` | 140.0 | bin | 35.0 | 39.6 | 800.7 | 0.6 | 49.0 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | `/home/runner/.npm-global/bin/opencode2` | 207.4 | bin | 67.6 | 117.6 | 479.4 | 54.5 | 127.3 |
| jcode | jcode v0.98.1 (1c7426eb1) | `/home/runner/.local/bin/jcode` | 166.8 | bin | 6.5 | 8.3 | 606.9 | 0.3 | 29.7 |
| pi | 1.3.0 | `/home/runner/.npm-global/bin/pi` | 140.0 | bin | 192.8 | 257.5 | 757.6 | 6.9 | 131.7 |
| gemini cli | 0.64.0 | `/home/runner/.npm-global/bin/gemini` | 140.0 | bin | 1188.2 | 1270.7 | 1289.3 | 0.1 | — |
| copilot cli | GitHub Copilot CLI 1.0.98. | `/home/runner/.npm-global/bin/copilot` | 140.0 | bin | 82.4 | 627.5 | — | — | 47.3 |
| crush | crush version v0.98.1 | `/home/runner/.npm-global/bin/crush` | 140.0 | bin | 135.6 | 418.7 | 844.0 | 55.4 | 68.5 |
| goose | 1.55.0 | `/home/runner/.local/bin/goose` | 304.0 | bin | 5.6 | 5.7 | 366.4 | 0.2 | 108.5 |
| aider | aider 0.86.2 | `/home/runner/work/fox-agent/fox-agent/.venv-bench/bin/aider` | 140.0 | bin | 608.8 | 544.4 | 922.7 | 7.8 | 66.9 |
| amp | 0.0.1792224035-gabd4f6 (released 2026-10-17T08:00:35.000Z, 1 | `/home/runner/.local/bin/amp` | 134.9 | bin | 205.5 | 222.1 | 598.7 | 0.7 | 164.9 |
| cursor-agent | 2026.10.16-e3cb207 | `/home/runner/.local/bin/cursor-agent` | 140.0 | bin | 353.1 | 341.4 | — | — | 235.2 |
| qwen code | 0.25.2 | `/home/runner/.npm-global/bin/qwen` | 140.0 | bin | 30.8 | 649.0 | 1085.5 | — | 290.1 |
| codebuff | 1.0.688 | `/home/runner/.npm-global/bin/codebuff` | 140.0 | bin | 787.7 | 773.5 | 1269.5 | 106.9 | 57.8 |
| kilo code | 7.8.12 | `/home/runner/.npm-global/bin/kilocode` | 140.0 | bin | 747.9 | 2201.0 | 5741.4 | 1148.5 | 46.1 |
| droid | 0.244.0 | `/home/runner/.local/bin/droid` | 294.4 | bin | 81.0 | 111.9 | 3156.2 | 724.3 | 277.0 |
| kimi code | 2.2.0 | `/home/runner/.kimi-code/bin/kimi` | 191.9 | bin | 466.4 | 601.6 | 983.6 | 3.7 | 356.6 |
| devin | devin 3000.11.92 (7f4e64980e22) | `/home/runner/.local/bin/devin` | 200.4 | bin | 3.4 | 18.2 | 1023.6 | 1641.1 | 92.3 |
| cline | 3.0.73 | `/home/runner/.npm-global/bin/cline` | 140.0 | bin | 809.2 | 996.1 | — | — | 55.0 |
| continue | 1.5.47 | `/home/runner/.npm-global/bin/cn` | 140.0 | bin | 905.7 | — | — | — | 318.6 |
| iflow cli | 0.5.19 | `/home/runner/.npm-global/bin/iflow` | 140.0 | bin | 971.5 | 1040.4 | 1795.7 | 46.7 | 58.0 |

</details>

fox-agent headless vs scripted local provider: time to first token **50 ms**, peak RSS **59 MB**.

_Generated 2026-10-17T09:24:05Z on Linux x86_64 (6.17.0-1022-azure). [How this is measured](#benchmarks) · [raw JSON](bench/results.json)_
