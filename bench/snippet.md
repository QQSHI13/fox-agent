![harness bench dashboard](bench/bench.svg)

| agent | bundle | `--version` | TUI 1st byte | TUI 1st input | input latency 1s | idle PSS |
|---|---|---|---|---|---|---|
| **fox-agent** | 99 MB | 15 ms | **18 ms** | **377 ms** | **1 ms** | 35 MB |
| claude code | 286 MB | 10 ms | **211 ms** | — | — | 190 MB |
| codex | 140 MB | 44 ms | **43 ms** | **806 ms** | **1 ms** | 49 MB |
| opencode v2 | 207 MB | 77 ms | **132 ms** | **501 ms** | **56 ms** | 128 MB |
| jcode | 167 MB | 9 ms | **12 ms** | **765 ms** | **0 ms** | 30 MB |
| pi | 140 MB | 241 ms | **319 ms** | **849 ms** | **8 ms** | 133 MB |
| gemini cli | 140 MB | 1511 ms | **1598 ms** | **1628 ms** | **0 ms** | 146 MB |
| copilot cli | 140 MB | 104 ms | **770 ms** | — | — | 47 MB |
| crush | 140 MB | 131 ms | **582 ms** | **854 ms** | **73 ms** | 69 MB |
| goose | 304 MB | 7 ms | **7 ms** | **368 ms** | **0 ms** | 108 MB |
| aider | 140 MB | 858 ms | **760 ms** | **1149 ms** | **10 ms** | 67 MB |
| amp | 135 MB | 261 ms | **263 ms** | **624 ms** | **1 ms** | 165 MB |
| cursor-agent | 140 MB | 456 ms | **431 ms** | **808 ms** | — | 232 MB |
| qwen code | 140 MB | 38 ms | **838 ms** | **1322 ms** | — | 239 MB |
| codebuff | 140 MB | 957 ms | **933 ms** | **1425 ms** | **111 ms** | 58 MB |
| kilo code | 140 MB | 860 ms | **2599 ms** | **6540 ms** | **1671 ms** | 46 MB |
| droid | 294 MB | 106 ms | **125 ms** | **3248 ms** | **785 ms** | 333 MB |
| kimi code | 192 MB | 567 ms | **725 ms** | **1121 ms** | **4 ms** | 354 MB |
| devin | 200 MB | 4 ms | **22 ms** | **1027 ms** | **1641 ms** | 93 MB |
| cline | 140 MB | 993 ms | **1191 ms** | — | — | 55 MB |
| continue | 140 MB | 1116 ms | — | — | — | 317 MB |
| iflow cli | 140 MB | 1190 ms | **1273 ms** | **2072 ms** | **45 ms** | 56 MB |

<details><summary>full precision · all collected fields</summary>

| agent | version | bin | bundle (MB) | bundle kind | `--version` (ms) | TUI 1st byte (ms) | TUI 1st input (ms) | input latency 1s (ms) | idle PSS (MB) |
|---|---|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.5.0-beta.1 | `/home/runner/work/fox-agent/fox-agent/bin/fox` | 99.0 | bin | 14.7 | 18.5 | 376.6 | 0.7 | 35.1 |
| claude code | 2.1.302 (Claude Code) | `/home/runner/.npm-global/bin/claude` | 285.8 | bin | 9.7 | 210.6 | — | — | 190.5 |
| codex | codex-cli 0.163.0 | `/home/runner/.npm-global/bin/codex` | 140.0 | bin | 44.2 | 43.4 | 805.5 | 0.6 | 49.1 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | `/home/runner/.npm-global/bin/opencode2` | 207.4 | bin | 76.6 | 132.0 | 501.1 | 56.4 | 128.4 |
| jcode | jcode v0.98.1 (1c7426eb1) | `/home/runner/.local/bin/jcode` | 166.8 | bin | 9.4 | 11.6 | 765.0 | 0.4 | 30.0 |
| pi | 1.3.0 | `/home/runner/.npm-global/bin/pi` | 140.0 | bin | 240.9 | 318.7 | 848.7 | 8.3 | 132.6 |
| gemini cli | 0.64.0 | `/home/runner/.npm-global/bin/gemini` | 140.0 | bin | 1511.4 | 1598.0 | 1627.8 | 0.1 | 146.0 |
| copilot cli | GitHub Copilot CLI 1.0.98. | `/home/runner/.npm-global/bin/copilot` | 140.0 | bin | 104.2 | 770.2 | — | — | 47.5 |
| crush | crush version v0.98.1 | `/home/runner/.npm-global/bin/crush` | 140.0 | bin | 131.2 | 582.2 | 853.9 | 72.6 | 68.7 |
| goose | 1.55.0 | `/home/runner/.local/bin/goose` | 304.0 | bin | 7.3 | 7.1 | 367.9 | 0.2 | 107.6 |
| aider | aider 0.86.2 | `/home/runner/work/fox-agent/fox-agent/.venv-bench/bin/aider` | 140.0 | bin | 858.3 | 760.5 | 1149.3 | 10.1 | 66.8 |
| amp | 0.0.1792224035-gabd4f6 (released 2026-10-17T08:00:35.000Z, 1 | `/home/runner/.local/bin/amp` | 134.9 | bin | 260.5 | 262.7 | 624.0 | 0.6 | 165.2 |
| cursor-agent | 2026.10.16-e3cb207 | `/home/runner/.local/bin/cursor-agent` | 140.0 | bin | 455.8 | 430.9 | 808.1 | — | 232.0 |
| qwen code | 0.25.2 | `/home/runner/.npm-global/bin/qwen` | 140.0 | bin | 38.1 | 838.1 | 1321.9 | — | 238.8 |
| codebuff | 1.0.688 | `/home/runner/.npm-global/bin/codebuff` | 140.0 | bin | 956.7 | 933.3 | 1424.9 | 111.5 | 57.5 |
| kilo code | 7.8.12 | `/home/runner/.npm-global/bin/kilocode` | 140.0 | bin | 860.4 | 2598.8 | 6539.7 | 1670.7 | 46.2 |
| droid | 0.244.0 | `/home/runner/.local/bin/droid` | 294.4 | bin | 106.1 | 124.6 | 3248.0 | 784.7 | 332.8 |
| kimi code | 2.2.0 | `/home/runner/.kimi-code/bin/kimi` | 191.9 | bin | 567.3 | 724.6 | 1120.6 | 4.1 | 354.0 |
| devin | devin 3000.11.92 (7f4e64980e22) | `/home/runner/.local/bin/devin` | 200.4 | bin | 3.7 | 21.9 | 1027.0 | 1641.0 | 92.7 |
| cline | 3.0.73 | `/home/runner/.npm-global/bin/cline` | 140.0 | bin | 993.1 | 1190.6 | — | — | 55.0 |
| continue | 1.5.47 | `/home/runner/.npm-global/bin/cn` | 140.0 | bin | 1116.2 | — | — | — | 316.8 |
| iflow cli | 0.5.19 | `/home/runner/.npm-global/bin/iflow` | 140.0 | bin | 1189.6 | 1273.0 | 2072.5 | 45.3 | 55.6 |

</details>

fox-agent headless vs scripted local provider: time to first token **59 ms**, peak RSS **60 MB**.

_Generated 2026-10-17T09:38:10Z on Linux x86_64 (6.17.0-1022-azure). [How this is measured](#benchmarks) · [raw JSON](bench/results.json)_
