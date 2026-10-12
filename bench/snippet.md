![harness bench dashboard](bench/bench.svg)

| agent | bundle | `--version` | TUI 1st byte | TUI 1st input | input latency 1s | idle PSS |
|---|---|---|---|---|---|---|
| **fox-agent** | 120 MB | 15 ms | **17 ms** | — | — | 36 MB |
| claude code | 257 MB | 9 ms | **207 ms** | — | — | 188 MB |
| codex | 140 MB | 42 ms | **43 ms** | — | — | 49 MB |
| opencode v2 | 207 MB | 81 ms | **138 ms** | **500 ms** | **56 ms** | 128 MB |
| jcode | 138 MB | 9 ms | **12 ms** | — | — | 27 MB |
| pi | 140 MB | 234 ms | **318 ms** | **846 ms** | **8 ms** | 131 MB |
| gemini cli | 140 MB | 1526 ms | **1595 ms** | **1633 ms** | — | 146 MB |
| copilot cli | 140 MB | 101 ms | **789 ms** | — | — | 47 MB |
| crush | 140 MB | 131 ms | **575 ms** | — | — | 68 MB |
| goose | 308 MB | 7 ms | **8 ms** | **207 ms** | — | — |
| aider | 140 MB | 794 ms | **729 ms** | **1119 ms** | **10 ms** | 67 MB |
| amp | 134 MB | 239 ms | **254 ms** | **615 ms** | **1 ms** | 157 MB |
| cursor-agent | 140 MB | 455 ms | **428 ms** | — | — | 219 MB |
| qwen code | 140 MB | 37 ms | **824 ms** | — | — | 246 MB |
| codebuff | 140 MB | 897 ms | **872 ms** | — | — | 58 MB |
| kilo code | 140 MB | 845 ms | **2527 ms** | — | — | 46 MB |
| droid | 281 MB | 89 ms | **108 ms** | — | — | 229 MB |
| kimi code | 191 MB | 567 ms | **706 ms** | — | — | 348 MB |
| devin | 195 MB | 4 ms | **47 ms** | — | — | 48 MB |
| cline | 140 MB | 921 ms | **1255 ms** | — | — | 55 MB |
| continue | 140 MB | 1083 ms | — | — | — | 317 MB |
| iflow cli | 140 MB | 1226 ms | **1316 ms** | **2494 ms** | **47 ms** | 56 MB |

<details><summary>full precision · all collected fields</summary>

| agent | version | bin | bundle (MB) | bundle kind | `--version` (ms) | TUI 1st byte (ms) | TUI 1st input (ms) | input latency 1s (ms) | idle PSS (MB) |
|---|---|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.5.0-beta.1 | `/home/runner/work/fox-agent/fox-agent/bin/fox` | 120.3 | bin | 15.3 | 17.0 | — | — | 36.4 |
| claude code | 2.1.296 (Claude Code) | `/home/runner/.npm-global/bin/claude` | 257.1 | bin | 9.0 | 206.7 | — | — | 187.6 |
| codex | codex-cli 0.162.1 | `/home/runner/.npm-global/bin/codex` | 140.0 | bin | 42.2 | 43.2 | — | — | 49.1 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | `/home/runner/.npm-global/bin/opencode2` | 207.4 | bin | 81.2 | 138.1 | 499.6 | 56.2 | 128.1 |
| jcode | jcode v0.95.0 (6487bbd7e) | `/home/runner/.local/bin/jcode` | 138.2 | bin | 9.3 | 12.0 | — | — | 27.3 |
| pi | 1.1.0 | `/home/runner/.npm-global/bin/pi` | 140.0 | bin | 233.7 | 318.4 | 846.1 | 8.3 | 130.8 |
| gemini cli | 0.63.0 | `/home/runner/.npm-global/bin/gemini` | 140.0 | bin | 1525.7 | 1594.6 | 1633.3 | — | 145.9 |
| copilot cli | GitHub Copilot CLI 1.0.95. | `/home/runner/.npm-global/bin/copilot` | 140.0 | bin | 100.7 | 789.4 | — | — | 47.4 |
| crush | crush version v0.98.1 | `/home/runner/.npm-global/bin/crush` | 140.0 | bin | 131.1 | 574.7 | — | — | 68.5 |
| goose | 1.54.0 | `/home/runner/.local/bin/goose` | 307.8 | bin | 7.4 | 7.6 | 207.4 | — | — |
| aider | aider 0.86.2 | `/home/runner/work/fox-agent/fox-agent/.venv-bench/bin/aider` | 140.0 | bin | 794.2 | 728.7 | 1119.4 | 10.3 | 66.8 |
| amp | 0.0.1791778148-g902162 (released 2026-10-12T04:09:08.000Z, 4 | `/home/runner/.local/bin/amp` | 134.2 | bin | 238.6 | 253.5 | 614.8 | 0.6 | 157.3 |
| cursor-agent | 2026.10.01-e373342 | `/home/runner/.local/bin/cursor-agent` | 140.0 | bin | 454.7 | 427.6 | — | — | 219.1 |
| qwen code | 0.25.1 | `/home/runner/.npm-global/bin/qwen` | 140.0 | bin | 37.4 | 823.8 | — | — | 245.5 |
| codebuff | 1.0.688 | `/home/runner/.npm-global/bin/codebuff` | 140.0 | bin | 896.7 | 872.2 | — | — | 57.5 |
| kilo code | 7.8.8 | `/home/runner/.npm-global/bin/kilocode` | 140.0 | bin | 845.0 | 2526.9 | — | — | 46.2 |
| droid | 0.238.0 | `/home/runner/.local/bin/droid` | 281.4 | bin | 89.5 | 107.6 | — | — | 229.0 |
| kimi code | 2.1.1 | `/home/runner/.kimi-code/bin/kimi` | 190.8 | bin | 566.6 | 705.9 | — | — | 348.2 |
| devin | devin 3000.11.3 (9c803229faa4) | `/home/runner/.local/bin/devin` | 195.0 | bin | 3.7 | 47.0 | — | — | 48.3 |
| cline | 3.0.70 | `/home/runner/.npm-global/bin/cline` | 140.0 | bin | 921.4 | 1254.6 | — | — | 55.0 |
| continue | 1.5.47 | `/home/runner/.npm-global/bin/cn` | 140.0 | bin | 1083.0 | — | — | — | 316.6 |
| iflow cli | 0.5.19 | `/home/runner/.npm-global/bin/iflow` | 140.0 | bin | 1225.6 | 1316.2 | 2493.6 | 46.9 | 55.6 |

</details>

fox-agent headless vs scripted local provider: time to first token **64 ms**, peak RSS **61 MB**.

_Generated 2026-10-12T05:12:59Z on Linux x86_64 (6.17.0-1022-azure). [How this is measured](#benchmarks) · [raw JSON](bench/results.json)_
