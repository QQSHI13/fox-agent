![harness bench dashboard](bench/bench.svg)

| agent | bundle | `--version` | TUI 1st byte | TUI 1st input | input latency 1s | idle PSS |
|---|---|---|---|---|---|---|
| **fox-agent** | 120 MB | 16 ms | **18 ms** | **379 ms** | **1 ms** | 37 MB |
| claude code | 257 MB | 10 ms | **238 ms** | — | — | 188 MB |
| codex | 140 MB | 43 ms | **44 ms** | **801 ms** | **1 ms** | 49 MB |
| opencode v2 | 207 MB | 87 ms | **138 ms** | **505 ms** | **64 ms** | 129 MB |
| jcode | 138 MB | 9 ms | **12 ms** | **708 ms** | **0 ms** | 27 MB |
| pi | 140 MB | 247 ms | **321 ms** | **854 ms** | **8 ms** | 130 MB |
| gemini cli | 140 MB | 1558 ms | **1624 ms** | **1627 ms** | — | 146 MB |
| copilot cli | 140 MB | 104 ms | **764 ms** | — | — | 47 MB |
| crush | 140 MB | 131 ms | **364 ms** | **818 ms** | **73 ms** | 69 MB |
| goose | 308 MB | 8 ms | **8 ms** | **368 ms** | **0 ms** | 105 MB |
| aider | 140 MB | 804 ms | **739 ms** | **1129 ms** | **10 ms** | 67 MB |
| amp | 134 MB | 248 ms | **260 ms** | **612 ms** | **1 ms** | 163 MB |
| cursor-agent | 140 MB | 449 ms | **431 ms** | — | — | 216 MB |
| qwen code | 140 MB | 37 ms | **819 ms** | **1290 ms** | — | 245 MB |
| codebuff | 140 MB | 913 ms | **890 ms** | **1425 ms** | **110 ms** | 58 MB |
| kilo code | 140 MB | 834 ms | **2583 ms** | **6395 ms** | **1464 ms** | 46 MB |
| droid | 292 MB | 111 ms | **133 ms** | **798 ms** | **739 ms** | 221 MB |
| kimi code | 191 MB | 573 ms | **731 ms** | **1130 ms** | **4 ms** | 350 MB |
| devin | 195 MB | 4 ms | **48 ms** | **1051 ms** | **640 ms** | 48 MB |
| cline | 140 MB | 853 ms | **1124 ms** | — | — | 55 MB |
| continue | 140 MB | 1129 ms | — | — | — | 318 MB |
| iflow cli | 140 MB | 1238 ms | **1342 ms** | **2534 ms** | **46 ms** | 56 MB |

<details><summary>full precision · all collected fields</summary>

| agent | version | bin | bundle (MB) | bundle kind | `--version` (ms) | TUI 1st byte (ms) | TUI 1st input (ms) | input latency 1s (ms) | idle PSS (MB) |
|---|---|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.5.0-beta.1 | `/home/runner/work/fox-agent/fox-agent/bin/fox` | 120.4 | bin | 15.7 | 17.9 | 379.4 | 0.6 | 36.6 |
| claude code | 2.1.296 (Claude Code) | `/home/runner/.npm-global/bin/claude` | 257.1 | bin | 10.1 | 238.1 | — | — | 187.7 |
| codex | codex-cli 0.162.1 | `/home/runner/.npm-global/bin/codex` | 140.0 | bin | 43.1 | 44.1 | 800.9 | 0.6 | 49.1 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | `/home/runner/.npm-global/bin/opencode2` | 207.4 | bin | 87.3 | 138.3 | 504.7 | 64.1 | 129.2 |
| jcode | jcode v0.95.0 (6487bbd7e) | `/home/runner/.local/bin/jcode` | 138.2 | bin | 9.2 | 11.7 | 707.7 | 0.4 | 27.3 |
| pi | 1.2.0 | `/home/runner/.npm-global/bin/pi` | 140.0 | bin | 247.5 | 321.0 | 853.6 | 8.3 | 129.8 |
| gemini cli | 0.63.0 | `/home/runner/.npm-global/bin/gemini` | 140.0 | bin | 1558.0 | 1624.2 | 1626.8 | — | 145.7 |
| copilot cli | GitHub Copilot CLI 1.0.96. | `/home/runner/.npm-global/bin/copilot` | 140.0 | bin | 104.4 | 763.8 | — | — | 47.4 |
| crush | crush version v0.98.1 | `/home/runner/.npm-global/bin/crush` | 140.0 | bin | 130.8 | 363.8 | 818.1 | 72.6 | 68.6 |
| goose | 1.54.0 | `/home/runner/.local/bin/goose` | 307.8 | bin | 7.6 | 7.7 | 368.3 | 0.2 | 104.7 |
| aider | aider 0.86.2 | `/home/runner/work/fox-agent/fox-agent/.venv-bench/bin/aider` | 140.0 | bin | 803.7 | 739.3 | 1129.0 | 10.0 | 66.8 |
| amp | 0.0.1791864325-g52e626 (released 2026-10-13T04:05:25.000Z, 3 | `/home/runner/.local/bin/amp` | 134.4 | bin | 248.4 | 260.4 | 611.7 | 0.5 | 163.4 |
| cursor-agent | 2026.10.01-e373342 | `/home/runner/.local/bin/cursor-agent` | 140.0 | bin | 448.7 | 430.8 | — | — | 216.4 |
| qwen code | 0.25.1 | `/home/runner/.npm-global/bin/qwen` | 140.0 | bin | 37.4 | 818.8 | 1290.5 | — | 245.1 |
| codebuff | 1.0.688 | `/home/runner/.npm-global/bin/codebuff` | 140.0 | bin | 913.0 | 889.5 | 1424.7 | 110.0 | 57.6 |
| kilo code | 7.8.8 | `/home/runner/.npm-global/bin/kilocode` | 140.0 | bin | 833.5 | 2582.8 | 6395.3 | 1464.1 | 46.2 |
| droid | 0.240.0 | `/home/runner/.local/bin/droid` | 291.7 | bin | 111.1 | 133.2 | 797.6 | 738.8 | 220.5 |
| kimi code | 2.1.1 | `/home/runner/.kimi-code/bin/kimi` | 190.8 | bin | 573.1 | 730.5 | 1130.1 | 4.5 | 350.0 |
| devin | devin 3000.11.3 (9c803229faa4) | `/home/runner/.local/bin/devin` | 195.0 | bin | 3.8 | 48.5 | 1050.5 | 640.0 | 48.4 |
| cline | 3.0.70 | `/home/runner/.npm-global/bin/cline` | 140.0 | bin | 852.9 | 1124.0 | — | — | 55.0 |
| continue | 1.5.47 | `/home/runner/.npm-global/bin/cn` | 140.0 | bin | 1128.6 | — | — | — | 318.1 |
| iflow cli | 0.5.19 | `/home/runner/.npm-global/bin/iflow` | 140.0 | bin | 1238.3 | 1342.3 | 2533.6 | 46.2 | 55.6 |

</details>

fox-agent headless vs scripted local provider: time to first token **65 ms**, peak RSS **60 MB**.

_Generated 2026-10-13T08:10:42Z on Linux x86_64 (6.17.0-1022-azure). [How this is measured](#benchmarks) · [raw JSON](bench/results.json)_
