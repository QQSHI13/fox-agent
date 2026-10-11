![harness bench dashboard](bench/bench.svg)

| agent | bundle | `--version` | TUI 1st byte | TUI 1st input | input latency 1s | idle PSS |
|---|---|---|---|---|---|---|
| **fox-agent** | 99 MB | 13 ms | **15 ms** | — | — | 34 MB |
| claude code | 257 MB | 9 ms | **175 ms** | — | — | 188 MB |
| codex | 140 MB | 39 ms | **38 ms** | — | — | 49 MB |
| opencode v2 | 207 MB | 61 ms | **100 ms** | **458 ms** | **44 ms** | 122 MB |
| jcode | 137 MB | 9 ms | **11 ms** | — | — | 27 MB |
| pi | 140 MB | 165 ms | **201 ms** | **721 ms** | **6 ms** | 133 MB |
| gemini cli | 140 MB | 1056 ms | **1125 ms** | **1224 ms** | **0 ms** | — |
| copilot cli | 140 MB | 84 ms | **602 ms** | — | — | 47 MB |
| crush | 140 MB | 115 ms | **504 ms** | — | — | 69 MB |
| goose | 308 MB | 7 ms | **7 ms** | **175 ms** | — | — |
| aider | 140 MB | 555 ms | **487 ms** | **862 ms** | **7 ms** | 67 MB |
| amp | 134 MB | 175 ms | **181 ms** | **539 ms** | **1 ms** | 160 MB |
| cursor-agent | 140 MB | 305 ms | **294 ms** | — | — | 214 MB |
| qwen code | 140 MB | 30 ms | **563 ms** | — | — | 303 MB |
| codebuff | 140 MB | 690 ms | **669 ms** | — | — | 58 MB |
| kilo code | 140 MB | 658 ms | **2007 ms** | — | — | 46 MB |
| droid | 281 MB | 70 ms | **74 ms** | — | — | 227 MB |
| kimi code | 191 MB | 475 ms | **608 ms** | **953 ms** | **7 ms** | 354 MB |
| devin | 195 MB | 4 ms | **38 ms** | — | — | 47 MB |
| cline | 140 MB | 658 ms | **891 ms** | — | — | 55 MB |
| continue | 140 MB | 833 ms | — | — | — | 319 MB |
| iflow cli | 140 MB | 861 ms | **922 ms** | **1768 ms** | **45 ms** | 58 MB |

<details><summary>full precision · all collected fields</summary>

| agent | version | bin | bundle (MB) | bundle kind | `--version` (ms) | TUI 1st byte (ms) | TUI 1st input (ms) | input latency 1s (ms) | idle PSS (MB) |
|---|---|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.5.0-beta.1 | `/home/runner/work/fox-agent/fox-agent/bin/fox` | 98.9 | bin | 13.2 | 15.0 | — | — | 34.3 |
| claude code | 2.1.296 (Claude Code) | `/home/runner/.npm-global/bin/claude` | 257.1 | bin | 8.6 | 175.1 | — | — | 187.5 |
| codex | codex-cli 0.162.1 | `/home/runner/.npm-global/bin/codex` | 140.0 | bin | 38.9 | 38.3 | — | — | 49.0 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | `/home/runner/.npm-global/bin/opencode2` | 207.4 | bin | 60.7 | 100.5 | 458.2 | 44.2 | 122.5 |
| jcode | jcode v0.94.0 (b6c63ff04) | `/home/runner/.local/bin/jcode` | 137.1 | bin | 8.5 | 10.9 | — | — | 26.9 |
| pi | 1.1.0 | `/home/runner/.npm-global/bin/pi` | 140.0 | bin | 164.7 | 200.5 | 721.3 | 5.7 | 132.8 |
| gemini cli | 0.63.0 | `/home/runner/.npm-global/bin/gemini` | 140.0 | bin | 1056.4 | 1125.4 | 1223.8 | 0.1 | — |
| copilot cli | GitHub Copilot CLI 1.0.95. | `/home/runner/.npm-global/bin/copilot` | 140.0 | bin | 84.5 | 602.4 | — | — | 47.3 |
| crush | crush version v0.98.1 | `/home/runner/.npm-global/bin/crush` | 140.0 | bin | 114.6 | 504.0 | — | — | 68.6 |
| goose | 1.54.0 | `/home/runner/.local/bin/goose` | 307.8 | bin | 7.2 | 7.0 | 174.5 | — | — |
| aider | aider 0.86.2 | `/home/runner/work/fox-agent/fox-agent/.venv-bench/bin/aider` | 140.0 | bin | 554.6 | 486.6 | 861.5 | 6.9 | 66.9 |
| amp | 0.0.1791705634-g3bdda1 (released 2026-10-11T08:00:34.000Z, 1 | `/home/runner/.local/bin/amp` | 134.2 | bin | 175.2 | 181.3 | 539.3 | 0.5 | 160.4 |
| cursor-agent | 2026.10.01-e373342 | `/home/runner/.local/bin/cursor-agent` | 140.0 | bin | 304.8 | 294.0 | — | — | 214.0 |
| qwen code | 0.25.0 | `/home/runner/.npm-global/bin/qwen` | 140.0 | bin | 30.1 | 563.2 | — | — | 303.4 |
| codebuff | 1.0.688 | `/home/runner/.npm-global/bin/codebuff` | 140.0 | bin | 690.5 | 669.2 | — | — | 57.7 |
| kilo code | 7.8.8 | `/home/runner/.npm-global/bin/kilocode` | 140.0 | bin | 657.6 | 2007.1 | — | — | 46.1 |
| droid | 0.238.0 | `/home/runner/.local/bin/droid` | 281.4 | bin | 69.8 | 74.2 | — | — | 227.3 |
| kimi code | 2.1.1 | `/home/runner/.kimi-code/bin/kimi` | 190.8 | bin | 474.6 | 608.2 | 952.7 | 7.1 | 354.4 |
| devin | devin 3000.11.3 (9c803229faa4) | `/home/runner/.local/bin/devin` | 195.0 | bin | 3.5 | 37.7 | — | — | 46.8 |
| cline | 3.0.70 | `/home/runner/.npm-global/bin/cline` | 140.0 | bin | 657.7 | 890.9 | — | — | 54.9 |
| continue | 1.5.47 | `/home/runner/.npm-global/bin/cn` | 140.0 | bin | 832.8 | — | — | — | 318.8 |
| iflow cli | 0.5.19 | `/home/runner/.npm-global/bin/iflow` | 140.0 | bin | 861.5 | 921.9 | 1768.2 | 45.3 | 57.9 |

</details>

fox-agent headless vs scripted local provider: time to first token **47 ms**, peak RSS **59 MB**.

_Generated 2026-10-11T09:39:50Z on Linux x86_64 (6.17.0-1022-azure). [How this is measured](#benchmarks) · [raw JSON](bench/results.json)_
