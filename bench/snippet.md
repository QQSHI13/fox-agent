![harness bench dashboard](bench/bench.svg)

| agent | bundle | `--version` | TUI 1st byte | TUI 1st input | input latency 1s | idle PSS |
|---|---|---|---|---|---|---|
| **fox-agent** | 99 MB | 11 ms | **13 ms** | **376 ms** | **1 ms** | 35 MB |
| claude code | 257 MB | 6 ms | **175 ms** | — | — | 187 MB |
| codex | 140 MB | 36 ms | **40 ms** | **831 ms** | **1 ms** | 49 MB |
| opencode v2 | 207 MB | 67 ms | **118 ms** | **480 ms** | **62 ms** | 128 MB |
| jcode | 138 MB | 7 ms | **9 ms** | **573 ms** | **0 ms** | 28 MB |
| pi | 140 MB | 198 ms | **267 ms** | **791 ms** | **7 ms** | 129 MB |
| gemini cli | 140 MB | 1223 ms | **1279 ms** | **1321 ms** | **0 ms** | — |
| copilot cli | 140 MB | 89 ms | **645 ms** | — | — | 47 MB |
| crush | 140 MB | 119 ms | **410 ms** | **837 ms** | **56 ms** | 68 MB |
| goose | 308 MB | 6 ms | **5 ms** | **366 ms** | **0 ms** | 105 MB |
| aider | 140 MB | 628 ms | **557 ms** | **941 ms** | **8 ms** | 67 MB |
| amp | 134 MB | 210 ms | **220 ms** | **587 ms** | **1 ms** | 166 MB |
| cursor-agent | 140 MB | 363 ms | **349 ms** | — | — | 215 MB |
| qwen code | 140 MB | 30 ms | **687 ms** | **1118 ms** | — | 290 MB |
| codebuff | 140 MB | 788 ms | **766 ms** | **1280 ms** | **109 ms** | 58 MB |
| kilo code | 140 MB | 744 ms | **2264 ms** | **5760 ms** | **1066 ms** | 46 MB |
| droid | 292 MB | 76 ms | **125 ms** | **3152 ms** | **711 ms** | 222 MB |
| kimi code | 191 MB | 492 ms | **585 ms** | **1054 ms** | **4 ms** | 351 MB |
| devin | 195 MB | 3 ms | **35 ms** | **1038 ms** | **641 ms** | 49 MB |
| cline | 140 MB | 867 ms | **1032 ms** | — | — | 55 MB |
| continue | 140 MB | 912 ms | — | — | — | 317 MB |
| iflow cli | 140 MB | 980 ms | **1053 ms** | **1807 ms** | **47 ms** | 58 MB |

<details><summary>full precision · all collected fields</summary>

| agent | version | bin | bundle (MB) | bundle kind | `--version` (ms) | TUI 1st byte (ms) | TUI 1st input (ms) | input latency 1s (ms) | idle PSS (MB) |
|---|---|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.5.0-beta.1 | `/home/runner/work/fox-agent/fox-agent/bin/fox` | 99.0 | bin | 10.9 | 12.8 | 375.7 | 0.6 | 35.0 |
| claude code | 2.1.296 (Claude Code) | `/home/runner/.npm-global/bin/claude` | 257.1 | bin | 6.2 | 175.0 | — | — | 187.4 |
| codex | codex-cli 0.162.1 | `/home/runner/.npm-global/bin/codex` | 140.0 | bin | 36.0 | 40.1 | 830.8 | 0.7 | 49.0 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | `/home/runner/.npm-global/bin/opencode2` | 207.4 | bin | 67.0 | 118.2 | 479.6 | 61.9 | 128.3 |
| jcode | jcode v0.95.0 (6487bbd7e) | `/home/runner/.local/bin/jcode` | 138.2 | bin | 7.3 | 8.9 | 572.5 | 0.4 | 27.7 |
| pi | 1.2.0 | `/home/runner/.npm-global/bin/pi` | 140.0 | bin | 198.3 | 266.7 | 790.6 | 7.0 | 129.5 |
| gemini cli | 0.63.0 | `/home/runner/.npm-global/bin/gemini` | 140.0 | bin | 1222.8 | 1279.4 | 1320.9 | 0.1 | — |
| copilot cli | GitHub Copilot CLI 1.0.96. | `/home/runner/.npm-global/bin/copilot` | 140.0 | bin | 89.4 | 644.6 | — | — | 47.3 |
| crush | crush version v0.98.1 | `/home/runner/.npm-global/bin/crush` | 140.0 | bin | 118.9 | 410.0 | 836.9 | 55.8 | 68.2 |
| goose | 1.54.0 | `/home/runner/.local/bin/goose` | 307.8 | bin | 5.5 | 5.1 | 366.1 | 0.2 | 105.1 |
| aider | aider 0.86.2 | `/home/runner/work/fox-agent/fox-agent/.venv-bench/bin/aider` | 140.0 | bin | 628.3 | 557.2 | 941.1 | 7.7 | 66.9 |
| amp | 0.0.1791878731-g2f7fd0 (released 2026-10-13T08:05:31.000Z, 1 | `/home/runner/.local/bin/amp` | 134.4 | bin | 209.9 | 219.9 | 586.8 | 0.6 | 165.9 |
| cursor-agent | 2026.10.01-e373342 | `/home/runner/.local/bin/cursor-agent` | 140.0 | bin | 363.0 | 349.5 | — | — | 215.2 |
| qwen code | 0.25.1 | `/home/runner/.npm-global/bin/qwen` | 140.0 | bin | 29.9 | 686.9 | 1117.9 | — | 290.0 |
| codebuff | 1.0.688 | `/home/runner/.npm-global/bin/codebuff` | 140.0 | bin | 788.5 | 765.7 | 1279.6 | 109.1 | 57.7 |
| kilo code | 7.8.8 | `/home/runner/.npm-global/bin/kilocode` | 140.0 | bin | 743.9 | 2264.0 | 5760.4 | 1065.7 | 46.1 |
| droid | 0.240.0 | `/home/runner/.local/bin/droid` | 291.7 | bin | 75.9 | 125.1 | 3152.3 | 711.3 | 222.2 |
| kimi code | 2.1.1 | `/home/runner/.kimi-code/bin/kimi` | 190.8 | bin | 491.6 | 585.1 | 1054.3 | 4.0 | 350.9 |
| devin | devin 3000.11.3 (9c803229faa4) | `/home/runner/.local/bin/devin` | 195.0 | bin | 2.6 | 35.0 | 1037.8 | 641.2 | 48.6 |
| cline | 3.0.71 | `/home/runner/.npm-global/bin/cline` | 140.0 | bin | 867.4 | 1031.9 | — | — | 54.9 |
| continue | 1.5.47 | `/home/runner/.npm-global/bin/cn` | 140.0 | bin | 912.0 | — | — | — | 316.6 |
| iflow cli | 0.5.19 | `/home/runner/.npm-global/bin/iflow` | 140.0 | bin | 979.8 | 1052.7 | 1806.9 | 47.1 | 57.9 |

</details>

fox-agent headless vs scripted local provider: time to first token **54 ms**, peak RSS **60 MB**.

_Generated 2026-10-13T10:16:00Z on Linux x86_64 (6.17.0-1022-azure). [How this is measured](#benchmarks) · [raw JSON](bench/results.json)_
