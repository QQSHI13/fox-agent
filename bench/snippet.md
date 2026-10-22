![harness bench dashboard](bench/bench.svg)

| agent | bundle | `--version` | TUI 1st byte | TUI 1st input | input latency 1s | idle PSS |
|---|---|---|---|---|---|---|
| **fox-agent** | 117 MB | 13 ms | **14 ms** | **375 ms** | **1 ms** | 36 MB |
| claude code | 292 MB | 12 ms | **176 ms** | — | — | 195 MB |
| codex | 140 MB | 33 ms | **35 ms** | **793 ms** | **0 ms** | 49 MB |
| opencode v2 | 207 MB | 55 ms | **85 ms** | **454 ms** | **43 ms** | 125 MB |
| jcode | 170 MB | 7 ms | **10 ms** | **674 ms** | **0 ms** | 32 MB |
| pi | 140 MB | 147 ms | **192 ms** | **678 ms** | **5 ms** | 132 MB |
| pi-bolt | 262 MB | 10 ms | **30 ms** | **510 ms** | **1 ms** | 97 MB |
| gemini cli | 140 MB | 895 ms | **928 ms** | **966 ms** | **0 ms** | — |
| copilot cli | 140 MB | 65 ms | **470 ms** | — | — | 47 MB |
| crush | 140 MB | 98 ms | **328 ms** | **766 ms** | **39 ms** | 68 MB |
| goose | 304 MB | 6 ms | **6 ms** | **367 ms** | **0 ms** | 111 MB |
| aider | 140 MB | 460 ms | **405 ms** | **780 ms** | **6 ms** | 67 MB |
| amp | 135 MB | 166 ms | **161 ms** | **526 ms** | **0 ms** | 163 MB |
| cursor-agent | 140 MB | 286 ms | **256 ms** | — | — | 252 MB |
| qwen code | 140 MB | 27 ms | **497 ms** | **907 ms** | — | 297 MB |
| codebuff | 140 MB | 647 ms | **624 ms** | **1155 ms** | **108 ms** | 58 MB |
| kilo code | 140 MB | 594 ms | **1650 ms** | **4847 ms** | **885 ms** | 46 MB |
| droid | 300 MB | 79 ms | **62 ms** | **3171 ms** | **742 ms** | 288 MB |
| kimi code | 192 MB | 383 ms | **492 ms** | **872 ms** | **3 ms** | 356 MB |
| devin | 200 MB | 4 ms | **19 ms** | **1022 ms** | **1641 ms** | 96 MB |
| cline | 140 MB | 609 ms | **820 ms** | — | — | 55 MB |
| continue | 140 MB | 686 ms | — | — | — | 320 MB |
| iflow cli | 140 MB | 783 ms | **820 ms** | **1564 ms** | **44 ms** | 58 MB |

<details><summary>full precision · all collected fields</summary>

