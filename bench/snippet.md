![harness bench dashboard](bench/bench.svg)

| agent | bundle | `--version` | TUI 1st byte | TUI 1st input | input latency 1s | idle PSS |
|---|---|---|---|---|---|---|
| **fox-agent** | 99 MB | 15 ms | **17 ms** | **378 ms** | **1 ms** | 35 MB |
| claude code | 286 MB | 10 ms | **221 ms** | — | — | 190 MB |
| codex | 140 MB | 41 ms | **44 ms** | **775 ms** | **1 ms** | 49 MB |
| opencode v2 | 207 MB | 84 ms | **138 ms** | **497 ms** | **62 ms** | 129 MB |
| jcode | 167 MB | 9 ms | **12 ms** | **772 ms** | **0 ms** | 30 MB |
| pi | 140 MB | 246 ms | **329 ms** | **859 ms** | **9 ms** | 130 MB |
| gemini cli | 140 MB | 1527 ms | **1650 ms** | **1673 ms** | **0 ms** | 146 MB |
| copilot cli | 140 MB | 106 ms | **781 ms** | — | — | 47 MB |
| crush | 140 MB | 140 ms | **593 ms** | **1020 ms** | **73 ms** | 69 MB |
| goose | 304 MB | 8 ms | **7 ms** | **368 ms** | **0 ms** | 108 MB |
| aider | 140 MB | 803 ms | **736 ms** | **1144 ms** | **10 ms** | 67 MB |
| amp | 135 MB | 257 ms | **273 ms** | **630 ms** | **1 ms** | 163 MB |
| cursor-agent | 140 MB | 458 ms | **435 ms** | **809 ms** | — | 236 MB |
| qwen code | 140 MB | 38 ms | **823 ms** | **1298 ms** | — | 246 MB |
| codebuff | 140 MB | 931 ms | **906 ms** | **1459 ms** | **111 ms** | 58 MB |
| kilo code | 140 MB | 874 ms | **2569 ms** | **6841 ms** | **1701 ms** | 46 MB |
| droid | 294 MB | 112 ms | **123 ms** | **3229 ms** | **790 ms** | 327 MB |
| kimi code | 192 MB | 590 ms | **762 ms** | **1178 ms** | **5 ms** | 352 MB |
| devin | 200 MB | 4 ms | **23 ms** | **1028 ms** | **1639 ms** | 92 MB |
| cline | 140 MB | 929 ms | **1202 ms** | — | — | 55 MB |
| continue | 140 MB | 1101 ms | — | — | — | 317 MB |
| iflow cli | 140 MB | 1214 ms | **1308 ms** | **2133 ms** | **46 ms** | 56 MB |

<details><summary>full precision · all collected fields</summary>

| agent | version | bin | bundle (MB) | bundle kind | `--version` (ms) | TUI 1st byte (ms) | TUI 1st input (ms) | input latency 1s (ms) | idle PSS (MB) |
|---|---|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.6.0 | `/home/runner/work/fox-agent/fox-agent/bin/fox` | 99.0 | bin | 15.4 | 17.4 | 378.2 | 0.6 | 35.2 |
| claude code | 2.1.302 (Claude Code) | `/home/runner/.npm-global/bin/claude` | 285.8 | bin | 9.9 | 221.0 | — | — | 190.4 |
| codex | codex-cli 0.163.0 | `/home/runner/.npm-global/bin/codex` | 140.0 | bin | 41.5 | 43.9 | 774.7 | 0.6 | 49.1 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | `/home/runner/.npm-global/bin/opencode2` | 207.4 | bin | 83.8 | 138.5 | 497.0 | 61.6 | 129.1 |
| jcode | jcode v0.98.1 (1c7426eb1) | `/home/runner/.local/bin/jcode` | 166.8 | bin | 9.3 | 12.0 | 772.3 | 0.3 | 30.4 |
| pi | 1.3.0 | `/home/runner/.npm-global/bin/pi` | 140.0 | bin | 245.8 | 329.3 | 859.3 | 8.7 | 130.5 |
| gemini cli | 0.64.0 | `/home/runner/.npm-global/bin/gemini` | 140.0 | bin | 1526.7 | 1650.2 | 1672.7 | 0.1 | 146.3 |
| copilot cli | GitHub Copilot CLI 1.0.98. | `/home/runner/.npm-global/bin/copilot` | 140.0 | bin | 105.7 | 780.7 | — | — | 47.4 |
| crush | crush version v0.98.1 | `/home/runner/.npm-global/bin/crush` | 140.0 | bin | 140.2 | 593.3 | 1019.8 | 72.7 | 68.6 |
| goose | 1.55.0 | `/home/runner/.local/bin/goose` | 304.0 | bin | 7.6 | 7.4 | 368.2 | 0.2 | 108.4 |
| aider | aider 0.86.2 | `/home/runner/work/fox-agent/fox-agent/.venv-bench/bin/aider` | 140.0 | bin | 803.4 | 735.5 | 1143.7 | 10.1 | 66.8 |
| amp | 0.0.1792310430-g2972dc (released 2026-10-18T08:00:30.000Z, 3 | `/home/runner/.local/bin/amp` | 135.0 | bin | 256.9 | 272.9 | 629.8 | 0.6 | 162.5 |
| cursor-agent | 2026.10.16-e3cb207 | `/home/runner/.local/bin/cursor-agent` | 140.0 | bin | 458.3 | 435.0 | 808.7 | — | 235.6 |
| qwen code | 0.25.2 | `/home/runner/.npm-global/bin/qwen` | 140.0 | bin | 37.8 | 823.0 | 1298.2 | — | 246.0 |
| codebuff | 1.0.688 | `/home/runner/.npm-global/bin/codebuff` | 140.0 | bin | 930.7 | 905.7 | 1458.7 | 110.7 | 57.5 |
| kilo code | 7.8.12 | `/home/runner/.npm-global/bin/kilocode` | 140.0 | bin | 874.1 | 2569.5 | 6841.3 | 1700.5 | 46.2 |
| droid | 0.244.0 | `/home/runner/.local/bin/droid` | 294.4 | bin | 112.0 | 122.9 | 3228.8 | 790.0 | 327.0 |
| kimi code | 2.2.0 | `/home/runner/.kimi-code/bin/kimi` | 191.9 | bin | 590.4 | 762.1 | 1178.1 | 4.7 | 352.1 |
| devin | devin 3000.11.92 (7f4e64980e22) | `/home/runner/.local/bin/devin` | 200.4 | bin | 4.4 | 23.1 | 1028.0 | 1639.4 | 91.8 |
| cline | 3.0.73 | `/home/runner/.npm-global/bin/cline` | 140.0 | bin | 929.3 | 1202.4 | — | — | 55.0 |
| continue | 1.5.47 | `/home/runner/.npm-global/bin/cn` | 140.0 | bin | 1100.7 | — | — | — | 316.7 |
| iflow cli | 0.5.19 | `/home/runner/.npm-global/bin/iflow` | 140.0 | bin | 1214.4 | 1308.1 | 2133.2 | 46.5 | 55.5 |

</details>

fox-agent headless vs scripted local provider: time to first token **59 ms**, peak RSS **60 MB**.

_Generated 2026-10-18T11:39:48Z on Linux x86_64 (6.17.0-1022-azure). [How this is measured](#benchmarks) · [raw JSON](bench/results.json)_
