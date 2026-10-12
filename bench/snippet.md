![harness bench dashboard](bench/bench.svg)

| agent | bundle | `--version` | TUI 1st byte | TUI 1st input | input latency 1s | idle PSS |
|---|---|---|---|---|---|---|
| **fox-agent** | 120 MB | 15 ms | **17 ms** | — | — | 36 MB |
| claude code | 257 MB | 11 ms | **227 ms** | — | — | 187 MB |
| codex | 140 MB | 41 ms | **45 ms** | — | — | 49 MB |
| opencode v2 | 207 MB | 82 ms | **133 ms** | **496 ms** | **56 ms** | 131 MB |
| jcode | 138 MB | 10 ms | **12 ms** | — | — | 28 MB |
| pi | 140 MB | 238 ms | **316 ms** | **844 ms** | **8 ms** | 130 MB |
| gemini cli | 140 MB | 1503 ms | **1611 ms** | **1639 ms** | **0 ms** | 146 MB |
| copilot cli | 140 MB | 103 ms | **775 ms** | — | — | 47 MB |
| crush | 140 MB | 131 ms | **503 ms** | — | — | 68 MB |
| goose | 308 MB | 7 ms | **8 ms** | **205 ms** | **0 ms** | — |
| aider | 140 MB | 843 ms | **765 ms** | **1146 ms** | **10 ms** | 67 MB |
| amp | 134 MB | 247 ms | **269 ms** | **629 ms** | **1 ms** | 162 MB |
| cursor-agent | 140 MB | 471 ms | **446 ms** | — | — | 213 MB |
| qwen code | 140 MB | 37 ms | **837 ms** | — | — | 248 MB |
| codebuff | 140 MB | 921 ms | **922 ms** | — | — | 58 MB |
| kilo code | 140 MB | 846 ms | **2510 ms** | — | — | 46 MB |
| droid | 281 MB | 91 ms | **111 ms** | — | — | 234 MB |
| kimi code | 191 MB | 573 ms | **738 ms** | — | — | 349 MB |
| devin | 195 MB | 4 ms | **48 ms** | — | — | 46 MB |
| cline | 140 MB | 895 ms | **1195 ms** | — | — | 55 MB |
| continue | 140 MB | 1112 ms | — | — | — | 316 MB |
| iflow cli | 140 MB | 1199 ms | **1277 ms** | **2106 ms** | **47 ms** | 55 MB |

<details><summary>full precision · all collected fields</summary>

| agent | version | bin | bundle (MB) | bundle kind | `--version` (ms) | TUI 1st byte (ms) | TUI 1st input (ms) | input latency 1s (ms) | idle PSS (MB) |
|---|---|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.5.0-beta.1 | `/home/runner/work/fox-agent/fox-agent/bin/fox` | 120.3 | bin | 14.9 | 16.7 | — | — | 36.3 |
| claude code | 2.1.296 (Claude Code) | `/home/runner/.npm-global/bin/claude` | 257.1 | bin | 10.6 | 227.1 | — | — | 187.5 |
| codex | codex-cli 0.162.1 | `/home/runner/.npm-global/bin/codex` | 140.0 | bin | 41.3 | 44.5 | — | — | 49.1 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | `/home/runner/.npm-global/bin/opencode2` | 207.4 | bin | 81.6 | 132.8 | 495.5 | 55.6 | 130.6 |
| jcode | jcode v0.95.0 (6487bbd7e) | `/home/runner/.local/bin/jcode` | 138.2 | bin | 9.6 | 11.9 | — | — | 28.0 |
| pi | 1.1.0 | `/home/runner/.npm-global/bin/pi` | 140.0 | bin | 238.3 | 316.5 | 843.6 | 8.3 | 129.8 |
| gemini cli | 0.63.0 | `/home/runner/.npm-global/bin/gemini` | 140.0 | bin | 1503.3 | 1611.3 | 1639.2 | 0.2 | 145.9 |
| copilot cli | GitHub Copilot CLI 1.0.95. | `/home/runner/.npm-global/bin/copilot` | 140.0 | bin | 102.7 | 775.1 | — | — | 47.4 |
| crush | crush version v0.98.1 | `/home/runner/.npm-global/bin/crush` | 140.0 | bin | 130.9 | 502.9 | — | — | 68.4 |
| goose | 1.54.0 | `/home/runner/.local/bin/goose` | 307.8 | bin | 7.5 | 7.6 | 204.6 | 0.2 | — |
| aider | aider 0.86.2 | `/home/runner/work/fox-agent/fox-agent/.venv-bench/bin/aider` | 140.0 | bin | 843.2 | 764.9 | 1146.2 | 10.2 | 66.9 |
| amp | 0.0.1791778148-g902162 (released 2026-10-12T04:09:08.000Z, 1 | `/home/runner/.local/bin/amp` | 134.2 | bin | 246.9 | 269.2 | 629.2 | 0.6 | 162.1 |
| cursor-agent | 2026.10.01-e373342 | `/home/runner/.local/bin/cursor-agent` | 140.0 | bin | 471.1 | 446.3 | — | — | 212.8 |
| qwen code | 0.25.1 | `/home/runner/.npm-global/bin/qwen` | 140.0 | bin | 36.7 | 837.3 | — | — | 248.0 |
| codebuff | 1.0.688 | `/home/runner/.npm-global/bin/codebuff` | 140.0 | bin | 921.2 | 921.9 | — | — | 57.5 |
| kilo code | 7.8.8 | `/home/runner/.npm-global/bin/kilocode` | 140.0 | bin | 845.9 | 2510.0 | — | — | 46.2 |
| droid | 0.238.0 | `/home/runner/.local/bin/droid` | 281.4 | bin | 91.0 | 111.2 | — | — | 233.8 |
| kimi code | 2.1.1 | `/home/runner/.kimi-code/bin/kimi` | 190.8 | bin | 573.2 | 737.9 | — | — | 349.3 |
| devin | devin 3000.11.3 (9c803229faa4) | `/home/runner/.local/bin/devin` | 195.0 | bin | 4.2 | 47.8 | — | — | 46.3 |
| cline | 3.0.70 | `/home/runner/.npm-global/bin/cline` | 140.0 | bin | 894.7 | 1194.8 | — | — | 55.0 |
| continue | 1.5.47 | `/home/runner/.npm-global/bin/cn` | 140.0 | bin | 1112.3 | — | — | — | 316.5 |
| iflow cli | 0.5.19 | `/home/runner/.npm-global/bin/iflow` | 140.0 | bin | 1198.5 | 1277.3 | 2105.9 | 47.1 | 55.4 |

</details>

fox-agent headless vs scripted local provider: time to first token **64 ms**, peak RSS **61 MB**.

_Generated 2026-10-12T05:37:37Z on Linux x86_64 (6.17.0-1022-azure). [How this is measured](#benchmarks) · [raw JSON](bench/results.json)_
