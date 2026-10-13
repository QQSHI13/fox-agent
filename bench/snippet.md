![harness bench dashboard](bench/bench.svg)

| agent | bundle | `--version` | TUI 1st byte | TUI 1st input | input latency 1s | idle PSS |
|---|---|---|---|---|---|---|
| **fox-agent** | 99 MB | 13 ms | **16 ms** | **376 ms** | **1 ms** | 35 MB |
| claude code | 257 MB | 9 ms | **204 ms** | — | — | 188 MB |
| codex | 140 MB | 43 ms | **44 ms** | **774 ms** | **1 ms** | 49 MB |
| opencode v2 | 207 MB | 82 ms | **132 ms** | **498 ms** | **64 ms** | 128 MB |
| jcode | 138 MB | 9 ms | **12 ms** | **711 ms** | **0 ms** | 28 MB |
| pi | 140 MB | 248 ms | **329 ms** | **852 ms** | **9 ms** | 131 MB |
| gemini cli | 140 MB | 1548 ms | **1665 ms** | **1681 ms** | **0 ms** | 146 MB |
| copilot cli | 140 MB | 104 ms | **795 ms** | — | — | 47 MB |
| crush | 140 MB | 126 ms | **248 ms** | **696 ms** | **72 ms** | 69 MB |
| goose | 308 MB | 7 ms | **7 ms** | **368 ms** | **0 ms** | 105 MB |
| aider | 140 MB | 820 ms | **731 ms** | **1106 ms** | **10 ms** | 67 MB |
| amp | 134 MB | 245 ms | **258 ms** | **618 ms** | **1 ms** | 162 MB |
| cursor-agent | 140 MB | 452 ms | **432 ms** | — | — | 218 MB |
| qwen code | 140 MB | 38 ms | **855 ms** | **1287 ms** | — | 244 MB |
| codebuff | 140 MB | 893 ms | **899 ms** | **1410 ms** | **110 ms** | 58 MB |
| kilo code | 140 MB | 862 ms | **2599 ms** | **6604 ms** | **1569 ms** | 46 MB |
| droid | 292 MB | 113 ms | **131 ms** | **3202 ms** | **737 ms** | 208 MB |
| kimi code | 191 MB | 600 ms | **757 ms** | **1215 ms** | **4 ms** | 327 MB |
| devin | 195 MB | 4 ms | **49 ms** | **1051 ms** | **641 ms** | 48 MB |
| cline | 140 MB | 867 ms | **1129 ms** | — | — | 55 MB |
| continue | 140 MB | 1125 ms | — | — | — | 317 MB |
| iflow cli | 140 MB | 1192 ms | **1343 ms** | **2507 ms** | **47 ms** | 56 MB |

<details><summary>full precision · all collected fields</summary>

| agent | version | bin | bundle (MB) | bundle kind | `--version` (ms) | TUI 1st byte (ms) | TUI 1st input (ms) | input latency 1s (ms) | idle PSS (MB) |
|---|---|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.5.0-beta.1 | `/home/runner/work/fox-agent/fox-agent/bin/fox` | 99.0 | bin | 12.6 | 16.3 | 376.3 | 0.6 | 35.0 |
| claude code | 2.1.296 (Claude Code) | `/home/runner/.npm-global/bin/claude` | 257.1 | bin | 8.9 | 204.0 | — | — | 187.7 |
| codex | codex-cli 0.162.1 | `/home/runner/.npm-global/bin/codex` | 140.0 | bin | 42.5 | 43.5 | 773.9 | 0.6 | 49.1 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | `/home/runner/.npm-global/bin/opencode2` | 207.4 | bin | 81.7 | 132.0 | 497.6 | 64.1 | 127.6 |
| jcode | jcode v0.95.0 (6487bbd7e) | `/home/runner/.local/bin/jcode` | 138.2 | bin | 9.4 | 12.0 | 710.8 | 0.4 | 27.8 |
| pi | 1.2.0 | `/home/runner/.npm-global/bin/pi` | 140.0 | bin | 248.5 | 329.3 | 852.4 | 8.6 | 131.1 |
| gemini cli | 0.63.0 | `/home/runner/.npm-global/bin/gemini` | 140.0 | bin | 1548.3 | 1665.0 | 1680.9 | 0.1 | 145.9 |
| copilot cli | GitHub Copilot CLI 1.0.96. | `/home/runner/.npm-global/bin/copilot` | 140.0 | bin | 104.0 | 795.0 | — | — | 47.4 |
| crush | crush version v0.98.1 | `/home/runner/.npm-global/bin/crush` | 140.0 | bin | 126.3 | 248.4 | 696.3 | 71.9 | 68.7 |
| goose | 1.54.0 | `/home/runner/.local/bin/goose` | 307.8 | bin | 7.3 | 7.2 | 368.0 | 0.2 | 104.7 |
| aider | aider 0.86.2 | `/home/runner/work/fox-agent/fox-agent/.venv-bench/bin/aider` | 140.0 | bin | 819.8 | 731.4 | 1106.1 | 9.9 | 66.9 |
| amp | 0.0.1791878731-g2f7fd0 (released 2026-10-13T08:05:31.000Z, 1 | `/home/runner/.local/bin/amp` | 134.4 | bin | 245.1 | 258.2 | 617.9 | 0.6 | 162.4 |
| cursor-agent | 2026.10.01-e373342 | `/home/runner/.local/bin/cursor-agent` | 140.0 | bin | 452.0 | 431.5 | — | — | 217.9 |
| qwen code | 0.25.1 | `/home/runner/.npm-global/bin/qwen` | 140.0 | bin | 38.2 | 854.9 | 1287.2 | — | 244.4 |
| codebuff | 1.0.688 | `/home/runner/.npm-global/bin/codebuff` | 140.0 | bin | 892.8 | 898.9 | 1409.6 | 109.9 | 57.5 |
| kilo code | 7.8.8 | `/home/runner/.npm-global/bin/kilocode` | 140.0 | bin | 861.5 | 2598.8 | 6604.3 | 1569.4 | 46.2 |
| droid | 0.240.0 | `/home/runner/.local/bin/droid` | 291.7 | bin | 113.4 | 131.1 | 3202.0 | 737.0 | 208.4 |
| kimi code | 2.1.1 | `/home/runner/.kimi-code/bin/kimi` | 190.8 | bin | 600.0 | 757.4 | 1215.4 | 4.4 | 327.1 |
| devin | devin 3000.11.3 (9c803229faa4) | `/home/runner/.local/bin/devin` | 195.0 | bin | 3.8 | 48.5 | 1050.8 | 641.0 | 48.4 |
| cline | 3.0.71 | `/home/runner/.npm-global/bin/cline` | 140.0 | bin | 867.4 | 1129.5 | — | — | 55.0 |
| continue | 1.5.47 | `/home/runner/.npm-global/bin/cn` | 140.0 | bin | 1124.9 | — | — | — | 316.6 |
| iflow cli | 0.5.19 | `/home/runner/.npm-global/bin/iflow` | 140.0 | bin | 1191.6 | 1343.4 | 2507.4 | 46.6 | 55.6 |

</details>

fox-agent headless vs scripted local provider: time to first token **59 ms**, peak RSS **60 MB**.

_Generated 2026-10-13T10:06:59Z on Linux x86_64 (6.17.0-1022-azure). [How this is measured](#benchmarks) · [raw JSON](bench/results.json)_
