![harness bench dashboard](bench/bench.svg)

| agent | bundle | `--version` | TUI 1st byte | TUI 1st input | input latency 1s | idle PSS |
|---|---|---|---|---|---|---|
| **fox-agent** | 120 MB | 17 ms | **17 ms** | — | — | 37 MB |
| claude code | 257 MB | 9 ms | **220 ms** | — | — | 187 MB |
| codex | 140 MB | 42 ms | **45 ms** | — | — | 49 MB |
| opencode v2 | 207 MB | 81 ms | **136 ms** | **498 ms** | **56 ms** | 127 MB |
| jcode | 138 MB | 10 ms | **12 ms** | — | — | 28 MB |
| pi | 140 MB | 244 ms | **320 ms** | **835 ms** | **8 ms** | 131 MB |
| gemini cli | 140 MB | 1543 ms | **1641 ms** | **1675 ms** | **0 ms** | 146 MB |
| copilot cli | 140 MB | 101 ms | **767 ms** | — | — | 47 MB |
| crush | 140 MB | 131 ms | **508 ms** | — | — | 69 MB |
| goose | 308 MB | 8 ms | **8 ms** | **208 ms** | — | — |
| aider | 140 MB | 845 ms | **768 ms** | **1160 ms** | **10 ms** | 67 MB |
| amp | 134 MB | 259 ms | **270 ms** | **632 ms** | **1 ms** | 159 MB |
| cursor-agent | 140 MB | 478 ms | **453 ms** | — | — | 217 MB |
| qwen code | 140 MB | 40 ms | **849 ms** | — | — | 236 MB |
| codebuff | 140 MB | 970 ms | **962 ms** | — | — | 58 MB |
| kilo code | 140 MB | 868 ms | **2639 ms** | — | — | 46 MB |
| droid | 281 MB | 94 ms | **117 ms** | — | — | 227 MB |
| kimi code | 191 MB | 602 ms | **753 ms** | — | — | 348 MB |
| devin | 195 MB | 4 ms | **50 ms** | — | — | 48 MB |
| cline | 140 MB | 873 ms | **1201 ms** | — | — | 55 MB |
| continue | 140 MB | 1145 ms | — | — | — | 316 MB |
| iflow cli | 140 MB | 1210 ms | **1281 ms** | **2492 ms** | **46 ms** | 56 MB |

<details><summary>full precision · all collected fields</summary>

| agent | version | bin | bundle (MB) | bundle kind | `--version` (ms) | TUI 1st byte (ms) | TUI 1st input (ms) | input latency 1s (ms) | idle PSS (MB) |
|---|---|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.5.0-beta.1 | `/home/runner/work/fox-agent/fox-agent/bin/fox` | 120.3 | bin | 16.8 | 17.1 | — | — | 36.6 |
| claude code | 2.1.296 (Claude Code) | `/home/runner/.npm-global/bin/claude` | 257.1 | bin | 9.4 | 220.1 | — | — | 187.2 |
| codex | codex-cli 0.162.1 | `/home/runner/.npm-global/bin/codex` | 140.0 | bin | 42.3 | 45.5 | — | — | 49.1 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | `/home/runner/.npm-global/bin/opencode2` | 207.4 | bin | 81.3 | 136.2 | 498.0 | 55.5 | 127.0 |
| jcode | jcode v0.95.0 (6487bbd7e) | `/home/runner/.local/bin/jcode` | 138.2 | bin | 9.6 | 12.3 | — | — | 27.7 |
| pi | 1.1.0 | `/home/runner/.npm-global/bin/pi` | 140.0 | bin | 243.5 | 320.1 | 835.2 | 8.5 | 131.1 |
| gemini cli | 0.63.0 | `/home/runner/.npm-global/bin/gemini` | 140.0 | bin | 1543.4 | 1640.8 | 1675.4 | 0.2 | 146.0 |
| copilot cli | GitHub Copilot CLI 1.0.95. | `/home/runner/.npm-global/bin/copilot` | 140.0 | bin | 101.0 | 766.6 | — | — | 47.4 |
| crush | crush version v0.98.1 | `/home/runner/.npm-global/bin/crush` | 140.0 | bin | 131.1 | 507.7 | — | — | 68.8 |
| goose | 1.54.0 | `/home/runner/.local/bin/goose` | 307.8 | bin | 7.6 | 7.7 | 208.1 | — | — |
| aider | aider 0.86.2 | `/home/runner/work/fox-agent/fox-agent/.venv-bench/bin/aider` | 140.0 | bin | 845.5 | 768.2 | 1159.9 | 10.4 | 66.9 |
| amp | 0.0.1791778148-g902162 (released 2026-10-12T04:09:08.000Z, 1 | `/home/runner/.local/bin/amp` | 134.2 | bin | 259.5 | 269.6 | 632.4 | 0.6 | 159.3 |
| cursor-agent | 2026.10.01-e373342 | `/home/runner/.local/bin/cursor-agent` | 140.0 | bin | 478.0 | 452.7 | — | — | 217.2 |
| qwen code | 0.25.1 | `/home/runner/.npm-global/bin/qwen` | 140.0 | bin | 40.1 | 849.0 | — | — | 236.2 |
| codebuff | 1.0.688 | `/home/runner/.npm-global/bin/codebuff` | 140.0 | bin | 970.2 | 961.8 | — | — | 57.5 |
| kilo code | 7.8.8 | `/home/runner/.npm-global/bin/kilocode` | 140.0 | bin | 867.7 | 2639.2 | — | — | 46.2 |
| droid | 0.238.0 | `/home/runner/.local/bin/droid` | 281.4 | bin | 94.3 | 117.3 | — | — | 227.0 |
| kimi code | 2.1.1 | `/home/runner/.kimi-code/bin/kimi` | 190.8 | bin | 602.3 | 752.9 | — | — | 348.5 |
| devin | devin 3000.11.3 (9c803229faa4) | `/home/runner/.local/bin/devin` | 195.0 | bin | 4.0 | 49.8 | — | — | 48.5 |
| cline | 3.0.70 | `/home/runner/.npm-global/bin/cline` | 140.0 | bin | 873.4 | 1200.6 | — | — | 55.0 |
| continue | 1.5.47 | `/home/runner/.npm-global/bin/cn` | 140.0 | bin | 1145.4 | — | — | — | 316.2 |
| iflow cli | 0.5.19 | `/home/runner/.npm-global/bin/iflow` | 140.0 | bin | 1210.0 | 1281.0 | 2492.4 | 46.4 | 55.7 |

</details>

fox-agent headless vs scripted local provider: time to first token **60 ms**, peak RSS **61 MB**.

_Generated 2026-10-12T06:18:28Z on Linux x86_64 (6.17.0-1022-azure). [How this is measured](#benchmarks) · [raw JSON](bench/results.json)_
