![harness bench dashboard](bench/bench.svg)

| agent | bundle | `--version` | TUI 1st byte | TUI 1st input | input latency 1s | idle PSS |
|---|---|---|---|---|---|---|
| **fox-agent** | 117 MB | 16 ms | **17 ms** | **378 ms** | **1 ms** | 39 MB |
| claude code | 292 MB | 12 ms | **245 ms** | — | — | 194 MB |
| codex | 140 MB | 43 ms | **45 ms** | **805 ms** | **1 ms** | 48 MB |
| opencode v2 | 207 MB | 86 ms | **144 ms** | **508 ms** | **72 ms** | 128 MB |
| jcode | 170 MB | 10 ms | **12 ms** | **760 ms** | **0 ms** | 35 MB |
| pi | 140 MB | 257 ms | **331 ms** | **861 ms** | **8 ms** | 131 MB |
| pi-bolt | 262 MB | 12 ms | **43 ms** | **521 ms** | **2 ms** | 96 MB |
| gemini cli | 140 MB | 1575 ms | **1669 ms** | **1696 ms** | **0 ms** | 146 MB |
| copilot cli | 140 MB | 107 ms | **783 ms** | — | — | 46 MB |
| crush | 140 MB | 144 ms | **581 ms** | **1028 ms** | **73 ms** | 68 MB |
| goose | 304 MB | 8 ms | **8 ms** | **369 ms** | **0 ms** | 111 MB |
| aider | 140 MB | 787 ms | **724 ms** | **1115 ms** | **10 ms** | 68 MB |
| amp | 135 MB | 263 ms | **267 ms** | **630 ms** | **0 ms** | 164 MB |
| cursor-agent | 140 MB | 466 ms | **439 ms** | **799 ms** | — | 253 MB |
| qwen code | 140 MB | 37 ms | **840 ms** | **1316 ms** | — | 246 MB |
| codebuff | 140 MB | 952 ms | **886 ms** | **1374 ms** | **108 ms** | 56 MB |
| kilo code | 140 MB | 830 ms | **2515 ms** | **6704 ms** | **1770 ms** | 45 MB |
| droid | 300 MB | 115 ms | **125 ms** | **3260 ms** | **786 ms** | 353 MB |
| kimi code | 192 MB | 626 ms | **779 ms** | **1211 ms** | **4 ms** | 351 MB |
| devin | 200 MB | 4 ms | **24 ms** | **1029 ms** | **1640 ms** | 71 MB |
| cline | 140 MB | 963 ms | **1133 ms** | — | — | 53 MB |
| continue | 140 MB | 1142 ms | — | — | — | 316 MB |
| iflow cli | 140 MB | 1286 ms | **1378 ms** | **2568 ms** | **46 ms** | 54 MB |

<details><summary>full precision · all collected fields</summary>

