![harness bench dashboard](bench/bench.svg)

| agent | bundle | `--version` | TUI 1st byte | TUI 1st input | input latency 1s | idle PSS |
|---|---|---|---|---|---|---|
| **fox-agent** | 99 MB | 14 ms | **18 ms** | **377 ms** | **1 ms** | 35 MB |
| claude code | 286 MB | 10 ms | **224 ms** | — | — | 191 MB |
| codex | 140 MB | 44 ms | **46 ms** | **805 ms** | **2 ms** | 49 MB |
| opencode v2 | 207 MB | 84 ms | **135 ms** | **499 ms** | **59 ms** | 129 MB |
| jcode | 170 MB | 10 ms | **14 ms** | **783 ms** | **0 ms** | 32 MB |
| pi | 140 MB | 238 ms | **312 ms** | **838 ms** | **8 ms** | 131 MB |
| pi-bolt | 260 MB | 13 ms | **42 ms** | **529 ms** | **2 ms** | 96 MB |
| gemini cli | 140 MB | 1467 ms | **1536 ms** | **1578 ms** | **0 ms** | 146 MB |
| copilot cli | 140 MB | 107 ms | **784 ms** | — | — | 47 MB |
| crush | 140 MB | 139 ms | **289 ms** | **756 ms** | **69 ms** | 69 MB |
| goose | 304 MB | 8 ms | **8 ms** | **369 ms** | **0 ms** | 108 MB |
| aider | 140 MB | 821 ms | **729 ms** | **1113 ms** | **10 ms** | 67 MB |
| amp | 135 MB | 248 ms | **259 ms** | **624 ms** | **1 ms** | 168 MB |
| cursor-agent | 140 MB | 440 ms | **429 ms** | — | — | 237 MB |
| qwen code | 140 MB | 40 ms | **828 ms** | **1308 ms** | — | 247 MB |
| codebuff | 140 MB | 979 ms | **953 ms** | **1459 ms** | **111 ms** | 58 MB |
| kilo code | 140 MB | 879 ms | **2578 ms** | **6630 ms** | **1587 ms** | 46 MB |
| droid | 294 MB | 105 ms | **125 ms** | **3216 ms** | **795 ms** | 333 MB |
| kimi code | 192 MB | 579 ms | **749 ms** | **1146 ms** | **4 ms** | 352 MB |
| devin | 200 MB | 5 ms | **23 ms** | **1028 ms** | **1641 ms** | 88 MB |
| cline | 140 MB | 862 ms | **1114 ms** | — | — | 55 MB |
| continue | 140 MB | 1124 ms | — | — | — | 318 MB |
| iflow cli | 140 MB | 1245 ms | **1311 ms** | **2492 ms** | **46 ms** | 56 MB |

<details><summary>full precision · all collected fields</summary>

