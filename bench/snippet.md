![harness bench dashboard](bench/bench.svg)

| agent | bundle | `--version` | TUI 1st byte | TUI 1st input | input latency | idle PSS |
|---|---|---|---|---|---|---|
| **fox-agent** | 117 MB | 15 ms | **18 ms** | **378 ms** | **1 ms** | 39 MB |
| claude code | 292 MB | 13 ms | **237 ms** | — | — | 194 MB |
| codex | 140 MB | 43 ms | **45 ms** | **790 ms** | **0 ms** | 48 MB |
| opencode v2 | 207 MB | 82 ms | **133 ms** | **501 ms** | **0 ms** | 127 MB |
| jcode | 170 MB | 10 ms | **13 ms** | **766 ms** | **0 ms** | 32 MB |
| pi | 140 MB | 254 ms | **326 ms** | **858 ms** | **8 ms** | 134 MB |
| pi-bolt | 262 MB | 13 ms | **39 ms** | **518 ms** | **2 ms** | 96 MB |
| gemini cli | 140 MB | 1564 ms | **1643 ms** | **1657 ms** | **0 ms** | 145 MB |
| copilot cli | 140 MB | 106 ms | **779 ms** | — | — | 46 MB |
| crush | 140 MB | 162 ms | **287 ms** | **749 ms** | **72 ms** | 68 MB |
| goose | 304 MB | 7 ms | **7 ms** | **368 ms** | **0 ms** | 111 MB |
| aider | 140 MB | 778 ms | **723 ms** | **1107 ms** | **10 ms** | 68 MB |
| amp | 135 MB | 259 ms | **266 ms** | **630 ms** | **3 ms** | 164 MB |
| cursor-agent | 140 MB | 460 ms | **439 ms** | — | — | 237 MB |
| qwen code | 140 MB | 39 ms | **832 ms** | **1307 ms** | **0 ms** | 245 MB |
| codebuff | 140 MB | 888 ms | **868 ms** | **1381 ms** | **0 ms** | 56 MB |
| kilo code | 140 MB | 818 ms | **2464 ms** | **6488 ms** | **2780 ms** | 45 MB |
| droid | 300 MB | 124 ms | **137 ms** | **3223 ms** | **1887 ms** | 293 MB |
| kimi code | 192 MB | 643 ms | **784 ms** | **1163 ms** | **4 ms** | 352 MB |
| devin | 200 MB | 4 ms | **25 ms** | **1029 ms** | **143 ms** | 71 MB |
| cline | 140 MB | 854 ms | **1197 ms** | — | — | 53 MB |
| continue | 140 MB | 1159 ms | — | — | — | 316 MB |
| iflow cli | 140 MB | 1241 ms | **1335 ms** | **2517 ms** | **0 ms** | 54 MB |

<details><summary>full precision · all collected fields</summary>