| agent | version | bin | bundle (MB) | bundle kind | `--version` (ms) | TUI 1st byte (ms) | TUI 1st input (ms) | input latency 1s (ms) | idle PSS (MB) |
|---|---|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.6.0 | `/home/runner/work/fox-agent/fox-agent/bin/fox` | 117.5 | bin | 15.6 | 16.9 | 378.0 | 0.6 | 39.2 |
| claude code | 2.1.308 (Claude Code) | `/home/runner/.npm-global/bin/claude` | 292.2 | bin | 12.5 | 245.1 | — | — | 194.1 |
| codex | codex-cli 0.163.0 | `/home/runner/.npm-global/bin/codex` | 140.0 | bin | 43.3 | 45.0 | 805.2 | 0.6 | 47.6 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | `/home/runner/.npm-global/bin/opencode2` | 207.4 | bin | 85.8 | 144.2 | 507.7 | 71.7 | 128.0 |
| jcode | jcode v0.99.0 (774613c90) | `/home/runner/.local/bin/jcode` | 169.6 | bin | 9.7 | 12.4 | 760.5 | 0.3 | 34.9 |
| pi | 1.4.0 | `/home/runner/.npm-global/bin/pi` | 140.0 | bin | 256.6 | 330.8 | 861.4 | 8.2 | 130.9 |
| pi-bolt | 1.4.0 (Pi-Bolt 0.9.8, linux-x64, JIT off) | `/home/runner/.local/bin/pi-bolt` | 262.0 | bin | 11.8 | 43.1 | 520.8 | 1.7 | 96.2 |
| gemini cli | 0.65.0 | `/home/runner/.npm-global/bin/gemini` | 140.0 | bin | 1575.1 | 1668.7 | 1696.2 | 0.1 | 145.6 |
| copilot cli | GitHub Copilot CLI 1.0.102. | `/home/runner/.npm-global/bin/copilot` | 140.0 | bin | 107.0 | 782.8 | — | — | 45.9 |
| crush | crush version v0.98.1 | `/home/runner/.npm-global/bin/crush` | 140.0 | bin | 144.1 | 581.5 | 1027.6 | 72.6 | 67.8 |
| goose | 1.55.0 | `/home/runner/.local/bin/goose` | 304.0 | bin | 8.0 | 8.1 | 368.8 | 0.2 | 110.8 |
| aider | aider 0.86.2 | `/home/runner/work/fox-agent/fox-agent/.venv-bench/bin/aider` | 140.0 | bin | 787.1 | 724.2 | 1114.7 | 9.7 | 67.7 |
| amp | 0.0.1792656060-g6af3d5 (released 2026-10-22T08:01:00.000Z, 3 | `/home/runner/.local/bin/amp` | 135.3 | bin | 263.1 | 266.6 | 630.0 | 0.4 | 164.2 |
| cursor-agent | 2026.10.19-6bbf2c4 | `/home/runner/.local/bin/cursor-agent` | 140.0 | bin | 465.9 | 438.5 | 799.5 | — | 253.2 |
| qwen code | 0.26.0 | `/home/runner/.npm-global/bin/qwen` | 140.0 | bin | 37.4 | 840.4 | 1316.5 | — | 245.5 |
| codebuff | 1.0.688 | `/home/runner/.npm-global/bin/codebuff` | 140.0 | bin | 952.4 | 885.6 | 1374.1 | 108.5 | 56.5 |
| kilo code | 7.8.15 | `/home/runner/.npm-global/bin/kilocode` | 140.0 | bin | 830.0 | 2515.1 | 6703.8 | 1769.7 | 44.8 |
| droid | 0.247.0 | `/home/runner/.local/bin/droid` | 299.5 | bin | 115.2 | 124.6 | 3259.6 | 786.0 | 353.5 |
| kimi code | 2.3.0 | `/home/runner/.kimi-code/bin/kimi` | 192.5 | bin | 626.1 | 779.0 | 1211.2 | 4.1 | 351.5 |
| devin | devin 3000.11.92 (7f4e64980e22) | `/home/runner/.local/bin/devin` | 200.4 | bin | 4.2 | 24.1 | 1029.5 | 1640.0 | 71.1 |
| cline | 3.0.73 | `/home/runner/.npm-global/bin/cline` | 140.0 | bin | 963.4 | 1133.4 | — | — | 53.3 |
| continue | 1.5.47 | `/home/runner/.npm-global/bin/cn` | 140.0 | bin | 1141.6 | — | — | — | 315.9 |
| iflow cli | 0.5.19 | `/home/runner/.npm-global/bin/iflow` | 140.0 | bin | 1285.5 | 1377.7 | 2568.1 | 45.9 | 54.0 |

</details>

fox-agent headless vs scripted local provider: time to first token **61 ms**, peak RSS **65 MB**.

_Generated 2026-10-22T11:22:34Z on Linux x86_64 (7.0.0-1017-azure). [How this is measured](#benchmarks) · [raw JSON](bench/results.json)_
