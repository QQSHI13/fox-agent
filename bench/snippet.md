![harness bench dashboard](bench/bench.svg)

| agent | bundle | `--version` | TUI 1st byte | TUI 1st input | input latency 1s | idle PSS |
|---|---|---|---|---|---|---|
| **fox-agent** | 120 MB | 17 ms | **18 ms** | — | — | 37 MB |
| claude code | 257 MB | 9 ms | **200 ms** | — | — | 187 MB |
| codex | 140 MB | 41 ms | **43 ms** | — | — | 49 MB |
| opencode v2 | 207 MB | 86 ms | **137 ms** | **509 ms** | **57 ms** | 126 MB |
| jcode | 138 MB | 9 ms | **11 ms** | — | — | 28 MB |
| pi | 140 MB | 231 ms | **308 ms** | **808 ms** | **8 ms** | 130 MB |
| gemini cli | 140 MB | 1485 ms | **1565 ms** | **1616 ms** | **0 ms** | 146 MB |
| copilot cli | 140 MB | 100 ms | **753 ms** | — | — | 47 MB |
| crush | 140 MB | 127 ms | **580 ms** | — | — | 69 MB |
| goose | 308 MB | 7 ms | **7 ms** | **201 ms** | **0 ms** | — |
| aider | 140 MB | 792 ms | **725 ms** | **1116 ms** | **10 ms** | 67 MB |
| amp | 134 MB | 247 ms | **246 ms** | **617 ms** | **1 ms** | 160 MB |
| cursor-agent | 140 MB | 452 ms | **426 ms** | — | — | 219 MB |
| qwen code | 140 MB | 36 ms | **804 ms** | — | — | 247 MB |
| codebuff | 140 MB | 869 ms | **871 ms** | — | — | 58 MB |
| kilo code | 140 MB | 840 ms | **2495 ms** | — | — | 46 MB |
| droid | 281 MB | 92 ms | **109 ms** | — | — | 232 MB |
| kimi code | 191 MB | 581 ms | **729 ms** | — | — | 347 MB |
| devin | 195 MB | 4 ms | **48 ms** | — | — | 48 MB |
| cline | 140 MB | 880 ms | **1093 ms** | — | — | 55 MB |
| continue | 140 MB | 1108 ms | — | — | — | 317 MB |
| iflow cli | 140 MB | 1186 ms | **1256 ms** | **2108 ms** | **47 ms** | 55 MB |

<details><summary>full precision · all collected fields</summary>

| agent | version | bin | bundle (MB) | bundle kind | `--version` (ms) | TUI 1st byte (ms) | TUI 1st input (ms) | input latency 1s (ms) | idle PSS (MB) |
|---|---|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.5.0-beta.1 | `/home/runner/work/fox-agent/fox-agent/bin/fox` | 120.3 | bin | 17.3 | 17.7 | — | — | 36.7 |
| claude code | 2.1.296 (Claude Code) | `/home/runner/.npm-global/bin/claude` | 257.1 | bin | 8.7 | 200.4 | — | — | 187.3 |
| codex | codex-cli 0.162.1 | `/home/runner/.npm-global/bin/codex` | 140.0 | bin | 40.6 | 42.9 | — | — | 49.0 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | `/home/runner/.npm-global/bin/opencode2` | 207.4 | bin | 85.5 | 136.5 | 509.4 | 57.5 | 126.3 |
| jcode | jcode v0.95.0 (6487bbd7e) | `/home/runner/.local/bin/jcode` | 138.2 | bin | 9.0 | 11.2 | — | — | 27.9 |
| pi | 1.1.0 | `/home/runner/.npm-global/bin/pi` | 140.0 | bin | 231.0 | 307.6 | 808.4 | 7.9 | 130.3 |
| gemini cli | 0.63.0 | `/home/runner/.npm-global/bin/gemini` | 140.0 | bin | 1485.2 | 1564.9 | 1616.1 | 0.2 | 145.7 |
| copilot cli | GitHub Copilot CLI 1.0.95. | `/home/runner/.npm-global/bin/copilot` | 140.0 | bin | 99.6 | 752.8 | — | — | 47.4 |
| crush | crush version v0.98.1 | `/home/runner/.npm-global/bin/crush` | 140.0 | bin | 127.4 | 579.9 | — | — | 69.0 |
| goose | 1.54.0 | `/home/runner/.local/bin/goose` | 307.8 | bin | 7.3 | 7.3 | 201.0 | 0.2 | — |
| aider | aider 0.86.2 | `/home/runner/work/fox-agent/fox-agent/.venv-bench/bin/aider` | 140.0 | bin | 792.3 | 724.7 | 1116.2 | 10.1 | 66.9 |
| amp | 0.0.1791778148-g902162 (released 2026-10-12T04:09:08.000Z, 1 | `/home/runner/.local/bin/amp` | 134.2 | bin | 247.1 | 245.8 | 617.2 | 0.6 | 159.9 |
| cursor-agent | 2026.10.01-e373342 | `/home/runner/.local/bin/cursor-agent` | 140.0 | bin | 452.2 | 425.6 | — | — | 219.3 |
| qwen code | 0.25.1 | `/home/runner/.npm-global/bin/qwen` | 140.0 | bin | 36.0 | 804.3 | — | — | 247.2 |
| codebuff | 1.0.688 | `/home/runner/.npm-global/bin/codebuff` | 140.0 | bin | 869.3 | 870.9 | — | — | 57.5 |
| kilo code | 7.8.8 | `/home/runner/.npm-global/bin/kilocode` | 140.0 | bin | 840.4 | 2495.2 | — | — | 46.2 |
| droid | 0.238.0 | `/home/runner/.local/bin/droid` | 281.4 | bin | 91.7 | 109.4 | — | — | 231.9 |
| kimi code | 2.1.1 | `/home/runner/.kimi-code/bin/kimi` | 190.8 | bin | 581.1 | 729.4 | — | — | 346.7 |
| devin | devin 3000.11.3 (9c803229faa4) | `/home/runner/.local/bin/devin` | 195.0 | bin | 3.8 | 48.0 | — | — | 48.3 |
| cline | 3.0.70 | `/home/runner/.npm-global/bin/cline` | 140.0 | bin | 880.3 | 1093.5 | — | — | 55.0 |
| continue | 1.5.47 | `/home/runner/.npm-global/bin/cn` | 140.0 | bin | 1107.5 | — | — | — | 317.3 |
| iflow cli | 0.5.19 | `/home/runner/.npm-global/bin/iflow` | 140.0 | bin | 1185.6 | 1256.0 | 2108.4 | 46.9 | 55.4 |

</details>

fox-agent headless vs scripted local provider: time to first token **59 ms**, peak RSS **61 MB**.

_Generated 2026-10-12T06:06:00Z on Linux x86_64 (6.17.0-1022-azure). [How this is measured](#benchmarks) · [raw JSON](bench/results.json)_
