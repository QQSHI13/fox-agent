![harness bench dashboard](bench/bench.svg)

| agent | bundle | `--version` | TUI 1st byte | TUI 1st input | input latency 1s | idle PSS |
|---|---|---|---|---|---|---|
| **fox-agent** | 120 MB | 16 ms | **18 ms** | **378 ms** | **1 ms** | 37 MB |
| claude code | 257 MB | 11 ms | **211 ms** | — | — | 187 MB |
| codex | 140 MB | 44 ms | **45 ms** | **819 ms** | **2 ms** | 49 MB |
| opencode v2 | 207 MB | 82 ms | **132 ms** | **508 ms** | **66 ms** | 128 MB |
| jcode | 138 MB | 10 ms | **12 ms** | **705 ms** | **0 ms** | 27 MB |
| pi | 140 MB | 232 ms | **308 ms** | **830 ms** | **8 ms** | 129 MB |
| gemini cli | 140 MB | 1496 ms | **1559 ms** | **1573 ms** | **0 ms** | 146 MB |
| copilot cli | 140 MB | 107 ms | **778 ms** | — | — | 47 MB |
| crush | 140 MB | 148 ms | **413 ms** | **872 ms** | **73 ms** | 69 MB |
| goose | 308 MB | 9 ms | **9 ms** | **369 ms** | **0 ms** | 103 MB |
| aider | 140 MB | 804 ms | **724 ms** | **1109 ms** | **10 ms** | 67 MB |
| amp | 134 MB | 242 ms | **250 ms** | **619 ms** | **1 ms** | 159 MB |
| cursor-agent | 140 MB | 451 ms | **424 ms** | — | — | 212 MB |
| qwen code | 140 MB | 40 ms | **803 ms** | **1275 ms** | — | 246 MB |
| codebuff | 140 MB | 935 ms | **923 ms** | **1411 ms** | **111 ms** | 58 MB |
| kilo code | 140 MB | 874 ms | **2494 ms** | **6304 ms** | **1366 ms** | 46 MB |
| droid | 281 MB | 97 ms | **113 ms** | **3203 ms** | **751 ms** | 259 MB |
| kimi code | 191 MB | 566 ms | **712 ms** | **1123 ms** | **4 ms** | 349 MB |
| devin | 195 MB | 4 ms | **50 ms** | **1053 ms** | **641 ms** | 48 MB |
| cline | 140 MB | 926 ms | **1119 ms** | — | — | 55 MB |
| continue | 140 MB | 1145 ms | — | — | — | 316 MB |
| iflow cli | 140 MB | 1219 ms | **1286 ms** | **2509 ms** | **47 ms** | 56 MB |

<details><summary>full precision · all collected fields</summary>

| agent | version | bin | bundle (MB) | bundle kind | `--version` (ms) | TUI 1st byte (ms) | TUI 1st input (ms) | input latency 1s (ms) | idle PSS (MB) |
|---|---|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.5.0-beta.1 | `/home/runner/work/fox-agent/fox-agent/bin/fox` | 120.4 | bin | 16.2 | 18.0 | 378.3 | 0.6 | 36.6 |
| claude code | 2.1.296 (Claude Code) | `/home/runner/.npm-global/bin/claude` | 257.1 | bin | 10.8 | 210.8 | — | — | 187.2 |
| codex | codex-cli 0.162.1 | `/home/runner/.npm-global/bin/codex` | 140.0 | bin | 44.2 | 44.6 | 819.2 | 1.6 | 49.1 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | `/home/runner/.npm-global/bin/opencode2` | 207.4 | bin | 82.4 | 132.0 | 507.6 | 66.2 | 127.6 |
| jcode | jcode v0.95.0 (6487bbd7e) | `/home/runner/.local/bin/jcode` | 138.2 | bin | 10.0 | 12.5 | 705.4 | 0.4 | 27.4 |
| pi | 1.1.0 | `/home/runner/.npm-global/bin/pi` | 140.0 | bin | 231.6 | 307.8 | 830.3 | 7.7 | 129.2 |
| gemini cli | 0.63.0 | `/home/runner/.npm-global/bin/gemini` | 140.0 | bin | 1495.7 | 1559.3 | 1572.5 | 0.1 | 146.1 |
| copilot cli | GitHub Copilot CLI 1.0.95. | `/home/runner/.npm-global/bin/copilot` | 140.0 | bin | 106.7 | 777.7 | — | — | 47.4 |
| crush | crush version v0.98.1 | `/home/runner/.npm-global/bin/crush` | 140.0 | bin | 148.4 | 412.6 | 872.0 | 72.7 | 68.5 |
| goose | 1.54.0 | `/home/runner/.local/bin/goose` | 307.8 | bin | 8.7 | 8.7 | 369.1 | 0.2 | 102.5 |
| aider | aider 0.86.2 | `/home/runner/work/fox-agent/fox-agent/.venv-bench/bin/aider` | 140.0 | bin | 803.7 | 723.7 | 1109.2 | 9.8 | 66.9 |
| amp | 0.0.1791806555-g425e34 (released 2026-10-12T12:02:35.000Z, 1 | `/home/runner/.local/bin/amp` | 134.2 | bin | 242.5 | 249.6 | 618.8 | 0.5 | 159.3 |
| cursor-agent | 2026.10.01-e373342 | `/home/runner/.local/bin/cursor-agent` | 140.0 | bin | 450.9 | 423.6 | — | — | 211.8 |
| qwen code | 0.25.1 | `/home/runner/.npm-global/bin/qwen` | 140.0 | bin | 39.6 | 803.2 | 1275.2 | — | 245.7 |
| codebuff | 1.0.688 | `/home/runner/.npm-global/bin/codebuff` | 140.0 | bin | 935.4 | 922.6 | 1411.1 | 111.1 | 57.7 |
| kilo code | 7.8.8 | `/home/runner/.npm-global/bin/kilocode` | 140.0 | bin | 874.2 | 2494.0 | 6304.2 | 1366.4 | 46.2 |
| droid | 0.238.0 | `/home/runner/.local/bin/droid` | 281.4 | bin | 97.3 | 112.7 | 3202.9 | 750.8 | 259.0 |
| kimi code | 2.1.1 | `/home/runner/.kimi-code/bin/kimi` | 190.8 | bin | 565.6 | 711.6 | 1123.2 | 4.3 | 348.6 |
| devin | devin 3000.11.3 (9c803229faa4) | `/home/runner/.local/bin/devin` | 195.0 | bin | 4.1 | 50.2 | 1052.8 | 641.0 | 48.4 |
| cline | 3.0.70 | `/home/runner/.npm-global/bin/cline` | 140.0 | bin | 926.3 | 1119.0 | — | — | 55.1 |
| continue | 1.5.47 | `/home/runner/.npm-global/bin/cn` | 140.0 | bin | 1145.2 | — | — | — | 316.4 |
| iflow cli | 0.5.19 | `/home/runner/.npm-global/bin/iflow` | 140.0 | bin | 1219.1 | 1285.8 | 2508.5 | 46.8 | 55.5 |

</details>

fox-agent headless vs scripted local provider: time to first token **63 ms**, peak RSS **61 MB**.

_Generated 2026-10-12T13:48:08Z on Linux x86_64 (6.17.0-1022-azure). [How this is measured](#benchmarks) · [raw JSON](bench/results.json)_
