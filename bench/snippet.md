![harness bench dashboard](bench/bench.svg)

| agent | bundle | `--version` | TUI 1st byte | TUI 1st input | input latency 1s | idle PSS |
|---|---|---|---|---|---|---|
| **fox-agent** | 120 MB | 12 ms | **14 ms** | — | — | 36 MB |
| claude code | 257 MB | 6 ms | **133 ms** | — | — | 187 MB |
| codex | 140 MB | 34 ms | **33 ms** | — | — | 49 MB |
| opencode v2 | 207 MB | 59 ms | **97 ms** | **457 ms** | **35 ms** | 125 MB |
| jcode | 138 MB | 7 ms | **9 ms** | — | — | 27 MB |
| pi | 140 MB | 149 ms | **186 ms** | **698 ms** | **5 ms** | 132 MB |
| gemini cli | 140 MB | 928 ms | **975 ms** | **1021 ms** | **0 ms** | — |
| copilot cli | 140 MB | 68 ms | **486 ms** | — | — | 47 MB |
| crush | 140 MB | 95 ms | **430 ms** | — | — | 69 MB |
| goose | 308 MB | 7 ms | **7 ms** | **168 ms** | — | — |
| aider | 140 MB | 571 ms | **451 ms** | **832 ms** | **6 ms** | 67 MB |
| amp | 134 MB | 160 ms | **171 ms** | **532 ms** | **0 ms** | 159 MB |
| cursor-agent | 140 MB | 279 ms | **252 ms** | — | — | 219 MB |
| qwen code | 140 MB | 28 ms | **507 ms** | — | — | 290 MB |
| codebuff | 140 MB | 613 ms | **590 ms** | — | — | 58 MB |
| kilo code | 140 MB | 583 ms | **1630 ms** | — | — | 46 MB |
| droid | 281 MB | 92 ms | **65 ms** | — | — | 235 MB |
| kimi code | 191 MB | 392 ms | **513 ms** | — | — | 353 MB |
| devin | 195 MB | 3 ms | **32 ms** | — | — | 49 MB |
| cline | 140 MB | 684 ms | **876 ms** | — | — | 55 MB |
| continue | 140 MB | 778 ms | — | — | — | 318 MB |
| iflow cli | 140 MB | 813 ms | **860 ms** | **1675 ms** | **46 ms** | 58 MB |

<details><summary>full precision · all collected fields</summary>

| agent | version | bin | bundle (MB) | bundle kind | `--version` (ms) | TUI 1st byte (ms) | TUI 1st input (ms) | input latency 1s (ms) | idle PSS (MB) |
|---|---|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.5.0-beta.1 | `/home/runner/work/fox-agent/fox-agent/bin/fox` | 120.3 | bin | 12.0 | 13.9 | — | — | 36.4 |
| claude code | 2.1.296 (Claude Code) | `/home/runner/.npm-global/bin/claude` | 257.1 | bin | 6.5 | 133.3 | — | — | 187.2 |
| codex | codex-cli 0.162.1 | `/home/runner/.npm-global/bin/codex` | 140.0 | bin | 33.6 | 32.8 | — | — | 49.0 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | `/home/runner/.npm-global/bin/opencode2` | 207.4 | bin | 58.9 | 96.8 | 457.2 | 35.0 | 124.7 |
| jcode | jcode v0.95.0 (6487bbd7e) | `/home/runner/.local/bin/jcode` | 138.2 | bin | 6.9 | 9.1 | — | — | 26.8 |
| pi | 1.1.0 | `/home/runner/.npm-global/bin/pi` | 140.0 | bin | 148.8 | 186.2 | 698.2 | 5.2 | 131.9 |
| gemini cli | 0.63.0 | `/home/runner/.npm-global/bin/gemini` | 140.0 | bin | 927.6 | 974.8 | 1020.9 | 0.1 | — |
| copilot cli | GitHub Copilot CLI 1.0.95. | `/home/runner/.npm-global/bin/copilot` | 140.0 | bin | 68.0 | 486.3 | — | — | 47.3 |
| crush | crush version v0.98.1 | `/home/runner/.npm-global/bin/crush` | 140.0 | bin | 95.2 | 430.2 | — | — | 68.6 |
| goose | 1.54.0 | `/home/runner/.local/bin/goose` | 307.8 | bin | 7.0 | 7.1 | 168.4 | — | — |
| aider | aider 0.86.2 | `/home/runner/work/fox-agent/fox-agent/.venv-bench/bin/aider` | 140.0 | bin | 571.3 | 450.8 | 831.8 | 5.7 | 66.9 |
| amp | 0.0.1791792883-gf1ab8d (released 2026-10-12T08:14:43.000Z, 2 | `/home/runner/.local/bin/amp` | 134.2 | bin | 159.8 | 170.7 | 532.0 | 0.5 | 159.0 |
| cursor-agent | 2026.10.01-e373342 | `/home/runner/.local/bin/cursor-agent` | 140.0 | bin | 278.7 | 252.0 | — | — | 219.3 |
| qwen code | 0.25.1 | `/home/runner/.npm-global/bin/qwen` | 140.0 | bin | 28.0 | 506.8 | — | — | 289.6 |
| codebuff | 1.0.688 | `/home/runner/.npm-global/bin/codebuff` | 140.0 | bin | 613.1 | 589.7 | — | — | 57.7 |
| kilo code | 7.8.8 | `/home/runner/.npm-global/bin/kilocode` | 140.0 | bin | 583.3 | 1629.5 | — | — | 46.2 |
| droid | 0.238.0 | `/home/runner/.local/bin/droid` | 281.4 | bin | 92.3 | 65.2 | — | — | 234.8 |
| kimi code | 2.1.1 | `/home/runner/.kimi-code/bin/kimi` | 190.8 | bin | 392.4 | 513.4 | — | — | 352.5 |
| devin | devin 3000.11.3 (9c803229faa4) | `/home/runner/.local/bin/devin` | 195.0 | bin | 3.0 | 32.1 | — | — | 48.7 |
| cline | 3.0.70 | `/home/runner/.npm-global/bin/cline` | 140.0 | bin | 684.0 | 876.1 | — | — | 54.9 |
| continue | 1.5.47 | `/home/runner/.npm-global/bin/cn` | 140.0 | bin | 777.6 | — | — | — | 317.9 |
| iflow cli | 0.5.19 | `/home/runner/.npm-global/bin/iflow` | 140.0 | bin | 812.6 | 859.5 | 1674.9 | 45.6 | 57.9 |

</details>

fox-agent headless vs scripted local provider: time to first token **45 ms**, peak RSS **61 MB**.

_Generated 2026-10-12T11:26:36Z on Linux x86_64 (6.17.0-1022-azure). [How this is measured](#benchmarks) · [raw JSON](bench/results.json)_
