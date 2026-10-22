![harness bench dashboard](bench/bench.svg)

| agent | bundle | `--version` | TUI 1st byte | TUI 1st input | input latency 1s | idle PSS |
|---|---|---|---|---|---|---|
| **fox-agent** | 117 MB | 12 ms | **13 ms** | **375 ms** | **1 ms** | 38 MB |
| claude code | 292 MB | 8 ms | **198 ms** | — | — | 194 MB |
| codex | 140 MB | 33 ms | **35 ms** | **816 ms** | **2 ms** | 48 MB |
| opencode v2 | 207 MB | 69 ms | **120 ms** | **486 ms** | **61 ms** | 122 MB |
| jcode | 170 MB | 7 ms | **9 ms** | **675 ms** | **0 ms** | 36 MB |
| pi | 140 MB | 202 ms | **262 ms** | **771 ms** | **7 ms** | 133 MB |
| pi-bolt | 262 MB | 9 ms | **31 ms** | **508 ms** | **1 ms** | 97 MB |
| gemini cli | 140 MB | 1199 ms | **1272 ms** | **1307 ms** | — | — |
| copilot cli | 140 MB | 84 ms | **637 ms** | — | — | 46 MB |
| crush | 140 MB | 131 ms | **420 ms** | **838 ms** | **56 ms** | 68 MB |
| goose | 304 MB | 6 ms | **6 ms** | **366 ms** | **0 ms** | 111 MB |
| aider | 140 MB | 590 ms | **533 ms** | **906 ms** | **8 ms** | 68 MB |
| amp | 135 MB | 209 ms | **219 ms** | **584 ms** | **1 ms** | 164 MB |
| cursor-agent | 140 MB | 360 ms | **343 ms** | — | — | 248 MB |
| qwen code | 140 MB | 30 ms | **648 ms** | **1092 ms** | — | 293 MB |
| codebuff | 140 MB | 799 ms | **785 ms** | **1263 ms** | **106 ms** | 57 MB |
| kilo code | 140 MB | 753 ms | **2161 ms** | **5691 ms** | **1123 ms** | 45 MB |
| droid | 300 MB | 86 ms | **118 ms** | **3176 ms** | **763 ms** | 295 MB |
| kimi code | 192 MB | 484 ms | **608 ms** | **1001 ms** | **4 ms** | 351 MB |
| devin | 200 MB | 3 ms | **17 ms** | **1021 ms** | **1641 ms** | 71 MB |
| cline | 140 MB | 840 ms | **1042 ms** | — | — | 53 MB |
| continue | 140 MB | 885 ms | — | — | — | 315 MB |
| iflow cli | 140 MB | 979 ms | **1038 ms** | **1822 ms** | **47 ms** | 57 MB |

<details><summary>full precision · all collected fields</summary>

