![harness bench dashboard](bench/bench.svg)

| agent | bundle | `--version` | TUI 1st byte | TUI 1st input | input latency 1s | idle PSS |
|---|---|---|---|---|---|---|
| **fox-agent** | 120 MB | 16 ms | **18 ms** | **378 ms** | **1 ms** | 37 MB |
| claude code | 257 MB | 10 ms | **222 ms** | — | — | 188 MB |
| codex | 140 MB | 42 ms | **44 ms** | **761 ms** | **1 ms** | 49 MB |
| opencode v2 | 207 MB | 85 ms | **138 ms** | **505 ms** | **62 ms** | 129 MB |
| jcode | 138 MB | 10 ms | **12 ms** | **715 ms** | **0 ms** | 27 MB |
| pi | 140 MB | 252 ms | **330 ms** | **864 ms** | **9 ms** | 131 MB |
| gemini cli | 140 MB | 1562 ms | **1662 ms** | **1674 ms** | **0 ms** | 146 MB |
| copilot cli | 140 MB | 106 ms | **794 ms** | — | — | 47 MB |
| crush | 140 MB | 133 ms | **271 ms** | **698 ms** | **73 ms** | 69 MB |
| goose | 308 MB | 7 ms | **7 ms** | **369 ms** | **0 ms** | 104 MB |
| aider | 140 MB | 843 ms | **763 ms** | **1142 ms** | **10 ms** | 67 MB |
| amp | 134 MB | 257 ms | **262 ms** | **619 ms** | **1 ms** | 161 MB |
| cursor-agent | 140 MB | 470 ms | **440 ms** | — | — | 218 MB |
| qwen code | 140 MB | 39 ms | **844 ms** | **1325 ms** | — | 239 MB |
| codebuff | 140 MB | 953 ms | **949 ms** | **1439 ms** | **110 ms** | 58 MB |
| kilo code | 140 MB | 873 ms | **2632 ms** | **6552 ms** | **1542 ms** | 46 MB |
| droid | 292 MB | 113 ms | **142 ms** | **3210 ms** | **743 ms** | 218 MB |
| kimi code | 191 MB | 610 ms | **765 ms** | **1167 ms** | **5 ms** | 350 MB |
| devin | 195 MB | 4 ms | **50 ms** | **1052 ms** | **641 ms** | 46 MB |
| cline | 140 MB | 865 ms | **1112 ms** | — | — | 55 MB |
| continue | 140 MB | 1173 ms | — | — | — | 317 MB |
| iflow cli | 140 MB | 1257 ms | **1340 ms** | **2529 ms** | **47 ms** | 56 MB |

<details><summary>full precision · all collected fields</summary>

| agent | version | bin | bundle (MB) | bundle kind | `--version` (ms) | TUI 1st byte (ms) | TUI 1st input (ms) | input latency 1s (ms) | idle PSS (MB) |
|---|---|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.5.0-beta.1 | `/home/runner/work/fox-agent/fox-agent/bin/fox` | 120.4 | bin | 15.6 | 18.1 | 378.5 | 0.6 | 36.6 |
| claude code | 2.1.296 (Claude Code) | `/home/runner/.npm-global/bin/claude` | 257.1 | bin | 10.0 | 221.8 | — | — | 187.5 |
| codex | codex-cli 0.162.1 | `/home/runner/.npm-global/bin/codex` | 140.0 | bin | 41.6 | 44.4 | 760.5 | 0.6 | 49.1 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | `/home/runner/.npm-global/bin/opencode2` | 207.4 | bin | 85.2 | 137.8 | 504.6 | 62.0 | 129.1 |
| jcode | jcode v0.95.0 (6487bbd7e) | `/home/runner/.local/bin/jcode` | 138.2 | bin | 9.8 | 12.2 | 715.4 | 0.5 | 27.3 |
| pi | 1.2.0 | `/home/runner/.npm-global/bin/pi` | 140.0 | bin | 252.0 | 329.7 | 864.1 | 8.7 | 131.0 |
| gemini cli | 0.63.0 | `/home/runner/.npm-global/bin/gemini` | 140.0 | bin | 1561.9 | 1662.3 | 1674.3 | 0.1 | 146.1 |
| copilot cli | GitHub Copilot CLI 1.0.96. | `/home/runner/.npm-global/bin/copilot` | 140.0 | bin | 106.0 | 794.1 | — | — | 47.4 |
| crush | crush version v0.98.1 | `/home/runner/.npm-global/bin/crush` | 140.0 | bin | 132.5 | 271.5 | 698.3 | 73.0 | 68.7 |
| goose | 1.54.0 | `/home/runner/.local/bin/goose` | 307.8 | bin | 7.4 | 7.5 | 368.5 | 0.3 | 104.5 |
| aider | aider 0.86.2 | `/home/runner/work/fox-agent/fox-agent/.venv-bench/bin/aider` | 140.0 | bin | 842.8 | 762.9 | 1142.1 | 10.5 | 66.8 |
| amp | 0.0.1791864325-g52e626 (released 2026-10-13T04:05:25.000Z, 1 | `/home/runner/.local/bin/amp` | 134.4 | bin | 257.1 | 262.1 | 619.5 | 0.5 | 160.8 |
| cursor-agent | 2026.10.01-e373342 | `/home/runner/.local/bin/cursor-agent` | 140.0 | bin | 470.1 | 440.1 | — | — | 217.8 |
| qwen code | 0.25.1 | `/home/runner/.npm-global/bin/qwen` | 140.0 | bin | 38.7 | 843.8 | 1324.5 | — | 239.4 |
| codebuff | 1.0.688 | `/home/runner/.npm-global/bin/codebuff` | 140.0 | bin | 953.2 | 948.5 | 1439.4 | 110.2 | 57.6 |
| kilo code | 7.8.8 | `/home/runner/.npm-global/bin/kilocode` | 140.0 | bin | 873.1 | 2632.4 | 6552.2 | 1541.8 | 46.2 |
| droid | 0.240.0 | `/home/runner/.local/bin/droid` | 291.7 | bin | 112.7 | 142.0 | 3210.2 | 742.8 | 218.4 |
| kimi code | 2.1.1 | `/home/runner/.kimi-code/bin/kimi` | 190.8 | bin | 610.0 | 765.4 | 1167.4 | 5.0 | 350.1 |
| devin | devin 3000.11.3 (9c803229faa4) | `/home/runner/.local/bin/devin` | 195.0 | bin | 4.3 | 49.7 | 1052.1 | 641.0 | 46.4 |
| cline | 3.0.70 | `/home/runner/.npm-global/bin/cline` | 140.0 | bin | 864.7 | 1112.2 | — | — | 55.0 |
| continue | 1.5.47 | `/home/runner/.npm-global/bin/cn` | 140.0 | bin | 1173.0 | — | — | — | 316.6 |
| iflow cli | 0.5.19 | `/home/runner/.npm-global/bin/iflow` | 140.0 | bin | 1256.5 | 1339.9 | 2529.3 | 46.6 | 55.5 |

</details>

fox-agent headless vs scripted local provider: time to first token **60 ms**, peak RSS **61 MB**.

_Generated 2026-10-13T05:58:51Z on Linux x86_64 (6.17.0-1022-azure). [How this is measured](#benchmarks) · [raw JSON](bench/results.json)_
