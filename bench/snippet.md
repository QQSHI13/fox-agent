![harness bench dashboard](bench/bench.svg)

| agent | bundle | `--version` | TUI 1st byte | TUI 1st input | input latency 1s | idle PSS |
|---|---|---|---|---|---|---|
| **fox-agent** | 99 MB | 10 ms | **14 ms** | **376 ms** | **1 ms** | 37 MB |
| claude code | 292 MB | 8 ms | **210 ms** | — | — | 194 MB |
| codex | 140 MB | 37 ms | **40 ms** | **801 ms** | **0 ms** | 48 MB |
| opencode v2 | 207 MB | 69 ms | **121 ms** | **487 ms** | **56 ms** | 126 MB |
| jcode | 170 MB | 8 ms | **10 ms** | **675 ms** | **0 ms** | 35 MB |
| pi | 140 MB | 223 ms | **286 ms** | **781 ms** | **8 ms** | 131 MB |
| pi-bolt | 261 MB | 10 ms | **33 ms** | **516 ms** | **1 ms** | 97 MB |
| gemini cli | 140 MB | 1329 ms | **1403 ms** | **1425 ms** | **0 ms** | — |
| copilot cli | 140 MB | 93 ms | **693 ms** | — | — | 46 MB |
| crush | 140 MB | 144 ms | **502 ms** | **974 ms** | **72 ms** | 68 MB |
| goose | 304 MB | 7 ms | **7 ms** | **367 ms** | **0 ms** | 111 MB |
| aider | 140 MB | 688 ms | **605 ms** | **982 ms** | **9 ms** | 68 MB |
| amp | 135 MB | 245 ms | **245 ms** | **604 ms** | **1 ms** | 162 MB |
| cursor-agent | 140 MB | 401 ms | **387 ms** | — | — | 250 MB |
| qwen code | 140 MB | 31 ms | **695 ms** | **1153 ms** | — | 279 MB |
| codebuff | 140 MB | 837 ms | **846 ms** | **1318 ms** | **106 ms** | 57 MB |
| kilo code | 140 MB | 812 ms | **2380 ms** | **6180 ms** | **1347 ms** | 45 MB |
| droid | 295 MB | 98 ms | **116 ms** | **3217 ms** | **756 ms** | 345 MB |
| kimi code | 192 MB | 543 ms | **668 ms** | **1059 ms** | **4 ms** | 354 MB |
| devin | 200 MB | 3 ms | **18 ms** | **1025 ms** | **1641 ms** | 72 MB |
| cline | 140 MB | 819 ms | **1123 ms** | — | — | 53 MB |
| continue | 140 MB | 1004 ms | — | — | — | 318 MB |
| iflow cli | 140 MB | 1007 ms | **1087 ms** | **1907 ms** | **47 ms** | 56 MB |

<details><summary>full precision · all collected fields</summary>