| agent | version | bin | bundle (MB) | bundle kind | `--version` (ms) | TUI 1st byte (ms) | TUI 1st input (ms) | input latency 1s (ms) | idle PSS (MB) |
|---|---|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.6.0 | `/home/runner/work/fox-agent/fox-agent/bin/fox` | 99.1 | bin | 13.9 | 18.1 | 377.3 | 0.6 | 35.3 |
| claude code | 2.1.303 (Claude Code) | `/home/runner/.npm-global/bin/claude` | 285.8 | bin | 10.4 | 224.1 | — | — | 191.2 |
| codex | codex-cli 0.163.0 | `/home/runner/.npm-global/bin/codex` | 140.0 | bin | 44.1 | 46.3 | 805.0 | 1.6 | 49.1 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | `/home/runner/.npm-global/bin/opencode2` | 207.4 | bin | 84.4 | 134.9 | 499.4 | 58.6 | 129.1 |
| jcode | jcode v0.99.0 (774613c90) | `/home/runner/.local/bin/jcode` | 169.6 | bin | 10.5 | 13.9 | 782.9 | 0.4 | 31.6 |
| pi | 1.3.0 | `/home/runner/.npm-global/bin/pi` | 140.0 | bin | 238.3 | 312.0 | 838.2 | 8.0 | 131.1 |
| pi-bolt | 1.3.0 (Pi-Bolt 0.9.5, linux-x64, JIT off) | `/home/runner/.local/bin/pi-bolt` | 260.4 | bin | 13.0 | 41.6 | 528.5 | 1.6 | 96.4 |
| gemini cli | 0.64.0 | `/home/runner/.npm-global/bin/gemini` | 140.0 | bin | 1467.5 | 1536.0 | 1577.7 | 0.1 | 146.0 |
| copilot cli | GitHub Copilot CLI 1.0.98. | `/home/runner/.npm-global/bin/copilot` | 140.0 | bin | 106.9 | 784.4 | — | — | 47.3 |
| crush | crush version v0.98.1 | `/home/runner/.npm-global/bin/crush` | 140.0 | bin | 139.5 | 289.3 | 755.5 | 69.4 | 69.0 |
| goose | 1.55.0 | `/home/runner/.local/bin/goose` | 304.0 | bin | 8.3 | 8.1 | 368.8 | 0.2 | 108.4 |
| aider | aider 0.86.2 | `/home/runner/work/fox-agent/fox-agent/.venv-bench/bin/aider` | 140.0 | bin | 821.4 | 729.3 | 1113.1 | 9.9 | 66.9 |
| amp | 0.0.1792411243-gb8cffc (released 2026-10-19T12:00:43.000Z, 1 | `/home/runner/.local/bin/amp` | 135.0 | bin | 247.9 | 258.6 | 624.5 | 0.6 | 167.5 |
| cursor-agent | 2026.10.16-e3cb207 | `/home/runner/.local/bin/cursor-agent` | 140.0 | bin | 439.5 | 429.1 | — | — | 237.2 |
| qwen code | 0.25.3 | `/home/runner/.npm-global/bin/qwen` | 140.0 | bin | 39.8 | 828.0 | 1308.0 | — | 247.2 |
| codebuff | 1.0.688 | `/home/runner/.npm-global/bin/codebuff` | 140.0 | bin | 978.7 | 952.6 | 1459.4 | 111.3 | 57.6 |
| kilo code | 7.8.12 | `/home/runner/.npm-global/bin/kilocode` | 140.0 | bin | 879.5 | 2578.0 | 6630.1 | 1587.2 | 46.2 |
| droid | 0.244.0 | `/home/runner/.local/bin/droid` | 294.4 | bin | 105.2 | 124.7 | 3215.6 | 795.1 | 333.4 |
| kimi code | 2.2.0 | `/home/runner/.kimi-code/bin/kimi` | 191.9 | bin | 578.9 | 748.9 | 1146.4 | 4.3 | 352.5 |
| devin | devin 3000.11.92 (7f4e64980e22) | `/home/runner/.local/bin/devin` | 200.4 | bin | 4.8 | 22.6 | 1027.8 | 1640.9 | 88.3 |
| cline | 3.0.73 | `/home/runner/.npm-global/bin/cline` | 140.0 | bin | 862.3 | 1113.7 | — | — | 55.0 |
| continue | 1.5.47 | `/home/runner/.npm-global/bin/cn` | 140.0 | bin | 1123.6 | — | — | — | 318.3 |
| iflow cli | 0.5.19 | `/home/runner/.npm-global/bin/iflow` | 140.0 | bin | 1245.1 | 1310.6 | 2492.3 | 46.2 | 55.6 |

</details>

fox-agent headless vs scripted local provider: time to first token **57 ms**, peak RSS **61 MB**.

_Generated 2026-10-19T13:13:31Z on Linux x86_64 (6.17.0-1022-azure). [How this is measured](#benchmarks) · [raw JSON](bench/results.json)_
