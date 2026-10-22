![harness bench dashboard](bench/bench.svg)

| agent | bundle | `--version` | TUI 1st byte | TUI 1st input | input latency 1s | idle PSS |
|---|---|---|---|---|---|---|
| **fox-agent** | 99 MB | 16 ms | **16 ms** | **377 ms** | **1 ms** | 35 MB |
| claude code | 292 MB | 9 ms | **234 ms** | — | — | 194 MB |
| codex | 140 MB | 42 ms | **42 ms** | **851 ms** | **2 ms** | 49 MB |
| opencode v2 | 207 MB | 81 ms | **134 ms** | **497 ms** | **66 ms** | 129 MB |
| jcode | 170 MB | 9 ms | **11 ms** | **774 ms** | **0 ms** | 32 MB |
| pi | 140 MB | 245 ms | **321 ms** | **847 ms** | **8 ms** | 130 MB |
| pi-bolt | 261 MB | 11 ms | **40 ms** | **518 ms** | **2 ms** | 96 MB |
| gemini cli | 140 MB | 1493 ms | **1574 ms** | **1601 ms** | — | 146 MB |
| copilot cli | 140 MB | 102 ms | **775 ms** | — | — | 47 MB |
| crush | 140 MB | 151 ms | **422 ms** | **868 ms** | **73 ms** | 69 MB |
| goose | 304 MB | 7 ms | **7 ms** | **367 ms** | **0 ms** | 111 MB |
| aider | 140 MB | 782 ms | **727 ms** | **1109 ms** | **10 ms** | 67 MB |
| amp | 135 MB | 252 ms | **262 ms** | **619 ms** | **1 ms** | 163 MB |
| cursor-agent | 140 MB | 447 ms | **426 ms** | **789 ms** | — | 250 MB |
| qwen code | 140 MB | 36 ms | **824 ms** | **1292 ms** | — | 248 MB |
| codebuff | 140 MB | 887 ms | **868 ms** | **1366 ms** | **110 ms** | 58 MB |
| kilo code | 140 MB | 821 ms | **2473 ms** | **6591 ms** | **1691 ms** | 46 MB |
| droid | 295 MB | 113 ms | **123 ms** | **803 ms** | **738 ms** | 280 MB |
| kimi code | 192 MB | 567 ms | **731 ms** | **1112 ms** | **4 ms** | 353 MB |
| devin | 200 MB | 4 ms | **21 ms** | **1029 ms** | **1641 ms** | 96 MB |
| cline | 140 MB | 916 ms | **1287 ms** | — | — | 55 MB |
| continue | 140 MB | 1092 ms | — | — | — | 317 MB |
| iflow cli | 140 MB | 1210 ms | **1271 ms** | **2078 ms** | **45 ms** | 56 MB |

<details><summary>full precision · all collected fields</summary>

