![harness bench dashboard](bench/bench.svg)

| agent | bundle | `--version` | TUI 1st byte | TUI 1st input | input latency 1s | idle PSS |
|---|---|---|---|---|---|---|
| **fox-agent** | 120 MB | 15 ms | **17 ms** | — | — | 37 MB |
| claude code | 257 MB | 9 ms | **221 ms** | — | — | 188 MB |
| codex | 140 MB | 43 ms | **44 ms** | — | — | 49 MB |
| opencode v2 | 207 MB | 83 ms | **134 ms** | **496 ms** | **57 ms** | 131 MB |
| jcode | 138 MB | 9 ms | **13 ms** | — | — | 27 MB |
| pi | 140 MB | 242 ms | **327 ms** | **853 ms** | **8 ms** | 131 MB |
| gemini cli | 140 MB | 1561 ms | **1649 ms** | **1661 ms** | **0 ms** | 146 MB |
| copilot cli | 140 MB | 104 ms | **784 ms** | — | — | 47 MB |
| crush | 140 MB | 139 ms | **628 ms** | — | — | 69 MB |
| goose | 308 MB | 8 ms | **8 ms** | **207 ms** | **0 ms** | — |
| aider | 140 MB | 838 ms | **759 ms** | **1146 ms** | **10 ms** | 67 MB |
| amp | 134 MB | 251 ms | **265 ms** | **628 ms** | **1 ms** | 157 MB |
| cursor-agent | 140 MB | 465 ms | **436 ms** | — | — | 214 MB |
| qwen code | 140 MB | 37 ms | **829 ms** | — | — | 241 MB |
| codebuff | 140 MB | 969 ms | **948 ms** | — | — | 58 MB |
| kilo code | 140 MB | 851 ms | **2580 ms** | — | — | 46 MB |
| droid | 281 MB | 102 ms | **109 ms** | — | — | 228 MB |
| kimi code | 191 MB | 569 ms | **718 ms** | — | — | 348 MB |
| devin | 195 MB | 4 ms | **50 ms** | — | — | 48 MB |
| cline | 140 MB | 870 ms | **1066 ms** | — | — | 55 MB |
| continue | 140 MB | 1121 ms | — | — | — | 317 MB |
| iflow cli | 140 MB | 1225 ms | **1300 ms** | **2474 ms** | **47 ms** | 56 MB |

<details><summary>full precision · all collected fields</summary>

| agent | version | bin | bundle (MB) | bundle kind | `--version` (ms) | TUI 1st byte (ms) | TUI 1st input (ms) | input latency 1s (ms) | idle PSS (MB) |
|---|---|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.5.0-beta.1 | `/home/runner/work/fox-agent/fox-agent/bin/fox` | 120.3 | bin | 15.3 | 17.0 | — | — | 36.7 |
| claude code | 2.1.296 (Claude Code) | `/home/runner/.npm-global/bin/claude` | 257.1 | bin | 9.1 | 221.5 | — | — | 187.5 |
| codex | codex-cli 0.162.1 | `/home/runner/.npm-global/bin/codex` | 140.0 | bin | 42.9 | 43.7 | — | — | 49.1 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | `/home/runner/.npm-global/bin/opencode2` | 207.4 | bin | 83.0 | 134.5 | 495.5 | 56.5 | 130.7 |
| jcode | jcode v0.95.0 (6487bbd7e) | `/home/runner/.local/bin/jcode` | 138.2 | bin | 9.5 | 12.5 | — | — | 27.1 |
| pi | 1.1.0 | `/home/runner/.npm-global/bin/pi` | 140.0 | bin | 241.9 | 327.0 | 852.9 | 8.3 | 130.7 |
| gemini cli | 0.63.0 | `/home/runner/.npm-global/bin/gemini` | 140.0 | bin | 1561.4 | 1649.4 | 1661.0 | 0.1 | 146.1 |
| copilot cli | GitHub Copilot CLI 1.0.95. | `/home/runner/.npm-global/bin/copilot` | 140.0 | bin | 104.5 | 784.5 | — | — | 47.3 |
| crush | crush version v0.98.1 | `/home/runner/.npm-global/bin/crush` | 140.0 | bin | 138.8 | 628.4 | — | — | 68.8 |
| goose | 1.54.0 | `/home/runner/.local/bin/goose` | 307.8 | bin | 7.8 | 7.8 | 206.9 | 0.1 | — |
| aider | aider 0.86.2 | `/home/runner/work/fox-agent/fox-agent/.venv-bench/bin/aider` | 140.0 | bin | 838.0 | 759.1 | 1146.4 | 10.3 | 66.9 |
| amp | 0.0.1791778148-g902162 (released 2026-10-12T04:09:08.000Z, 1 | `/home/runner/.local/bin/amp` | 134.2 | bin | 250.8 | 264.6 | 627.5 | 0.6 | 157.4 |
| cursor-agent | 2026.10.01-e373342 | `/home/runner/.local/bin/cursor-agent` | 140.0 | bin | 464.9 | 435.8 | — | — | 213.8 |
| qwen code | 0.25.1 | `/home/runner/.npm-global/bin/qwen` | 140.0 | bin | 36.7 | 829.3 | — | — | 240.7 |
| codebuff | 1.0.688 | `/home/runner/.npm-global/bin/codebuff` | 140.0 | bin | 969.5 | 948.0 | — | — | 57.6 |
| kilo code | 7.8.8 | `/home/runner/.npm-global/bin/kilocode` | 140.0 | bin | 850.7 | 2579.8 | — | — | 46.2 |
| droid | 0.238.0 | `/home/runner/.local/bin/droid` | 281.4 | bin | 101.6 | 108.7 | — | — | 227.6 |
| kimi code | 2.1.1 | `/home/runner/.kimi-code/bin/kimi` | 190.8 | bin | 569.5 | 718.1 | — | — | 348.4 |
| devin | devin 3000.11.3 (9c803229faa4) | `/home/runner/.local/bin/devin` | 195.0 | bin | 4.2 | 50.2 | — | — | 48.4 |
| cline | 3.0.70 | `/home/runner/.npm-global/bin/cline` | 140.0 | bin | 870.3 | 1066.5 | — | — | 55.0 |
| continue | 1.5.47 | `/home/runner/.npm-global/bin/cn` | 140.0 | bin | 1121.4 | — | — | — | 317.2 |
| iflow cli | 0.5.19 | `/home/runner/.npm-global/bin/iflow` | 140.0 | bin | 1225.4 | 1299.7 | 2473.8 | 47.2 | 55.7 |

</details>

fox-agent headless vs scripted local provider: time to first token **62 ms**, peak RSS **61 MB**.

_Generated 2026-10-12T05:44:34Z on Linux x86_64 (6.17.0-1022-azure). [How this is measured](#benchmarks) · [raw JSON](bench/results.json)_