| agent | version | bin | bundle (MB) | bundle kind | `--version` (ms) | TUI 1st byte (ms) | TUI 1st input (ms) | input latency 1s (ms) | idle PSS (MB) |
|---|---|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.6.0 | `/home/runner/work/fox-agent/fox-agent/bin/fox` | 99.1 | bin | 10.2 | 13.8 | 375.5 | 0.6 | 37.0 |
| claude code | 2.1.307 (Claude Code) | `/home/runner/.npm-global/bin/claude` | 292.0 | bin | 8.1 | 210.3 | — | — | 194.1 |
| codex | codex-cli 0.163.0 | `/home/runner/.npm-global/bin/codex` | 140.0 | bin | 36.9 | 39.8 | 801.1 | 0.3 | 47.6 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | `/home/runner/.npm-global/bin/opencode2` | 207.4 | bin | 69.3 | 120.5 | 486.8 | 56.1 | 126.2 |
| jcode | jcode v0.99.0 (774613c90) | `/home/runner/.local/bin/jcode` | 169.6 | bin | 7.8 | 10.0 | 675.0 | 0.3 | 35.0 |
| pi | 1.4.0 | `/home/runner/.npm-global/bin/pi` | 140.0 | bin | 223.3 | 285.6 | 781.0 | 7.5 | 130.7 |
| pi-bolt | 1.3.0 (Pi-Bolt 0.9.7, linux-x64, JIT off) | `/home/runner/.local/bin/pi-bolt` | 261.1 | bin | 10.2 | 32.8 | 516.0 | 1.5 | 96.5 |
| gemini cli | 0.65.0 | `/home/runner/.npm-global/bin/gemini` | 140.0 | bin | 1329.1 | 1403.2 | 1425.0 | 0.1 | — |
| copilot cli | GitHub Copilot CLI 1.0.102. | `/home/runner/.npm-global/bin/copilot` | 140.0 | bin | 93.4 | 692.5 | — | — | 45.9 |
| crush | crush version v0.98.1 | `/home/runner/.npm-global/bin/crush` | 140.0 | bin | 144.5 | 501.6 | 973.6 | 72.2 | 68.1 |
| goose | 1.55.0 | `/home/runner/.local/bin/goose` | 304.0 | bin | 6.6 | 7.0 | 367.3 | 0.2 | 111.4 |
| aider | aider 0.86.2 | `/home/runner/work/fox-agent/fox-agent/.venv-bench/bin/aider` | 140.0 | bin | 688.3 | 605.5 | 981.7 | 8.5 | 67.7 |
| amp | 0.0.1792627309-g98c009 (released 2026-10-22T00:01:49.000Z, 1 | `/home/runner/.local/bin/amp` | 135.1 | bin | 245.2 | 245.3 | 604.4 | 0.5 | 161.9 |
| cursor-agent | 2026.10.19-6bbf2c4 | `/home/runner/.local/bin/cursor-agent` | 140.0 | bin | 400.9 | 387.4 | — | — | 250.0 |
| qwen code | 0.26.0 | `/home/runner/.npm-global/bin/qwen` | 140.0 | bin | 31.2 | 694.8 | 1153.0 | — | 279.4 |
| codebuff | 1.0.688 | `/home/runner/.npm-global/bin/codebuff` | 140.0 | bin | 837.3 | 846.0 | 1317.7 | 106.5 | 56.8 |
| kilo code | 7.8.15 | `/home/runner/.npm-global/bin/kilocode` | 140.0 | bin | 812.1 | 2379.8 | 6180.5 | 1346.5 | 44.8 |
| droid | 0.245.1 | `/home/runner/.local/bin/droid` | 295.5 | bin | 98.1 | 115.5 | 3217.1 | 756.0 | 345.4 |
| kimi code | 2.3.0 | `/home/runner/.kimi-code/bin/kimi` | 192.5 | bin | 543.1 | 668.0 | 1059.1 | 4.1 | 353.9 |
| devin | devin 3000.11.92 (7f4e64980e22) | `/home/runner/.local/bin/devin` | 200.4 | bin | 3.4 | 17.6 | 1025.3 | 1640.9 | 71.5 |
| cline | 3.0.73 | `/home/runner/.npm-global/bin/cline` | 140.0 | bin | 819.5 | 1122.5 | — | — | 53.3 |
| continue | 1.5.47 | `/home/runner/.npm-global/bin/cn` | 140.0 | bin | 1003.6 | — | — | — | 317.8 |
| iflow cli | 0.5.19 | `/home/runner/.npm-global/bin/iflow` | 140.0 | bin | 1006.7 | 1087.3 | 1907.3 | 46.7 | 56.0 |

</details>

fox-agent headless vs scripted local provider: time to first token **53 ms**, peak RSS **64 MB**.

_Generated 2026-10-22T01:46:04Z on Linux x86_64 (7.0.0-1017-azure). [How this is measured](#benchmarks) · [raw JSON](bench/results.json)_
