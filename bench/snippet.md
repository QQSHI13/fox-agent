![harness bench dashboard](bench/bench.svg)

| agent | bundle | `--version` | TUI 1st byte | TUI 1st input | input latency 1s | idle PSS |
|---|---|---|---|---|---|---|
| **fox-agent** | 99 MB | 16 ms | **17 ms** | **380 ms** | **1 ms** | 38 MB |
| claude code | 291 MB | 9 ms | **246 ms** | — | — | 194 MB |
| codex | 140 MB | 44 ms | **45 ms** | **808 ms** | **2 ms** | 48 MB |
| opencode v2 | 207 MB | 85 ms | **144 ms** | **498 ms** | **66 ms** | 126 MB |
| jcode | 170 MB | 9 ms | **12 ms** | **760 ms** | **0 ms** | 35 MB |
| pi | 140 MB | 254 ms | **331 ms** | **860 ms** | **8 ms** | 133 MB |
| pi-bolt | 261 MB | 13 ms | **43 ms** | **520 ms** | **2 ms** | 96 MB |
| gemini cli | 140 MB | 1574 ms | **1678 ms** | **1728 ms** | **0 ms** | 146 MB |
| copilot cli | 140 MB | 108 ms | **798 ms** | — | — | 46 MB |
| crush | 140 MB | 172 ms | **270 ms** | **707 ms** | **73 ms** | 68 MB |
| goose | 304 MB | 8 ms | **8 ms** | **368 ms** | **0 ms** | 109 MB |
| aider | 140 MB | 846 ms | **752 ms** | **1154 ms** | **10 ms** | 68 MB |
| amp | 135 MB | 263 ms | **269 ms** | **624 ms** | **1 ms** | 161 MB |
| cursor-agent | 140 MB | 481 ms | **451 ms** | **832 ms** | — | 248 MB |
| qwen code | 140 MB | 40 ms | **854 ms** | **1334 ms** | — | 234 MB |
| codebuff | 140 MB | 920 ms | **892 ms** | **1395 ms** | **110 ms** | 57 MB |
| kilo code | 140 MB | 847 ms | **2618 ms** | **6539 ms** | **1578 ms** | 45 MB |
| droid | 295 MB | 123 ms | **127 ms** | **3253 ms** | **774 ms** | 348 MB |
| kimi code | 192 MB | 621 ms | **796 ms** | **1184 ms** | **5 ms** | 350 MB |
| devin | 200 MB | 5 ms | **25 ms** | **1034 ms** | **1641 ms** | 70 MB |
| cline | 140 MB | 889 ms | **1184 ms** | — | — | 53 MB |
| continue | 140 MB | 1177 ms | — | — | — | 315 MB |
| iflow cli | 140 MB | 1264 ms | **1356 ms** | **2541 ms** | **47 ms** | 54 MB |

<details><summary>full precision · all collected fields</summary>

