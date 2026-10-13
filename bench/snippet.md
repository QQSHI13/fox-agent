![harness bench dashboard](bench/bench.svg)

| agent | bundle | `--version` | TUI 1st byte | TUI 1st input | input latency 1s | idle PSS |
|---|---|---|---|---|---|---|
| **fox-agent** | 120 MB | 14 ms | **16 ms** | **380 ms** | **1 ms** | 37 MB |
| claude code | 257 MB | 8 ms | **203 ms** | — | — | 187 MB |
| codex | 140 MB | 39 ms | **45 ms** | **792 ms** | **1 ms** | 49 MB |
| opencode v2 | 207 MB | 76 ms | **128 ms** | **492 ms** | **61 ms** | 127 MB |
| jcode | 138 MB | 8 ms | **10 ms** | **586 ms** | **0 ms** | 28 MB |
| pi | 140 MB | 228 ms | **302 ms** | **790 ms** | **8 ms** | 131 MB |
| gemini cli | 140 MB | 1421 ms | **1504 ms** | **1530 ms** | **0 ms** | 146 MB |
| copilot cli | 140 MB | 99 ms | **741 ms** | — | — | 47 MB |
| crush | 140 MB | 119 ms | **474 ms** | **945 ms** | **72 ms** | 69 MB |
| goose | 308 MB | 6 ms | **6 ms** | **367 ms** | **0 ms** | 105 MB |
| aider | 140 MB | 725 ms | **646 ms** | **1035 ms** | **10 ms** | 67 MB |
| amp | 134 MB | 222 ms | **243 ms** | **608 ms** | **1 ms** | 161 MB |
| cursor-agent | 140 MB | 433 ms | **406 ms** | — | — | 213 MB |
| qwen code | 140 MB | 37 ms | **781 ms** | **1237 ms** | — | 252 MB |
| codebuff | 140 MB | 933 ms | **907 ms** | **1396 ms** | **109 ms** | 58 MB |
| kilo code | 140 MB | 885 ms | **2549 ms** | **6487 ms** | **1392 ms** | 46 MB |
| droid | 292 MB | 101 ms | **131 ms** | **3178 ms** | **731 ms** | 220 MB |
| kimi code | 191 MB | 571 ms | **709 ms** | **1106 ms** | **4 ms** | 350 MB |
| devin | 195 MB | 3 ms | **37 ms** | **1041 ms** | **641 ms** | 49 MB |
| cline | 140 MB | 836 ms | **1097 ms** | — | — | 55 MB |
| continue | 140 MB | 1015 ms | — | — | — | 317 MB |
| iflow cli | 140 MB | 1105 ms | **1186 ms** | **1972 ms** | **47 ms** | 54 MB |

<details><summary>full precision · all collected fields</summary>

| agent | version | bin | bundle (MB) | bundle kind | `--version` (ms) | TUI 1st byte (ms) | TUI 1st input (ms) | input latency 1s (ms) | idle PSS (MB) |
|---|---|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.5.0-beta.1 | `/home/runner/work/fox-agent/fox-agent/bin/fox` | 120.4 | bin | 13.9 | 16.4 | 379.9 | 0.6 | 36.6 |
| claude code | 2.1.296 (Claude Code) | `/home/runner/.npm-global/bin/claude` | 257.1 | bin | 7.8 | 203.4 | — | — | 187.5 |
| codex | codex-cli 0.162.1 | `/home/runner/.npm-global/bin/codex` | 140.0 | bin | 39.4 | 44.8 | 792.2 | 0.7 | 49.1 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | `/home/runner/.npm-global/bin/opencode2` | 207.4 | bin | 75.5 | 127.9 | 491.7 | 60.7 | 126.6 |
| jcode | jcode v0.95.0 (6487bbd7e) | `/home/runner/.local/bin/jcode` | 138.2 | bin | 8.1 | 10.3 | 586.1 | 0.3 | 27.8 |
| pi | 1.2.0 | `/home/runner/.npm-global/bin/pi` | 140.0 | bin | 227.7 | 302.1 | 789.8 | 7.7 | 131.3 |
| gemini cli | 0.63.0 | `/home/runner/.npm-global/bin/gemini` | 140.0 | bin | 1420.9 | 1503.5 | 1529.6 | 0.1 | 145.7 |
| copilot cli | GitHub Copilot CLI 1.0.96. | `/home/runner/.npm-global/bin/copilot` | 140.0 | bin | 99.3 | 741.1 | — | — | 47.3 |
| crush | crush version v0.98.1 | `/home/runner/.npm-global/bin/crush` | 140.0 | bin | 118.6 | 474.4 | 944.6 | 72.2 | 68.7 |
| goose | 1.54.0 | `/home/runner/.local/bin/goose` | 307.8 | bin | 5.9 | 6.1 | 366.8 | 0.2 | 104.9 |
| aider | aider 0.86.2 | `/home/runner/work/fox-agent/fox-agent/.venv-bench/bin/aider` | 140.0 | bin | 724.8 | 646.4 | 1034.8 | 10.1 | 66.9 |
| amp | 0.0.1791864325-g52e626 (released 2026-10-13T04:05:25.000Z, 4 | `/home/runner/.local/bin/amp` | 134.4 | bin | 221.6 | 243.3 | 607.7 | 0.5 | 160.6 |
| cursor-agent | 2026.10.01-e373342 | `/home/runner/.local/bin/cursor-agent` | 140.0 | bin | 433.2 | 406.3 | — | — | 213.0 |
| qwen code | 0.25.1 | `/home/runner/.npm-global/bin/qwen` | 140.0 | bin | 36.9 | 781.4 | 1236.8 | — | 252.0 |
| codebuff | 1.0.688 | `/home/runner/.npm-global/bin/codebuff` | 140.0 | bin | 933.4 | 906.8 | 1396.5 | 108.9 | 57.6 |
| kilo code | 7.8.8 | `/home/runner/.npm-global/bin/kilocode` | 140.0 | bin | 884.9 | 2549.4 | 6487.5 | 1392.2 | 46.2 |
| droid | 0.240.0 | `/home/runner/.local/bin/droid` | 291.7 | bin | 100.7 | 131.3 | 3178.2 | 731.2 | 219.7 |
| kimi code | 2.1.1 | `/home/runner/.kimi-code/bin/kimi` | 190.8 | bin | 571.4 | 708.6 | 1106.3 | 4.2 | 349.9 |
| devin | devin 3000.11.3 (9c803229faa4) | `/home/runner/.local/bin/devin` | 195.0 | bin | 2.6 | 37.1 | 1040.6 | 640.9 | 48.7 |
| cline | 3.0.70 | `/home/runner/.npm-global/bin/cline` | 140.0 | bin | 836.2 | 1097.4 | — | — | 55.0 |
| continue | 1.5.47 | `/home/runner/.npm-global/bin/cn` | 140.0 | bin | 1014.9 | — | — | — | 316.6 |
| iflow cli | 0.5.19 | `/home/runner/.npm-global/bin/iflow` | 140.0 | bin | 1105.0 | 1185.6 | 1972.3 | 47.4 | 53.9 |

</details>

fox-agent headless vs scripted local provider: time to first token **58 ms**, peak RSS **60 MB**.

_Generated 2026-10-13T08:34:24Z on Linux x86_64 (6.17.0-1022-azure). [How this is measured](#benchmarks) · [raw JSON](bench/results.json)_
