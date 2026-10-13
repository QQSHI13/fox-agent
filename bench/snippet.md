![harness bench dashboard](bench/bench.svg)

| agent | bundle | `--version` | TUI 1st byte | TUI 1st input | input latency 1s | idle PSS |
|---|---|---|---|---|---|---|
| **fox-agent** | 120 MB | 15 ms | **18 ms** | **377 ms** | **1 ms** | 37 MB |
| claude code | 257 MB | 9 ms | **208 ms** | — | — | 187 MB |
| codex | 140 MB | 42 ms | **44 ms** | **830 ms** | **0 ms** | 49 MB |
| opencode v2 | 207 MB | 79 ms | **138 ms** | **496 ms** | **66 ms** | 131 MB |
| jcode | 138 MB | 9 ms | **12 ms** | **708 ms** | **0 ms** | 27 MB |
| pi | 140 MB | 244 ms | **319 ms** | **846 ms** | **8 ms** | 130 MB |
| gemini cli | 140 MB | 1518 ms | **1615 ms** | **1632 ms** | — | 146 MB |
| copilot cli | 140 MB | 101 ms | **747 ms** | — | — | 47 MB |
| crush | 140 MB | 130 ms | **278 ms** | **735 ms** | **72 ms** | 69 MB |
| goose | 308 MB | 7 ms | **7 ms** | **368 ms** | **0 ms** | 105 MB |
| aider | 140 MB | 802 ms | **735 ms** | **1123 ms** | **10 ms** | 67 MB |
| amp | 134 MB | 253 ms | **251 ms** | **615 ms** | **1 ms** | 161 MB |
| cursor-agent | 140 MB | 446 ms | **432 ms** | — | — | 218 MB |
| qwen code | 140 MB | 39 ms | **824 ms** | **1299 ms** | — | 246 MB |
| codebuff | 140 MB | 890 ms | **905 ms** | **1405 ms** | **111 ms** | 58 MB |
| kilo code | 140 MB | 832 ms | **2456 ms** | **6365 ms** | **1467 ms** | 46 MB |
| droid | 292 MB | 116 ms | **122 ms** | **3183 ms** | **727 ms** | 226 MB |
| kimi code | 191 MB | 575 ms | **729 ms** | **1130 ms** | **4 ms** | 351 MB |
| devin | 195 MB | 4 ms | **48 ms** | **1052 ms** | **641 ms** | 48 MB |
| cline | 140 MB | 835 ms | **1131 ms** | — | — | 55 MB |
| continue | 140 MB | 1103 ms | — | — | — | 318 MB |
| iflow cli | 140 MB | 1214 ms | **1302 ms** | **2479 ms** | **46 ms** | 56 MB |

<details><summary>full precision · all collected fields</summary>

| agent | version | bin | bundle (MB) | bundle kind | `--version` (ms) | TUI 1st byte (ms) | TUI 1st input (ms) | input latency 1s (ms) | idle PSS (MB) |
|---|---|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.5.0-beta.1 | `/home/runner/work/fox-agent/fox-agent/bin/fox` | 120.4 | bin | 14.9 | 18.3 | 377.2 | 0.6 | 36.5 |
| claude code | 2.1.296 (Claude Code) | `/home/runner/.npm-global/bin/claude` | 257.1 | bin | 9.0 | 208.2 | — | — | 187.4 |
| codex | codex-cli 0.162.1 | `/home/runner/.npm-global/bin/codex` | 140.0 | bin | 42.1 | 44.0 | 830.5 | 0.3 | 49.0 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | `/home/runner/.npm-global/bin/opencode2` | 207.4 | bin | 79.5 | 137.7 | 495.8 | 66.1 | 131.2 |
| jcode | jcode v0.95.0 (6487bbd7e) | `/home/runner/.local/bin/jcode` | 138.2 | bin | 9.3 | 11.9 | 708.4 | 0.4 | 27.4 |
| pi | 1.2.0 | `/home/runner/.npm-global/bin/pi` | 140.0 | bin | 243.8 | 319.0 | 846.4 | 8.3 | 130.1 |
| gemini cli | 0.63.0 | `/home/runner/.npm-global/bin/gemini` | 140.0 | bin | 1518.4 | 1614.9 | 1631.6 | — | 146.0 |
| copilot cli | GitHub Copilot CLI 1.0.96. | `/home/runner/.npm-global/bin/copilot` | 140.0 | bin | 101.3 | 746.5 | — | — | 47.4 |
| crush | crush version v0.98.1 | `/home/runner/.npm-global/bin/crush` | 140.0 | bin | 129.9 | 278.3 | 735.3 | 72.2 | 68.9 |
| goose | 1.54.0 | `/home/runner/.local/bin/goose` | 307.8 | bin | 7.3 | 7.0 | 367.8 | 0.2 | 104.5 |
| aider | aider 0.86.2 | `/home/runner/work/fox-agent/fox-agent/.venv-bench/bin/aider` | 140.0 | bin | 801.9 | 735.2 | 1122.6 | 10.2 | 66.9 |
| amp | 0.0.1791864325-g52e626 (released 2026-10-13T04:05:25.000Z, 4 | `/home/runner/.local/bin/amp` | 134.4 | bin | 253.3 | 251.0 | 615.1 | 0.5 | 161.0 |
| cursor-agent | 2026.10.01-e373342 | `/home/runner/.local/bin/cursor-agent` | 140.0 | bin | 445.9 | 432.4 | — | — | 218.1 |
| qwen code | 0.25.1 | `/home/runner/.npm-global/bin/qwen` | 140.0 | bin | 38.5 | 823.7 | 1299.5 | — | 245.7 |
| codebuff | 1.0.688 | `/home/runner/.npm-global/bin/codebuff` | 140.0 | bin | 890.4 | 905.2 | 1405.1 | 111.3 | 57.6 |
| kilo code | 7.8.8 | `/home/runner/.npm-global/bin/kilocode` | 140.0 | bin | 831.6 | 2455.5 | 6365.4 | 1467.5 | 46.2 |
| droid | 0.240.0 | `/home/runner/.local/bin/droid` | 291.7 | bin | 115.6 | 122.4 | 3182.8 | 727.1 | 225.7 |
| kimi code | 2.1.1 | `/home/runner/.kimi-code/bin/kimi` | 190.8 | bin | 575.1 | 729.5 | 1129.8 | 4.4 | 350.5 |
| devin | devin 3000.11.3 (9c803229faa4) | `/home/runner/.local/bin/devin` | 195.0 | bin | 3.7 | 47.7 | 1051.8 | 641.0 | 48.4 |
| cline | 3.0.70 | `/home/runner/.npm-global/bin/cline` | 140.0 | bin | 834.5 | 1131.1 | — | — | 55.1 |
| continue | 1.5.47 | `/home/runner/.npm-global/bin/cn` | 140.0 | bin | 1103.5 | — | — | — | 318.0 |
| iflow cli | 0.5.19 | `/home/runner/.npm-global/bin/iflow` | 140.0 | bin | 1214.3 | 1302.2 | 2478.7 | 46.4 | 55.5 |

</details>

fox-agent headless vs scripted local provider: time to first token **61 ms**, peak RSS **60 MB**.

_Generated 2026-10-13T08:24:17Z on Linux x86_64 (6.17.0-1022-azure). [How this is measured](#benchmarks) · [raw JSON](bench/results.json)_
