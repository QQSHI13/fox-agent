![harness bench dashboard](bench/bench.svg)

| agent | bundle | `--version` | TUI 1st byte | TUI 1st input | input latency 1s | idle PSS |
|---|---|---|---|---|---|---|
| **fox-agent** | 120 MB | 11 ms | **13 ms** | **372 ms** | **1 ms** | 37 MB |
| claude code | 257 MB | 7 ms | **135 ms** | — | — | 187 MB |
| codex | 140 MB | 30 ms | **31 ms** | **770 ms** | **2 ms** | 49 MB |
| opencode v2 | 207 MB | 55 ms | **87 ms** | **449 ms** | **42 ms** | 123 MB |
| jcode | 138 MB | 7 ms | **9 ms** | **589 ms** | **0 ms** | 28 MB |
| pi | 140 MB | 146 ms | **192 ms** | **673 ms** | **5 ms** | 131 MB |
| gemini cli | 140 MB | 877 ms | **945 ms** | **971 ms** | **0 ms** | — |
| copilot cli | 140 MB | 66 ms | **484 ms** | — | — | 47 MB |
| crush | 140 MB | 96 ms | **461 ms** | **855 ms** | **39 ms** | 69 MB |
| goose | 308 MB | 6 ms | **5 ms** | **366 ms** | **0 ms** | 105 MB |
| aider | 140 MB | 483 ms | **415 ms** | **805 ms** | **6 ms** | 67 MB |
| amp | 134 MB | 155 ms | **161 ms** | **522 ms** | **0 ms** | 161 MB |
| cursor-agent | 140 MB | 263 ms | **247 ms** | — | — | 215 MB |
| qwen code | 140 MB | 25 ms | **478 ms** | **878 ms** | — | 291 MB |
| codebuff | 140 MB | 619 ms | **589 ms** | **1084 ms** | **109 ms** | 58 MB |
| kilo code | 140 MB | 556 ms | **1588 ms** | **4534 ms** | **580 ms** | 46 MB |
| droid | 292 MB | 51 ms | **58 ms** | **3082 ms** | **657 ms** | 220 MB |
| kimi code | 191 MB | 351 ms | **452 ms** | **848 ms** | **3 ms** | 356 MB |
| devin | 195 MB | 3 ms | **30 ms** | **1032 ms** | **641 ms** | 49 MB |
| cline | 140 MB | 563 ms | **734 ms** | — | — | 55 MB |
| continue | 140 MB | 685 ms | — | — | — | 318 MB |
| iflow cli | 140 MB | 745 ms | **804 ms** | **1532 ms** | **44 ms** | 58 MB |

<details><summary>full precision · all collected fields</summary>

| agent | version | bin | bundle (MB) | bundle kind | `--version` (ms) | TUI 1st byte (ms) | TUI 1st input (ms) | input latency 1s (ms) | idle PSS (MB) |
|---|---|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.5.0-beta.1 | `/home/runner/work/fox-agent/fox-agent/bin/fox` | 120.4 | bin | 11.5 | 13.4 | 372.2 | 0.5 | 37.1 |
| claude code | 2.1.296 (Claude Code) | `/home/runner/.npm-global/bin/claude` | 257.1 | bin | 6.6 | 135.5 | — | — | 187.2 |
| codex | codex-cli 0.162.1 | `/home/runner/.npm-global/bin/codex` | 140.0 | bin | 30.1 | 30.7 | 770.4 | 1.5 | 49.0 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | `/home/runner/.npm-global/bin/opencode2` | 207.4 | bin | 54.6 | 87.0 | 449.0 | 41.7 | 123.2 |
| jcode | jcode v0.95.0 (6487bbd7e) | `/home/runner/.local/bin/jcode` | 138.2 | bin | 6.9 | 8.8 | 589.3 | 0.3 | 27.7 |
| pi | 1.2.0 | `/home/runner/.npm-global/bin/pi` | 140.0 | bin | 146.3 | 192.0 | 672.7 | 5.1 | 131.2 |
| gemini cli | 0.63.0 | `/home/runner/.npm-global/bin/gemini` | 140.0 | bin | 877.5 | 944.6 | 970.6 | 0.1 | — |
| copilot cli | GitHub Copilot CLI 1.0.96. | `/home/runner/.npm-global/bin/copilot` | 140.0 | bin | 66.1 | 484.0 | — | — | 47.3 |
| crush | crush version v0.98.1 | `/home/runner/.npm-global/bin/crush` | 140.0 | bin | 96.2 | 460.9 | 854.6 | 39.2 | 68.6 |
| goose | 1.54.0 | `/home/runner/.local/bin/goose` | 307.8 | bin | 5.8 | 5.5 | 366.0 | 0.2 | 105.1 |
| aider | aider 0.86.2 | `/home/runner/work/fox-agent/fox-agent/.venv-bench/bin/aider` | 140.0 | bin | 483.2 | 415.3 | 805.3 | 5.6 | 66.9 |
| amp | 0.0.1791878731-g2f7fd0 (released 2026-10-13T08:05:31.000Z, 1 | `/home/runner/.local/bin/amp` | 134.4 | bin | 154.8 | 160.8 | 522.0 | 0.5 | 161.1 |
| cursor-agent | 2026.10.01-e373342 | `/home/runner/.local/bin/cursor-agent` | 140.0 | bin | 262.6 | 247.3 | — | — | 215.1 |
| qwen code | 0.25.1 | `/home/runner/.npm-global/bin/qwen` | 140.0 | bin | 25.3 | 478.1 | 878.1 | — | 290.6 |
| codebuff | 1.0.688 | `/home/runner/.npm-global/bin/codebuff` | 140.0 | bin | 619.4 | 588.9 | 1083.8 | 109.3 | 57.7 |
| kilo code | 7.8.8 | `/home/runner/.npm-global/bin/kilocode` | 140.0 | bin | 555.7 | 1587.8 | 4534.3 | 580.1 | 46.1 |
| droid | 0.240.0 | `/home/runner/.local/bin/droid` | 291.7 | bin | 50.8 | 58.0 | 3081.9 | 657.1 | 219.6 |
| kimi code | 2.1.1 | `/home/runner/.kimi-code/bin/kimi` | 190.8 | bin | 350.6 | 451.7 | 848.0 | 3.0 | 355.6 |
| devin | devin 3000.11.3 (9c803229faa4) | `/home/runner/.local/bin/devin` | 195.0 | bin | 2.8 | 30.4 | 1032.2 | 640.9 | 48.8 |
| cline | 3.0.71 | `/home/runner/.npm-global/bin/cline` | 140.0 | bin | 562.7 | 733.6 | — | — | 55.1 |
| continue | 1.5.47 | `/home/runner/.npm-global/bin/cn` | 140.0 | bin | 685.3 | — | — | — | 317.9 |
| iflow cli | 0.5.19 | `/home/runner/.npm-global/bin/iflow` | 140.0 | bin | 745.4 | 804.2 | 1532.0 | 44.1 | 57.9 |

</details>

fox-agent headless vs scripted local provider: time to first token **41 ms**, peak RSS **61 MB**.

_Generated 2026-10-13T09:33:28Z on Linux x86_64 (6.17.0-1022-azure). [How this is measured](#benchmarks) · [raw JSON](bench/results.json)_
