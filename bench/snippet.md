![harness bench dashboard](bench/bench.svg)

| agent | bundle | `--version` | TUI 1st byte | TUI 1st input | input latency 1s | idle PSS |
|---|---|---|---|---|---|---|
| **fox-agent** | 99 MB | 11 ms | **13 ms** | **373 ms** | **1 ms** | 35 MB |
| claude code | 292 MB | 8 ms | **155 ms** | — | — | 194 MB |
| codex | 140 MB | 31 ms | **33 ms** | **794 ms** | **0 ms** | 49 MB |
| opencode v2 | 207 MB | 55 ms | **88 ms** | **450 ms** | **42 ms** | 126 MB |
| jcode | 170 MB | 7 ms | **9 ms** | **675 ms** | **0 ms** | 32 MB |
| pi | 140 MB | 161 ms | **205 ms** | **706 ms** | **6 ms** | 131 MB |
| pi-bolt | 261 MB | 9 ms | **31 ms** | **508 ms** | **1 ms** | 96 MB |
| gemini cli | 140 MB | 946 ms | **1027 ms** | **1069 ms** | — | — |
| copilot cli | 140 MB | 75 ms | **565 ms** | — | — | 47 MB |
| crush | 140 MB | 109 ms | **373 ms** | **803 ms** | **39 ms** | 69 MB |
| goose | 304 MB | 7 ms | **7 ms** | **367 ms** | **0 ms** | 112 MB |
| aider | 140 MB | 600 ms | **468 ms** | **842 ms** | **6 ms** | 67 MB |
| amp | 135 MB | 195 ms | **190 ms** | **551 ms** | **1 ms** | 166 MB |
| cursor-agent | 140 MB | 310 ms | **274 ms** | — | — | 252 MB |
| qwen code | 140 MB | 29 ms | **535 ms** | **964 ms** | — | 293 MB |
| codebuff | 140 MB | 668 ms | **668 ms** | **1147 ms** | **109 ms** | 58 MB |
| kilo code | 140 MB | 623 ms | **1865 ms** | **5222 ms** | **772 ms** | 46 MB |
| droid | 295 MB | 75 ms | **69 ms** | **3146 ms** | **697 ms** | 275 MB |
| kimi code | 192 MB | 388 ms | **505 ms** | **883 ms** | **3 ms** | 356 MB |
| devin | 200 MB | 3 ms | **17 ms** | **1021 ms** | **1641 ms** | 96 MB |
| cline | 140 MB | 623 ms | **909 ms** | — | — | 55 MB |
| continue | 140 MB | 751 ms | **967 ms** | — | — | 325 MB |
| iflow cli | 140 MB | 767 ms | **837 ms** | **1583 ms** | **45 ms** | 58 MB |

<details><summary>full precision · all collected fields</summary>

| agent | version | bin | bundle (MB) | bundle kind | `--version` (ms) | TUI 1st byte (ms) | TUI 1st input (ms) | input latency 1s (ms) | idle PSS (MB) |
|---|---|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.6.0 | `/home/runner/work/fox-agent/fox-agent/bin/fox` | 99.1 | bin | 10.7 | 12.6 | 372.6 | 0.6 | 35.5 |
| claude code | 2.1.307 (Claude Code) | `/home/runner/.npm-global/bin/claude` | 292.0 | bin | 7.6 | 154.5 | — | — | 194.3 |
| codex | codex-cli 0.163.0 | `/home/runner/.npm-global/bin/codex` | 140.0 | bin | 30.7 | 32.9 | 793.7 | 0.5 | 49.0 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | `/home/runner/.npm-global/bin/opencode2` | 207.4 | bin | 55.1 | 88.2 | 449.6 | 42.1 | 125.5 |
| jcode | jcode v0.99.0 (774613c90) | `/home/runner/.local/bin/jcode` | 169.6 | bin | 7.0 | 9.2 | 674.7 | 0.3 | 31.7 |
| pi | 1.4.0 | `/home/runner/.npm-global/bin/pi` | 140.0 | bin | 160.7 | 205.3 | 706.0 | 5.7 | 130.8 |
| pi-bolt | 1.3.0 (Pi-Bolt 0.9.7, linux-x64, JIT off) | `/home/runner/.local/bin/pi-bolt` | 261.1 | bin | 9.2 | 31.4 | 508.0 | 1.4 | 96.4 |
| gemini cli | 0.65.0 | `/home/runner/.npm-global/bin/gemini` | 140.0 | bin | 946.1 | 1027.5 | 1069.0 | — | — |
| copilot cli | GitHub Copilot CLI 1.0.102. | `/home/runner/.npm-global/bin/copilot` | 140.0 | bin | 74.6 | 564.7 | — | — | 47.3 |
| crush | crush version v0.98.1 | `/home/runner/.npm-global/bin/crush` | 140.0 | bin | 109.2 | 372.6 | 802.9 | 39.4 | 68.6 |
| goose | 1.55.0 | `/home/runner/.local/bin/goose` | 304.0 | bin | 6.9 | 6.6 | 367.1 | 0.2 | 111.8 |
| aider | aider 0.86.2 | `/home/runner/work/fox-agent/fox-agent/.venv-bench/bin/aider` | 140.0 | bin | 599.8 | 468.2 | 841.8 | 6.2 | 66.8 |
| amp | 0.0.1792627309-g98c009 (released 2026-10-22T00:01:49.000Z, 5 | `/home/runner/.local/bin/amp` | 135.1 | bin | 194.6 | 190.3 | 550.9 | 0.6 | 165.7 |
| cursor-agent | 2026.10.19-6bbf2c4 | `/home/runner/.local/bin/cursor-agent` | 140.0 | bin | 309.8 | 274.3 | — | — | 252.1 |
| qwen code | 0.26.0 | `/home/runner/.npm-global/bin/qwen` | 140.0 | bin | 28.6 | 535.3 | 963.6 | — | 293.1 |
| codebuff | 1.0.688 | `/home/runner/.npm-global/bin/codebuff` | 140.0 | bin | 668.5 | 667.8 | 1147.1 | 109.3 | 57.7 |
| kilo code | 7.8.15 | `/home/runner/.npm-global/bin/kilocode` | 140.0 | bin | 622.9 | 1865.0 | 5221.8 | 772.3 | 46.2 |
| droid | 0.245.1 | `/home/runner/.local/bin/droid` | 295.5 | bin | 75.2 | 69.3 | 3146.3 | 696.7 | 275.4 |
| kimi code | 2.3.0 | `/home/runner/.kimi-code/bin/kimi` | 192.5 | bin | 388.4 | 504.6 | 882.9 | 3.0 | 356.4 |
| devin | devin 3000.11.92 (7f4e64980e22) | `/home/runner/.local/bin/devin` | 200.4 | bin | 3.4 | 17.3 | 1020.7 | 1640.9 | 96.0 |
| cline | 3.0.73 | `/home/runner/.npm-global/bin/cline` | 140.0 | bin | 623.0 | 909.2 | — | — | 55.0 |
| continue | 1.5.47 | `/home/runner/.npm-global/bin/cn` | 140.0 | bin | 750.8 | 967.0 | — | — | 325.1 |
| iflow cli | 0.5.19 | `/home/runner/.npm-global/bin/iflow` | 140.0 | bin | 766.7 | 837.0 | 1582.8 | 45.1 | 57.9 |

</details>

fox-agent headless vs scripted local provider: time to first token **42 ms**, peak RSS **60 MB**.

_Generated 2026-10-22T01:06:14Z on Linux x86_64 (6.17.0-1022-azure). [How this is measured](#benchmarks) · [raw JSON](bench/results.json)_
