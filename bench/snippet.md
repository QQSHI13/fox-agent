![harness bench dashboard](bench/bench.svg)

| agent | bundle | `--version` | TUI 1st byte | TUI 1st input | input latency 1s | idle PSS |
|---|---|---|---|---|---|---|
| **fox-agent** | 99 MB | 11 ms | **13 ms** | **374 ms** | **1 ms** | 35 MB |
| claude code | 291 MB | 8 ms | **182 ms** | — | — | 193 MB |
| codex | 140 MB | 35 ms | **37 ms** | **832 ms** | **2 ms** | 49 MB |
| opencode v2 | 207 MB | 64 ms | **104 ms** | **465 ms** | **51 ms** | 125 MB |
| jcode | 170 MB | 8 ms | **9 ms** | **691 ms** | **0 ms** | 32 MB |
| pi | 140 MB | 183 ms | **241 ms** | **723 ms** | **6 ms** | 131 MB |
| pi-bolt | 261 MB | 11 ms | **33 ms** | **512 ms** | **1 ms** | 97 MB |
| gemini cli | 140 MB | 1132 ms | **1204 ms** | **1230 ms** | — | — |
| copilot cli | 140 MB | 82 ms | **606 ms** | — | — | 47 MB |
| crush | 140 MB | 117 ms | **592 ms** | **855 ms** | **57 ms** | 69 MB |
| goose | 304 MB | 6 ms | **6 ms** | **366 ms** | **0 ms** | 111 MB |
| aider | 140 MB | 603 ms | **547 ms** | **943 ms** | **8 ms** | 67 MB |
| amp | 135 MB | 191 ms | **198 ms** | **561 ms** | **0 ms** | 164 MB |
| cursor-agent | 140 MB | 341 ms | **327 ms** | — | — | 252 MB |
| qwen code | 140 MB | 30 ms | **627 ms** | **1059 ms** | — | 291 MB |
| codebuff | 140 MB | 701 ms | **675 ms** | **1189 ms** | **110 ms** | 58 MB |
| kilo code | 140 MB | 661 ms | **1977 ms** | **5493 ms** | **1066 ms** | 46 MB |
| droid | 295 MB | 63 ms | **75 ms** | **3138 ms** | **709 ms** | 335 MB |
| kimi code | 192 MB | 443 ms | **588 ms** | **955 ms** | **3 ms** | 331 MB |
| devin | 200 MB | 3 ms | **18 ms** | **1023 ms** | **1641 ms** | 96 MB |
| cline | 140 MB | 707 ms | **950 ms** | — | — | 55 MB |
| continue | 140 MB | 866 ms | — | — | — | 317 MB |
| iflow cli | 140 MB | 935 ms | **1004 ms** | **1755 ms** | **45 ms** | 58 MB |

<details><summary>full precision · all collected fields</summary>

