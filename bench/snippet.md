![harness bench dashboard](bench/bench.svg)

| agent | bundle | `--version` | TUI 1st byte | TUI 1st input | input latency 1s | idle PSS |
|---|---|---|---|---|---|---|
| **fox-agent** | 99 MB | 12 ms | **14 ms** | **374 ms** | **1 ms** | 35 MB |
| claude code | 267 MB | 9 ms | **142 ms** | — | — | 188 MB |
| codex | 140 MB | 32 ms | **33 ms** | **789 ms** | **1 ms** | 49 MB |
| opencode v2 | 207 MB | 57 ms | **90 ms** | **451 ms** | **42 ms** | 126 MB |
| jcode | 167 MB | 7 ms | **9 ms** | **628 ms** | **0 ms** | 30 MB |
| pi | 140 MB | 145 ms | **196 ms** | **683 ms** | **5 ms** | 130 MB |
| gemini cli | 140 MB | 882 ms | **964 ms** | **973 ms** | **0 ms** | — |
| copilot cli | 140 MB | 70 ms | **507 ms** | — | — | 47 MB |
| crush | 140 MB | 160 ms | **402 ms** | **794 ms** | **40 ms** | 68 MB |
| goose | 308 MB | 6 ms | **6 ms** | **367 ms** | **0 ms** | 105 MB |
| aider | 140 MB | 493 ms | **427 ms** | **808 ms** | **6 ms** | 67 MB |
| amp | 135 MB | 161 ms | **168 ms** | **521 ms** | **0 ms** | 163 MB |
| cursor-agent | 140 MB | 279 ms | **264 ms** | — | — | 237 MB |
| qwen code | 140 MB | 26 ms | **526 ms** | **934 ms** | — | 289 MB |
| codebuff | 140 MB | 690 ms | **633 ms** | **1196 ms** | **109 ms** | 58 MB |
| kilo code | 140 MB | 620 ms | **1708 ms** | **4984 ms** | **694 ms** | 46 MB |
| droid | 293 MB | 99 ms | **70 ms** | **3111 ms** | **662 ms** | 218 MB |
| kimi code | 192 MB | 372 ms | **482 ms** | **857 ms** | **3 ms** | 355 MB |
| devin | 200 MB | 3 ms | **17 ms** | **1022 ms** | **1641 ms** | 97 MB |
| cline | 140 MB | 625 ms | **807 ms** | — | — | 55 MB |
| continue | 140 MB | 728 ms | — | — | — | 317 MB |
| iflow cli | 140 MB | 814 ms | **863 ms** | **1591 ms** | **45 ms** | 58 MB |

<details><summary>full precision · all collected fields</summary>

| agent | version | bin | bundle (MB) | bundle kind | `--version` (ms) | TUI 1st byte (ms) | TUI 1st input (ms) | input latency 1s (ms) | idle PSS (MB) |
|---|---|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.5.0-beta.1 | `/home/runner/work/fox-agent/fox-agent/bin/fox` | 99.0 | bin | 11.5 | 13.6 | 374.0 | 0.6 | 34.5 |
| claude code | 2.1.300 (Claude Code) | `/home/runner/.npm-global/bin/claude` | 267.0 | bin | 8.9 | 141.9 | — | — | 187.6 |
| codex | codex-cli 0.162.1 | `/home/runner/.npm-global/bin/codex` | 140.0 | bin | 31.8 | 33.1 | 789.2 | 1.5 | 49.0 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | `/home/runner/.npm-global/bin/opencode2` | 207.4 | bin | 57.4 | 89.5 | 451.0 | 42.3 | 125.8 |
| jcode | jcode v0.98.1 (1c7426eb1) | `/home/runner/.local/bin/jcode` | 166.8 | bin | 7.1 | 8.8 | 627.8 | 0.3 | 30.1 |
| pi | 1.2.0 | `/home/runner/.npm-global/bin/pi` | 140.0 | bin | 144.8 | 196.2 | 682.6 | 5.2 | 129.9 |
| gemini cli | 0.64.0 | `/home/runner/.npm-global/bin/gemini` | 140.0 | bin | 882.3 | 963.6 | 972.8 | 0.1 | — |
| copilot cli | GitHub Copilot CLI 1.0.98. | `/home/runner/.npm-global/bin/copilot` | 140.0 | bin | 70.3 | 507.2 | — | — | 47.3 |
| crush | crush version v0.98.1 | `/home/runner/.npm-global/bin/crush` | 140.0 | bin | 159.6 | 401.6 | 794.2 | 39.5 | 68.2 |
| goose | 1.54.0 | `/home/runner/.local/bin/goose` | 307.8 | bin | 5.8 | 5.5 | 367.0 | 0.2 | 105.4 |
| aider | aider 0.86.2 | `/home/runner/work/fox-agent/fox-agent/.venv-bench/bin/aider` | 140.0 | bin | 493.3 | 427.1 | 808.0 | 5.7 | 66.8 |
| amp | 0.0.1792051250-g2fc5c0 (released 2026-10-15T08:00:50.000Z, 5 | `/home/runner/.local/bin/amp` | 134.5 | bin | 160.8 | 167.7 | 520.8 | 0.4 | 163.3 |
| cursor-agent | 2026.10.14-941492e | `/home/runner/.local/bin/cursor-agent` | 140.0 | bin | 279.1 | 264.3 | — | — | 236.6 |
| qwen code | 0.25.1 | `/home/runner/.npm-global/bin/qwen` | 140.0 | bin | 26.4 | 525.8 | 934.3 | — | 289.1 |
| codebuff | 1.0.688 | `/home/runner/.npm-global/bin/codebuff` | 140.0 | bin | 689.7 | 633.2 | 1196.0 | 109.0 | 57.6 |
| kilo code | 7.8.8 | `/home/runner/.npm-global/bin/kilocode` | 140.0 | bin | 620.4 | 1707.8 | 4984.2 | 693.8 | 46.2 |
| droid | 0.242.0 | `/home/runner/.local/bin/droid` | 292.6 | bin | 99.3 | 70.5 | 3111.2 | 662.3 | 218.1 |
| kimi code | 2.2.0 | `/home/runner/.kimi-code/bin/kimi` | 191.9 | bin | 372.4 | 481.9 | 857.3 | 3.0 | 355.4 |
| devin | devin 3000.11.92 (7f4e64980e22) | `/home/runner/.local/bin/devin` | 200.4 | bin | 3.5 | 16.9 | 1022.2 | 1640.9 | 96.8 |
| cline | 3.0.71 | `/home/runner/.npm-global/bin/cline` | 140.0 | bin | 624.7 | 806.9 | — | — | 55.0 |
| continue | 1.5.47 | `/home/runner/.npm-global/bin/cn` | 140.0 | bin | 727.9 | — | — | — | 316.9 |
| iflow cli | 0.5.19 | `/home/runner/.npm-global/bin/iflow` | 140.0 | bin | 813.8 | 863.3 | 1590.5 | 45.1 | 57.8 |

</details>

fox-agent headless vs scripted local provider: time to first token **39 ms**, peak RSS **60 MB**.

_Generated 2026-10-15T09:04:51Z on Linux x86_64 (6.17.0-1022-azure). [How this is measured](#benchmarks) · [raw JSON](bench/results.json)_
