![harness bench dashboard](bench/bench.svg)

| agent | bundle | `--version` | TUI 1st byte | TUI 1st input | input latency 1s | idle PSS |
|---|---|---|---|---|---|---|
| **fox-agent** | 99 MB | 15 ms | **18 ms** | **378 ms** | **1 ms** | 35 MB |
| claude code | 257 MB | 11 ms | **222 ms** | — | — | 188 MB |
| codex | 140 MB | 46 ms | **47 ms** | **814 ms** | **2 ms** | 49 MB |
| opencode v2 | 207 MB | 93 ms | **160 ms** | **518 ms** | **70 ms** | 129 MB |
| jcode | 138 MB | 10 ms | **12 ms** | **714 ms** | **0 ms** | 28 MB |
| pi | 140 MB | 253 ms | **332 ms** | **833 ms** | **9 ms** | 130 MB |
| gemini cli | 140 MB | 1633 ms | **1798 ms** | **1747 ms** | **0 ms** | 146 MB |
| copilot cli | 140 MB | 104 ms | **791 ms** | — | — | 47 MB |
| crush | 140 MB | 133 ms | **511 ms** | **1059 ms** | **73 ms** | 69 MB |
| goose | 308 MB | 8 ms | **8 ms** | **369 ms** | **0 ms** | 105 MB |
| aider | 140 MB | 843 ms | **749 ms** | **1148 ms** | **10 ms** | 67 MB |
| amp | 134 MB | 251 ms | **255 ms** | **633 ms** | **1 ms** | 159 MB |
| cursor-agent | 140 MB | 479 ms | **454 ms** | — | — | 218 MB |
| qwen code | 140 MB | 36 ms | **831 ms** | **1302 ms** | — | 227 MB |
| codebuff | 140 MB | 1115 ms | **1116 ms** | **1560 ms** | **114 ms** | 58 MB |
| kilo code | 140 MB | 928 ms | **2840 ms** | **6701 ms** | **1647 ms** | 46 MB |
| droid | 292 MB | 114 ms | **125 ms** | **3189 ms** | **734 ms** | 222 MB |
| kimi code | 191 MB | 624 ms | **749 ms** | **1136 ms** | **5 ms** | 350 MB |
| devin | 195 MB | 4 ms | **49 ms** | **1051 ms** | **641 ms** | 48 MB |
| cline | 140 MB | 908 ms | **1113 ms** | — | — | 55 MB |
| continue | 140 MB | 1252 ms | — | — | — | 317 MB |
| iflow cli | 140 MB | 1317 ms | **1381 ms** | **2582 ms** | **46 ms** | 56 MB |

<details><summary>full precision · all collected fields</summary>

| agent | version | bin | bundle (MB) | bundle kind | `--version` (ms) | TUI 1st byte (ms) | TUI 1st input (ms) | input latency 1s (ms) | idle PSS (MB) |
|---|---|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.5.0-beta.1 | `/home/runner/work/fox-agent/fox-agent/bin/fox` | 99.0 | bin | 15.2 | 17.8 | 377.6 | 0.7 | 35.0 |
| claude code | 2.1.296 (Claude Code) | `/home/runner/.npm-global/bin/claude` | 257.1 | bin | 10.5 | 221.9 | — | — | 187.5 |
| codex | codex-cli 0.162.1 | `/home/runner/.npm-global/bin/codex` | 140.0 | bin | 46.2 | 47.3 | 813.8 | 1.7 | 49.1 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | `/home/runner/.npm-global/bin/opencode2` | 207.4 | bin | 92.5 | 159.6 | 517.8 | 69.7 | 128.7 |
| jcode | jcode v0.95.0 (6487bbd7e) | `/home/runner/.local/bin/jcode` | 138.2 | bin | 9.7 | 12.5 | 714.3 | 0.5 | 28.0 |
| pi | 1.2.0 | `/home/runner/.npm-global/bin/pi` | 140.0 | bin | 252.8 | 331.9 | 833.3 | 8.7 | 129.9 |
| gemini cli | 0.63.0 | `/home/runner/.npm-global/bin/gemini` | 140.0 | bin | 1633.2 | 1797.9 | 1746.6 | 0.1 | 145.7 |
| copilot cli | GitHub Copilot CLI 1.0.96. | `/home/runner/.npm-global/bin/copilot` | 140.0 | bin | 103.9 | 790.8 | — | — | 47.4 |
| crush | crush version v0.98.1 | `/home/runner/.npm-global/bin/crush` | 140.0 | bin | 133.5 | 511.2 | 1058.6 | 72.9 | 68.7 |
| goose | 1.54.0 | `/home/runner/.local/bin/goose` | 307.8 | bin | 7.6 | 7.8 | 368.6 | 0.2 | 104.6 |
| aider | aider 0.86.2 | `/home/runner/work/fox-agent/fox-agent/.venv-bench/bin/aider` | 140.0 | bin | 842.6 | 749.0 | 1147.8 | 10.2 | 66.8 |
| amp | 0.0.1791878731-g2f7fd0 (released 2026-10-13T08:05:31.000Z, 1 | `/home/runner/.local/bin/amp` | 134.4 | bin | 250.7 | 255.2 | 633.1 | 0.6 | 159.1 |
| cursor-agent | 2026.10.01-e373342 | `/home/runner/.local/bin/cursor-agent` | 140.0 | bin | 478.6 | 453.8 | — | — | 217.9 |
| qwen code | 0.25.1 | `/home/runner/.npm-global/bin/qwen` | 140.0 | bin | 36.4 | 830.7 | 1302.1 | — | 227.2 |
| codebuff | 1.0.688 | `/home/runner/.npm-global/bin/codebuff` | 140.0 | bin | 1115.1 | 1116.3 | 1560.0 | 114.5 | 57.6 |
| kilo code | 7.8.8 | `/home/runner/.npm-global/bin/kilocode` | 140.0 | bin | 927.8 | 2839.7 | 6700.8 | 1647.1 | 46.2 |
| droid | 0.240.0 | `/home/runner/.local/bin/droid` | 291.7 | bin | 114.1 | 125.4 | 3189.1 | 734.2 | 222.5 |
| kimi code | 2.1.1 | `/home/runner/.kimi-code/bin/kimi` | 190.8 | bin | 624.3 | 748.5 | 1135.7 | 4.6 | 349.9 |
| devin | devin 3000.11.3 (9c803229faa4) | `/home/runner/.local/bin/devin` | 195.0 | bin | 4.0 | 49.0 | 1050.9 | 641.0 | 48.5 |
| cline | 3.0.71 | `/home/runner/.npm-global/bin/cline` | 140.0 | bin | 907.9 | 1113.2 | — | — | 55.1 |
| continue | 1.5.47 | `/home/runner/.npm-global/bin/cn` | 140.0 | bin | 1252.2 | — | — | — | 317.2 |
| iflow cli | 0.5.19 | `/home/runner/.npm-global/bin/iflow` | 140.0 | bin | 1317.2 | 1380.7 | 2582.2 | 46.2 | 55.6 |

</details>

fox-agent headless vs scripted local provider: time to first token **67 ms**, peak RSS **60 MB**.

_Generated 2026-10-13T10:13:20Z on Linux x86_64 (6.17.0-1022-azure). [How this is measured](#benchmarks) · [raw JSON](bench/results.json)_
