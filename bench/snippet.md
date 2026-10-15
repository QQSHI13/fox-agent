![harness bench dashboard](bench/bench.svg)

| agent | bundle | `--version` | TUI 1st byte | TUI 1st input | input latency 1s | idle PSS |
|---|---|---|---|---|---|---|
| **fox-agent** | 99 MB | 11 ms | **13 ms** | **375 ms** | **1 ms** | 35 MB |
| claude code | 267 MB | 7 ms | **181 ms** | — | — | 187 MB |
| codex | 140 MB | 35 ms | **40 ms** | **819 ms** | **2 ms** | 49 MB |
| opencode v2 | 207 MB | 67 ms | **118 ms** | **478 ms** | **59 ms** | 128 MB |
| jcode | 167 MB | 7 ms | **8 ms** | **604 ms** | **0 ms** | 30 MB |
| pi | 140 MB | 195 ms | **256 ms** | **769 ms** | **7 ms** | 129 MB |
| gemini cli | 140 MB | 1186 ms | **1282 ms** | **1294 ms** | **0 ms** | — |
| copilot cli | 140 MB | 86 ms | **652 ms** | — | — | 47 MB |
| crush | 140 MB | 106 ms | **425 ms** | **824 ms** | **55 ms** | 68 MB |
| goose | 308 MB | 5 ms | **5 ms** | **366 ms** | **0 ms** | 106 MB |
| aider | 140 MB | 612 ms | **548 ms** | **928 ms** | **8 ms** | 67 MB |
| amp | 135 MB | 214 ms | **219 ms** | **584 ms** | **1 ms** | 160 MB |
| cursor-agent | 140 MB | 371 ms | **353 ms** | — | — | 238 MB |
| qwen code | 140 MB | 33 ms | **651 ms** | **1097 ms** | — | 291 MB |
| codebuff | 140 MB | 801 ms | **800 ms** | **1287 ms** | **108 ms** | 58 MB |
| kilo code | 140 MB | 753 ms | **2223 ms** | **5775 ms** | **1085 ms** | 46 MB |
| droid | 293 MB | 77 ms | **99 ms** | **3156 ms** | **709 ms** | 217 MB |
| kimi code | 192 MB | 478 ms | **596 ms** | **979 ms** | **4 ms** | 355 MB |
| devin | 200 MB | 4 ms | **20 ms** | **1030 ms** | **1641 ms** | 98 MB |
| cline | 140 MB | 789 ms | **1067 ms** | — | — | 55 MB |
| continue | 140 MB | 907 ms | — | — | — | 317 MB |
| iflow cli | 140 MB | 970 ms | **1041 ms** | **1831 ms** | **47 ms** | 58 MB |

<details><summary>full precision · all collected fields</summary>

| agent | version | bin | bundle (MB) | bundle kind | `--version` (ms) | TUI 1st byte (ms) | TUI 1st input (ms) | input latency 1s (ms) | idle PSS (MB) |
|---|---|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.5.0-beta.1 | `/home/runner/work/fox-agent/fox-agent/bin/fox` | 99.0 | bin | 11.4 | 12.7 | 375.4 | 0.7 | 34.8 |
| claude code | 2.1.300 (Claude Code) | `/home/runner/.npm-global/bin/claude` | 267.0 | bin | 7.1 | 181.2 | — | — | 187.3 |
| codex | codex-cli 0.162.1 | `/home/runner/.npm-global/bin/codex` | 140.0 | bin | 34.8 | 40.5 | 819.1 | 1.6 | 49.1 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | `/home/runner/.npm-global/bin/opencode2` | 207.4 | bin | 67.4 | 117.8 | 478.2 | 59.3 | 128.0 |
| jcode | jcode v0.98.1 (1c7426eb1) | `/home/runner/.local/bin/jcode` | 166.8 | bin | 6.5 | 8.3 | 603.6 | 0.3 | 30.4 |
| pi | 1.2.0 | `/home/runner/.npm-global/bin/pi` | 140.0 | bin | 194.6 | 256.5 | 769.5 | 6.9 | 129.1 |
| gemini cli | 0.64.0 | `/home/runner/.npm-global/bin/gemini` | 140.0 | bin | 1186.1 | 1282.2 | 1293.7 | 0.1 | — |
| copilot cli | GitHub Copilot CLI 1.0.98. | `/home/runner/.npm-global/bin/copilot` | 140.0 | bin | 85.6 | 652.0 | — | — | 47.4 |
| crush | crush version v0.98.1 | `/home/runner/.npm-global/bin/crush` | 140.0 | bin | 105.7 | 425.5 | 824.3 | 55.3 | 68.3 |
| goose | 1.54.0 | `/home/runner/.local/bin/goose` | 307.8 | bin | 5.2 | 5.2 | 365.9 | 0.2 | 105.8 |
| aider | aider 0.86.2 | `/home/runner/work/fox-agent/fox-agent/.venv-bench/bin/aider` | 140.0 | bin | 612.2 | 548.2 | 928.0 | 7.7 | 66.9 |
| amp | 0.0.1792051250-g2fc5c0 (released 2026-10-15T08:00:50.000Z, 2 | `/home/runner/.local/bin/amp` | 134.5 | bin | 213.5 | 218.8 | 583.8 | 0.6 | 160.1 |
| cursor-agent | 2026.10.14-941492e | `/home/runner/.local/bin/cursor-agent` | 140.0 | bin | 371.4 | 353.1 | — | — | 237.6 |
| qwen code | 0.25.1 | `/home/runner/.npm-global/bin/qwen` | 140.0 | bin | 33.0 | 651.0 | 1097.4 | — | 290.6 |
| codebuff | 1.0.688 | `/home/runner/.npm-global/bin/codebuff` | 140.0 | bin | 801.0 | 800.3 | 1287.0 | 108.3 | 57.6 |
| kilo code | 7.8.8 | `/home/runner/.npm-global/bin/kilocode` | 140.0 | bin | 753.1 | 2223.2 | 5774.5 | 1085.3 | 46.2 |
| droid | 0.242.0 | `/home/runner/.local/bin/droid` | 292.6 | bin | 76.8 | 99.3 | 3155.5 | 709.4 | 217.4 |
| kimi code | 2.2.0 | `/home/runner/.kimi-code/bin/kimi` | 191.9 | bin | 477.8 | 596.2 | 978.6 | 3.8 | 355.2 |
| devin | devin 3000.11.92 (7f4e64980e22) | `/home/runner/.local/bin/devin` | 200.4 | bin | 4.0 | 20.2 | 1030.0 | 1641.1 | 97.7 |
| cline | 3.0.71 | `/home/runner/.npm-global/bin/cline` | 140.0 | bin | 789.3 | 1066.7 | — | — | 55.0 |
| continue | 1.5.47 | `/home/runner/.npm-global/bin/cn` | 140.0 | bin | 907.2 | — | — | — | 316.8 |
| iflow cli | 0.5.19 | `/home/runner/.npm-global/bin/iflow` | 140.0 | bin | 970.0 | 1041.4 | 1831.3 | 47.2 | 57.9 |

</details>

fox-agent headless vs scripted local provider: time to first token **49 ms**, peak RSS **60 MB**.

_Generated 2026-10-15T08:33:08Z on Linux x86_64 (6.17.0-1022-azure). [How this is measured](#benchmarks) · [raw JSON](bench/results.json)_
