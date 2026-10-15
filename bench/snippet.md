![harness bench dashboard](bench/bench.svg)

| agent | bundle | `--version` | TUI 1st byte | TUI 1st input | input latency 1s | idle PSS |
|---|---|---|---|---|---|---|
| **fox-agent** | 99 MB | 9 ms | **12 ms** | **372 ms** | **1 ms** | 35 MB |
| claude code | 267 MB | 8 ms | **134 ms** | — | — | 196 MB |
| codex | 140 MB | 32 ms | **33 ms** | **801 ms** | **2 ms** | 49 MB |
| opencode v2 | 207 MB | 54 ms | **88 ms** | **450 ms** | **43 ms** | 123 MB |
| jcode | 167 MB | 7 ms | **8 ms** | **637 ms** | **0 ms** | 31 MB |
| pi | 140 MB | 151 ms | **200 ms** | **683 ms** | **5 ms** | 130 MB |
| gemini cli | 140 MB | 888 ms | **956 ms** | **998 ms** | — | — |
| copilot cli | 140 MB | 71 ms | **531 ms** | — | — | 47 MB |
| crush | 140 MB | 100 ms | **540 ms** | **837 ms** | **40 ms** | 68 MB |
| goose | 308 MB | 5 ms | **5 ms** | **365 ms** | **0 ms** | 106 MB |
| aider | 140 MB | 526 ms | **427 ms** | **820 ms** | **6 ms** | 67 MB |
| amp | 135 MB | 154 ms | **164 ms** | **534 ms** | **0 ms** | 162 MB |
| cursor-agent | 140 MB | 277 ms | **261 ms** | — | — | 238 MB |
| qwen code | 140 MB | 24 ms | **494 ms** | **881 ms** | — | 293 MB |
| codebuff | 140 MB | 642 ms | **590 ms** | **1099 ms** | **105 ms** | 58 MB |
| kilo code | 140 MB | 540 ms | **1555 ms** | **4595 ms** | **655 ms** | 46 MB |
| droid | 293 MB | 52 ms | **59 ms** | **3074 ms** | **651 ms** | 219 MB |
| kimi code | 192 MB | 359 ms | **449 ms** | **840 ms** | **2 ms** | 358 MB |
| devin | 200 MB | 3 ms | **17 ms** | **1019 ms** | **1640 ms** | 97 MB |
| cline | 140 MB | 563 ms | **750 ms** | — | — | 55 MB |
| continue | 140 MB | 706 ms | — | — | — | 317 MB |
| iflow cli | 140 MB | 763 ms | **807 ms** | **1539 ms** | **45 ms** | 58 MB |

<details><summary>full precision · all collected fields</summary>

| agent | version | bin | bundle (MB) | bundle kind | `--version` (ms) | TUI 1st byte (ms) | TUI 1st input (ms) | input latency 1s (ms) | idle PSS (MB) |
|---|---|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.5.0-beta.1 | `/home/runner/work/fox-agent/fox-agent/bin/fox` | 99.0 | bin | 9.4 | 11.6 | 372.4 | 0.5 | 35.3 |
| claude code | 2.1.300 (Claude Code) | `/home/runner/.npm-global/bin/claude` | 267.0 | bin | 7.7 | 134.5 | — | — | 195.7 |
| codex | codex-cli 0.162.1 | `/home/runner/.npm-global/bin/codex` | 140.0 | bin | 32.2 | 32.6 | 801.1 | 1.5 | 49.0 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | `/home/runner/.npm-global/bin/opencode2` | 207.4 | bin | 54.0 | 88.5 | 450.0 | 43.3 | 122.9 |
| jcode | jcode v0.98.1 (1c7426eb1) | `/home/runner/.local/bin/jcode` | 166.8 | bin | 6.5 | 8.3 | 636.7 | 0.3 | 31.1 |
| pi | 1.2.0 | `/home/runner/.npm-global/bin/pi` | 140.0 | bin | 150.9 | 199.6 | 682.8 | 5.4 | 130.1 |
| gemini cli | 0.64.0 | `/home/runner/.npm-global/bin/gemini` | 140.0 | bin | 887.7 | 955.8 | 997.9 | — | — |
| copilot cli | GitHub Copilot CLI 1.0.98. | `/home/runner/.npm-global/bin/copilot` | 140.0 | bin | 71.4 | 531.5 | — | — | 47.3 |
| crush | crush version v0.98.1 | `/home/runner/.npm-global/bin/crush` | 140.0 | bin | 100.1 | 540.5 | 836.7 | 39.5 | 68.2 |
| goose | 1.54.0 | `/home/runner/.local/bin/goose` | 307.8 | bin | 5.4 | 5.2 | 365.5 | 0.2 | 105.7 |
| aider | aider 0.86.2 | `/home/runner/work/fox-agent/fox-agent/.venv-bench/bin/aider` | 140.0 | bin | 525.8 | 427.0 | 820.2 | 5.9 | 66.9 |
| amp | 0.0.1792036844-g99022c (released 2026-10-15T04:00:44.000Z, 1 | `/home/runner/.local/bin/amp` | 134.5 | bin | 153.9 | 164.3 | 533.5 | 0.5 | 161.5 |
| cursor-agent | 2026.10.14-941492e | `/home/runner/.local/bin/cursor-agent` | 140.0 | bin | 276.5 | 260.9 | — | — | 238.0 |
| qwen code | 0.25.1 | `/home/runner/.npm-global/bin/qwen` | 140.0 | bin | 24.3 | 493.5 | 881.1 | — | 292.5 |
| codebuff | 1.0.688 | `/home/runner/.npm-global/bin/codebuff` | 140.0 | bin | 642.5 | 589.6 | 1099.0 | 105.2 | 57.7 |
| kilo code | 7.8.8 | `/home/runner/.npm-global/bin/kilocode` | 140.0 | bin | 539.7 | 1555.4 | 4595.0 | 654.8 | 46.2 |
| droid | 0.242.0 | `/home/runner/.local/bin/droid` | 292.6 | bin | 52.1 | 59.0 | 3073.7 | 651.1 | 219.3 |
| kimi code | 2.2.0 | `/home/runner/.kimi-code/bin/kimi` | 191.9 | bin | 358.7 | 449.4 | 839.6 | 2.5 | 357.9 |
| devin | devin 3000.11.92 (7f4e64980e22) | `/home/runner/.local/bin/devin` | 200.4 | bin | 3.0 | 17.1 | 1019.4 | 1639.9 | 96.6 |
| cline | 3.0.71 | `/home/runner/.npm-global/bin/cline` | 140.0 | bin | 562.7 | 749.9 | — | — | 54.9 |
| continue | 1.5.47 | `/home/runner/.npm-global/bin/cn` | 140.0 | bin | 706.5 | — | — | — | 317.3 |
| iflow cli | 0.5.19 | `/home/runner/.npm-global/bin/iflow` | 140.0 | bin | 763.3 | 807.3 | 1539.3 | 44.5 | 58.0 |

</details>

fox-agent headless vs scripted local provider: time to first token **42 ms**, peak RSS **60 MB**.

_Generated 2026-10-15T05:27:02Z on Linux x86_64 (6.17.0-1022-azure). [How this is measured](#benchmarks) · [raw JSON](bench/results.json)_