| agent | version | bin | bundle (MB) | bundle kind | `--version` (ms) | TUI 1st byte (ms) | TUI 1st input (ms) | input latency (ms) | idle PSS (MB) |
|---|---|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.6.0 | `/home/runner/work/fox-agent/fox-agent/bin/fox` | 117.5 | bin | 15.4 | 18.4 | 377.8 | 0.5 | 39.0 |
| claude code | 2.1.308 (Claude Code) | `/home/runner/.npm-global/bin/claude` | 292.2 | bin | 12.7 | 236.6 | — | — | 194.1 |
| codex | codex-cli 0.163.0 | `/home/runner/.npm-global/bin/codex` | 140.0 | bin | 43.4 | 45.1 | 790.1 | 0.4 | 47.6 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | `/home/runner/.npm-global/bin/opencode2` | 207.4 | bin | 81.9 | 133.3 | 500.9 | 0.1 | 127.1 |
| jcode | jcode v0.99.0 (774613c90) | `/home/runner/.local/bin/jcode` | 169.6 | bin | 9.7 | 12.5 | 765.9 | 0.3 | 31.6 |
| pi | 1.4.0 | `/home/runner/.npm-global/bin/pi` | 140.0 | bin | 254.3 | 326.0 | 857.8 | 8.4 | 133.5 |
| pi-bolt | 1.4.0 (Pi-Bolt 0.9.8, linux-x64, JIT off) | `/home/runner/.local/bin/pi-bolt` | 262.0 | bin | 12.5 | 39.0 | 518.1 | 1.6 | 96.4 |
| gemini cli | 0.65.0 | `/home/runner/.npm-global/bin/gemini` | 140.0 | bin | 1563.9 | 1643.3 | 1656.6 | 0.1 | 145.5 |
| copilot cli | GitHub Copilot CLI 1.0.102. | `/home/runner/.npm-global/bin/copilot` | 140.0 | bin | 105.8 | 778.6 | — | — | 45.8 |
| crush | crush version v0.98.1 | `/home/runner/.npm-global/bin/crush` | 140.0 | bin | 161.9 | 287.3 | 748.6 | 72.5 | 68.2 |
| goose | 1.55.0 | `/home/runner/.local/bin/goose` | 304.0 | bin | 7.5 | 7.4 | 368.1 | 0.2 | 111.0 |
| aider | aider 0.86.2 | `/home/runner/work/fox-agent/fox-agent/.venv-bench/bin/aider` | 140.0 | bin | 778.5 | 722.5 | 1106.6 | 9.8 | 67.7 |
| amp | 0.0.1792670445-ge8d5b3 (released 2026-10-22T12:00:45.000Z, 1 | `/home/runner/.local/bin/amp` | 135.3 | bin | 258.6 | 265.8 | 630.3 | 2.9 | 164.1 |
| cursor-agent | 2026.10.19-6bbf2c4 | `/home/runner/.local/bin/cursor-agent` | 140.0 | bin | 459.8 | 438.6 | — | — | 236.8 |
| qwen code | 0.26.0 | `/home/runner/.npm-global/bin/qwen` | 140.0 | bin | 39.2 | 831.8 | 1306.9 | 0.1 | 245.0 |
| codebuff | 1.0.688 | `/home/runner/.npm-global/bin/codebuff` | 140.0 | bin | 888.2 | 867.6 | 1380.5 | 0.1 | 56.3 |
| kilo code | 7.8.15 | `/home/runner/.npm-global/bin/kilocode` | 140.0 | bin | 818.2 | 2464.1 | 6487.9 | 2779.7 | 44.6 |
| droid | 0.247.0 | `/home/runner/.local/bin/droid` | 299.5 | bin | 124.0 | 136.5 | 3223.3 | 1886.6 | 292.7 |
| kimi code | 2.3.0 | `/home/runner/.kimi-code/bin/kimi` | 192.5 | bin | 643.2 | 784.0 | 1163.3 | 4.0 | 352.2 |
| devin | devin 3000.11.92 (7f4e64980e22) | `/home/runner/.local/bin/devin` | 200.4 | bin | 4.3 | 24.9 | 1029.5 | 143.2 | 70.9 |
| cline | 3.0.73 | `/home/runner/.npm-global/bin/cline` | 140.0 | bin | 853.8 | 1197.0 | — | — | 53.4 |
| continue | 1.5.47 | `/home/runner/.npm-global/bin/cn` | 140.0 | bin | 1159.4 | — | — | — | 316.3 |
| iflow cli | 0.5.19 | `/home/runner/.npm-global/bin/iflow` | 140.0 | bin | 1241.0 | 1335.0 | 2517.0 | 0.1 | 54.0 |

</details>

fox-agent headless vs scripted local provider: time to first token **61 ms**, peak RSS **64 MB**.

_Generated 2026-10-22T13:33:10Z on Linux x86_64 (7.0.0-1017-azure). [How this is measured](#benchmarks) · [raw JSON](bench/results.json)_
