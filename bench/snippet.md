![harness bench dashboard](bench/bench.svg)

| agent | bundle | `--version` | TUI 1st byte | TUI 1st input | input latency 1s | idle PSS |
|---|---|---|---|---|---|---|
| **fox-agent** | 120 MB | 16 ms | **17 ms** | **380 ms** | **1 ms** | 37 MB |
| claude code | 257 MB | 10 ms | **209 ms** | — | — | 188 MB |
| codex | 140 MB | 43 ms | **45 ms** | **780 ms** | **2 ms** | 49 MB |
| opencode v2 | 207 MB | 80 ms | **134 ms** | **500 ms** | **62 ms** | 129 MB |
| jcode | 138 MB | 9 ms | **12 ms** | **709 ms** | **0 ms** | 28 MB |
| pi | 140 MB | 252 ms | **332 ms** | **860 ms** | **9 ms** | 130 MB |
| gemini cli | 140 MB | 1570 ms | **1648 ms** | **1693 ms** | — | 143 MB |
| copilot cli | 140 MB | 105 ms | **790 ms** | — | — | 47 MB |
| crush | 140 MB | 135 ms | **557 ms** | **950 ms** | **72 ms** | 69 MB |
| goose | 308 MB | 8 ms | **8 ms** | **369 ms** | **0 ms** | 104 MB |
| aider | 140 MB | 832 ms | **771 ms** | **1147 ms** | **10 ms** | 67 MB |
| amp | 134 MB | 259 ms | **263 ms** | **638 ms** | **1 ms** | 163 MB |
| cursor-agent | 140 MB | 462 ms | **438 ms** | — | — | 219 MB |
| qwen code | 140 MB | 39 ms | **853 ms** | **1315 ms** | — | 237 MB |
| codebuff | 140 MB | 942 ms | **915 ms** | **1423 ms** | **111 ms** | 58 MB |
| kilo code | 140 MB | 854 ms | **2597 ms** | **6617 ms** | **1564 ms** | 46 MB |
| droid | 292 MB | 113 ms | **128 ms** | **3203 ms** | **735 ms** | 219 MB |
| kimi code | 191 MB | 578 ms | **741 ms** | **1137 ms** | **5 ms** | 352 MB |
| devin | 195 MB | 4 ms | **49 ms** | **1052 ms** | **641 ms** | 48 MB |
| cline | 140 MB | 873 ms | **1132 ms** | — | — | 55 MB |
| continue | 140 MB | 1147 ms | — | — | — | 317 MB |
| iflow cli | 140 MB | 1237 ms | **1310 ms** | **2516 ms** | **46 ms** | 56 MB |

<details><summary>full precision · all collected fields</summary>

| agent | version | bin | bundle (MB) | bundle kind | `--version` (ms) | TUI 1st byte (ms) | TUI 1st input (ms) | input latency 1s (ms) | idle PSS (MB) |
|---|---|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.5.0-beta.1 | `/home/runner/work/fox-agent/fox-agent/bin/fox` | 120.4 | bin | 16.5 | 16.8 | 380.2 | 0.6 | 36.7 |
| claude code | 2.1.296 (Claude Code) | `/home/runner/.npm-global/bin/claude` | 257.1 | bin | 9.8 | 209.2 | — | — | 187.6 |
| codex | codex-cli 0.162.1 | `/home/runner/.npm-global/bin/codex` | 140.0 | bin | 42.9 | 44.6 | 779.8 | 1.7 | 49.0 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | `/home/runner/.npm-global/bin/opencode2` | 207.4 | bin | 80.1 | 133.9 | 500.4 | 61.9 | 129.0 |
| jcode | jcode v0.95.0 (6487bbd7e) | `/home/runner/.local/bin/jcode` | 138.2 | bin | 9.2 | 12.1 | 708.8 | 0.5 | 28.0 |
| pi | 1.2.0 | `/home/runner/.npm-global/bin/pi` | 140.0 | bin | 252.4 | 332.5 | 860.4 | 8.6 | 129.7 |
| gemini cli | 0.63.0 | `/home/runner/.npm-global/bin/gemini` | 140.0 | bin | 1570.2 | 1648.5 | 1693.0 | — | 143.3 |
| copilot cli | GitHub Copilot CLI 1.0.96. | `/home/runner/.npm-global/bin/copilot` | 140.0 | bin | 105.3 | 790.4 | — | — | 47.4 |
| crush | crush version v0.98.1 | `/home/runner/.npm-global/bin/crush` | 140.0 | bin | 135.4 | 557.3 | 949.9 | 72.5 | 68.7 |
| goose | 1.54.0 | `/home/runner/.local/bin/goose` | 307.8 | bin | 7.9 | 8.0 | 368.8 | 0.3 | 104.3 |
| aider | aider 0.86.2 | `/home/runner/work/fox-agent/fox-agent/.venv-bench/bin/aider` | 140.0 | bin | 831.9 | 771.0 | 1147.1 | 10.4 | 66.9 |
| amp | 0.0.1791864325-g52e626 (released 2026-10-13T04:05:25.000Z, 3 | `/home/runner/.local/bin/amp` | 134.4 | bin | 259.0 | 262.6 | 637.6 | 0.5 | 163.5 |
| cursor-agent | 2026.10.01-e373342 | `/home/runner/.local/bin/cursor-agent` | 140.0 | bin | 462.4 | 437.8 | — | — | 219.3 |
| qwen code | 0.25.1 | `/home/runner/.npm-global/bin/qwen` | 140.0 | bin | 39.3 | 853.0 | 1315.3 | — | 237.2 |
| codebuff | 1.0.688 | `/home/runner/.npm-global/bin/codebuff` | 140.0 | bin | 942.2 | 915.2 | 1422.7 | 111.0 | 57.6 |
| kilo code | 7.8.8 | `/home/runner/.npm-global/bin/kilocode` | 140.0 | bin | 854.5 | 2596.8 | 6616.7 | 1564.0 | 46.2 |
| droid | 0.240.0 | `/home/runner/.local/bin/droid` | 291.7 | bin | 113.3 | 127.6 | 3202.9 | 735.1 | 219.3 |
| kimi code | 2.1.1 | `/home/runner/.kimi-code/bin/kimi` | 190.8 | bin | 577.6 | 741.2 | 1136.5 | 4.8 | 352.1 |
| devin | devin 3000.11.3 (9c803229faa4) | `/home/runner/.local/bin/devin` | 195.0 | bin | 3.8 | 49.2 | 1052.5 | 641.0 | 48.4 |
| cline | 3.0.70 | `/home/runner/.npm-global/bin/cline` | 140.0 | bin | 872.7 | 1132.0 | — | — | 55.0 |
| continue | 1.5.47 | `/home/runner/.npm-global/bin/cn` | 140.0 | bin | 1146.6 | — | — | — | 316.9 |
| iflow cli | 0.5.19 | `/home/runner/.npm-global/bin/iflow` | 140.0 | bin | 1237.4 | 1309.6 | 2515.6 | 46.0 | 55.6 |

</details>

fox-agent headless vs scripted local provider: time to first token **61 ms**, peak RSS **61 MB**.

_Generated 2026-10-13T07:56:32Z on Linux x86_64 (6.17.0-1022-azure). [How this is measured](#benchmarks) · [raw JSON](bench/results.json)_
