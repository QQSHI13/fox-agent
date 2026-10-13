![harness bench dashboard](bench/bench.svg)

| agent | bundle | `--version` | TUI 1st byte | TUI 1st input | input latency 1s | idle PSS |
|---|---|---|---|---|---|---|
| **fox-agent** | 99 MB | 14 ms | **18 ms** | **377 ms** | **1 ms** | 35 MB |
| claude code | 257 MB | 10 ms | **224 ms** | — | — | 187 MB |
| codex | 140 MB | 42 ms | **44 ms** | **828 ms** | **1 ms** | 49 MB |
| opencode v2 | 207 MB | 84 ms | **141 ms** | **495 ms** | **66 ms** | 130 MB |
| jcode | 138 MB | 9 ms | **11 ms** | **709 ms** | **0 ms** | 28 MB |
| pi | 140 MB | 246 ms | **329 ms** | **855 ms** | **9 ms** | 132 MB |
| gemini cli | 140 MB | 1575 ms | **1618 ms** | **1669 ms** | **0 ms** | 146 MB |
| copilot cli | 140 MB | 104 ms | **785 ms** | — | — | 47 MB |
| crush | 140 MB | 140 ms | **575 ms** | **1091 ms** | **73 ms** | 69 MB |
| goose | 308 MB | 8 ms | **8 ms** | **369 ms** | **0 ms** | 104 MB |
| aider | 140 MB | 850 ms | **749 ms** | **1129 ms** | **10 ms** | 67 MB |
| amp | 134 MB | 250 ms | **257 ms** | **627 ms** | **1 ms** | 159 MB |
| cursor-agent | 140 MB | 474 ms | **442 ms** | — | — | 212 MB |
| qwen code | 140 MB | 38 ms | **844 ms** | **1321 ms** | — | 237 MB |
| codebuff | 140 MB | 953 ms | **922 ms** | **1442 ms** | **110 ms** | 58 MB |
| kilo code | 140 MB | 831 ms | **2590 ms** | **6590 ms** | **1651 ms** | 46 MB |
| droid | 292 MB | 107 ms | **132 ms** | **3182 ms** | **719 ms** | 223 MB |
| kimi code | 191 MB | 577 ms | **721 ms** | **1139 ms** | **5 ms** | 350 MB |
| devin | 195 MB | 4 ms | **48 ms** | **1050 ms** | **641 ms** | 48 MB |
| cline | 140 MB | 930 ms | **1131 ms** | — | — | 55 MB |
| continue | 140 MB | 1155 ms | — | — | — | 317 MB |
| iflow cli | 140 MB | 1243 ms | **1325 ms** | **2530 ms** | **46 ms** | 56 MB |

<details><summary>full precision · all collected fields</summary>

| agent | version | bin | bundle (MB) | bundle kind | `--version` (ms) | TUI 1st byte (ms) | TUI 1st input (ms) | input latency 1s (ms) | idle PSS (MB) |
|---|---|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.5.0-beta.1 | `/home/runner/work/fox-agent/fox-agent/bin/fox` | 99.0 | bin | 13.8 | 17.8 | 377.4 | 0.7 | 35.3 |
| claude code | 2.1.296 (Claude Code) | `/home/runner/.npm-global/bin/claude` | 257.1 | bin | 10.1 | 223.9 | — | — | 187.4 |
| codex | codex-cli 0.162.1 | `/home/runner/.npm-global/bin/codex` | 140.0 | bin | 42.3 | 44.4 | 828.1 | 0.6 | 49.1 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | `/home/runner/.npm-global/bin/opencode2` | 207.4 | bin | 84.0 | 140.5 | 495.3 | 66.1 | 129.6 |
| jcode | jcode v0.95.0 (6487bbd7e) | `/home/runner/.local/bin/jcode` | 138.2 | bin | 9.4 | 11.4 | 709.2 | 0.3 | 28.0 |
| pi | 1.2.0 | `/home/runner/.npm-global/bin/pi` | 140.0 | bin | 245.8 | 328.7 | 854.5 | 8.6 | 132.4 |
| gemini cli | 0.63.0 | `/home/runner/.npm-global/bin/gemini` | 140.0 | bin | 1575.0 | 1617.5 | 1668.9 | 0.1 | 146.1 |
| copilot cli | GitHub Copilot CLI 1.0.96. | `/home/runner/.npm-global/bin/copilot` | 140.0 | bin | 104.2 | 784.5 | — | — | 47.4 |
| crush | crush version v0.98.1 | `/home/runner/.npm-global/bin/crush` | 140.0 | bin | 139.9 | 575.1 | 1090.8 | 72.6 | 68.8 |
| goose | 1.54.0 | `/home/runner/.local/bin/goose` | 307.8 | bin | 7.8 | 7.7 | 369.5 | 0.2 | 104.3 |
| aider | aider 0.86.2 | `/home/runner/work/fox-agent/fox-agent/.venv-bench/bin/aider` | 140.0 | bin | 850.1 | 749.3 | 1129.3 | 10.3 | 66.8 |
| amp | 0.0.1791878731-g2f7fd0 (released 2026-10-13T08:05:31.000Z, 2 | `/home/runner/.local/bin/amp` | 134.4 | bin | 250.0 | 257.1 | 627.2 | 0.6 | 159.2 |
| cursor-agent | 2026.10.01-e373342 | `/home/runner/.local/bin/cursor-agent` | 140.0 | bin | 473.6 | 442.1 | — | — | 212.2 |
| qwen code | 0.25.1 | `/home/runner/.npm-global/bin/qwen` | 140.0 | bin | 38.4 | 844.2 | 1320.7 | — | 237.1 |
| codebuff | 1.0.688 | `/home/runner/.npm-global/bin/codebuff` | 140.0 | bin | 952.7 | 921.9 | 1441.6 | 110.0 | 57.5 |
| kilo code | 7.8.8 | `/home/runner/.npm-global/bin/kilocode` | 140.0 | bin | 831.4 | 2590.4 | 6590.2 | 1650.8 | 46.2 |
| droid | 0.240.0 | `/home/runner/.local/bin/droid` | 291.7 | bin | 106.7 | 132.1 | 3182.1 | 719.3 | 223.5 |
| kimi code | 2.1.1 | `/home/runner/.kimi-code/bin/kimi` | 190.8 | bin | 577.1 | 720.6 | 1138.6 | 4.8 | 349.6 |
| devin | devin 3000.11.3 (9c803229faa4) | `/home/runner/.local/bin/devin` | 195.0 | bin | 4.0 | 47.8 | 1050.2 | 641.0 | 48.4 |
| cline | 3.0.71 | `/home/runner/.npm-global/bin/cline` | 140.0 | bin | 930.1 | 1130.8 | — | — | 55.0 |
| continue | 1.5.47 | `/home/runner/.npm-global/bin/cn` | 140.0 | bin | 1154.8 | — | — | — | 316.9 |
| iflow cli | 0.5.19 | `/home/runner/.npm-global/bin/iflow` | 140.0 | bin | 1243.3 | 1325.3 | 2530.4 | 45.9 | 55.5 |

</details>

fox-agent headless vs scripted local provider: time to first token **62 ms**, peak RSS **60 MB**.

_Generated 2026-10-13T10:23:39Z on Linux x86_64 (6.17.0-1022-azure). [How this is measured](#benchmarks) · [raw JSON](bench/results.json)_