| agent | version | bin | bundle (MB) | bundle kind | `--version` (ms) | TUI 1st byte (ms) | TUI 1st input (ms) | input latency 1s (ms) | idle PSS (MB) |
|---|---|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.6.0 | `/home/runner/work/fox-agent/fox-agent/bin/fox` | 99.1 | bin | 15.8 | 17.4 | 379.9 | 0.7 | 37.5 |
| claude code | 2.1.305 (Claude Code) | `/home/runner/.npm-global/bin/claude` | 290.5 | bin | 9.0 | 245.7 | — | — | 193.6 |
| codex | codex-cli 0.163.0 | `/home/runner/.npm-global/bin/codex` | 140.0 | bin | 44.4 | 45.1 | 808.0 | 1.7 | 47.6 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | `/home/runner/.npm-global/bin/opencode2` | 207.4 | bin | 84.8 | 144.0 | 498.4 | 65.6 | 125.6 |
| jcode | jcode v0.99.0 (774613c90) | `/home/runner/.local/bin/jcode` | 169.6 | bin | 9.4 | 12.2 | 759.8 | 0.3 | 35.0 |
| pi | 1.3.0 | `/home/runner/.npm-global/bin/pi` | 140.0 | bin | 254.5 | 331.0 | 860.3 | 8.2 | 132.8 |
| pi-bolt | 1.3.0 (Pi-Bolt 0.9.6, linux-x64, JIT off) | `/home/runner/.local/bin/pi-bolt` | 261.1 | bin | 13.2 | 43.0 | 520.2 | 1.7 | 96.2 |
| gemini cli | 0.65.0 | `/home/runner/.npm-global/bin/gemini` | 140.0 | bin | 1574.1 | 1678.4 | 1728.3 | 0.1 | 145.7 |
| copilot cli | GitHub Copilot CLI 1.0.101. | `/home/runner/.npm-global/bin/copilot` | 140.0 | bin | 107.6 | 798.4 | — | — | 46.2 |
| crush | crush version v0.98.1 | `/home/runner/.npm-global/bin/crush` | 140.0 | bin | 172.2 | 270.2 | 707.2 | 73.2 | 67.8 |
| goose | 1.55.0 | `/home/runner/.local/bin/goose` | 304.0 | bin | 8.3 | 8.1 | 368.5 | 0.2 | 109.4 |
| aider | aider 0.86.2 | `/home/runner/work/fox-agent/fox-agent/.venv-bench/bin/aider` | 140.0 | bin | 846.3 | 752.2 | 1154.0 | 10.3 | 67.7 |
| amp | 0.0.1792540877-gcc084c (released 2026-10-21T00:01:17.000Z, 3 | `/home/runner/.local/bin/amp` | 135.0 | bin | 262.7 | 268.9 | 624.4 | 0.6 | 161.5 |
| cursor-agent | 2026.10.19-6bbf2c4 | `/home/runner/.local/bin/cursor-agent` | 140.0 | bin | 480.5 | 451.2 | 831.7 | — | 247.8 |
| qwen code | 0.25.3 | `/home/runner/.npm-global/bin/qwen` | 140.0 | bin | 39.8 | 854.3 | 1333.9 | — | 234.3 |
| codebuff | 1.0.688 | `/home/runner/.npm-global/bin/codebuff` | 140.0 | bin | 919.7 | 891.5 | 1395.3 | 110.3 | 56.6 |
| kilo code | 7.8.15 | `/home/runner/.npm-global/bin/kilocode` | 140.0 | bin | 847.1 | 2618.4 | 6539.2 | 1577.7 | 44.9 |
| droid | 0.245.0 | `/home/runner/.local/bin/droid` | 295.5 | bin | 123.1 | 127.0 | 3252.7 | 773.6 | 347.6 |
| kimi code | 2.2.0 | `/home/runner/.kimi-code/bin/kimi` | 191.9 | bin | 620.5 | 796.2 | 1183.6 | 4.5 | 349.7 |
| devin | devin 3000.11.92 (7f4e64980e22) | `/home/runner/.local/bin/devin` | 200.4 | bin | 4.8 | 24.6 | 1034.3 | 1640.9 | 70.0 |
| cline | 3.0.73 | `/home/runner/.npm-global/bin/cline` | 140.0 | bin | 888.8 | 1183.5 | — | — | 53.4 |
| continue | 1.5.47 | `/home/runner/.npm-global/bin/cn` | 140.0 | bin | 1176.8 | — | — | — | 315.2 |
| iflow cli | 0.5.19 | `/home/runner/.npm-global/bin/iflow` | 140.0 | bin | 1264.5 | 1355.5 | 2540.7 | 46.7 | 54.1 |

</details>

fox-agent headless vs scripted local provider: time to first token **62 ms**, peak RSS **64 MB**.

_Generated 2026-10-21T03:32:29Z on Linux x86_64 (7.0.0-1017-azure). [How this is measured](#benchmarks) · [raw JSON](bench/results.json)_
