![harness bench dashboard](bench/bench.svg)

| agent | bundle | `--version` | TUI 1st byte | TUI 1st input | input latency 1s | idle PSS |
|---|---|---|---|---|---|---|
| **fox-agent** | 99 MB | 16 ms | **18 ms** | **377 ms** | **1 ms** | 38 MB |
| claude code | 292 MB | 9 ms | **245 ms** | — | — | 194 MB |
| codex | 140 MB | 45 ms | **47 ms** | **835 ms** | **1 ms** | 48 MB |
| opencode v2 | 207 MB | 92 ms | **147 ms** | **514 ms** | **67 ms** | 127 MB |
| jcode | 170 MB | 10 ms | **13 ms** | **763 ms** | **0 ms** | 35 MB |
| pi | 140 MB | 258 ms | **344 ms** | **863 ms** | **9 ms** | 130 MB |
| pi-bolt | 261 MB | 13 ms | **43 ms** | **523 ms** | **2 ms** | 96 MB |
| gemini cli | 140 MB | 1620 ms | **1690 ms** | **1722 ms** | — | 146 MB |
| copilot cli | 140 MB | 107 ms | **805 ms** | — | — | 46 MB |
| crush | 140 MB | 148 ms | **291 ms** | **736 ms** | **73 ms** | 68 MB |
| goose | 304 MB | 9 ms | **8 ms** | **369 ms** | **0 ms** | 111 MB |
| aider | 140 MB | 862 ms | **751 ms** | **1132 ms** | **10 ms** | 68 MB |
| amp | 135 MB | 271 ms | **272 ms** | **644 ms** | **1 ms** | 163 MB |
| cursor-agent | 140 MB | 484 ms | **461 ms** | **819 ms** | — | 247 MB |
| qwen code | 140 MB | 44 ms | **886 ms** | **1352 ms** | — | 232 MB |
| codebuff | 140 MB | 957 ms | **914 ms** | **1449 ms** | **112 ms** | 57 MB |
| kilo code | 140 MB | 873 ms | **2597 ms** | **6965 ms** | **1896 ms** | 45 MB |
| droid | 295 MB | 116 ms | **140 ms** | **745 ms** | **762 ms** | 288 MB |
| kimi code | 192 MB | 669 ms | **847 ms** | **1244 ms** | **5 ms** | 353 MB |
| devin | 200 MB | 5 ms | **26 ms** | **1038 ms** | **1641 ms** | 71 MB |
| cline | 140 MB | 919 ms | **1267 ms** | — | — | 53 MB |
| continue | 140 MB | 1233 ms | — | — | — | 315 MB |
| iflow cli | 140 MB | 1292 ms | **1421 ms** | **2597 ms** | **47 ms** | 54 MB |

<details><summary>full precision · all collected fields</summary>