| agent | version | bin | bundle (MB) | bundle kind | `--version` (ms) | TUI 1st byte (ms) | TUI 1st input (ms) | input latency 1s (ms) | idle PSS (MB) |
|---|---|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.6.0 | `/home/runner/work/fox-agent/fox-agent/bin/fox` | 99.1 | bin | 11.0 | 13.0 | 373.9 | 0.5 | 35.4 |
| claude code | 2.1.306 (Claude Code) | `/home/runner/.npm-global/bin/claude` | 290.5 | bin | 7.7 | 181.7 | — | — | 193.3 |
| codex | codex-cli 0.163.0 | `/home/runner/.npm-global/bin/codex` | 140.0 | bin | 34.9 | 36.8 | 831.8 | 1.5 | 49.1 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | `/home/runner/.npm-global/bin/opencode2` | 207.4 | bin | 64.1 | 104.0 | 465.4 | 50.9 | 124.8 |
| jcode | jcode v0.99.0 (774613c90) | `/home/runner/.local/bin/jcode` | 169.6 | bin | 7.5 | 9.5 | 691.0 | 0.3 | 31.6 |
| pi | 1.3.0 | `/home/runner/.npm-global/bin/pi` | 140.0 | bin | 182.8 | 241.4 | 723.1 | 6.3 | 131.3 |
| pi-bolt | 1.3.0 (Pi-Bolt 0.9.6, linux-x64, JIT off) | `/home/runner/.local/bin/pi-bolt` | 261.1 | bin | 10.6 | 32.6 | 511.5 | 1.4 | 96.8 |
| gemini cli | 0.65.0 | `/home/runner/.npm-global/bin/gemini` | 140.0 | bin | 1132.3 | 1203.8 | 1230.4 | — | — |
| copilot cli | GitHub Copilot CLI 1.0.101. | `/home/runner/.npm-global/bin/copilot` | 140.0 | bin | 81.8 | 606.0 | — | — | 47.3 |
| crush | crush version v0.98.1 | `/home/runner/.npm-global/bin/crush` | 140.0 | bin | 117.4 | 592.2 | 855.2 | 56.7 | 68.7 |
| goose | 1.55.0 | `/home/runner/.local/bin/goose` | 304.0 | bin | 6.2 | 6.0 | 366.4 | 0.2 | 110.8 |
| aider | aider 0.86.2 | `/home/runner/work/fox-agent/fox-agent/.venv-bench/bin/aider` | 140.0 | bin | 602.6 | 546.8 | 943.2 | 7.7 | 66.8 |
| amp | 0.0.1792555249-g702cd1 (released 2026-10-21T04:00:49.000Z, 4 | `/home/runner/.local/bin/amp` | 135.0 | bin | 191.4 | 197.9 | 561.2 | 0.5 | 164.4 |
| cursor-agent | 2026.10.19-6bbf2c4 | `/home/runner/.local/bin/cursor-agent` | 140.0 | bin | 340.7 | 327.3 | — | — | 252.3 |
| qwen code | 0.25.3 | `/home/runner/.npm-global/bin/qwen` | 140.0 | bin | 30.2 | 627.2 | 1058.6 | — | 291.4 |
| codebuff | 1.0.688 | `/home/runner/.npm-global/bin/codebuff` | 140.0 | bin | 700.9 | 674.8 | 1189.1 | 110.0 | 57.7 |
| kilo code | 7.8.15 | `/home/runner/.npm-global/bin/kilocode` | 140.0 | bin | 660.7 | 1977.4 | 5492.7 | 1066.2 | 46.1 |
| droid | 0.245.0 | `/home/runner/.local/bin/droid` | 295.5 | bin | 63.1 | 75.0 | 3137.9 | 708.8 | 334.7 |
| kimi code | 2.2.0 | `/home/runner/.kimi-code/bin/kimi` | 191.9 | bin | 442.7 | 587.7 | 954.6 | 3.3 | 330.7 |
| devin | devin 3000.11.92 (7f4e64980e22) | `/home/runner/.local/bin/devin` | 200.4 | bin | 3.3 | 17.7 | 1022.6 | 1640.9 | 96.1 |
| cline | 3.0.73 | `/home/runner/.npm-global/bin/cline` | 140.0 | bin | 706.6 | 949.7 | — | — | 55.0 |
| continue | 1.5.47 | `/home/runner/.npm-global/bin/cn` | 140.0 | bin | 865.6 | — | — | — | 317.0 |
| iflow cli | 0.5.19 | `/home/runner/.npm-global/bin/iflow` | 140.0 | bin | 935.1 | 1003.6 | 1755.4 | 44.9 | 58.0 |

</details>

fox-agent headless vs scripted local provider: time to first token **50 ms**, peak RSS **60 MB**.

_Generated 2026-10-21T04:56:21Z on Linux x86_64 (6.17.0-1022-azure). [How this is measured](#benchmarks) · [raw JSON](bench/results.json)_
