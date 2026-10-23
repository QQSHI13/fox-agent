![harness bench dashboard](bench/bench.svg)

| agent | bundle | `--version` | TUI 1st byte | TUI 1st input | input latency | idle PSS |
|---|---|---|---|---|---|---|
| **fox-agent** | 118 MB | 13 ms | **14 ms** | **374 ms** | **0 ms** | 36 MB |
| claude code | 293 MB | 11 ms | **199 ms** | — | — | 196 MB |
| codex | 430 MB | 36 ms | **38 ms** | **904 ms** | **0 ms** | 49 MB |
| opencode v2 | 207 MB | 69 ms | **113 ms** | **482 ms** | **0 ms** | 125 MB |
| jcode | 171 MB | 9 ms | **11 ms** | **701 ms** | **0 ms** | 32 MB |
| pi | 112 MB | 193 ms | **251 ms** | **739 ms** | **0 ms** | 132 MB |
| pi-bolt | 262 MB | 12 ms | **34 ms** | **513 ms** | **1 ms** | 96 MB |
| gemini cli | 103 MB | 1175 ms | **1247 ms** | **1270 ms** | **0 ms** | — |
| copilot cli | 198 MB | 87 ms | **637 ms** | — | — | 47 MB |
| crush | 129 MB | 122 ms | **772 ms** | **1194 ms** | **56 ms** | 69 MB |
| goose | 304 MB | 6 ms | **6 ms** | **367 ms** | **0 ms** | 110 MB |
| aider | 643 MB | 683 ms | **572 ms** | **971 ms** | **8 ms** | 67 MB |
| amp | 161 MB | 163 ms | **177 ms** | **546 ms** | **1 ms** | 138 MB |
| cursor-agent | 583 MB | 381 ms | **353 ms** | — | — | 252 MB |
| qwen code | 155 MB | 32 ms | **654 ms** | **1085 ms** | **0 ms** | 320 MB |
| codebuff | 140 MB | 745 ms | **739 ms** | **1259 ms** | **0 ms** | 58 MB |
| kilo code | 661 MB | 693 ms | **2034 ms** | **5701 ms** | **2485 ms** | 46 MB |
| droid | 319 MB | 92 ms | **78 ms** | **3254 ms** | **1889 ms** | 293 MB |
| kimi code | 192 MB | 469 ms | **585 ms** | **969 ms** | **3 ms** | 355 MB |
| devin | 200 MB | 4 ms | **20 ms** | **1024 ms** | **143 ms** | 94 MB |
| cline | 330 MB | 796 ms | **1079 ms** | — | — | 55 MB |
| continue | 83 MB | 902 ms | — | — | — | 317 MB |
| iflow cli | 180 MB | 970 ms | **1067 ms** | **1799 ms** | **0 ms** | 58 MB |

<details><summary>full precision · all collected fields</summary>

