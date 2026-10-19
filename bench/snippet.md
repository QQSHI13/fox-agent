![harness bench dashboard](bench/bench.svg)

| agent | bundle | `--version` | TUI 1st byte | TUI 1st input | input latency 1s | idle PSS |
|---|---|---|---|---|---|---|
| **fox-agent** | 99 MB | 14 ms | **16 ms** | **376 ms** | **1 ms** | 35 MB |
| claude code | 286 MB | 9 ms | **217 ms** | — | — | 191 MB |
| codex | 140 MB | 42 ms | **43 ms** | **843 ms** | **1 ms** | 49 MB |
| opencode v2 | 207 MB | 80 ms | **133 ms** | **496 ms** | **62 ms** | 127 MB |
| jcode | 170 MB | 9 ms | **12 ms** | **767 ms** | **0 ms** | 32 MB |
| pi | 140 MB | 239 ms | **316 ms** | **819 ms** | **9 ms** | 131 MB |
| gemini cli | 140 MB | 1527 ms | **1583 ms** | **1645 ms** | — | 146 MB |
| copilot cli | 140 MB | 103 ms | **761 ms** | — | — | 47 MB |
| crush | 140 MB | 132 ms | **504 ms** | **966 ms** | **73 ms** | 69 MB |
| goose | 304 MB | 7 ms | **7 ms** | **368 ms** | **0 ms** | 108 MB |
| aider | 140 MB | 792 ms | **730 ms** | **1112 ms** | **10 ms** | 67 MB |
| amp | 135 MB | 252 ms | **258 ms** | **616 ms** | **1 ms** | 160 MB |
| cursor-agent | 140 MB | 437 ms | **430 ms** | — | — | 237 MB |
| qwen code | 140 MB | 36 ms | **829 ms** | **1290 ms** | — | 250 MB |
| codebuff | 140 MB | 876 ms | **869 ms** | **1370 ms** | **112 ms** | 58 MB |
| kilo code | 140 MB | 823 ms | **2434 ms** | **6397 ms** | **1554 ms** | 46 MB |
| droid | 294 MB | 106 ms | **133 ms** | **3218 ms** | **775 ms** | 331 MB |
| kimi code | 192 MB | 574 ms | **728 ms** | **1128 ms** | **4 ms** | 352 MB |
| devin | 200 MB | 4 ms | **22 ms** | **1031 ms** | **1641 ms** | 88 MB |
| cline | 140 MB | 921 ms | **1168 ms** | — | — | 55 MB |
| continue | 140 MB | 1096 ms | — | — | — | 317 MB |
| iflow cli | 140 MB | 1187 ms | **1288 ms** | **2469 ms** | **47 ms** | 56 MB |

<details><summary>full precision · all collected fields</summary>

| agent | version | bin | bundle (MB) | bundle kind | `--version` (ms) | TUI 1st byte (ms) | TUI 1st input (ms) | input latency 1s (ms) | idle PSS (MB) |
|---|---|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.6.0 | `/home/runner/work/fox-agent/fox-agent/bin/fox` | 99.1 | bin | 13.8 | 16.5 | 375.8 | 0.7 | 35.4 |
| claude code | 2.1.303 (Claude Code) | `/home/runner/.npm-global/bin/claude` | 285.8 | bin | 8.8 | 217.0 | — | — | 191.0 |
| codex | codex-cli 0.163.0 | `/home/runner/.npm-global/bin/codex` | 140.0 | bin | 42.0 | 43.0 | 843.2 | 0.6 | 49.1 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | `/home/runner/.npm-global/bin/opencode2` | 207.4 | bin | 80.3 | 133.0 | 496.1 | 61.8 | 127.4 |
| jcode | jcode v0.99.0 (774613c90) | `/home/runner/.local/bin/jcode` | 169.6 | bin | 9.0 | 11.7 | 767.2 | 0.4 | 31.5 |
| pi | 1.3.0 | `/home/runner/.npm-global/bin/pi` | 140.0 | bin | 239.0 | 315.6 | 818.7 | 8.5 | 131.1 |
| gemini cli | 0.64.0 | `/home/runner/.npm-global/bin/gemini` | 140.0 | bin | 1527.3 | 1583.2 | 1645.4 | — | 145.8 |
| copilot cli | GitHub Copilot CLI 1.0.98. | `/home/runner/.npm-global/bin/copilot` | 140.0 | bin | 102.7 | 761.1 | — | — | 47.3 |
| crush | crush version v0.98.1 | `/home/runner/.npm-global/bin/crush` | 140.0 | bin | 132.5 | 503.9 | 966.1 | 72.8 | 68.9 |
| goose | 1.55.0 | `/home/runner/.local/bin/goose` | 304.0 | bin | 7.2 | 7.2 | 367.6 | 0.2 | 108.4 |
| aider | aider 0.86.2 | `/home/runner/work/fox-agent/fox-agent/.venv-bench/bin/aider` | 140.0 | bin | 792.1 | 730.5 | 1112.0 | 10.5 | 66.9 |
| amp | 0.0.1792397088-g3c824b (released 2026-10-19T08:04:48.000Z, 3 | `/home/runner/.local/bin/amp` | 135.0 | bin | 251.7 | 258.0 | 616.2 | 0.6 | 159.6 |
| cursor-agent | 2026.10.16-e3cb207 | `/home/runner/.local/bin/cursor-agent` | 140.0 | bin | 437.4 | 430.2 | — | — | 237.0 |
| qwen code | 0.25.3 | `/home/runner/.npm-global/bin/qwen` | 140.0 | bin | 36.3 | 828.7 | 1289.8 | — | 249.6 |
| codebuff | 1.0.688 | `/home/runner/.npm-global/bin/codebuff` | 140.0 | bin | 876.2 | 869.5 | 1369.6 | 111.7 | 57.5 |
| kilo code | 7.8.12 | `/home/runner/.npm-global/bin/kilocode` | 140.0 | bin | 822.9 | 2434.1 | 6397.1 | 1553.5 | 46.2 |
| droid | 0.244.0 | `/home/runner/.local/bin/droid` | 294.4 | bin | 106.5 | 132.9 | 3218.2 | 775.5 | 330.9 |
| kimi code | 2.2.0 | `/home/runner/.kimi-code/bin/kimi` | 191.9 | bin | 574.1 | 728.3 | 1128.2 | 4.4 | 352.4 |
| devin | devin 3000.11.92 (7f4e64980e22) | `/home/runner/.local/bin/devin` | 200.4 | bin | 4.0 | 22.5 | 1030.6 | 1641.0 | 88.4 |
| cline | 3.0.73 | `/home/runner/.npm-global/bin/cline` | 140.0 | bin | 921.2 | 1168.0 | — | — | 55.0 |
| continue | 1.5.47 | `/home/runner/.npm-global/bin/cn` | 140.0 | bin | 1095.6 | — | — | — | 317.4 |
| iflow cli | 0.5.19 | `/home/runner/.npm-global/bin/iflow` | 140.0 | bin | 1186.8 | 1288.3 | 2469.1 | 46.9 | 55.7 |

</details>

fox-agent headless vs scripted local provider: time to first token **57 ms**, peak RSS **60 MB**.

_Generated 2026-10-19T11:35:45Z on Linux x86_64 (6.17.0-1022-azure). [How this is measured](#benchmarks) · [raw JSON](bench/results.json)_