| agent | version | bin | bundle (MB) | bundle kind | `--version` (ms) | TUI 1st byte (ms) | TUI 1st input (ms) | input latency 1s (ms) | idle PSS (MB) |
|---|---|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.6.0 | `/home/runner/work/fox-agent/fox-agent/bin/fox` | 117.5 | bin | 13.3 | 14.3 | 375.3 | 0.6 | 36.5 |
| claude code | 2.1.308 (Claude Code) | `/home/runner/.npm-global/bin/claude` | 292.2 | bin | 11.8 | 175.8 | — | — | 194.6 |
| codex | codex-cli 0.163.0 | `/home/runner/.npm-global/bin/codex` | 140.0 | bin | 33.1 | 34.7 | 793.1 | 0.3 | 49.0 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | `/home/runner/.npm-global/bin/opencode2` | 207.4 | bin | 54.6 | 85.2 | 453.9 | 42.7 | 124.7 |
| jcode | jcode v0.99.0 (774613c90) | `/home/runner/.local/bin/jcode` | 169.6 | bin | 7.3 | 10.0 | 674.3 | 0.3 | 31.9 |
| pi | 1.4.0 | `/home/runner/.npm-global/bin/pi` | 140.0 | bin | 146.8 | 191.8 | 677.5 | 5.1 | 131.7 |
| pi-bolt | 1.4.0 (Pi-Bolt 0.9.8, linux-x64, JIT off) | `/home/runner/.local/bin/pi-bolt` | 262.0 | bin | 10.4 | 30.0 | 510.1 | 1.4 | 96.6 |
| gemini cli | 0.65.0 | `/home/runner/.npm-global/bin/gemini` | 140.0 | bin | 894.8 | 928.1 | 966.5 | 0.1 | — |
| copilot cli | GitHub Copilot CLI 1.0.102. | `/home/runner/.npm-global/bin/copilot` | 140.0 | bin | 64.8 | 469.7 | — | — | 47.3 |
| crush | crush version v0.98.1 | `/home/runner/.npm-global/bin/crush` | 140.0 | bin | 97.9 | 328.1 | 765.7 | 39.1 | 68.3 |
| goose | 1.55.0 | `/home/runner/.local/bin/goose` | 304.0 | bin | 6.3 | 6.2 | 366.9 | 0.2 | 111.1 |
| aider | aider 0.86.2 | `/home/runner/work/fox-agent/fox-agent/.venv-bench/bin/aider` | 140.0 | bin | 459.9 | 405.3 | 779.5 | 5.7 | 66.9 |
| amp | 0.0.1792670445-ge8d5b3 (released 2026-10-22T12:00:45.000Z, 1 | `/home/runner/.local/bin/amp` | 135.3 | bin | 166.0 | 161.4 | 526.4 | 0.5 | 162.7 |
| cursor-agent | 2026.10.19-6bbf2c4 | `/home/runner/.local/bin/cursor-agent` | 140.0 | bin | 285.8 | 255.8 | — | — | 252.2 |
| qwen code | 0.26.0 | `/home/runner/.npm-global/bin/qwen` | 140.0 | bin | 27.3 | 497.3 | 907.5 | — | 296.6 |
| codebuff | 1.0.688 | `/home/runner/.npm-global/bin/codebuff` | 140.0 | bin | 647.4 | 624.3 | 1154.5 | 107.7 | 57.7 |
| kilo code | 7.8.15 | `/home/runner/.npm-global/bin/kilocode` | 140.0 | bin | 593.6 | 1650.3 | 4847.3 | 885.3 | 46.2 |
| droid | 0.247.0 | `/home/runner/.local/bin/droid` | 299.5 | bin | 78.9 | 62.4 | 3170.9 | 741.7 | 287.7 |
| kimi code | 2.3.0 | `/home/runner/.kimi-code/bin/kimi` | 192.5 | bin | 382.7 | 492.4 | 872.1 | 2.9 | 355.6 |
| devin | devin 3000.11.92 (7f4e64980e22) | `/home/runner/.local/bin/devin` | 200.4 | bin | 3.6 | 19.0 | 1022.4 | 1640.9 | 96.3 |
| cline | 3.0.73 | `/home/runner/.npm-global/bin/cline` | 140.0 | bin | 609.3 | 820.3 | — | — | 55.0 |
| continue | 1.5.47 | `/home/runner/.npm-global/bin/cn` | 140.0 | bin | 685.9 | — | — | — | 319.8 |
| iflow cli | 0.5.19 | `/home/runner/.npm-global/bin/iflow` | 140.0 | bin | 783.1 | 819.8 | 1563.7 | 44.1 | 57.9 |

</details>

fox-agent headless vs scripted local provider: time to first token **46 ms**, peak RSS **62 MB**.

_Generated 2026-10-22T13:18:50Z on Linux x86_64 (6.17.0-1022-azure). [How this is measured](#benchmarks) · [raw JSON](bench/results.json)_
