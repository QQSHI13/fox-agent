![harness bench dashboard](bench/bench.svg)

| agent | bundle | `--version` | TUI 1st byte | TUI 1st input | input latency 1s | idle PSS |
|---|---|---|---|---|---|---|
| **fox-agent** | 120 MB | 16 ms | **18 ms** | — | — | 37 MB |
| claude code | 257 MB | 9 ms | **205 ms** | — | — | 187 MB |
| codex | 140 MB | 43 ms | **44 ms** | — | — | 49 MB |
| opencode v2 | 207 MB | 82 ms | **134 ms** | **509 ms** | **58 ms** | 130 MB |
| jcode | 138 MB | 9 ms | **11 ms** | — | — | 28 MB |
| pi | 140 MB | 240 ms | **314 ms** | **840 ms** | **8 ms** | 129 MB |
| gemini cli | 140 MB | 1518 ms | **1598 ms** | **1620 ms** | **0 ms** | 146 MB |
| copilot cli | 140 MB | 101 ms | **784 ms** | — | — | 47 MB |
| crush | 140 MB | 130 ms | **278 ms** | — | — | 69 MB |
| goose | 308 MB | 7 ms | **7 ms** | **202 ms** | — | — |
| aider | 140 MB | 810 ms | **737 ms** | **1120 ms** | **10 ms** | 67 MB |
| amp | 134 MB | 251 ms | **254 ms** | **632 ms** | **1 ms** | 160 MB |
| cursor-agent | 140 MB | 453 ms | **435 ms** | — | — | 214 MB |
| qwen code | 140 MB | 36 ms | **819 ms** | — | — | 247 MB |
| codebuff | 140 MB | 938 ms | **896 ms** | — | — | 58 MB |
| kilo code | 140 MB | 847 ms | **2480 ms** | — | — | 46 MB |
| droid | 281 MB | 91 ms | **115 ms** | — | — | 233 MB |
| kimi code | 191 MB | 586 ms | **717 ms** | — | — | 350 MB |
| devin | 195 MB | 4 ms | **48 ms** | — | — | 49 MB |
| cline | 140 MB | 906 ms | **1110 ms** | — | — | 55 MB |
| continue | 140 MB | 1120 ms | — | — | — | 317 MB |
| iflow cli | 140 MB | 1206 ms | **1285 ms** | **2483 ms** | **47 ms** | 56 MB |

<details><summary>full precision · all collected fields</summary>

| agent | version | bin | bundle (MB) | bundle kind | `--version` (ms) | TUI 1st byte (ms) | TUI 1st input (ms) | input latency 1s (ms) | idle PSS (MB) |
|---|---|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.5.0-beta.1 | `/home/runner/work/fox-agent/fox-agent/bin/fox` | 120.3 | bin | 16.0 | 17.5 | — | — | 36.5 |
| claude code | 2.1.296 (Claude Code) | `/home/runner/.npm-global/bin/claude` | 257.1 | bin | 9.4 | 205.3 | — | — | 187.1 |
| codex | codex-cli 0.162.1 | `/home/runner/.npm-global/bin/codex` | 140.0 | bin | 42.8 | 44.5 | — | — | 49.1 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | `/home/runner/.npm-global/bin/opencode2` | 207.4 | bin | 82.5 | 134.1 | 508.7 | 57.8 | 129.6 |
| jcode | jcode v0.95.0 (6487bbd7e) | `/home/runner/.local/bin/jcode` | 138.2 | bin | 9.1 | 11.2 | — | — | 27.9 |
| pi | 1.1.0 | `/home/runner/.npm-global/bin/pi` | 140.0 | bin | 239.7 | 314.4 | 839.5 | 8.3 | 129.0 |
| gemini cli | 0.63.0 | `/home/runner/.npm-global/bin/gemini` | 140.0 | bin | 1517.6 | 1597.7 | 1619.8 | 0.1 | 145.9 |
| copilot cli | GitHub Copilot CLI 1.0.95. | `/home/runner/.npm-global/bin/copilot` | 140.0 | bin | 101.2 | 783.5 | — | — | 47.4 |
| crush | crush version v0.98.1 | `/home/runner/.npm-global/bin/crush` | 140.0 | bin | 130.4 | 278.3 | — | — | 69.1 |
| goose | 1.54.0 | `/home/runner/.local/bin/goose` | 307.8 | bin | 6.9 | 6.8 | 201.8 | — | — |
| aider | aider 0.86.2 | `/home/runner/work/fox-agent/fox-agent/.venv-bench/bin/aider` | 140.0 | bin | 809.9 | 737.3 | 1120.2 | 10.3 | 66.9 |
| amp | 0.0.1791778148-g902162 (released 2026-10-12T04:09:08.000Z, 1 | `/home/runner/.local/bin/amp` | 134.2 | bin | 251.2 | 254.3 | 631.8 | 0.6 | 160.0 |
| cursor-agent | 2026.10.01-e373342 | `/home/runner/.local/bin/cursor-agent` | 140.0 | bin | 452.8 | 435.5 | — | — | 213.6 |
| qwen code | 0.25.1 | `/home/runner/.npm-global/bin/qwen` | 140.0 | bin | 36.4 | 819.0 | — | — | 247.5 |
| codebuff | 1.0.688 | `/home/runner/.npm-global/bin/codebuff` | 140.0 | bin | 937.8 | 895.8 | — | — | 57.6 |
| kilo code | 7.8.8 | `/home/runner/.npm-global/bin/kilocode` | 140.0 | bin | 846.6 | 2480.4 | — | — | 46.2 |
| droid | 0.238.0 | `/home/runner/.local/bin/droid` | 281.4 | bin | 90.6 | 114.6 | — | — | 233.4 |
| kimi code | 2.1.1 | `/home/runner/.kimi-code/bin/kimi` | 190.8 | bin | 585.7 | 717.2 | — | — | 349.8 |
| devin | devin 3000.11.3 (9c803229faa4) | `/home/runner/.local/bin/devin` | 195.0 | bin | 3.8 | 48.1 | — | — | 48.5 |
| cline | 3.0.70 | `/home/runner/.npm-global/bin/cline` | 140.0 | bin | 906.2 | 1109.8 | — | — | 55.0 |
| continue | 1.5.47 | `/home/runner/.npm-global/bin/cn` | 140.0 | bin | 1119.6 | — | — | — | 316.9 |
| iflow cli | 0.5.19 | `/home/runner/.npm-global/bin/iflow` | 140.0 | bin | 1206.3 | 1284.7 | 2483.2 | 47.2 | 55.6 |

</details>

fox-agent headless vs scripted local provider: time to first token **62 ms**, peak RSS **61 MB**.

_Generated 2026-10-12T06:22:10Z on Linux x86_64 (6.17.0-1022-azure). [How this is measured](#benchmarks) · [raw JSON](bench/results.json)_
