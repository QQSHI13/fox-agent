![harness bench dashboard](bench/bench.svg)

| agent | bundle | `--version` | TUI 1st byte | TUI 1st input | input latency 1s | idle PSS |
|---|---|---|---|---|---|---|
| **fox-agent** | 120 MB | 13 ms | **14 ms** | — | — | 36 MB |
| claude code | 257 MB | 8 ms | **180 ms** | — | — | 187 MB |
| codex | 140 MB | 36 ms | **40 ms** | — | — | 49 MB |
| opencode v2 | 207 MB | 70 ms | **118 ms** | **480 ms** | **53 ms** | 129 MB |
| jcode | 138 MB | 7 ms | **10 ms** | — | — | 28 MB |
| pi | 140 MB | 196 ms | **275 ms** | **755 ms** | **7 ms** | 130 MB |
| gemini cli | 140 MB | 1241 ms | **1316 ms** | **1367 ms** | — | — |
| copilot cli | 140 MB | 87 ms | **663 ms** | — | — | 47 MB |
| crush | 140 MB | 126 ms | **564 ms** | — | — | 68 MB |
| goose | 308 MB | 6 ms | **5 ms** | **156 ms** | **0 ms** | — |
| aider | 140 MB | 624 ms | **568 ms** | **931 ms** | **9 ms** | 67 MB |
| amp | 134 MB | 210 ms | **227 ms** | **588 ms** | **1 ms** | 161 MB |
| cursor-agent | 140 MB | 364 ms | **353 ms** | — | — | 213 MB |
| qwen code | 140 MB | 33 ms | **668 ms** | — | — | 289 MB |
| codebuff | 140 MB | 806 ms | **831 ms** | — | — | 58 MB |
| kilo code | 140 MB | 761 ms | **2270 ms** | — | — | 46 MB |
| droid | 281 MB | 81 ms | **98 ms** | — | — | 233 MB |
| kimi code | 191 MB | 469 ms | **599 ms** | — | — | 327 MB |
| devin | 195 MB | 2 ms | **34 ms** | — | — | 49 MB |
| cline | 140 MB | 931 ms | **1130 ms** | — | — | 55 MB |
| continue | 140 MB | 930 ms | — | — | — | 318 MB |
| iflow cli | 140 MB | 1000 ms | **1070 ms** | **1885 ms** | **46 ms** | 58 MB |

<details><summary>full precision · all collected fields</summary>

| agent | version | bin | bundle (MB) | bundle kind | `--version` (ms) | TUI 1st byte (ms) | TUI 1st input (ms) | input latency 1s (ms) | idle PSS (MB) |
|---|---|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.5.0-beta.1 | `/home/runner/work/fox-agent/fox-agent/bin/fox` | 120.4 | bin | 12.8 | 14.5 | — | — | 36.4 |
| claude code | 2.1.296 (Claude Code) | `/home/runner/.npm-global/bin/claude` | 257.1 | bin | 7.6 | 179.7 | — | — | 187.4 |
| codex | codex-cli 0.162.1 | `/home/runner/.npm-global/bin/codex` | 140.0 | bin | 36.3 | 39.5 | — | — | 49.0 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | `/home/runner/.npm-global/bin/opencode2` | 207.4 | bin | 70.0 | 117.5 | 480.2 | 53.3 | 129.2 |
| jcode | jcode v0.95.0 (6487bbd7e) | `/home/runner/.local/bin/jcode` | 138.2 | bin | 7.3 | 10.1 | — | — | 28.1 |
| pi | 1.1.0 | `/home/runner/.npm-global/bin/pi` | 140.0 | bin | 195.6 | 274.7 | 754.9 | 6.7 | 130.3 |
| gemini cli | 0.63.0 | `/home/runner/.npm-global/bin/gemini` | 140.0 | bin | 1241.0 | 1316.4 | 1367.2 | — | — |
| copilot cli | GitHub Copilot CLI 1.0.95. | `/home/runner/.npm-global/bin/copilot` | 140.0 | bin | 86.6 | 662.9 | — | — | 47.3 |
| crush | crush version v0.98.1 | `/home/runner/.npm-global/bin/crush` | 140.0 | bin | 125.6 | 563.8 | — | — | 68.4 |
| goose | 1.54.0 | `/home/runner/.local/bin/goose` | 307.8 | bin | 5.6 | 5.5 | 156.0 | 0.1 | — |
| aider | aider 0.86.2 | `/home/runner/work/fox-agent/fox-agent/.venv-bench/bin/aider` | 140.0 | bin | 623.6 | 568.0 | 930.7 | 8.8 | 66.9 |
| amp | 0.0.1791778148-g902162 (released 2026-10-12T04:09:08.000Z, 3 | `/home/runner/.local/bin/amp` | 134.2 | bin | 210.2 | 226.5 | 587.6 | 0.7 | 160.6 |
| cursor-agent | 2026.10.01-e373342 | `/home/runner/.local/bin/cursor-agent` | 140.0 | bin | 364.3 | 352.9 | — | — | 212.9 |
| qwen code | 0.25.1 | `/home/runner/.npm-global/bin/qwen` | 140.0 | bin | 33.2 | 667.8 | — | — | 289.4 |
| codebuff | 1.0.688 | `/home/runner/.npm-global/bin/codebuff` | 140.0 | bin | 805.5 | 831.2 | — | — | 57.6 |
| kilo code | 7.8.8 | `/home/runner/.npm-global/bin/kilocode` | 140.0 | bin | 761.0 | 2270.1 | — | — | 46.2 |
| droid | 0.238.0 | `/home/runner/.local/bin/droid` | 281.4 | bin | 80.9 | 97.9 | — | — | 232.8 |
| kimi code | 2.1.1 | `/home/runner/.kimi-code/bin/kimi` | 190.8 | bin | 469.3 | 599.0 | — | — | 327.0 |
| devin | devin 3000.11.3 (9c803229faa4) | `/home/runner/.local/bin/devin` | 195.0 | bin | 2.3 | 33.7 | — | — | 48.6 |
| cline | 3.0.70 | `/home/runner/.npm-global/bin/cline` | 140.0 | bin | 931.3 | 1130.2 | — | — | 54.9 |
| continue | 1.5.47 | `/home/runner/.npm-global/bin/cn` | 140.0 | bin | 929.5 | — | — | — | 318.2 |
| iflow cli | 0.5.19 | `/home/runner/.npm-global/bin/iflow` | 140.0 | bin | 999.8 | 1070.3 | 1885.5 | 46.4 | 58.0 |

</details>

fox-agent headless vs scripted local provider: time to first token **57 ms**, peak RSS **61 MB**.

_Generated 2026-10-12T08:02:54Z on Linux x86_64 (6.17.0-1022-azure). [How this is measured](#benchmarks) · [raw JSON](bench/results.json)_
