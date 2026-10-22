![harness bench dashboard](bench/bench.svg)

| agent | bundle | `--version` | TUI 1st byte | TUI 1st input | input latency | idle PSS |
|---|---|---|---|---|---|---|
| **fox-agent** | 117 MB | 12 ms | **14 ms** | **375 ms** | **0 ms** | 38 MB |
| claude code | 292 MB | 8 ms | **203 ms** | — | — | 194 MB |
| codex | 140 MB | 35 ms | **38 ms** | **798 ms** | **1 ms** | 48 MB |
| opencode v2 | 207 MB | 67 ms | **115 ms** | **479 ms** | **0 ms** | 123 MB |
| jcode | 170 MB | 7 ms | **9 ms** | **672 ms** | **0 ms** | 35 MB |
| pi | 140 MB | 205 ms | **267 ms** | **776 ms** | **7 ms** | 131 MB |
| pi-bolt | 262 MB | 9 ms | **29 ms** | **512 ms** | **2 ms** | 96 MB |
| gemini cli | 140 MB | 1230 ms | **1297 ms** | **1302 ms** | **0 ms** | — |
| copilot cli | 140 MB | 86 ms | **663 ms** | — | — | 46 MB |
| crush | 140 MB | 117 ms | **427 ms** | **823 ms** | **57 ms** | 67 MB |
| goose | 304 MB | 6 ms | **6 ms** | **366 ms** | **0 ms** | 111 MB |
| aider | 140 MB | 611 ms | **551 ms** | **932 ms** | **8 ms** | 68 MB |
| amp | 135 MB | 224 ms | **230 ms** | **595 ms** | **4 ms** | 163 MB |
| cursor-agent | 140 MB | 382 ms | **355 ms** | — | — | 250 MB |
| qwen code | 140 MB | 34 ms | **679 ms** | **1112 ms** | **0 ms** | 288 MB |
| codebuff | 140 MB | 812 ms | **780 ms** | **1289 ms** | **0 ms** | 57 MB |
| kilo code | 140 MB | 764 ms | **2267 ms** | **5893 ms** | **2456 ms** | 45 MB |
| droid | 300 MB | 82 ms | **116 ms** | **3179 ms** | **1891 ms** | 292 MB |
| kimi code | 192 MB | 495 ms | **635 ms** | **1009 ms** | **4 ms** | 353 MB |
| devin | 200 MB | 3 ms | **17 ms** | **1020 ms** | **142 ms** | 71 MB |
| cline | 140 MB | 808 ms | **1063 ms** | — | — | 53 MB |
| continue | 140 MB | 895 ms | — | — | — | 316 MB |
| iflow cli | 140 MB | 984 ms | **1059 ms** | **1826 ms** | **0 ms** | 57 MB |

<details><summary>full precision · all collected fields</summary>

