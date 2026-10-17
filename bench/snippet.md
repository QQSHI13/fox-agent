![harness bench dashboard](bench/bench.svg)

| agent | bundle | `--version` | TUI 1st byte | TUI 1st input | input latency 1s | idle PSS |
|---|---|---|---|---|---|---|
| **fox-agent** | 99 MB | 14 ms | **17 ms** | **377 ms** | **1 ms** | 35 MB |
| claude code | 286 MB | 9 ms | **204 ms** | — | — | 190 MB |
| codex | 140 MB | 42 ms | **42 ms** | **796 ms** | **2 ms** | 49 MB |
| opencode v2 | 207 MB | 80 ms | **132 ms** | **503 ms** | **65 ms** | 126 MB |
| jcode | 167 MB | 9 ms | **11 ms** | **768 ms** | **0 ms** | 30 MB |
| pi | 140 MB | 242 ms | **317 ms** | **848 ms** | **8 ms** | 131 MB |
| gemini cli | 140 MB | 1498 ms | **1600 ms** | **1605 ms** | **0 ms** | 146 MB |
| copilot cli | 140 MB | 103 ms | **783 ms** | — | — | 47 MB |
| crush | 140 MB | 141 ms | **390 ms** | **828 ms** | **72 ms** | 69 MB |
| goose | 304 MB | 7 ms | **7 ms** | **368 ms** | **0 ms** | 108 MB |
| aider | 140 MB | 792 ms | **730 ms** | **1145 ms** | **10 ms** | 67 MB |
| amp | 135 MB | 262 ms | **266 ms** | **629 ms** | **1 ms** | 161 MB |
| cursor-agent | 140 MB | 461 ms | **441 ms** | — | — | 236 MB |
| qwen code | 140 MB | 37 ms | **826 ms** | **1283 ms** | — | 247 MB |
| codebuff | 140 MB | 934 ms | **870 ms** | **1390 ms** | **111 ms** | 58 MB |
| kilo code | 140 MB | 820 ms | **2478 ms** | **6615 ms** | **1638 ms** | 46 MB |
| droid | 294 MB | 111 ms | **118 ms** | **3243 ms** | **743 ms** | 275 MB |
| kimi code | 192 MB | 568 ms | **727 ms** | **1125 ms** | **4 ms** | 351 MB |
| devin | 200 MB | 4 ms | **23 ms** | **1030 ms** | **1641 ms** | 92 MB |
| cline | 140 MB | 910 ms | **1099 ms** | — | — | 55 MB |
| continue | 140 MB | 1094 ms | — | — | — | 317 MB |
| iflow cli | 140 MB | 1192 ms | **1291 ms** | **2467 ms** | **46 ms** | 56 MB |

<details><summary>full precision · all collected fields</summary>

| agent | version | bin | bundle (MB) | bundle kind | `--version` (ms) | TUI 1st byte (ms) | TUI 1st input (ms) | input latency 1s (ms) | idle PSS (MB) |
|---|---|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.5.0-beta.1 | `/home/runner/work/fox-agent/fox-agent/bin/fox` | 99.0 | bin | 13.6 | 16.9 | 377.2 | 0.6 | 35.0 |
| claude code | 2.1.302 (Claude Code) | `/home/runner/.npm-global/bin/claude` | 285.8 | bin | 9.3 | 203.7 | — | — | 190.3 |
| codex | codex-cli 0.163.0 | `/home/runner/.npm-global/bin/codex` | 140.0 | bin | 42.0 | 42.5 | 796.5 | 1.7 | 49.1 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | `/home/runner/.npm-global/bin/opencode2` | 207.4 | bin | 80.0 | 132.0 | 502.6 | 65.4 | 126.4 |
| jcode | jcode v0.98.1 (1c7426eb1) | `/home/runner/.local/bin/jcode` | 166.8 | bin | 9.0 | 11.3 | 768.4 | 0.4 | 30.2 |
| pi | 1.3.0 | `/home/runner/.npm-global/bin/pi` | 140.0 | bin | 241.8 | 316.5 | 848.0 | 8.4 | 131.1 |
| gemini cli | 0.64.0 | `/home/runner/.npm-global/bin/gemini` | 140.0 | bin | 1498.3 | 1599.8 | 1604.8 | 0.1 | 146.1 |
| copilot cli | GitHub Copilot CLI 1.0.98. | `/home/runner/.npm-global/bin/copilot` | 140.0 | bin | 103.1 | 782.9 | — | — | 47.4 |
| crush | crush version v0.98.1 | `/home/runner/.npm-global/bin/crush` | 140.0 | bin | 140.8 | 390.4 | 828.1 | 72.3 | 68.7 |
| goose | 1.55.0 | `/home/runner/.local/bin/goose` | 304.0 | bin | 6.8 | 6.7 | 367.8 | 0.2 | 107.8 |
| aider | aider 0.86.2 | `/home/runner/work/fox-agent/fox-agent/.venv-bench/bin/aider` | 140.0 | bin | 791.8 | 729.6 | 1145.3 | 10.2 | 66.9 |
| amp | 0.0.1792195263-g037e53 (released 2026-10-17T00:01:03.000Z, 3 | `/home/runner/.local/bin/amp` | 134.9 | bin | 262.1 | 265.6 | 629.0 | 0.6 | 161.2 |
| cursor-agent | 2026.10.16-e3cb207 | `/home/runner/.local/bin/cursor-agent` | 140.0 | bin | 460.9 | 441.1 | — | — | 235.9 |
| qwen code | 0.25.2 | `/home/runner/.npm-global/bin/qwen` | 140.0 | bin | 37.0 | 826.2 | 1283.4 | — | 246.8 |
| codebuff | 1.0.688 | `/home/runner/.npm-global/bin/codebuff` | 140.0 | bin | 934.0 | 869.9 | 1389.9 | 110.9 | 57.6 |
| kilo code | 7.8.12 | `/home/runner/.npm-global/bin/kilocode` | 140.0 | bin | 819.5 | 2478.4 | 6615.0 | 1638.2 | 46.2 |
| droid | 0.244.0 | `/home/runner/.local/bin/droid` | 294.4 | bin | 111.4 | 118.4 | 3243.4 | 743.4 | 274.9 |
| kimi code | 2.2.0 | `/home/runner/.kimi-code/bin/kimi` | 191.9 | bin | 567.7 | 727.2 | 1125.1 | 4.4 | 350.8 |
| devin | devin 3000.11.92 (7f4e64980e22) | `/home/runner/.local/bin/devin` | 200.4 | bin | 4.4 | 22.9 | 1030.3 | 1640.9 | 91.7 |
| cline | 3.0.72 | `/home/runner/.npm-global/bin/cline` | 140.0 | bin | 909.9 | 1099.4 | — | — | 55.0 |
| continue | 1.5.47 | `/home/runner/.npm-global/bin/cn` | 140.0 | bin | 1093.7 | — | — | — | 316.8 |
| iflow cli | 0.5.19 | `/home/runner/.npm-global/bin/iflow` | 140.0 | bin | 1192.2 | 1290.7 | 2467.5 | 46.4 | 55.6 |

</details>

fox-agent headless vs scripted local provider: time to first token **59 ms**, peak RSS **60 MB**.

_Generated 2026-10-17T03:43:36Z on Linux x86_64 (6.17.0-1022-azure). [How this is measured](#benchmarks) · [raw JSON](bench/results.json)_