| agent | version | bin | bundle (MB) | bundle kind | `--version` (ms) | TUI 1st byte (ms) | TUI 1st input (ms) | input latency 1s (ms) | idle PSS (MB) |
|---|---|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.6.0 | `/home/runner/work/fox-agent/fox-agent/bin/fox` | 99.1 | bin | 16.4 | 18.3 | 377.5 | 0.6 | 37.9 |
| claude code | 2.1.307 (Claude Code) | `/home/runner/.npm-global/bin/claude` | 292.0 | bin | 9.3 | 245.1 | — | — | 194.0 |
| codex | codex-cli 0.163.0 | `/home/runner/.npm-global/bin/codex` | 140.0 | bin | 44.7 | 46.7 | 835.0 | 0.6 | 47.7 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | `/home/runner/.npm-global/bin/opencode2` | 207.4 | bin | 92.1 | 146.5 | 514.1 | 67.0 | 127.4 |
| jcode | jcode v0.99.0 (774613c90) | `/home/runner/.local/bin/jcode` | 169.6 | bin | 10.0 | 12.8 | 762.8 | 0.3 | 35.4 |
| pi | 1.4.0 | `/home/runner/.npm-global/bin/pi` | 140.0 | bin | 258.3 | 344.4 | 863.1 | 8.5 | 129.9 |
| pi-bolt | 1.3.0 (Pi-Bolt 0.9.7, linux-x64, JIT off) | `/home/runner/.local/bin/pi-bolt` | 261.1 | bin | 13.0 | 43.1 | 523.0 | 1.7 | 96.4 |
| gemini cli | 0.65.0 | `/home/runner/.npm-global/bin/gemini` | 140.0 | bin | 1619.9 | 1690.0 | 1722.0 | — | 145.6 |
| copilot cli | GitHub Copilot CLI 1.0.102. | `/home/runner/.npm-global/bin/copilot` | 140.0 | bin | 107.0 | 805.4 | — | — | 46.2 |
| crush | crush version v0.98.1 | `/home/runner/.npm-global/bin/crush` | 140.0 | bin | 147.6 | 290.5 | 735.9 | 72.9 | 67.9 |
| goose | 1.55.0 | `/home/runner/.local/bin/goose` | 304.0 | bin | 8.7 | 8.2 | 368.7 | 0.2 | 110.6 |
| aider | aider 0.86.2 | `/home/runner/work/fox-agent/fox-agent/.venv-bench/bin/aider` | 140.0 | bin | 862.0 | 750.7 | 1131.9 | 10.4 | 67.9 |
| amp | 0.0.1792627309-g98c009 (released 2026-10-22T00:01:49.000Z, 1 | `/home/runner/.local/bin/amp` | 135.1 | bin | 270.7 | 271.9 | 644.2 | 0.5 | 163.0 |
| cursor-agent | 2026.10.19-6bbf2c4 | `/home/runner/.local/bin/cursor-agent` | 140.0 | bin | 484.4 | 460.9 | 818.8 | — | 247.1 |
| qwen code | 0.26.0 | `/home/runner/.npm-global/bin/qwen` | 140.0 | bin | 44.2 | 885.7 | 1351.7 | — | 231.7 |
| codebuff | 1.0.688 | `/home/runner/.npm-global/bin/codebuff` | 140.0 | bin | 957.2 | 913.9 | 1449.0 | 111.9 | 56.5 |
| kilo code | 7.8.15 | `/home/runner/.npm-global/bin/kilocode` | 140.0 | bin | 873.0 | 2596.6 | 6964.7 | 1896.2 | 44.8 |
| droid | 0.245.1 | `/home/runner/.local/bin/droid` | 295.5 | bin | 116.2 | 139.9 | 745.4 | 762.1 | 288.2 |
| kimi code | 2.3.0 | `/home/runner/.kimi-code/bin/kimi` | 192.5 | bin | 668.7 | 847.3 | 1243.7 | 4.6 | 352.6 |
| devin | devin 3000.11.92 (7f4e64980e22) | `/home/runner/.local/bin/devin` | 200.4 | bin | 5.3 | 26.4 | 1037.9 | 1641.0 | 71.0 |
| cline | 3.0.73 | `/home/runner/.npm-global/bin/cline` | 140.0 | bin | 919.2 | 1266.9 | — | — | 53.3 |
| continue | 1.5.47 | `/home/runner/.npm-global/bin/cn` | 140.0 | bin | 1233.1 | — | — | — | 315.0 |
| iflow cli | 0.5.19 | `/home/runner/.npm-global/bin/iflow` | 140.0 | bin | 1291.5 | 1420.7 | 2597.1 | 47.2 | 54.0 |

</details>

fox-agent headless vs scripted local provider: time to first token **66 ms**, peak RSS **64 MB**.

_Generated 2026-10-22T02:07:45Z on Linux x86_64 (7.0.0-1017-azure). [How this is measured](#benchmarks) · [raw JSON](bench/results.json)_
