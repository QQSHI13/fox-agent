![harness bench dashboard](bench/bench.svg)

| agent | bundle | `--version` | TUI 1st byte | TUI 1st input | input latency 1s | idle PSS |
|---|---|---|---|---|---|---|
| **fox-agent** | 120 MB | 17 ms | **19 ms** | **379 ms** | **1 ms** | 37 MB |
| claude code | 257 MB | 10 ms | **213 ms** | — | — | 187 MB |
| codex | 140 MB | 43 ms | **44 ms** | **783 ms** | **0 ms** | 49 MB |
| opencode v2 | 207 MB | 79 ms | **131 ms** | **499 ms** | **63 ms** | 129 MB |
| jcode | 138 MB | 10 ms | **12 ms** | **710 ms** | **0 ms** | 28 MB |
| pi | 140 MB | 233 ms | **307 ms** | **815 ms** | **8 ms** | 128 MB |
| gemini cli | 140 MB | 1456 ms | **1528 ms** | **1550 ms** | — | 146 MB |
| copilot cli | 140 MB | 104 ms | **756 ms** | — | — | 47 MB |
| crush | 140 MB | 150 ms | **341 ms** | **784 ms** | **72 ms** | 68 MB |
| goose | 308 MB | 7 ms | **7 ms** | **368 ms** | **0 ms** | 104 MB |
| aider | 140 MB | 774 ms | **702 ms** | **1087 ms** | **10 ms** | 67 MB |
| amp | 134 MB | 248 ms | **247 ms** | **610 ms** | **1 ms** | 164 MB |
| cursor-agent | 140 MB | 447 ms | **424 ms** | — | — | 213 MB |
| qwen code | 140 MB | 39 ms | **809 ms** | **1274 ms** | — | 247 MB |
| codebuff | 140 MB | 921 ms | **889 ms** | **1424 ms** | **111 ms** | 58 MB |
| kilo code | 140 MB | 844 ms | **2445 ms** | **6213 ms** | **1392 ms** | 46 MB |
| droid | 292 MB | 103 ms | **115 ms** | **3178 ms** | **728 ms** | 226 MB |
| kimi code | 191 MB | 604 ms | **726 ms** | **1113 ms** | **4 ms** | 350 MB |
| devin | 195 MB | 4 ms | **49 ms** | **1052 ms** | **641 ms** | 48 MB |
| cline | 140 MB | 845 ms | **1075 ms** | — | — | 55 MB |
| continue | 140 MB | 1111 ms | — | — | — | 318 MB |
| iflow cli | 140 MB | 1194 ms | **1273 ms** | **2467 ms** | **45 ms** | 56 MB |

<details><summary>full precision · all collected fields</summary>

| agent | version | bin | bundle (MB) | bundle kind | `--version` (ms) | TUI 1st byte (ms) | TUI 1st input (ms) | input latency 1s (ms) | idle PSS (MB) |
|---|---|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.5.0-beta.1 | `/home/runner/work/fox-agent/fox-agent/bin/fox` | 120.4 | bin | 16.6 | 18.8 | 378.9 | 0.6 | 36.6 |
| claude code | 2.1.296 (Claude Code) | `/home/runner/.npm-global/bin/claude` | 257.1 | bin | 10.1 | 212.8 | — | — | 187.4 |
| codex | codex-cli 0.162.1 | `/home/runner/.npm-global/bin/codex` | 140.0 | bin | 42.9 | 43.6 | 782.5 | 0.3 | 49.1 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | `/home/runner/.npm-global/bin/opencode2` | 207.4 | bin | 78.9 | 130.7 | 499.3 | 62.9 | 128.7 |
| jcode | jcode v0.95.0 (6487bbd7e) | `/home/runner/.local/bin/jcode` | 138.2 | bin | 9.8 | 12.3 | 709.7 | 0.3 | 27.8 |
| pi | 1.2.0 | `/home/runner/.npm-global/bin/pi` | 140.0 | bin | 233.3 | 307.2 | 814.5 | 8.1 | 128.4 |
| gemini cli | 0.63.0 | `/home/runner/.npm-global/bin/gemini` | 140.0 | bin | 1455.8 | 1528.5 | 1550.1 | — | 146.0 |
| copilot cli | GitHub Copilot CLI 1.0.96. | `/home/runner/.npm-global/bin/copilot` | 140.0 | bin | 104.0 | 756.2 | — | — | 47.3 |
| crush | crush version v0.98.1 | `/home/runner/.npm-global/bin/crush` | 140.0 | bin | 150.1 | 341.3 | 784.2 | 72.1 | 68.3 |
| goose | 1.54.0 | `/home/runner/.local/bin/goose` | 307.8 | bin | 7.5 | 7.2 | 368.2 | 0.2 | 104.3 |
| aider | aider 0.86.2 | `/home/runner/work/fox-agent/fox-agent/.venv-bench/bin/aider` | 140.0 | bin | 773.7 | 701.5 | 1087.0 | 9.7 | 66.8 |
| amp | 0.0.1791864325-g52e626 (released 2026-10-13T04:05:25.000Z, 2 | `/home/runner/.local/bin/amp` | 134.4 | bin | 247.9 | 246.7 | 610.2 | 0.5 | 163.6 |
| cursor-agent | 2026.10.01-e373342 | `/home/runner/.local/bin/cursor-agent` | 140.0 | bin | 447.0 | 424.4 | — | — | 213.1 |
| qwen code | 0.25.1 | `/home/runner/.npm-global/bin/qwen` | 140.0 | bin | 39.2 | 809.5 | 1273.7 | — | 246.7 |
| codebuff | 1.0.688 | `/home/runner/.npm-global/bin/codebuff` | 140.0 | bin | 920.6 | 888.8 | 1423.6 | 111.0 | 57.6 |
| kilo code | 7.8.8 | `/home/runner/.npm-global/bin/kilocode` | 140.0 | bin | 844.0 | 2444.7 | 6212.7 | 1392.2 | 46.2 |
| droid | 0.240.0 | `/home/runner/.local/bin/droid` | 291.7 | bin | 102.9 | 114.6 | 3178.5 | 727.9 | 225.7 |
| kimi code | 2.1.1 | `/home/runner/.kimi-code/bin/kimi` | 190.8 | bin | 603.9 | 725.6 | 1112.7 | 4.3 | 350.4 |
| devin | devin 3000.11.3 (9c803229faa4) | `/home/runner/.local/bin/devin` | 195.0 | bin | 4.1 | 48.8 | 1051.6 | 641.0 | 48.3 |
| cline | 3.0.70 | `/home/runner/.npm-global/bin/cline` | 140.0 | bin | 844.5 | 1075.3 | — | — | 55.1 |
| continue | 1.5.47 | `/home/runner/.npm-global/bin/cn` | 140.0 | bin | 1110.7 | — | — | — | 317.5 |
| iflow cli | 0.5.19 | `/home/runner/.npm-global/bin/iflow` | 140.0 | bin | 1194.0 | 1273.2 | 2467.4 | 45.4 | 55.7 |

</details>

fox-agent headless vs scripted local provider: time to first token **60 ms**, peak RSS **61 MB**.

_Generated 2026-10-13T06:56:59Z on Linux x86_64 (6.17.0-1022-azure). [How this is measured](#benchmarks) · [raw JSON](bench/results.json)_