| agent | version | bin | bundle (MB) | bundle kind | `--version` (ms) | TUI 1st byte (ms) | TUI 1st input (ms) | input latency (ms) | idle PSS (MB) |
|---|---|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.6.0 | `/home/runner/work/fox-agent/fox-agent/bin/fox` | 117.5 | bin | 12.7 | 14.0 | 374.0 | 0.5 | 36.5 |
| claude code | 2.1.309 (Claude Code) | `/home/runner/.npm-global/bin/claude` | 293.5 | bin | 10.5 | 198.6 | — | — | 196.2 |
| codex | codex-cli 0.163.0 | `/home/runner/.npm-global/bin/codex` | 430.0 | pkg | 36.5 | 37.8 | 904.4 | 0.3 | 49.1 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | `/home/runner/.npm-global/bin/opencode2` | 207.4 | bin | 69.4 | 113.1 | 481.9 | 0.1 | 124.9 |
| jcode | jcode v0.99.1 (7206efd0c) | `/home/runner/.local/bin/jcode` | 171.3 | bin | 8.6 | 10.9 | 701.5 | 0.4 | 31.8 |
| pi | 1.4.0 | `/home/runner/.npm-global/bin/pi` | 111.8 | pkg | 193.2 | 250.9 | 738.9 | 0.1 | 131.5 |
| pi-bolt | 1.4.0 (Pi-Bolt 0.9.9, linux-x64, JIT off) | `/home/runner/.local/bin/pi-bolt` | 262.0 | bin | 11.6 | 33.9 | 513.3 | 1.5 | 96.4 |
| gemini cli | 0.65.0 | `/home/runner/.npm-global/bin/gemini` | 102.6 | pkg | 1174.7 | 1247.4 | 1270.1 | 0.1 | — |
| copilot cli | GitHub Copilot CLI 1.0.103. | `/home/runner/.npm-global/bin/copilot` | 198.5 | pkg | 87.4 | 636.7 | — | — | 47.3 |
| crush | crush version v0.98.1 | `/home/runner/.npm-global/bin/crush` | 128.7 | pkg | 121.7 | 772.1 | 1193.9 | 55.7 | 68.7 |
| goose | 1.55.0 | `/home/runner/.local/bin/goose` | 304.0 | bin | 6.4 | 6.4 | 367.1 | 0.2 | 109.8 |
| aider | aider 0.86.2 | `/home/runner/work/fox-agent/fox-agent/.venv-bench/bin/aider` | 642.8 | pkg | 683.1 | 572.4 | 970.5 | 7.9 | 66.8 |
| amp | 0.0.1792713681-g9b55f0 (released 2026-10-23T00:01:21.000Z, 2 | `/home/runner/.local/bin/amp` | 161.0 | bin | 163.4 | 176.9 | 545.6 | 0.6 | 138.2 |
| cursor-agent | 2026.10.22-27dcf5f | `/home/runner/.local/bin/cursor-agent` | 583.2 | pkg | 380.5 | 353.5 | — | — | 252.1 |
| qwen code | 0.26.0 | `/home/runner/.npm-global/bin/qwen` | 154.7 | pkg | 31.8 | 654.2 | 1085.1 | 0.1 | 319.7 |
| codebuff | 1.0.688 | `/home/runner/.npm-global/bin/codebuff` | 140.0 | bin | 744.6 | 738.5 | 1259.2 | 0.1 | 57.6 |
| kilo code | 7.8.15 | `/home/runner/.npm-global/bin/kilocode` | 661.5 | pkg | 693.0 | 2033.7 | 5700.9 | 2485.1 | 46.2 |
| droid | 0.248.0 | `/home/runner/.local/bin/droid` | 319.2 | bin | 91.7 | 78.4 | 3254.5 | 1888.6 | 292.8 |
| kimi code | 2.3.0 | `/home/runner/.kimi-code/bin/kimi` | 192.5 | bin | 469.3 | 584.8 | 969.0 | 3.2 | 355.0 |
| devin | devin 3000.11.92 (7f4e64980e22) | `/home/runner/.local/bin/devin` | 200.4 | bin | 4.0 | 20.3 | 1024.1 | 142.5 | 94.3 |
| cline | 3.0.73 | `/home/runner/.npm-global/bin/cline` | 330.3 | pkg | 795.7 | 1079.4 | — | — | 55.0 |
| continue | 1.5.47 | `/home/runner/.npm-global/bin/cn` | 82.7 | pkg | 901.8 | — | — | — | 317.4 |
| iflow cli | 0.5.19 | `/home/runner/.npm-global/bin/iflow` | 180.2 | pkg | 970.2 | 1066.6 | 1798.6 | 0.1 | 57.9 |

</details>

fox-agent headless vs scripted local provider: time to first token **81 ms**, peak RSS **61 MB**.

_Generated 2026-10-23T02:20:23Z on Linux x86_64 (6.17.0-1022-azure). [How this is measured](#benchmarks) · [raw JSON](bench/results.json)_
