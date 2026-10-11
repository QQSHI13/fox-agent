![harness bench dashboard](bench/bench.svg)

| agent | bundle | `--version` | TUI 1st byte | TUI 1st input | input latency 1s | idle PSS |
|---|---|---|---|---|---|---|
| **fox-agent** | 99 MB | 10 ms | **10 ms** | — | — | 33 MB |
| claude code | 257 MB | 6 ms | **146 ms** | — | — | 187 MB |
| codex | 140 MB | 32 ms | **36 ms** | — | — | 49 MB |
| opencode v2 | 207 MB | 54 ms | **95 ms** | **458 ms** | **49 ms** | 126 MB |
| jcode | 137 MB | 6 ms | **9 ms** | — | — | 28 MB |
| pi | 140 MB | 156 ms | **210 ms** | **702 ms** | **6 ms** | 131 MB |
| gemini cli | 140 MB | 993 ms | **1061 ms** | **1233 ms** | — | — |
| copilot cli | 140 MB | 67 ms | **513 ms** | — | — | 47 MB |
| crush | 140 MB | 94 ms | **416 ms** | — | — | 68 MB |
| goose | 308 MB | 4 ms | **5 ms** | — | — | — |
| aider | 140 MB | 494 ms | **447 ms** | **864 ms** | **7 ms** | 67 MB |
| amp | 134 MB | 170 ms | **179 ms** | **545 ms** | **1 ms** | 160 MB |
| cursor-agent | 140 MB | 293 ms | **282 ms** | — | — | 214 MB |
| qwen code | 140 MB | 25 ms | **523 ms** | — | — | 297 MB |
| codebuff | 140 MB | 677 ms | **661 ms** | — | — | 58 MB |
| kilo code | 140 MB | 609 ms | **1720 ms** | — | — | 46 MB |
| droid | 281 MB | 86 ms | **69 ms** | — | — | 228 MB |
| kimi code | 191 MB | 396 ms | **501 ms** | **898 ms** | **7 ms** | 354 MB |
| devin | 195 MB | 2 ms | **28 ms** | — | — | 49 MB |
| cline | 140 MB | 650 ms | **808 ms** | — | — | 55 MB |
| continue | 140 MB | 793 ms | — | — | — | 318 MB |
| iflow cli | 140 MB | 806 ms | **868 ms** | **1615 ms** | **45 ms** | 58 MB |

<details><summary>full precision · all collected fields</summary>

| agent | version | bin | bundle (MB) | bundle kind | `--version` (ms) | TUI 1st byte (ms) | TUI 1st input (ms) | input latency 1s (ms) | idle PSS (MB) |
|---|---|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.5.0-beta.1 | `/home/runner/work/fox-agent/fox-agent/bin/fox` | 98.9 | bin | 9.8 | 10.1 | — | — | 33.2 |
| claude code | 2.1.296 (Claude Code) | `/home/runner/.npm-global/bin/claude` | 257.1 | bin | 5.5 | 145.7 | — | — | 187.2 |
| codex | codex-cli 0.162.1 | `/home/runner/.npm-global/bin/codex` | 140.0 | bin | 32.3 | 36.1 | — | — | 49.1 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | `/home/runner/.npm-global/bin/opencode2` | 207.4 | bin | 54.5 | 95.0 | 458.1 | 48.6 | 125.9 |
| jcode | jcode v0.94.0 (b6c63ff04) | `/home/runner/.local/bin/jcode` | 137.1 | bin | 6.3 | 8.7 | — | — | 27.6 |
| pi | 1.1.0 | `/home/runner/.npm-global/bin/pi` | 140.0 | bin | 156.5 | 209.9 | 702.0 | 6.1 | 131.2 |
| gemini cli | 0.63.0 | `/home/runner/.npm-global/bin/gemini` | 140.0 | bin | 993.1 | 1060.8 | 1232.8 | — | — |
| copilot cli | GitHub Copilot CLI 1.0.95. | `/home/runner/.npm-global/bin/copilot` | 140.0 | bin | 67.0 | 513.1 | — | — | 47.3 |
| crush | crush version v0.98.1 | `/home/runner/.npm-global/bin/crush` | 140.0 | bin | 94.3 | 415.8 | — | — | 68.3 |
| goose | 1.54.0 | `/home/runner/.local/bin/goose` | 307.8 | bin | 4.4 | 4.7 | — | — | — |
| aider | aider 0.86.2 | `/home/runner/work/fox-agent/fox-agent/.venv-bench/bin/aider` | 140.0 | bin | 494.3 | 447.0 | 863.9 | 6.9 | 66.8 |
| amp | 0.0.1791705634-g3bdda1 (released 2026-10-11T08:00:34.000Z, 1 | `/home/runner/.local/bin/amp` | 134.2 | bin | 170.1 | 178.6 | 544.8 | 0.7 | 159.7 |
| cursor-agent | 2026.10.01-e373342 | `/home/runner/.local/bin/cursor-agent` | 140.0 | bin | 292.6 | 282.5 | — | — | 214.3 |
| qwen code | 0.25.0 | `/home/runner/.npm-global/bin/qwen` | 140.0 | bin | 25.4 | 522.9 | — | — | 296.8 |
| codebuff | 1.0.688 | `/home/runner/.npm-global/bin/codebuff` | 140.0 | bin | 677.2 | 661.3 | — | — | 57.7 |
| kilo code | 7.8.8 | `/home/runner/.npm-global/bin/kilocode` | 140.0 | bin | 609.0 | 1720.2 | — | — | 46.1 |
| droid | 0.238.0 | `/home/runner/.local/bin/droid` | 281.4 | bin | 85.9 | 68.6 | — | — | 227.5 |
| kimi code | 2.1.1 | `/home/runner/.kimi-code/bin/kimi` | 190.8 | bin | 396.1 | 500.7 | 898.4 | 7.0 | 353.6 |
| devin | devin 3000.11.3 (9c803229faa4) | `/home/runner/.local/bin/devin` | 195.0 | bin | 2.1 | 27.9 | — | — | 48.5 |
| cline | 3.0.70 | `/home/runner/.npm-global/bin/cline` | 140.0 | bin | 650.4 | 808.2 | — | — | 54.8 |
| continue | 1.5.47 | `/home/runner/.npm-global/bin/cn` | 140.0 | bin | 793.3 | — | — | — | 318.1 |
| iflow cli | 0.5.19 | `/home/runner/.npm-global/bin/iflow` | 140.0 | bin | 806.3 | 867.6 | 1615.5 | 45.5 | 58.0 |

</details>

fox-agent headless vs scripted local provider: time to first token **43 ms**, peak RSS **59 MB**.

_Generated 2026-10-11T09:47:26Z on Linux x86_64 (6.17.0-1022-azure). [How this is measured](#benchmarks) · [raw JSON](bench/results.json)_
