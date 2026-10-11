![harness bench dashboard](bench/bench.svg)

| agent | bundle | `--version` | TUI 1st byte | TUI 1st input | input latency 1s | idle PSS |
|---|---|---|---|---|---|---|
| **fox-agent** | 99 MB | 14 ms | **16 ms** | — | — | 35 MB |
| claude code | 257 MB | 9 ms | **219 ms** | — | — | 187 MB |
| codex | 140 MB | 44 ms | **45 ms** | — | — | 49 MB |
| opencode v2 | 207 MB | 92 ms | **149 ms** | **518 ms** | **64 ms** | 129 MB |
| jcode | 137 MB | 10 ms | **12 ms** | — | — | 27 MB |
| pi | 140 MB | 250 ms | **335 ms** | **833 ms** | **9 ms** | 130 MB |
| gemini cli | 140 MB | 1609 ms | **1706 ms** | **1719 ms** | — | 146 MB |
| copilot cli | 140 MB | 107 ms | **827 ms** | — | — | 47 MB |
| crush | 140 MB | 136 ms | **527 ms** | — | — | 68 MB |
| goose | 308 MB | 8 ms | **8 ms** | **209 ms** | **0 ms** | — |
| aider | 140 MB | 862 ms | **776 ms** | **1158 ms** | **12 ms** | 67 MB |
| amp | 134 MB | 261 ms | **266 ms** | **636 ms** | **1 ms** | 160 MB |
| cursor-agent | 140 MB | 480 ms | **452 ms** | — | — | 218 MB |
| qwen code | 140 MB | 42 ms | **850 ms** | — | — | 241 MB |
| codebuff | 140 MB | 1073 ms | **1045 ms** | — | — | 58 MB |
| kilo code | 140 MB | 881 ms | **2622 ms** | — | — | 46 MB |
| droid | 281 MB | 100 ms | **125 ms** | — | — | 232 MB |
| kimi code | 191 MB | 615 ms | **781 ms** | **1212 ms** | **10 ms** | 352 MB |
| devin | 195 MB | 4 ms | **51 ms** | — | — | 48 MB |
| cline | 140 MB | 957 ms | **1156 ms** | — | — | 55 MB |
| continue | 140 MB | 1187 ms | — | — | — | 317 MB |
| iflow cli | 140 MB | 1298 ms | **1403 ms** | **2593 ms** | **47 ms** | 56 MB |

<details><summary>full precision · all collected fields</summary>

| agent | version | bin | bundle (MB) | bundle kind | `--version` (ms) | TUI 1st byte (ms) | TUI 1st input (ms) | input latency 1s (ms) | idle PSS (MB) |
|---|---|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.5.0-beta.1 | `/home/runner/work/fox-agent/fox-agent/bin/fox` | 98.9 | bin | 14.2 | 15.7 | — | — | 34.5 |
| claude code | 2.1.296 (Claude Code) | `/home/runner/.npm-global/bin/claude` | 257.1 | bin | 8.9 | 219.2 | — | — | 187.5 |
| codex | codex-cli 0.162.1 | `/home/runner/.npm-global/bin/codex` | 140.0 | bin | 43.9 | 45.0 | — | — | 49.0 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | `/home/runner/.npm-global/bin/opencode2` | 207.4 | bin | 91.7 | 149.2 | 518.0 | 63.8 | 129.1 |
| jcode | jcode v0.94.0 (b6c63ff04) | `/home/runner/.local/bin/jcode` | 137.1 | bin | 9.9 | 12.4 | — | — | 27.2 |
| pi | 1.1.0 | `/home/runner/.npm-global/bin/pi` | 140.0 | bin | 250.1 | 335.4 | 833.3 | 8.6 | 130.5 |
| gemini cli | 0.63.0 | `/home/runner/.npm-global/bin/gemini` | 140.0 | bin | 1609.1 | 1706.4 | 1719.4 | — | 145.8 |
| copilot cli | GitHub Copilot CLI 1.0.95. | `/home/runner/.npm-global/bin/copilot` | 140.0 | bin | 106.9 | 826.9 | — | — | 47.4 |
| crush | crush version v0.98.1 | `/home/runner/.npm-global/bin/crush` | 140.0 | bin | 136.3 | 527.1 | — | — | 68.4 |
| goose | 1.54.0 | `/home/runner/.local/bin/goose` | 307.8 | bin | 8.2 | 8.0 | 208.5 | 0.1 | — |
| aider | aider 0.86.2 | `/home/runner/work/fox-agent/fox-agent/.venv-bench/bin/aider` | 140.0 | bin | 862.1 | 775.7 | 1158.1 | 12.1 | 66.9 |
| amp | 0.0.1791705634-g3bdda1 (released 2026-10-11T08:00:34.000Z, 1 | `/home/runner/.local/bin/amp` | 134.2 | bin | 260.9 | 265.9 | 636.2 | 0.6 | 159.9 |
| cursor-agent | 2026.10.01-e373342 | `/home/runner/.local/bin/cursor-agent` | 140.0 | bin | 479.9 | 451.9 | — | — | 217.5 |
| qwen code | 0.25.0 | `/home/runner/.npm-global/bin/qwen` | 140.0 | bin | 41.5 | 850.4 | — | — | 240.6 |
| codebuff | 1.0.688 | `/home/runner/.npm-global/bin/codebuff` | 140.0 | bin | 1073.4 | 1044.9 | — | — | 57.6 |
| kilo code | 7.8.8 | `/home/runner/.npm-global/bin/kilocode` | 140.0 | bin | 881.2 | 2622.0 | — | — | 46.2 |
| droid | 0.238.0 | `/home/runner/.local/bin/droid` | 281.4 | bin | 99.9 | 124.6 | — | — | 232.3 |
| kimi code | 2.1.1 | `/home/runner/.kimi-code/bin/kimi` | 190.8 | bin | 614.5 | 780.7 | 1212.4 | 10.0 | 351.9 |
| devin | devin 3000.11.3 (9c803229faa4) | `/home/runner/.local/bin/devin` | 195.0 | bin | 4.4 | 51.2 | — | — | 48.3 |
| cline | 3.0.70 | `/home/runner/.npm-global/bin/cline` | 140.0 | bin | 957.1 | 1156.2 | — | — | 55.0 |
| continue | 1.5.47 | `/home/runner/.npm-global/bin/cn` | 140.0 | bin | 1187.4 | — | — | — | 316.8 |
| iflow cli | 0.5.19 | `/home/runner/.npm-global/bin/iflow` | 140.0 | bin | 1298.3 | 1402.8 | 2593.0 | 47.3 | 55.6 |

</details>

fox-agent headless vs scripted local provider: time to first token **63 ms**, peak RSS **59 MB**.

_Generated 2026-10-11T09:26:04Z on Linux x86_64 (6.17.0-1022-azure). [How this is measured](#benchmarks) · [raw JSON](bench/results.json)_
