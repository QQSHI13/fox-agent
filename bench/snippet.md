![harness bench dashboard](bench/bench.svg)

| agent | bundle | `--version` | TUI 1st byte | TUI 1st input | input latency 1s | idle PSS |
|---|---|---|---|---|---|---|
| **fox-agent** | 120 MB | 15 ms | **18 ms** | — | — | 37 MB |
| claude code | 257 MB | 10 ms | **211 ms** | — | — | 187 MB |
| codex | 140 MB | 42 ms | **43 ms** | — | — | 49 MB |
| opencode v2 | 207 MB | 83 ms | **136 ms** | **492 ms** | **58 ms** | 129 MB |
| jcode | 138 MB | 10 ms | **12 ms** | — | — | 28 MB |
| pi | 140 MB | 240 ms | **316 ms** | **854 ms** | **8 ms** | 129 MB |
| gemini cli | 140 MB | 1546 ms | **1645 ms** | **1682 ms** | — | 146 MB |
| copilot cli | 140 MB | 104 ms | **780 ms** | — | — | 47 MB |
| crush | 140 MB | 129 ms | **574 ms** | — | — | 68 MB |
| goose | 308 MB | 7 ms | **7 ms** | **204 ms** | — | — |
| aider | 140 MB | 832 ms | **753 ms** | **1142 ms** | **10 ms** | 67 MB |
| amp | 134 MB | 252 ms | **259 ms** | **615 ms** | **1 ms** | 160 MB |
| cursor-agent | 140 MB | 462 ms | **445 ms** | — | — | 217 MB |
| qwen code | 140 MB | 39 ms | **830 ms** | — | — | 238 MB |
| codebuff | 140 MB | 954 ms | **968 ms** | — | — | 58 MB |
| kilo code | 140 MB | 874 ms | **2623 ms** | — | — | 46 MB |
| droid | 281 MB | 92 ms | **115 ms** | — | — | 235 MB |
| kimi code | 191 MB | 616 ms | **829 ms** | — | — | 349 MB |
| devin | 195 MB | 4 ms | **50 ms** | — | — | 48 MB |
| cline | 140 MB | 895 ms | **1200 ms** | — | — | 55 MB |
| continue | 140 MB | 1100 ms | — | — | — | 316 MB |
| iflow cli | 140 MB | 1222 ms | **1284 ms** | **2128 ms** | **46 ms** | 56 MB |

<details><summary>full precision · all collected fields</summary>

| agent | version | bin | bundle (MB) | bundle kind | `--version` (ms) | TUI 1st byte (ms) | TUI 1st input (ms) | input latency 1s (ms) | idle PSS (MB) |
|---|---|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.5.0-beta.1 | `/home/runner/work/fox-agent/fox-agent/bin/fox` | 120.3 | bin | 15.5 | 18.3 | — | — | 36.6 |
| claude code | 2.1.296 (Claude Code) | `/home/runner/.npm-global/bin/claude` | 257.1 | bin | 9.7 | 211.4 | — | — | 187.0 |
| codex | codex-cli 0.162.1 | `/home/runner/.npm-global/bin/codex` | 140.0 | bin | 41.6 | 43.1 | — | — | 49.1 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | `/home/runner/.npm-global/bin/opencode2` | 207.4 | bin | 83.3 | 135.5 | 491.6 | 58.0 | 129.0 |
| jcode | jcode v0.95.0 (6487bbd7e) | `/home/runner/.local/bin/jcode` | 138.2 | bin | 9.7 | 12.1 | — | — | 27.9 |
| pi | 1.1.0 | `/home/runner/.npm-global/bin/pi` | 140.0 | bin | 239.6 | 315.7 | 854.3 | 8.1 | 128.8 |
| gemini cli | 0.63.0 | `/home/runner/.npm-global/bin/gemini` | 140.0 | bin | 1545.7 | 1645.0 | 1681.9 | — | 145.9 |
| copilot cli | GitHub Copilot CLI 1.0.95. | `/home/runner/.npm-global/bin/copilot` | 140.0 | bin | 103.7 | 780.3 | — | — | 47.4 |
| crush | crush version v0.98.1 | `/home/runner/.npm-global/bin/crush` | 140.0 | bin | 128.8 | 574.2 | — | — | 68.5 |
| goose | 1.54.0 | `/home/runner/.local/bin/goose` | 307.8 | bin | 7.0 | 7.2 | 203.9 | — | — |
| aider | aider 0.86.2 | `/home/runner/work/fox-agent/fox-agent/.venv-bench/bin/aider` | 140.0 | bin | 831.7 | 752.9 | 1142.1 | 10.2 | 66.9 |
| amp | 0.0.1791778148-g902162 (released 2026-10-12T04:09:08.000Z, 5 | `/home/runner/.local/bin/amp` | 134.2 | bin | 251.6 | 259.4 | 614.8 | 0.6 | 159.8 |
| cursor-agent | 2026.10.01-e373342 | `/home/runner/.local/bin/cursor-agent` | 140.0 | bin | 462.1 | 445.3 | — | — | 217.2 |
| qwen code | 0.25.1 | `/home/runner/.npm-global/bin/qwen` | 140.0 | bin | 38.6 | 829.8 | — | — | 237.8 |
| codebuff | 1.0.688 | `/home/runner/.npm-global/bin/codebuff` | 140.0 | bin | 954.0 | 967.7 | — | — | 57.5 |
| kilo code | 7.8.8 | `/home/runner/.npm-global/bin/kilocode` | 140.0 | bin | 873.9 | 2623.1 | — | — | 46.2 |
| droid | 0.238.0 | `/home/runner/.local/bin/droid` | 281.4 | bin | 92.5 | 114.9 | — | — | 235.4 |
| kimi code | 2.1.1 | `/home/runner/.kimi-code/bin/kimi` | 190.8 | bin | 615.9 | 829.2 | — | — | 349.4 |
| devin | devin 3000.11.3 (9c803229faa4) | `/home/runner/.local/bin/devin` | 195.0 | bin | 4.2 | 50.2 | — | — | 48.3 |
| cline | 3.0.70 | `/home/runner/.npm-global/bin/cline` | 140.0 | bin | 894.6 | 1199.7 | — | — | 55.0 |
| continue | 1.5.47 | `/home/runner/.npm-global/bin/cn` | 140.0 | bin | 1099.8 | — | — | — | 316.4 |
| iflow cli | 0.5.19 | `/home/runner/.npm-global/bin/iflow` | 140.0 | bin | 1222.0 | 1284.3 | 2128.5 | 46.5 | 55.7 |

</details>

fox-agent headless vs scripted local provider: time to first token **63 ms**, peak RSS **61 MB**.

_Generated 2026-10-12T05:18:50Z on Linux x86_64 (6.17.0-1022-azure). [How this is measured](#benchmarks) · [raw JSON](bench/results.json)_
