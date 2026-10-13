![harness bench dashboard](bench/bench.svg)

| agent | bundle | `--version` | TUI 1st byte | TUI 1st input | input latency 1s | idle PSS |
|---|---|---|---|---|---|---|
| **fox-agent** | 120 MB | 15 ms | **18 ms** | **378 ms** | **1 ms** | 37 MB |
| claude code | 257 MB | 10 ms | **209 ms** | — | — | 187 MB |
| codex | 140 MB | 42 ms | **44 ms** | **915 ms** | **0 ms** | 49 MB |
| opencode v2 | 207 MB | 82 ms | **144 ms** | **496 ms** | **59 ms** | 130 MB |
| jcode | 138 MB | 9 ms | **12 ms** | **714 ms** | **0 ms** | 27 MB |
| pi | 140 MB | 242 ms | **327 ms** | **816 ms** | **8 ms** | 130 MB |
| gemini cli | 140 MB | 1533 ms | **1617 ms** | **1635 ms** | — | 146 MB |
| copilot cli | 140 MB | 103 ms | **767 ms** | — | — | 47 MB |
| crush | 140 MB | 131 ms | **807 ms** | **1255 ms** | **73 ms** | 69 MB |
| goose | 308 MB | 7 ms | **7 ms** | **368 ms** | **0 ms** | 104 MB |
| aider | 140 MB | 829 ms | **743 ms** | **1115 ms** | **10 ms** | 67 MB |
| amp | 134 MB | 256 ms | **258 ms** | **631 ms** | **1 ms** | 162 MB |
| cursor-agent | 140 MB | 451 ms | **435 ms** | — | — | 218 MB |
| qwen code | 140 MB | 38 ms | **827 ms** | **1296 ms** | — | 247 MB |
| codebuff | 140 MB | 927 ms | **915 ms** | **1401 ms** | **111 ms** | 58 MB |
| kilo code | 140 MB | 845 ms | **2505 ms** | **6940 ms** | **1540 ms** | 46 MB |
| droid | 292 MB | 111 ms | **137 ms** | **1088 ms** | **760 ms** | 221 MB |
| kimi code | 191 MB | 572 ms | **725 ms** | **1109 ms** | **4 ms** | 350 MB |
| devin | 195 MB | 4 ms | **48 ms** | **1051 ms** | **641 ms** | 46 MB |
| cline | 140 MB | 905 ms | **1280 ms** | — | — | 55 MB |
| continue | 140 MB | 1138 ms | — | — | — | 317 MB |
| iflow cli | 140 MB | 1225 ms | **1322 ms** | **2130 ms** | **47 ms** | 56 MB |

<details><summary>full precision · all collected fields</summary>

| agent | version | bin | bundle (MB) | bundle kind | `--version` (ms) | TUI 1st byte (ms) | TUI 1st input (ms) | input latency 1s (ms) | idle PSS (MB) |
|---|---|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.5.0-beta.1 | `/home/runner/work/fox-agent/fox-agent/bin/fox` | 120.4 | bin | 15.0 | 18.0 | 378.1 | 0.6 | 36.6 |
| claude code | 2.1.296 (Claude Code) | `/home/runner/.npm-global/bin/claude` | 257.1 | bin | 9.8 | 209.2 | — | — | 187.5 |
| codex | codex-cli 0.162.1 | `/home/runner/.npm-global/bin/codex` | 140.0 | bin | 41.8 | 43.7 | 915.2 | 0.5 | 49.1 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | `/home/runner/.npm-global/bin/opencode2` | 207.4 | bin | 82.2 | 144.4 | 496.3 | 58.8 | 129.8 |
| jcode | jcode v0.95.0 (6487bbd7e) | `/home/runner/.local/bin/jcode` | 138.2 | bin | 9.4 | 11.7 | 713.9 | 0.4 | 27.3 |
| pi | 1.2.0 | `/home/runner/.npm-global/bin/pi` | 140.0 | bin | 241.5 | 327.4 | 815.6 | 8.1 | 129.6 |
| gemini cli | 0.63.0 | `/home/runner/.npm-global/bin/gemini` | 140.0 | bin | 1533.0 | 1616.8 | 1634.7 | — | 145.7 |
| copilot cli | GitHub Copilot CLI 1.0.96. | `/home/runner/.npm-global/bin/copilot` | 140.0 | bin | 102.7 | 767.5 | — | — | 47.4 |
| crush | crush version v0.98.1 | `/home/runner/.npm-global/bin/crush` | 140.0 | bin | 130.9 | 807.2 | 1254.7 | 72.6 | 69.0 |
| goose | 1.54.0 | `/home/runner/.local/bin/goose` | 307.8 | bin | 7.3 | 7.2 | 367.9 | 0.1 | 104.3 |
| aider | aider 0.86.2 | `/home/runner/work/fox-agent/fox-agent/.venv-bench/bin/aider` | 140.0 | bin | 828.8 | 742.7 | 1115.2 | 10.4 | 66.8 |
| amp | 0.0.1791878731-g2f7fd0 (released 2026-10-13T08:05:31.000Z, 3 | `/home/runner/.local/bin/amp` | 134.4 | bin | 256.2 | 258.3 | 630.9 | 0.5 | 162.4 |
| cursor-agent | 2026.10.01-e373342 | `/home/runner/.local/bin/cursor-agent` | 140.0 | bin | 451.2 | 434.9 | — | — | 218.1 |
| qwen code | 0.25.1 | `/home/runner/.npm-global/bin/qwen` | 140.0 | bin | 37.7 | 826.7 | 1295.9 | — | 247.2 |
| codebuff | 1.0.688 | `/home/runner/.npm-global/bin/codebuff` | 140.0 | bin | 926.8 | 915.4 | 1400.8 | 110.6 | 57.5 |
| kilo code | 7.8.8 | `/home/runner/.npm-global/bin/kilocode` | 140.0 | bin | 844.8 | 2505.0 | 6940.1 | 1539.6 | 46.3 |
| droid | 0.240.0 | `/home/runner/.local/bin/droid` | 291.7 | bin | 111.0 | 136.6 | 1087.7 | 759.8 | 220.7 |
| kimi code | 2.1.1 | `/home/runner/.kimi-code/bin/kimi` | 190.8 | bin | 572.2 | 725.2 | 1108.9 | 4.4 | 350.2 |
| devin | devin 3000.11.3 (9c803229faa4) | `/home/runner/.local/bin/devin` | 195.0 | bin | 4.0 | 48.1 | 1051.4 | 641.0 | 46.4 |
| cline | 3.0.70 | `/home/runner/.npm-global/bin/cline` | 140.0 | bin | 904.5 | 1280.3 | — | — | 55.1 |
| continue | 1.5.47 | `/home/runner/.npm-global/bin/cn` | 140.0 | bin | 1137.8 | — | — | — | 316.8 |
| iflow cli | 0.5.19 | `/home/runner/.npm-global/bin/iflow` | 140.0 | bin | 1225.4 | 1321.8 | 2130.3 | 47.0 | 55.7 |

</details>

fox-agent headless vs scripted local provider: time to first token **62 ms**, peak RSS **61 MB**.

_Generated 2026-10-13T08:49:42Z on Linux x86_64 (6.17.0-1022-azure). [How this is measured](#benchmarks) · [raw JSON](bench/results.json)_
