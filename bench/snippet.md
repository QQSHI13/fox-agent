![harness bench dashboard](bench/bench.svg)

| agent | bundle | `--version` | TUI 1st byte | TUI 1st input | input latency 1s | idle PSS |
|---|---|---|---|---|---|---|
| **fox-agent** | 120 MB | 16 ms | **16 ms** | **377 ms** | **1 ms** | 37 MB |
| claude code | 257 MB | 8 ms | **198 ms** | — | — | 187 MB |
| codex | 140 MB | 40 ms | **43 ms** | **814 ms** | **0 ms** | 49 MB |
| opencode v2 | 207 MB | 74 ms | **124 ms** | **489 ms** | **67 ms** | 128 MB |
| jcode | 138 MB | 8 ms | **10 ms** | **580 ms** | **0 ms** | 27 MB |
| pi | 140 MB | 221 ms | **299 ms** | **791 ms** | **9 ms** | 131 MB |
| gemini cli | 140 MB | 1408 ms | **1487 ms** | **1476 ms** | **0 ms** | 146 MB |
| copilot cli | 140 MB | 96 ms | **737 ms** | — | — | 47 MB |
| crush | 140 MB | 117 ms | **501 ms** | **1013 ms** | **70 ms** | 69 MB |
| goose | 308 MB | 6 ms | **6 ms** | **366 ms** | **0 ms** | 105 MB |
| aider | 140 MB | 718 ms | **645 ms** | **1025 ms** | **9 ms** | 67 MB |
| amp | 134 MB | 223 ms | **243 ms** | **603 ms** | **1 ms** | 159 MB |
| cursor-agent | 140 MB | 411 ms | **412 ms** | — | — | 213 MB |
| qwen code | 140 MB | 36 ms | **762 ms** | **1220 ms** | — | 256 MB |
| codebuff | 140 MB | 904 ms | **892 ms** | **1389 ms** | **110 ms** | 58 MB |
| kilo code | 140 MB | 869 ms | **2600 ms** | **6342 ms** | **1374 ms** | 46 MB |
| droid | 292 MB | 102 ms | **107 ms** | **3176 ms** | **725 ms** | 224 MB |
| kimi code | 191 MB | 563 ms | **695 ms** | **1098 ms** | **4 ms** | 350 MB |
| devin | 195 MB | 3 ms | **36 ms** | **1041 ms** | **641 ms** | 49 MB |
| cline | 140 MB | 850 ms | **1297 ms** | — | — | 55 MB |
| continue | 140 MB | 1055 ms | — | — | — | 317 MB |
| iflow cli | 140 MB | 1111 ms | **1180 ms** | **1970 ms** | **47 ms** | 56 MB |

<details><summary>full precision · all collected fields</summary>

| agent | version | bin | bundle (MB) | bundle kind | `--version` (ms) | TUI 1st byte (ms) | TUI 1st input (ms) | input latency 1s (ms) | idle PSS (MB) |
|---|---|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.5.0-beta.1 | `/home/runner/work/fox-agent/fox-agent/bin/fox` | 120.4 | bin | 16.4 | 16.0 | 377.5 | 0.5 | 36.6 |
| claude code | 2.1.296 (Claude Code) | `/home/runner/.npm-global/bin/claude` | 257.1 | bin | 8.0 | 197.6 | — | — | 187.4 |
| codex | codex-cli 0.162.1 | `/home/runner/.npm-global/bin/codex` | 140.0 | bin | 39.6 | 42.9 | 813.7 | 0.3 | 49.0 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | `/home/runner/.npm-global/bin/opencode2` | 207.4 | bin | 74.1 | 123.8 | 488.9 | 67.1 | 127.9 |
| jcode | jcode v0.95.0 (6487bbd7e) | `/home/runner/.local/bin/jcode` | 138.2 | bin | 7.9 | 10.1 | 579.6 | 0.3 | 27.5 |
| pi | 1.2.0 | `/home/runner/.npm-global/bin/pi` | 140.0 | bin | 221.0 | 299.0 | 791.0 | 9.0 | 131.2 |
| gemini cli | 0.63.0 | `/home/runner/.npm-global/bin/gemini` | 140.0 | bin | 1408.5 | 1486.6 | 1475.9 | 0.1 | 145.7 |
| copilot cli | GitHub Copilot CLI 1.0.96. | `/home/runner/.npm-global/bin/copilot` | 140.0 | bin | 96.3 | 737.4 | — | — | 47.3 |
| crush | crush version v0.98.1 | `/home/runner/.npm-global/bin/crush` | 140.0 | bin | 117.0 | 501.0 | 1012.6 | 70.4 | 69.0 |
| goose | 1.54.0 | `/home/runner/.local/bin/goose` | 307.8 | bin | 5.7 | 5.7 | 366.3 | 0.2 | 104.7 |
| aider | aider 0.86.2 | `/home/runner/work/fox-agent/fox-agent/.venv-bench/bin/aider` | 140.0 | bin | 718.3 | 644.6 | 1025.4 | 9.3 | 66.8 |
| amp | 0.0.1791864325-g52e626 (released 2026-10-13T04:05:25.000Z, 1 | `/home/runner/.local/bin/amp` | 134.4 | bin | 223.2 | 243.2 | 602.5 | 0.5 | 159.3 |
| cursor-agent | 2026.10.01-e373342 | `/home/runner/.local/bin/cursor-agent` | 140.0 | bin | 410.9 | 411.8 | — | — | 212.8 |
| qwen code | 0.25.1 | `/home/runner/.npm-global/bin/qwen` | 140.0 | bin | 36.1 | 762.0 | 1220.5 | — | 256.2 |
| codebuff | 1.0.688 | `/home/runner/.npm-global/bin/codebuff` | 140.0 | bin | 903.9 | 891.7 | 1388.6 | 109.6 | 57.7 |
| kilo code | 7.8.8 | `/home/runner/.npm-global/bin/kilocode` | 140.0 | bin | 868.8 | 2599.5 | 6341.8 | 1374.4 | 46.2 |
| droid | 0.240.0 | `/home/runner/.local/bin/droid` | 291.7 | bin | 101.9 | 106.9 | 3176.2 | 724.8 | 223.7 |
| kimi code | 2.1.1 | `/home/runner/.kimi-code/bin/kimi` | 190.8 | bin | 562.6 | 695.3 | 1097.6 | 4.2 | 350.4 |
| devin | devin 3000.11.3 (9c803229faa4) | `/home/runner/.local/bin/devin` | 195.0 | bin | 2.5 | 36.2 | 1040.8 | 641.1 | 48.6 |
| cline | 3.0.70 | `/home/runner/.npm-global/bin/cline` | 140.0 | bin | 850.3 | 1297.5 | — | — | 54.9 |
| continue | 1.5.47 | `/home/runner/.npm-global/bin/cn` | 140.0 | bin | 1054.6 | — | — | — | 316.7 |
| iflow cli | 0.5.19 | `/home/runner/.npm-global/bin/iflow` | 140.0 | bin | 1110.5 | 1180.5 | 1969.6 | 47.1 | 56.3 |

</details>

fox-agent headless vs scripted local provider: time to first token **61 ms**, peak RSS **61 MB**.

_Generated 2026-10-13T06:04:54Z on Linux x86_64 (6.17.0-1022-azure). [How this is measured](#benchmarks) · [raw JSON](bench/results.json)_
