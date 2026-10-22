![harness bench dashboard](bench/bench.svg)

| agent | bundle | `--version` | TUI 1st byte | TUI 1st input | input latency 1s | idle PSS |
|---|---|---|---|---|---|---|
| **fox-agent** | 117 MB | 13 ms | **14 ms** | **373 ms** | **1 ms** | 37 MB |
| claude code | 292 MB | 13 ms | **187 ms** | — | — | 194 MB |
| codex | 140 MB | 33 ms | **35 ms** | **795 ms** | **1 ms** | 49 MB |
| opencode v2 | 207 MB | 56 ms | **93 ms** | **457 ms** | **41 ms** | 123 MB |
| jcode | 170 MB | 8 ms | **10 ms** | **679 ms** | **0 ms** | 31 MB |
| pi | 140 MB | 167 ms | **216 ms** | **715 ms** | **6 ms** | 131 MB |
| pi-bolt | 262 MB | 11 ms | **32 ms** | **513 ms** | **1 ms** | 97 MB |
| gemini cli | 140 MB | 995 ms | **1029 ms** | **1067 ms** | — | — |
| copilot cli | 140 MB | 71 ms | **538 ms** | — | — | 47 MB |
| crush | 140 MB | 100 ms | **401 ms** | **776 ms** | **40 ms** | 68 MB |
| goose | 304 MB | 6 ms | **5 ms** | **366 ms** | **0 ms** | 111 MB |
| aider | 140 MB | 482 ms | **406 ms** | **800 ms** | **6 ms** | 67 MB |
| amp | 135 MB | 166 ms | **164 ms** | **532 ms** | **0 ms** | 165 MB |
| cursor-agent | 140 MB | 301 ms | **288 ms** | — | — | 253 MB |
| qwen code | 140 MB | 29 ms | **543 ms** | **915 ms** | — | 295 MB |
| codebuff | 140 MB | 631 ms | **593 ms** | **1138 ms** | **109 ms** | 58 MB |
| kilo code | 140 MB | 539 ms | **1587 ms** | **4799 ms** | **736 ms** | 46 MB |
| droid | 300 MB | 85 ms | **63 ms** | **3109 ms** | **680 ms** | 286 MB |
| kimi code | 192 MB | 339 ms | **462 ms** | **833 ms** | **3 ms** | 355 MB |
| devin | 200 MB | 3 ms | **17 ms** | **1021 ms** | **1641 ms** | 96 MB |
| cline | 140 MB | 624 ms | **799 ms** | — | — | 55 MB |
| continue | 140 MB | 682 ms | — | — | — | 318 MB |
| iflow cli | 140 MB | 756 ms | **804 ms** | **1614 ms** | **45 ms** | 58 MB |

<details><summary>full precision · all collected fields</summary>

| agent | version | bin | bundle (MB) | bundle kind | `--version` (ms) | TUI 1st byte (ms) | TUI 1st input (ms) | input latency 1s (ms) | idle PSS (MB) |
|---|---|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.6.0 | `/home/runner/work/fox-agent/fox-agent/bin/fox` | 117.5 | bin | 12.8 | 13.9 | 372.9 | 0.6 | 36.6 |
| claude code | 2.1.308 (Claude Code) | `/home/runner/.npm-global/bin/claude` | 292.2 | bin | 12.7 | 187.1 | — | — | 194.3 |
| codex | codex-cli 0.163.0 | `/home/runner/.npm-global/bin/codex` | 140.0 | bin | 32.8 | 35.2 | 794.8 | 0.5 | 49.1 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | `/home/runner/.npm-global/bin/opencode2` | 207.4 | bin | 55.8 | 92.6 | 456.7 | 41.1 | 122.6 |
| jcode | jcode v0.99.0 (774613c90) | `/home/runner/.local/bin/jcode` | 169.6 | bin | 7.6 | 10.2 | 678.9 | 0.3 | 31.0 |
| pi | 1.4.0 | `/home/runner/.npm-global/bin/pi` | 140.0 | bin | 167.2 | 215.5 | 715.2 | 5.6 | 130.7 |
| pi-bolt | 1.4.0 (Pi-Bolt 0.9.8, linux-x64, JIT off) | `/home/runner/.local/bin/pi-bolt` | 262.0 | bin | 10.6 | 32.3 | 513.1 | 1.4 | 96.5 |
| gemini cli | 0.65.0 | `/home/runner/.npm-global/bin/gemini` | 140.0 | bin | 994.6 | 1028.9 | 1066.9 | — | — |
| copilot cli | GitHub Copilot CLI 1.0.102. | `/home/runner/.npm-global/bin/copilot` | 140.0 | bin | 71.4 | 538.4 | — | — | 47.3 |
| crush | crush version v0.98.1 | `/home/runner/.npm-global/bin/crush` | 140.0 | bin | 100.5 | 401.2 | 776.4 | 39.6 | 68.4 |
| goose | 1.55.0 | `/home/runner/.local/bin/goose` | 304.0 | bin | 6.2 | 5.2 | 366.1 | 0.2 | 111.3 |
| aider | aider 0.86.2 | `/home/runner/work/fox-agent/fox-agent/.venv-bench/bin/aider` | 140.0 | bin | 482.1 | 406.2 | 800.1 | 5.8 | 66.8 |
| amp | 0.0.1792656060-g6af3d5 (released 2026-10-22T08:01:00.000Z, 3 | `/home/runner/.local/bin/amp` | 135.3 | bin | 166.0 | 164.2 | 532.2 | 0.5 | 165.0 |
| cursor-agent | 2026.10.19-6bbf2c4 | `/home/runner/.local/bin/cursor-agent` | 140.0 | bin | 300.9 | 288.4 | — | — | 253.1 |
| qwen code | 0.26.0 | `/home/runner/.npm-global/bin/qwen` | 140.0 | bin | 29.2 | 542.5 | 914.7 | — | 295.1 |
| codebuff | 1.0.688 | `/home/runner/.npm-global/bin/codebuff` | 140.0 | bin | 631.2 | 592.8 | 1137.6 | 109.0 | 57.7 |
| kilo code | 7.8.15 | `/home/runner/.npm-global/bin/kilocode` | 140.0 | bin | 538.7 | 1587.2 | 4799.0 | 735.6 | 46.2 |
| droid | 0.247.0 | `/home/runner/.local/bin/droid` | 299.5 | bin | 85.2 | 63.4 | 3109.1 | 679.8 | 286.0 |
| kimi code | 2.3.0 | `/home/runner/.kimi-code/bin/kimi` | 192.5 | bin | 338.6 | 462.2 | 832.9 | 2.5 | 354.6 |
| devin | devin 3000.11.92 (7f4e64980e22) | `/home/runner/.local/bin/devin` | 200.4 | bin | 3.0 | 17.2 | 1020.5 | 1640.9 | 96.4 |
| cline | 3.0.73 | `/home/runner/.npm-global/bin/cline` | 140.0 | bin | 623.9 | 799.2 | — | — | 55.0 |
| continue | 1.5.47 | `/home/runner/.npm-global/bin/cn` | 140.0 | bin | 681.8 | — | — | — | 317.9 |
| iflow cli | 0.5.19 | `/home/runner/.npm-global/bin/iflow` | 140.0 | bin | 755.7 | 804.3 | 1614.5 | 45.5 | 57.9 |

</details>

fox-agent headless vs scripted local provider: time to first token **42 ms**, peak RSS **61 MB**.

_Generated 2026-10-22T12:06:07Z on Linux x86_64 (6.17.0-1022-azure). [How this is measured](#benchmarks) · [raw JSON](bench/results.json)_
