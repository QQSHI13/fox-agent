![harness bench dashboard](bench/bench.svg)

| agent | bundle | `--version` | TUI 1st byte | TUI 1st input | input latency 1s | idle PSS |
|---|---|---|---|---|---|---|
| **fox-agent** | 120 MB | 17 ms | **20 ms** | **378 ms** | **1 ms** | 36 MB |
| claude code | 257 MB | 10 ms | **216 ms** | — | — | 187 MB |
| codex | 140 MB | 45 ms | **45 ms** | **801 ms** | **2 ms** | 49 MB |
| opencode v2 | 207 MB | 82 ms | **134 ms** | **507 ms** | **61 ms** | 129 MB |
| jcode | 138 MB | 10 ms | **12 ms** | **712 ms** | **0 ms** | 28 MB |
| pi | 140 MB | 252 ms | **333 ms** | **822 ms** | **8 ms** | 130 MB |
| gemini cli | 140 MB | 1555 ms | **1645 ms** | **1657 ms** | — | 146 MB |
| copilot cli | 140 MB | 107 ms | **785 ms** | — | — | 47 MB |
| crush | 140 MB | 127 ms | **512 ms** | **980 ms** | **73 ms** | 68 MB |
| goose | 308 MB | 8 ms | **7 ms** | **368 ms** | **0 ms** | 176 MB |
| aider | 140 MB | 822 ms | **737 ms** | **1127 ms** | **11 ms** | 67 MB |
| amp | 134 MB | 257 ms | **257 ms** | **616 ms** | **1 ms** | 161 MB |
| cursor-agent | 140 MB | 466 ms | **438 ms** | — | — | 213 MB |
| qwen code | 140 MB | 38 ms | **829 ms** | **1294 ms** | — | 245 MB |
| codebuff | 140 MB | 902 ms | **884 ms** | **1391 ms** | **111 ms** | 58 MB |
| kilo code | 140 MB | 830 ms | **2493 ms** | **6451 ms** | **1573 ms** | 46 MB |
| droid | 292 MB | 106 ms | **140 ms** | **3175 ms** | **720 ms** | 221 MB |
| kimi code | 191 MB | 570 ms | **720 ms** | **1102 ms** | **4 ms** | 349 MB |
| devin | 195 MB | 4 ms | **48 ms** | **1051 ms** | **640 ms** | 46 MB |
| cline | 140 MB | 869 ms | **1248 ms** | — | — | 55 MB |
| continue | 140 MB | 1119 ms | — | — | — | 318 MB |
| iflow cli | 140 MB | 1217 ms | **1315 ms** | **2482 ms** | **46 ms** | 56 MB |

<details><summary>full precision · all collected fields</summary>

| agent | version | bin | bundle (MB) | bundle kind | `--version` (ms) | TUI 1st byte (ms) | TUI 1st input (ms) | input latency 1s (ms) | idle PSS (MB) |
|---|---|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.5.0-beta.1 | `/home/runner/work/fox-agent/fox-agent/bin/fox` | 120.4 | bin | 16.5 | 19.7 | 377.9 | 0.7 | 36.4 |
| claude code | 2.1.296 (Claude Code) | `/home/runner/.npm-global/bin/claude` | 257.1 | bin | 10.2 | 216.0 | — | — | 187.4 |
| codex | codex-cli 0.162.1 | `/home/runner/.npm-global/bin/codex` | 140.0 | bin | 45.5 | 44.9 | 801.2 | 1.7 | 49.1 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | `/home/runner/.npm-global/bin/opencode2` | 207.4 | bin | 81.7 | 134.1 | 507.1 | 61.2 | 129.4 |
| jcode | jcode v0.95.0 (6487bbd7e) | `/home/runner/.local/bin/jcode` | 138.2 | bin | 9.7 | 12.4 | 712.0 | 0.4 | 27.6 |
| pi | 1.2.0 | `/home/runner/.npm-global/bin/pi` | 140.0 | bin | 251.9 | 332.6 | 822.1 | 8.5 | 129.7 |
| gemini cli | 0.63.0 | `/home/runner/.npm-global/bin/gemini` | 140.0 | bin | 1555.2 | 1644.6 | 1656.8 | — | 145.8 |
| copilot cli | GitHub Copilot CLI 1.0.96. | `/home/runner/.npm-global/bin/copilot` | 140.0 | bin | 107.2 | 784.6 | — | — | 47.4 |
| crush | crush version v0.98.1 | `/home/runner/.npm-global/bin/crush` | 140.0 | bin | 127.1 | 511.8 | 980.5 | 72.9 | 68.4 |
| goose | 1.54.0 | `/home/runner/.local/bin/goose` | 307.8 | bin | 7.5 | 7.4 | 368.3 | 0.3 | 175.8 |
| aider | aider 0.86.2 | `/home/runner/work/fox-agent/fox-agent/.venv-bench/bin/aider` | 140.0 | bin | 821.7 | 736.9 | 1127.2 | 10.7 | 66.8 |
| amp | 0.0.1791864325-g52e626 (released 2026-10-13T04:05:25.000Z, 3 | `/home/runner/.local/bin/amp` | 134.4 | bin | 257.4 | 256.7 | 616.1 | 0.6 | 161.2 |
| cursor-agent | 2026.10.01-e373342 | `/home/runner/.local/bin/cursor-agent` | 140.0 | bin | 466.4 | 437.7 | — | — | 213.3 |
| qwen code | 0.25.1 | `/home/runner/.npm-global/bin/qwen` | 140.0 | bin | 37.8 | 828.8 | 1294.0 | — | 245.3 |
| codebuff | 1.0.688 | `/home/runner/.npm-global/bin/codebuff` | 140.0 | bin | 902.2 | 883.5 | 1391.4 | 110.7 | 57.6 |
| kilo code | 7.8.8 | `/home/runner/.npm-global/bin/kilocode` | 140.0 | bin | 830.2 | 2492.8 | 6451.2 | 1572.8 | 46.2 |
| droid | 0.240.0 | `/home/runner/.local/bin/droid` | 291.7 | bin | 106.0 | 139.8 | 3174.7 | 719.7 | 221.3 |
| kimi code | 2.1.1 | `/home/runner/.kimi-code/bin/kimi` | 190.8 | bin | 570.3 | 719.7 | 1101.9 | 4.5 | 349.2 |
| devin | devin 3000.11.3 (9c803229faa4) | `/home/runner/.local/bin/devin` | 195.0 | bin | 3.8 | 48.4 | 1050.6 | 640.2 | 46.4 |
| cline | 3.0.70 | `/home/runner/.npm-global/bin/cline` | 140.0 | bin | 869.4 | 1247.6 | — | — | 55.1 |
| continue | 1.5.47 | `/home/runner/.npm-global/bin/cn` | 140.0 | bin | 1118.7 | — | — | — | 317.6 |
| iflow cli | 0.5.19 | `/home/runner/.npm-global/bin/iflow` | 140.0 | bin | 1217.3 | 1314.6 | 2482.4 | 45.8 | 55.6 |

</details>

fox-agent headless vs scripted local provider: time to first token **62 ms**, peak RSS **61 MB**.

_Generated 2026-10-13T07:54:59Z on Linux x86_64 (6.17.0-1022-azure). [How this is measured](#benchmarks) · [raw JSON](bench/results.json)_