| agent | version | bin | bundle (MB) | bundle kind | `--version` (ms) | TUI 1st byte (ms) | TUI 1st input (ms) | input latency 1s (ms) | idle PSS (MB) |
|---|---|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.6.0 | `/home/runner/work/fox-agent/fox-agent/bin/fox` | 117.5 | bin | 11.6 | 13.0 | 375.4 | 0.6 | 38.3 |
| claude code | 2.1.308 (Claude Code) | `/home/runner/.npm-global/bin/claude` | 292.2 | bin | 8.0 | 198.0 | — | — | 194.3 |
| codex | codex-cli 0.163.0 | `/home/runner/.npm-global/bin/codex` | 140.0 | bin | 32.7 | 35.1 | 816.2 | 1.8 | 47.6 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | `/home/runner/.npm-global/bin/opencode2` | 207.4 | bin | 69.3 | 119.9 | 485.6 | 60.6 | 122.4 |
| jcode | jcode v0.99.0 (774613c90) | `/home/runner/.local/bin/jcode` | 169.6 | bin | 7.4 | 9.4 | 674.6 | 0.3 | 35.9 |
| pi | 1.4.0 | `/home/runner/.npm-global/bin/pi` | 140.0 | bin | 201.8 | 262.2 | 771.1 | 7.0 | 133.3 |
| pi-bolt | 1.4.0 (Pi-Bolt 0.9.8, linux-x64, JIT off) | `/home/runner/.local/bin/pi-bolt` | 262.0 | bin | 8.9 | 31.1 | 508.2 | 1.4 | 96.6 |
| gemini cli | 0.65.0 | `/home/runner/.npm-global/bin/gemini` | 140.0 | bin | 1199.2 | 1272.4 | 1307.2 | — | — |
| copilot cli | GitHub Copilot CLI 1.0.102. | `/home/runner/.npm-global/bin/copilot` | 140.0 | bin | 84.2 | 636.8 | — | — | 45.9 |
| crush | crush version v0.98.1 | `/home/runner/.npm-global/bin/crush` | 140.0 | bin | 131.3 | 420.0 | 837.6 | 56.2 | 67.8 |
| goose | 1.55.0 | `/home/runner/.local/bin/goose` | 304.0 | bin | 5.9 | 5.9 | 366.4 | 0.2 | 111.4 |
| aider | aider 0.86.2 | `/home/runner/work/fox-agent/fox-agent/.venv-bench/bin/aider` | 140.0 | bin | 590.0 | 533.4 | 906.4 | 7.9 | 67.7 |
| amp | 0.0.1792670445-ge8d5b3 (released 2026-10-22T12:00:45.000Z, 3 | `/home/runner/.local/bin/amp` | 135.3 | bin | 209.4 | 218.7 | 583.9 | 0.5 | 164.1 |
| cursor-agent | 2026.10.19-6bbf2c4 | `/home/runner/.local/bin/cursor-agent` | 140.0 | bin | 360.4 | 342.8 | — | — | 248.5 |
| qwen code | 0.26.0 | `/home/runner/.npm-global/bin/qwen` | 140.0 | bin | 30.2 | 647.8 | 1091.9 | — | 293.0 |
| codebuff | 1.0.688 | `/home/runner/.npm-global/bin/codebuff` | 140.0 | bin | 798.8 | 785.0 | 1262.7 | 106.4 | 56.8 |
| kilo code | 7.8.15 | `/home/runner/.npm-global/bin/kilocode` | 140.0 | bin | 753.5 | 2161.0 | 5691.1 | 1123.0 | 44.8 |
| droid | 0.247.0 | `/home/runner/.local/bin/droid` | 299.5 | bin | 86.2 | 118.2 | 3176.3 | 762.6 | 294.7 |
| kimi code | 2.3.0 | `/home/runner/.kimi-code/bin/kimi` | 192.5 | bin | 483.8 | 608.2 | 1001.1 | 3.6 | 351.1 |
| devin | devin 3000.11.92 (7f4e64980e22) | `/home/runner/.local/bin/devin` | 200.4 | bin | 3.4 | 17.0 | 1021.3 | 1640.9 | 71.5 |
| cline | 3.0.73 | `/home/runner/.npm-global/bin/cline` | 140.0 | bin | 839.7 | 1042.4 | — | — | 53.3 |
| continue | 1.5.47 | `/home/runner/.npm-global/bin/cn` | 140.0 | bin | 885.2 | — | — | — | 315.1 |
| iflow cli | 0.5.19 | `/home/runner/.npm-global/bin/iflow` | 140.0 | bin | 978.9 | 1038.4 | 1822.3 | 46.9 | 56.8 |

</details>

fox-agent headless vs scripted local provider: time to first token **55 ms**, peak RSS **65 MB**.

_Generated 2026-10-22T12:51:45Z on Linux x86_64 (7.0.0-1017-azure). [How this is measured](#benchmarks) · [raw JSON](bench/results.json)_
