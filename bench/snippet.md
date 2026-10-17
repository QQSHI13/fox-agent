![harness bench dashboard](bench/bench.svg)

| agent | bundle | `--version` | TUI 1st byte | TUI 1st input | input latency 1s | idle PSS |
|---|---|---|---|---|---|---|
| **fox-agent** | 99 MB | 10 ms | **11 ms** | **371 ms** | **1 ms** | 35 MB |
| claude code | 286 MB | 6 ms | **144 ms** | — | — | 191 MB |
| codex | 140 MB | 29 ms | **32 ms** | **791 ms** | **1 ms** | 49 MB |
| opencode v2 | 207 MB | 54 ms | **95 ms** | **462 ms** | **50 ms** | 125 MB |
| jcode | 167 MB | 6 ms | **9 ms** | **569 ms** | **0 ms** | 30 MB |
| pi | 140 MB | 149 ms | **200 ms** | **709 ms** | **6 ms** | 133 MB |
| gemini cli | 140 MB | 967 ms | **1057 ms** | **1077 ms** | — | — |
| copilot cli | 140 MB | 68 ms | **527 ms** | — | — | 47 MB |
| crush | 140 MB | 99 ms | **394 ms** | **822 ms** | **56 ms** | 69 MB |
| goose | 304 MB | 4 ms | **4 ms** | **365 ms** | **0 ms** | 108 MB |
| aider | 140 MB | 480 ms | **429 ms** | **811 ms** | **6 ms** | 67 MB |
| amp | 135 MB | 172 ms | **183 ms** | **541 ms** | **1 ms** | 161 MB |
| cursor-agent | 140 MB | 289 ms | **274 ms** | — | — | 236 MB |
| qwen code | 140 MB | 24 ms | **526 ms** | **949 ms** | — | 290 MB |
| codebuff | 140 MB | 661 ms | **650 ms** | **1142 ms** | **107 ms** | 58 MB |
| kilo code | 140 MB | 591 ms | **1728 ms** | **4919 ms** | **852 ms** | 46 MB |
| droid | 294 MB | 103 ms | **66 ms** | **3111 ms** | **688 ms** | 274 MB |
| kimi code | 192 MB | 387 ms | **490 ms** | **884 ms** | **3 ms** | 353 MB |
| devin | 200 MB | 4 ms | **16 ms** | **1022 ms** | **1640 ms** | 95 MB |
| cline | 140 MB | 679 ms | **847 ms** | — | — | 55 MB |
| continue | 140 MB | 747 ms | — | — | — | 318 MB |
| iflow cli | 140 MB | 802 ms | **837 ms** | **1602 ms** | **45 ms** | 58 MB |

<details><summary>full precision · all collected fields</summary>

| agent | version | bin | bundle (MB) | bundle kind | `--version` (ms) | TUI 1st byte (ms) | TUI 1st input (ms) | input latency 1s (ms) | idle PSS (MB) |
|---|---|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.5.0-beta.1 | `/home/runner/work/fox-agent/fox-agent/bin/fox` | 99.0 | bin | 10.2 | 10.7 | 371.1 | 0.7 | 35.1 |
| claude code | 2.1.302 (Claude Code) | `/home/runner/.npm-global/bin/claude` | 285.8 | bin | 5.9 | 144.4 | — | — | 190.8 |
| codex | codex-cli 0.163.0 | `/home/runner/.npm-global/bin/codex` | 140.0 | bin | 29.1 | 31.9 | 790.6 | 0.5 | 49.1 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | `/home/runner/.npm-global/bin/opencode2` | 207.4 | bin | 53.8 | 95.5 | 462.0 | 49.9 | 125.3 |
| jcode | jcode v0.98.1 (1c7426eb1) | `/home/runner/.local/bin/jcode` | 166.8 | bin | 6.1 | 8.8 | 568.8 | 0.3 | 30.3 |
| pi | 1.3.0 | `/home/runner/.npm-global/bin/pi` | 140.0 | bin | 148.8 | 200.3 | 709.4 | 5.6 | 132.6 |
| gemini cli | 0.64.0 | `/home/runner/.npm-global/bin/gemini` | 140.0 | bin | 967.2 | 1056.9 | 1076.6 | — | — |
| copilot cli | GitHub Copilot CLI 1.0.98. | `/home/runner/.npm-global/bin/copilot` | 140.0 | bin | 68.2 | 526.9 | — | — | 47.3 |
| crush | crush version v0.98.1 | `/home/runner/.npm-global/bin/crush` | 140.0 | bin | 99.2 | 393.6 | 822.0 | 56.2 | 68.5 |
| goose | 1.55.0 | `/home/runner/.local/bin/goose` | 304.0 | bin | 4.5 | 4.5 | 365.1 | 0.4 | 108.0 |
| aider | aider 0.86.2 | `/home/runner/work/fox-agent/fox-agent/.venv-bench/bin/aider` | 140.0 | bin | 480.3 | 429.0 | 811.1 | 6.0 | 66.9 |
| amp | 0.0.1792209635-g24a9fe (released 2026-10-17T04:00:35.000Z, 2 | `/home/runner/.local/bin/amp` | 134.9 | bin | 172.1 | 182.6 | 541.3 | 0.7 | 161.1 |
| cursor-agent | 2026.10.16-e3cb207 | `/home/runner/.local/bin/cursor-agent` | 140.0 | bin | 289.4 | 274.0 | — | — | 236.4 |
| qwen code | 0.25.2 | `/home/runner/.npm-global/bin/qwen` | 140.0 | bin | 23.7 | 526.3 | 948.5 | — | 290.3 |
| codebuff | 1.0.688 | `/home/runner/.npm-global/bin/codebuff` | 140.0 | bin | 660.8 | 650.0 | 1142.4 | 107.1 | 57.7 |
| kilo code | 7.8.12 | `/home/runner/.npm-global/bin/kilocode` | 140.0 | bin | 591.1 | 1727.9 | 4918.6 | 852.3 | 46.2 |
| droid | 0.244.0 | `/home/runner/.local/bin/droid` | 294.4 | bin | 103.3 | 66.5 | 3111.3 | 687.7 | 274.1 |
| kimi code | 2.2.0 | `/home/runner/.kimi-code/bin/kimi` | 191.9 | bin | 387.0 | 490.5 | 884.0 | 3.0 | 353.1 |
| devin | devin 3000.11.92 (7f4e64980e22) | `/home/runner/.local/bin/devin` | 200.4 | bin | 3.5 | 15.8 | 1021.5 | 1640.2 | 94.6 |
| cline | 3.0.73 | `/home/runner/.npm-global/bin/cline` | 140.0 | bin | 678.8 | 847.2 | — | — | 55.0 |
| continue | 1.5.47 | `/home/runner/.npm-global/bin/cn` | 140.0 | bin | 746.6 | — | — | — | 318.3 |
| iflow cli | 0.5.19 | `/home/runner/.npm-global/bin/iflow` | 140.0 | bin | 801.8 | 837.0 | 1602.3 | 44.8 | 57.8 |

</details>

fox-agent headless vs scripted local provider: time to first token **52 ms**, peak RSS **60 MB**.

_Generated 2026-10-17T07:04:41Z on Linux x86_64 (6.17.0-1022-azure). [How this is measured](#benchmarks) · [raw JSON](bench/results.json)_
