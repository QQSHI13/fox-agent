![harness bench dashboard](bench/bench.svg)

| agent | bundle | `--version` | TUI 1st byte | TUI 1st input | input latency 1s | idle PSS |
|---|---|---|---|---|---|---|
| **fox-agent** | 120 MB | 13 ms | **15 ms** | — | — | 36 MB |
| claude code | 257 MB | 8 ms | **165 ms** | — | — | 187 MB |
| codex | 140 MB | 32 ms | **32 ms** | — | — | 49 MB |
| opencode v2 | 207 MB | 61 ms | **98 ms** | **461 ms** | **35 ms** | 126 MB |
| jcode | 138 MB | 8 ms | **10 ms** | — | — | 27 MB |
| pi | 140 MB | 144 ms | **192 ms** | **695 ms** | **5 ms** | 131 MB |
| gemini cli | 140 MB | 953 ms | **1022 ms** | **1015 ms** | — | — |
| copilot cli | 140 MB | 66 ms | **504 ms** | — | — | 47 MB |
| crush | 140 MB | 96 ms | **382 ms** | — | — | 68 MB |
| goose | 308 MB | 6 ms | **6 ms** | **178 ms** | — | — |
| aider | 140 MB | 542 ms | **459 ms** | **833 ms** | **6 ms** | 67 MB |
| amp | 134 MB | 179 ms | **181 ms** | **537 ms** | **0 ms** | 161 MB |
| cursor-agent | 140 MB | 300 ms | **283 ms** | — | — | 219 MB |
| qwen code | 140 MB | 30 ms | **506 ms** | — | — | 291 MB |
| codebuff | 140 MB | 608 ms | **581 ms** | — | — | 58 MB |
| kilo code | 140 MB | 537 ms | **1549 ms** | — | — | 46 MB |
| droid | 281 MB | 51 ms | **59 ms** | — | — | 228 MB |
| kimi code | 191 MB | 351 ms | **453 ms** | — | — | 351 MB |
| devin | 195 MB | 3 ms | **32 ms** | — | — | 49 MB |
| cline | 140 MB | 603 ms | **773 ms** | — | — | 55 MB |
| continue | 140 MB | 672 ms | — | — | — | 318 MB |
| iflow cli | 140 MB | 771 ms | **810 ms** | **1551 ms** | **45 ms** | 58 MB |

<details><summary>full precision · all collected fields</summary>

| agent | version | bin | bundle (MB) | bundle kind | `--version` (ms) | TUI 1st byte (ms) | TUI 1st input (ms) | input latency 1s (ms) | idle PSS (MB) |
|---|---|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.5.0-beta.1 | `/home/runner/work/fox-agent/fox-agent/bin/fox` | 120.3 | bin | 12.6 | 15.0 | — | — | 36.2 |
| claude code | 2.1.296 (Claude Code) | `/home/runner/.npm-global/bin/claude` | 257.1 | bin | 8.2 | 165.4 | — | — | 187.0 |
| codex | codex-cli 0.162.1 | `/home/runner/.npm-global/bin/codex` | 140.0 | bin | 32.4 | 32.0 | — | — | 49.1 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | `/home/runner/.npm-global/bin/opencode2` | 207.4 | bin | 60.7 | 97.5 | 461.4 | 35.5 | 125.7 |
| jcode | jcode v0.95.0 (6487bbd7e) | `/home/runner/.local/bin/jcode` | 138.2 | bin | 7.7 | 10.0 | — | — | 27.2 |
| pi | 1.1.0 | `/home/runner/.npm-global/bin/pi` | 140.0 | bin | 143.9 | 191.6 | 695.5 | 5.1 | 131.4 |
| gemini cli | 0.63.0 | `/home/runner/.npm-global/bin/gemini` | 140.0 | bin | 953.3 | 1022.0 | 1014.6 | — | — |
| copilot cli | GitHub Copilot CLI 1.0.95. | `/home/runner/.npm-global/bin/copilot` | 140.0 | bin | 65.5 | 503.8 | — | — | 47.3 |
| crush | crush version v0.98.1 | `/home/runner/.npm-global/bin/crush` | 140.0 | bin | 96.2 | 382.1 | — | — | 68.0 |
| goose | 1.54.0 | `/home/runner/.local/bin/goose` | 307.8 | bin | 6.2 | 6.1 | 178.3 | — | — |
| aider | aider 0.86.2 | `/home/runner/work/fox-agent/fox-agent/.venv-bench/bin/aider` | 140.0 | bin | 541.9 | 458.7 | 833.5 | 6.4 | 66.8 |
| amp | 0.0.1791792883-gf1ab8d (released 2026-10-12T08:14:43.000Z, 2 | `/home/runner/.local/bin/amp` | 134.2 | bin | 178.5 | 181.3 | 536.6 | 0.5 | 161.4 |
| cursor-agent | 2026.10.01-e373342 | `/home/runner/.local/bin/cursor-agent` | 140.0 | bin | 300.1 | 283.0 | — | — | 218.6 |
| qwen code | 0.25.1 | `/home/runner/.npm-global/bin/qwen` | 140.0 | bin | 30.3 | 505.6 | — | — | 291.3 |
| codebuff | 1.0.688 | `/home/runner/.npm-global/bin/codebuff` | 140.0 | bin | 607.6 | 581.0 | — | — | 57.6 |
| kilo code | 7.8.8 | `/home/runner/.npm-global/bin/kilocode` | 140.0 | bin | 537.0 | 1549.3 | — | — | 46.1 |
| droid | 0.238.0 | `/home/runner/.local/bin/droid` | 281.4 | bin | 50.5 | 59.2 | — | — | 227.6 |
| kimi code | 2.1.1 | `/home/runner/.kimi-code/bin/kimi` | 190.8 | bin | 350.9 | 452.8 | — | — | 351.3 |
| devin | devin 3000.11.3 (9c803229faa4) | `/home/runner/.local/bin/devin` | 195.0 | bin | 2.9 | 31.7 | — | — | 48.9 |
| cline | 3.0.70 | `/home/runner/.npm-global/bin/cline` | 140.0 | bin | 602.8 | 772.9 | — | — | 54.9 |
| continue | 1.5.47 | `/home/runner/.npm-global/bin/cn` | 140.0 | bin | 671.8 | — | — | — | 317.9 |
| iflow cli | 0.5.19 | `/home/runner/.npm-global/bin/iflow` | 140.0 | bin | 771.0 | 810.3 | 1550.6 | 44.7 | 57.9 |

</details>

fox-agent headless vs scripted local provider: time to first token **38 ms**, peak RSS **61 MB**.

_Generated 2026-10-12T11:13:48Z on Linux x86_64 (6.17.0-1022-azure). [How this is measured](#benchmarks) · [raw JSON](bench/results.json)_
