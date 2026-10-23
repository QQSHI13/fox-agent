![harness bench dashboard](bench/bench.svg)

| agent | bundle | `--version` | TUI 1st byte | TUI 1st input | input latency | idle PSS |
|---|---|---|---|---|---|---|
| **fox-agent** | 118 MB | 6 ms | **13 ms** | **374 ms** | **1 ms** | 36 MB |
| claude code | 293 MB | 12 ms | **167 ms** | — | — | 196 MB |
| codex | 430 MB | 32 ms | **33 ms** | **807 ms** | **1 ms** | 49 MB |
| opencode v2 | 207 MB | 59 ms | **92 ms** | **458 ms** | **0 ms** | 125 MB |
| jcode | 171 MB | 7 ms | **10 ms** | **675 ms** | **0 ms** | 32 MB |
| pi | 112 MB | 159 ms | **204 ms** | **686 ms** | **5 ms** | 132 MB |
| pi-bolt | 262 MB | 11 ms | **30 ms** | **509 ms** | **1 ms** | 96 MB |
| gemini cli | 103 MB | 934 ms | **985 ms** | **1036 ms** | **0 ms** | — |
| copilot cli | 198 MB | 72 ms | **519 ms** | — | — | 47 MB |
| crush | 129 MB | 85 ms | **375 ms** | **785 ms** | **39 ms** | 68 MB |
| goose | 304 MB | 6 ms | **6 ms** | **366 ms** | **0 ms** | 109 MB |
| aider | 643 MB | 512 ms | **437 ms** | **838 ms** | **6 ms** | 67 MB |
| amp | 161 MB | 152 ms | **148 ms** | **522 ms** | **0 ms** | 138 MB |
| cursor-agent | 583 MB | 294 ms | **277 ms** | — | — | 252 MB |
| qwen code | 155 MB | 30 ms | **548 ms** | **944 ms** | **0 ms** | 295 MB |
| codebuff | 140 MB | 690 ms | **641 ms** | **1165 ms** | **0 ms** | 58 MB |
| kilo code | 661 MB | 597 ms | **1714 ms** | **4784 ms** | **1925 ms** | 46 MB |
| droid | 319 MB | 67 ms | **66 ms** | **3118 ms** | **1887 ms** | 290 MB |
| kimi code | 192 MB | 372 ms | **473 ms** | **867 ms** | **3 ms** | 357 MB |
| devin | 200 MB | 4 ms | **18 ms** | **1022 ms** | **143 ms** | 96 MB |
| cline | 330 MB | 677 ms | **814 ms** | — | — | 55 MB |
| continue | 83 MB | 755 ms | — | — | — | 317 MB |
| iflow cli | 180 MB | 801 ms | **854 ms** | **1593 ms** | **0 ms** | 58 MB |

<details><summary>full precision · all collected fields</summary>