| agent | version | bin | bundle (MB) | bundle kind | `--version` (ms) | TUI 1st byte (ms) | TUI 1st input (ms) | input latency 1s (ms) | idle PSS (MB) |
|---|---|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.6.0 | `/home/runner/work/fox-agent/fox-agent/bin/fox` | 99.1 | bin | 15.6 | 16.2 | 376.8 | 0.6 | 35.4 |
| claude code | 2.1.307 (Claude Code) | `/home/runner/.npm-global/bin/claude` | 292.0 | bin | 9.0 | 234.1 | — | — | 194.2 |
| codex | codex-cli 0.163.0 | `/home/runner/.npm-global/bin/codex` | 140.0 | bin | 42.0 | 42.4 | 851.2 | 1.6 | 49.1 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | `/home/runner/.npm-global/bin/opencode2` | 207.4 | bin | 81.2 | 134.5 | 497.4 | 65.5 | 129.4 |
| jcode | jcode v0.99.0 (774613c90) | `/home/runner/.local/bin/jcode` | 169.6 | bin | 8.9 | 11.1 | 773.7 | 0.3 | 31.9 |
| pi | 1.4.0 | `/home/runner/.npm-global/bin/pi` | 140.0 | bin | 245.1 | 321.0 | 847.5 | 8.4 | 129.6 |
| pi-bolt | 1.3.0 (Pi-Bolt 0.9.7, linux-x64, JIT off) | `/home/runner/.local/bin/pi-bolt` | 261.1 | bin | 11.0 | 39.8 | 517.8 | 1.7 | 96.2 |
| gemini cli | 0.65.0 | `/home/runner/.npm-global/bin/gemini` | 140.0 | bin | 1492.8 | 1573.6 | 1601.0 | — | 146.1 |
| copilot cli | GitHub Copilot CLI 1.0.102. | `/home/runner/.npm-global/bin/copilot` | 140.0 | bin | 102.3 | 775.3 | — | — | 47.4 |
| crush | crush version v0.98.1 | `/home/runner/.npm-global/bin/crush` | 140.0 | bin | 150.7 | 422.1 | 867.9 | 73.2 | 68.8 |
| goose | 1.55.0 | `/home/runner/.local/bin/goose` | 304.0 | bin | 6.9 | 6.7 | 367.4 | 0.2 | 110.7 |
| aider | aider 0.86.2 | `/home/runner/work/fox-agent/fox-agent/.venv-bench/bin/aider` | 140.0 | bin | 781.9 | 727.4 | 1109.1 | 10.1 | 67.0 |
| amp | 0.0.1792627309-g98c009 (released 2026-10-22T00:01:49.000Z, 1 | `/home/runner/.local/bin/amp` | 135.1 | bin | 251.8 | 262.5 | 619.1 | 0.5 | 162.6 |
| cursor-agent | 2026.10.19-6bbf2c4 | `/home/runner/.local/bin/cursor-agent` | 140.0 | bin | 447.0 | 426.0 | 789.2 | — | 249.9 |
| qwen code | 0.26.0 | `/home/runner/.npm-global/bin/qwen` | 140.0 | bin | 35.6 | 824.0 | 1291.8 | — | 248.3 |
| codebuff | 1.0.688 | `/home/runner/.npm-global/bin/codebuff` | 140.0 | bin | 886.8 | 868.3 | 1366.5 | 110.3 | 57.6 |
| kilo code | 7.8.15 | `/home/runner/.npm-global/bin/kilocode` | 140.0 | bin | 821.0 | 2472.5 | 6591.4 | 1691.2 | 46.3 |
| droid | 0.245.1 | `/home/runner/.local/bin/droid` | 295.5 | bin | 113.2 | 122.7 | 802.6 | 737.9 | 279.7 |
| kimi code | 2.3.0 | `/home/runner/.kimi-code/bin/kimi` | 192.5 | bin | 566.7 | 730.8 | 1112.4 | 4.4 | 352.8 |
| devin | devin 3000.11.92 (7f4e64980e22) | `/home/runner/.local/bin/devin` | 200.4 | bin | 4.5 | 21.4 | 1028.6 | 1641.0 | 95.6 |
| cline | 3.0.73 | `/home/runner/.npm-global/bin/cline` | 140.0 | bin | 916.4 | 1286.5 | — | — | 55.0 |
| continue | 1.5.47 | `/home/runner/.npm-global/bin/cn` | 140.0 | bin | 1092.2 | — | — | — | 316.6 |
| iflow cli | 0.5.19 | `/home/runner/.npm-global/bin/iflow` | 140.0 | bin | 1209.6 | 1271.2 | 2078.2 | 45.4 | 55.6 |

</details>

fox-agent headless vs scripted local provider: time to first token **65 ms**, peak RSS **60 MB**.

_Generated 2026-10-22T01:59:28Z on Linux x86_64 (6.17.0-1022-azure). [How this is measured](#benchmarks) · [raw JSON](bench/results.json)_