| agent | version | bin | bundle (MB) | bundle kind | `--version` (ms) | TUI 1st byte (ms) | TUI 1st input (ms) | input latency (ms) | idle PSS (MB) |
|---|---|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.6.0 | `/home/runner/work/fox-agent/fox-agent/bin/fox` | 117.5 | bin | 12.2 | 13.9 | 375.4 | 0.5 | 38.5 |
| claude code | 2.1.308 (Claude Code) | `/home/runner/.npm-global/bin/claude` | 292.2 | bin | 8.1 | 202.5 | — | — | 194.3 |
| codex | codex-cli 0.163.0 | `/home/runner/.npm-global/bin/codex` | 140.0 | bin | 34.7 | 37.7 | 798.2 | 0.5 | 47.6 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | `/home/runner/.npm-global/bin/opencode2` | 207.4 | bin | 67.3 | 114.8 | 478.9 | 0.1 | 123.1 |
| jcode | jcode v0.99.0 (774613c90) | `/home/runner/.local/bin/jcode` | 169.6 | bin | 7.4 | 9.3 | 672.4 | 0.3 | 35.4 |
| pi | 1.4.0 | `/home/runner/.npm-global/bin/pi` | 140.0 | bin | 204.6 | 267.0 | 776.1 | 7.3 | 131.2 |
| pi-bolt | 1.4.0 (Pi-Bolt 0.9.8, linux-x64, JIT off) | `/home/runner/.local/bin/pi-bolt` | 262.0 | bin | 9.3 | 29.0 | 511.6 | 1.6 | 96.5 |
| gemini cli | 0.65.0 | `/home/runner/.npm-global/bin/gemini` | 140.0 | bin | 1229.7 | 1297.0 | 1302.3 | 0.1 | — |
| copilot cli | GitHub Copilot CLI 1.0.102. | `/home/runner/.npm-global/bin/copilot` | 140.0 | bin | 86.2 | 663.0 | — | — | 46.0 |
| crush | crush version v0.98.1 | `/home/runner/.npm-global/bin/crush` | 140.0 | bin | 117.4 | 427.1 | 823.5 | 56.6 | 67.4 |
| goose | 1.55.0 | `/home/runner/.local/bin/goose` | 304.0 | bin | 5.7 | 5.7 | 366.3 | 0.2 | 111.2 |
| aider | aider 0.86.2 | `/home/runner/work/fox-agent/fox-agent/.venv-bench/bin/aider` | 140.0 | bin | 611.5 | 551.4 | 932.0 | 7.9 | 67.8 |
| amp | 0.0.1792670445-ge8d5b3 (released 2026-10-22T12:00:45.000Z, 1 | `/home/runner/.local/bin/amp` | 135.3 | bin | 223.7 | 229.7 | 595.3 | 3.9 | 162.6 |
| cursor-agent | 2026.10.19-6bbf2c4 | `/home/runner/.local/bin/cursor-agent` | 140.0 | bin | 382.5 | 354.9 | — | — | 249.7 |
| qwen code | 0.26.0 | `/home/runner/.npm-global/bin/qwen` | 140.0 | bin | 34.0 | 679.3 | 1112.4 | 0.1 | 288.3 |
| codebuff | 1.0.688 | `/home/runner/.npm-global/bin/codebuff` | 140.0 | bin | 812.5 | 779.5 | 1289.4 | 0.1 | 56.7 |
| kilo code | 7.8.15 | `/home/runner/.npm-global/bin/kilocode` | 140.0 | bin | 763.9 | 2266.8 | 5893.0 | 2455.9 | 44.8 |
| droid | 0.247.0 | `/home/runner/.local/bin/droid` | 299.5 | bin | 81.6 | 116.5 | 3178.7 | 1891.0 | 291.7 |
| kimi code | 2.3.0 | `/home/runner/.kimi-code/bin/kimi` | 192.5 | bin | 494.6 | 634.9 | 1008.8 | 3.8 | 353.1 |
| devin | devin 3000.11.92 (7f4e64980e22) | `/home/runner/.local/bin/devin` | 200.4 | bin | 3.4 | 16.7 | 1020.1 | 142.2 | 71.3 |
| cline | 3.0.73 | `/home/runner/.npm-global/bin/cline` | 140.0 | bin | 808.3 | 1062.6 | — | — | 53.4 |
| continue | 1.5.47 | `/home/runner/.npm-global/bin/cn` | 140.0 | bin | 895.0 | — | — | — | 316.2 |
| iflow cli | 0.5.19 | `/home/runner/.npm-global/bin/iflow` | 140.0 | bin | 984.3 | 1058.7 | 1826.3 | 0.1 | 56.5 |

</details>

fox-agent headless vs scripted local provider: time to first token **49 ms**, peak RSS **64 MB**.

_Generated 2026-10-22T13:20:30Z on Linux x86_64 (7.0.0-1017-azure). [How this is measured](#benchmarks) · [raw JSON](bench/results.json)_