| agent | version | bin | bundle (MB) | bundle kind | `--version` (ms) | TUI 1st byte (ms) | TUI 1st input (ms) | input latency (ms) | idle PSS (MB) |
|---|---|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.6.0 | `/home/runner/work/fox-agent/fox-agent/bin/fox` | 117.5 | bin | 5.9 | 12.8 | 374.5 | 0.5 | 35.6 |
| claude code | 2.1.309 (Claude Code) | `/home/runner/.npm-global/bin/claude` | 293.5 | bin | 11.9 | 166.7 | — | — | 196.3 |
| codex | codex-cli 0.163.0 | `/home/runner/.npm-global/bin/codex` | 430.0 | pkg | 32.2 | 33.4 | 806.8 | 0.5 | 49.0 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | `/home/runner/.npm-global/bin/opencode2` | 207.4 | bin | 58.7 | 92.3 | 457.9 | 0.1 | 125.4 |
| jcode | jcode v0.99.1 (7206efd0c) | `/home/runner/.local/bin/jcode` | 171.3 | bin | 7.4 | 9.6 | 674.7 | 0.3 | 32.1 |
| pi | 1.4.0 | `/home/runner/.npm-global/bin/pi` | 111.8 | pkg | 158.8 | 204.0 | 686.0 | 5.4 | 132.0 |
| pi-bolt | 1.4.0 (Pi-Bolt 0.9.9, linux-x64, JIT off) | `/home/runner/.local/bin/pi-bolt` | 262.0 | bin | 11.4 | 29.9 | 508.6 | 1.3 | 96.4 |
| gemini cli | 0.65.0 | `/home/runner/.npm-global/bin/gemini` | 102.6 | pkg | 934.0 | 984.8 | 1035.9 | 0.1 | — |
| copilot cli | GitHub Copilot CLI 1.0.103. | `/home/runner/.npm-global/bin/copilot` | 198.5 | pkg | 72.5 | 518.7 | — | — | 47.4 |
| crush | crush version v0.98.1 | `/home/runner/.npm-global/bin/crush` | 128.7 | pkg | 85.2 | 375.3 | 785.0 | 39.1 | 68.5 |
| goose | 1.55.0 | `/home/runner/.local/bin/goose` | 304.0 | bin | 5.9 | 5.7 | 366.2 | 0.2 | 109.0 |
| aider | aider 0.86.2 | `/home/runner/work/fox-agent/fox-agent/.venv-bench/bin/aider` | 642.8 | pkg | 511.8 | 436.9 | 837.8 | 6.0 | 66.8 |
| amp | 0.0.1792713681-g9b55f0 (released 2026-10-23T00:01:21.000Z, 3 | `/home/runner/.local/bin/amp` | 161.0 | bin | 151.6 | 147.6 | 522.1 | 0.4 | 137.6 |
| cursor-agent | 2026.10.22-27dcf5f | `/home/runner/.local/bin/cursor-agent` | 583.2 | pkg | 294.5 | 276.5 | — | — | 251.9 |
| qwen code | 0.26.0 | `/home/runner/.npm-global/bin/qwen` | 154.7 | pkg | 29.5 | 547.9 | 943.9 | 0.1 | 294.6 |
| codebuff | 1.0.688 | `/home/runner/.npm-global/bin/codebuff` | 140.0 | bin | 689.9 | 641.2 | 1165.0 | 0.1 | 57.7 |
| kilo code | 7.8.15 | `/home/runner/.npm-global/bin/kilocode` | 661.5 | pkg | 597.3 | 1714.4 | 4783.6 | 1924.7 | 46.1 |
| droid | 0.248.0 | `/home/runner/.local/bin/droid` | 319.2 | bin | 67.5 | 65.5 | 3117.7 | 1886.8 | 290.3 |
| kimi code | 2.3.0 | `/home/runner/.kimi-code/bin/kimi` | 192.5 | bin | 371.5 | 472.6 | 867.0 | 2.8 | 356.6 |
| devin | devin 3000.11.92 (7f4e64980e22) | `/home/runner/.local/bin/devin` | 200.4 | bin | 3.9 | 17.9 | 1021.6 | 142.5 | 96.3 |
| cline | 3.0.73 | `/home/runner/.npm-global/bin/cline` | 330.3 | pkg | 677.1 | 814.2 | — | — | 55.0 |
| continue | 1.5.47 | `/home/runner/.npm-global/bin/cn` | 82.7 | pkg | 755.4 | — | — | — | 316.7 |
| iflow cli | 0.5.19 | `/home/runner/.npm-global/bin/iflow` | 180.2 | pkg | 801.0 | 854.3 | 1593.0 | 0.1 | 58.0 |

</details>

fox-agent headless vs scripted local provider: time to first token **45 ms**, peak RSS **61 MB**.

_Generated 2026-10-23T03:31:35Z on Linux x86_64 (6.17.0-1022-azure). [How this is measured](#benchmarks) · [raw JSON](bench/results.json)_
