![harness bench dashboard](bench/bench.svg)

| agent | bundle | `--version` | TUI 1st byte | TUI 1st input | input latency 1s | idle PSS |
|---|---|---|---|---|---|---|
| **fox-agent** | 120 MB | 15 ms | **16 ms** | **377 ms** | **1 ms** | 37 MB |
| claude code | 257 MB | 9 ms | **204 ms** | — | — | 188 MB |
| codex | 140 MB | 41 ms | **42 ms** | **789 ms** | **1 ms** | 49 MB |
| opencode v2 | 207 MB | 81 ms | **134 ms** | **496 ms** | **58 ms** | 129 MB |
| jcode | 138 MB | 9 ms | **11 ms** | **709 ms** | **0 ms** | 27 MB |
| pi | 140 MB | 239 ms | **316 ms** | **844 ms** | **8 ms** | 131 MB |
| gemini cli | 140 MB | 1501 ms | **1593 ms** | **1607 ms** | — | 146 MB |
| copilot cli | 140 MB | 101 ms | **750 ms** | — | — | 47 MB |
| crush | 140 MB | 127 ms | **511 ms** | **941 ms** | **73 ms** | 69 MB |
| goose | 308 MB | 7 ms | **7 ms** | **367 ms** | **0 ms** | 105 MB |
| aider | 140 MB | 790 ms | **731 ms** | **1118 ms** | **10 ms** | 67 MB |
| amp | 134 MB | 245 ms | **254 ms** | **614 ms** | **1 ms** | 161 MB |
| cursor-agent | 140 MB | 455 ms | **434 ms** | — | — | 216 MB |
| qwen code | 140 MB | 37 ms | **818 ms** | **1292 ms** | — | 243 MB |
| codebuff | 140 MB | 895 ms | **889 ms** | **1400 ms** | **111 ms** | 58 MB |
| kilo code | 140 MB | 827 ms | **2459 ms** | **6579 ms** | **1579 ms** | 46 MB |
| droid | 292 MB | 118 ms | **131 ms** | **3177 ms** | **717 ms** | 220 MB |
| kimi code | 191 MB | 591 ms | **750 ms** | **1135 ms** | **4 ms** | 349 MB |
| devin | 195 MB | 4 ms | **48 ms** | **1049 ms** | **641 ms** | 46 MB |
| cline | 140 MB | 860 ms | **1102 ms** | — | — | 55 MB |
| continue | 140 MB | 1120 ms | — | — | — | 317 MB |
| iflow cli | 140 MB | 1223 ms | **1323 ms** | **2083 ms** | **46 ms** | 56 MB |

<details><summary>full precision · all collected fields</summary>

| agent | version | bin | bundle (MB) | bundle kind | `--version` (ms) | TUI 1st byte (ms) | TUI 1st input (ms) | input latency 1s (ms) | idle PSS (MB) |
|---|---|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.5.0-beta.1 | `/home/runner/work/fox-agent/fox-agent/bin/fox` | 120.4 | bin | 14.7 | 16.1 | 377.2 | 0.6 | 36.6 |
| claude code | 2.1.296 (Claude Code) | `/home/runner/.npm-global/bin/claude` | 257.1 | bin | 9.2 | 204.0 | — | — | 187.5 |
| codex | codex-cli 0.162.1 | `/home/runner/.npm-global/bin/codex` | 140.0 | bin | 41.1 | 41.9 | 789.2 | 0.5 | 49.1 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | `/home/runner/.npm-global/bin/opencode2` | 207.4 | bin | 80.7 | 133.6 | 495.6 | 58.4 | 129.5 |
| jcode | jcode v0.95.0 (6487bbd7e) | `/home/runner/.local/bin/jcode` | 138.2 | bin | 9.2 | 11.5 | 708.6 | 0.4 | 27.4 |
| pi | 1.2.0 | `/home/runner/.npm-global/bin/pi` | 140.0 | bin | 238.9 | 315.7 | 844.3 | 8.2 | 131.3 |
| gemini cli | 0.63.0 | `/home/runner/.npm-global/bin/gemini` | 140.0 | bin | 1501.4 | 1592.6 | 1606.7 | — | 145.7 |
| copilot cli | GitHub Copilot CLI 1.0.96. | `/home/runner/.npm-global/bin/copilot` | 140.0 | bin | 100.5 | 749.8 | — | — | 47.4 |
| crush | crush version v0.98.1 | `/home/runner/.npm-global/bin/crush` | 140.0 | bin | 126.7 | 510.7 | 940.8 | 72.9 | 68.7 |
| goose | 1.54.0 | `/home/runner/.local/bin/goose` | 307.8 | bin | 7.1 | 6.9 | 367.4 | 0.2 | 104.6 |
| aider | aider 0.86.2 | `/home/runner/work/fox-agent/fox-agent/.venv-bench/bin/aider` | 140.0 | bin | 789.5 | 730.5 | 1118.3 | 10.2 | 66.9 |
| amp | 0.0.1791878731-g2f7fd0 (released 2026-10-13T08:05:31.000Z, 2 | `/home/runner/.local/bin/amp` | 134.4 | bin | 244.8 | 254.0 | 613.8 | 0.5 | 160.7 |
| cursor-agent | 2026.10.01-e373342 | `/home/runner/.local/bin/cursor-agent` | 140.0 | bin | 455.3 | 433.6 | — | — | 216.1 |
| qwen code | 0.25.1 | `/home/runner/.npm-global/bin/qwen` | 140.0 | bin | 37.1 | 817.8 | 1292.2 | — | 242.8 |
| codebuff | 1.0.688 | `/home/runner/.npm-global/bin/codebuff` | 140.0 | bin | 895.1 | 888.6 | 1399.8 | 110.8 | 57.5 |
| kilo code | 7.8.8 | `/home/runner/.npm-global/bin/kilocode` | 140.0 | bin | 827.4 | 2459.4 | 6578.8 | 1579.4 | 46.2 |
| droid | 0.240.0 | `/home/runner/.local/bin/droid` | 291.7 | bin | 117.6 | 130.7 | 3177.1 | 716.9 | 220.0 |
| kimi code | 2.1.1 | `/home/runner/.kimi-code/bin/kimi` | 190.8 | bin | 590.6 | 750.1 | 1134.8 | 4.4 | 349.4 |
| devin | devin 3000.11.3 (9c803229faa4) | `/home/runner/.local/bin/devin` | 195.0 | bin | 3.8 | 47.8 | 1049.4 | 641.0 | 46.4 |
| cline | 3.0.70 | `/home/runner/.npm-global/bin/cline` | 140.0 | bin | 859.8 | 1101.6 | — | — | 55.1 |
| continue | 1.5.47 | `/home/runner/.npm-global/bin/cn` | 140.0 | bin | 1120.4 | — | — | — | 317.2 |
| iflow cli | 0.5.19 | `/home/runner/.npm-global/bin/iflow` | 140.0 | bin | 1222.6 | 1323.2 | 2082.7 | 46.3 | 55.7 |

</details>

fox-agent headless vs scripted local provider: time to first token **64 ms**, peak RSS **61 MB**.

_Generated 2026-10-13T08:38:24Z on Linux x86_64 (6.17.0-1022-azure). [How this is measured](#benchmarks) · [raw JSON](bench/results.json)_
