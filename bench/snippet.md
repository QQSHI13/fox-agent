![harness bench dashboard](bench/bench.svg)

| agent | bundle | `--version` | TUI 1st byte | TUI 1st input | input latency 1s | idle PSS |
|---|---|---|---|---|---|---|
| **fox-agent** | 99 MB | 15 ms | **17 ms** | **377 ms** | **1 ms** | 35 MB |
| claude code | 291 MB | 10 ms | **246 ms** | — | — | 194 MB |
| codex | 140 MB | 42 ms | **43 ms** | **797 ms** | **2 ms** | 49 MB |
| opencode v2 | 207 MB | 90 ms | **150 ms** | **502 ms** | **72 ms** | 129 MB |
| jcode | 170 MB | 9 ms | **12 ms** | **765 ms** | **0 ms** | 32 MB |
| pi | 140 MB | 244 ms | **322 ms** | **853 ms** | **8 ms** | 131 MB |
| pi-bolt | 261 MB | 12 ms | **39 ms** | **524 ms** | **2 ms** | 96 MB |
| gemini cli | 140 MB | 1527 ms | **1597 ms** | **1617 ms** | — | 146 MB |
| copilot cli | 140 MB | 106 ms | **783 ms** | — | — | 47 MB |
| crush | 140 MB | 163 ms | **399 ms** | **846 ms** | **73 ms** | 68 MB |
| goose | 304 MB | 8 ms | **7 ms** | **368 ms** | **0 ms** | 110 MB |
| aider | 140 MB | 831 ms | **751 ms** | **1158 ms** | **10 ms** | 67 MB |
| amp | 135 MB | 268 ms | **277 ms** | **638 ms** | **1 ms** | 163 MB |
| cursor-agent | 140 MB | 475 ms | **447 ms** | **805 ms** | — | 252 MB |
| qwen code | 140 MB | 38 ms | **852 ms** | **1345 ms** | — | 238 MB |
| codebuff | 140 MB | 948 ms | **919 ms** | **1443 ms** | **110 ms** | 58 MB |
| kilo code | 140 MB | 882 ms | **2708 ms** | **6932 ms** | **1738 ms** | 46 MB |
| droid | 295 MB | 113 ms | **138 ms** | **3283 ms** | **761 ms** | 338 MB |
| kimi code | 192 MB | 628 ms | **793 ms** | **1187 ms** | **5 ms** | 352 MB |
| devin | 200 MB | 5 ms | **24 ms** | **1035 ms** | **1640 ms** | 93 MB |
| cline | 140 MB | 984 ms | **1247 ms** | — | — | 55 MB |
| continue | 140 MB | 1236 ms | — | — | — | 317 MB |
| iflow cli | 140 MB | 1285 ms | **1385 ms** | **2579 ms** | **46 ms** | 56 MB |

<details><summary>full precision · all collected fields</summary>

| agent | version | bin | bundle (MB) | bundle kind | `--version` (ms) | TUI 1st byte (ms) | TUI 1st input (ms) | input latency 1s (ms) | idle PSS (MB) |
|---|---|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.6.0 | `/home/runner/work/fox-agent/fox-agent/bin/fox` | 99.1 | bin | 15.0 | 17.2 | 377.5 | 0.6 | 35.4 |
| claude code | 2.1.306 (Claude Code) | `/home/runner/.npm-global/bin/claude` | 290.5 | bin | 9.6 | 246.5 | — | — | 193.6 |
| codex | codex-cli 0.163.0 | `/home/runner/.npm-global/bin/codex` | 140.0 | bin | 41.8 | 43.1 | 796.6 | 1.7 | 49.1 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | `/home/runner/.npm-global/bin/opencode2` | 207.4 | bin | 89.7 | 149.7 | 502.5 | 72.3 | 129.1 |
| jcode | jcode v0.99.0 (774613c90) | `/home/runner/.local/bin/jcode` | 169.6 | bin | 8.9 | 11.6 | 764.7 | 0.4 | 31.9 |
| pi | 1.3.0 | `/home/runner/.npm-global/bin/pi` | 140.0 | bin | 243.5 | 321.5 | 853.0 | 8.4 | 131.3 |
| pi-bolt | 1.3.0 (Pi-Bolt 0.9.6, linux-x64, JIT off) | `/home/runner/.local/bin/pi-bolt` | 261.1 | bin | 12.4 | 39.1 | 523.9 | 1.7 | 96.3 |
| gemini cli | 0.65.0 | `/home/runner/.npm-global/bin/gemini` | 140.0 | bin | 1527.0 | 1597.4 | 1616.9 | — | 146.0 |
| copilot cli | GitHub Copilot CLI 1.0.101. | `/home/runner/.npm-global/bin/copilot` | 140.0 | bin | 105.7 | 783.4 | — | — | 47.3 |
| crush | crush version v0.98.1 | `/home/runner/.npm-global/bin/crush` | 140.0 | bin | 162.8 | 399.3 | 846.5 | 72.7 | 68.4 |
| goose | 1.55.0 | `/home/runner/.local/bin/goose` | 304.0 | bin | 7.9 | 7.5 | 367.9 | 0.2 | 110.2 |
| aider | aider 0.86.2 | `/home/runner/work/fox-agent/fox-agent/.venv-bench/bin/aider` | 140.0 | bin | 830.6 | 750.7 | 1157.5 | 10.4 | 66.9 |
| amp | 0.0.1792555249-g702cd1 (released 2026-10-21T04:00:49.000Z, 2 | `/home/runner/.local/bin/amp` | 135.0 | bin | 267.8 | 276.6 | 638.1 | 0.6 | 163.3 |
| cursor-agent | 2026.10.19-6bbf2c4 | `/home/runner/.local/bin/cursor-agent` | 140.0 | bin | 474.6 | 446.7 | 804.6 | — | 251.5 |
| qwen code | 0.25.3 | `/home/runner/.npm-global/bin/qwen` | 140.0 | bin | 37.9 | 851.6 | 1344.7 | — | 237.5 |
| codebuff | 1.0.688 | `/home/runner/.npm-global/bin/codebuff` | 140.0 | bin | 947.6 | 918.5 | 1442.9 | 109.6 | 57.5 |
| kilo code | 7.8.15 | `/home/runner/.npm-global/bin/kilocode` | 140.0 | bin | 881.9 | 2708.0 | 6931.5 | 1738.3 | 46.2 |
| droid | 0.245.0 | `/home/runner/.local/bin/droid` | 295.5 | bin | 112.5 | 137.9 | 3282.8 | 761.1 | 338.1 |
| kimi code | 2.2.0 | `/home/runner/.kimi-code/bin/kimi` | 191.9 | bin | 628.4 | 793.0 | 1186.8 | 4.5 | 352.5 |
| devin | devin 3000.11.92 (7f4e64980e22) | `/home/runner/.local/bin/devin` | 200.4 | bin | 4.9 | 23.8 | 1035.0 | 1640.1 | 92.8 |
| cline | 3.0.73 | `/home/runner/.npm-global/bin/cline` | 140.0 | bin | 984.3 | 1247.1 | — | — | 55.0 |
| continue | 1.5.47 | `/home/runner/.npm-global/bin/cn` | 140.0 | bin | 1235.8 | — | — | — | 317.0 |
| iflow cli | 0.5.19 | `/home/runner/.npm-global/bin/iflow` | 140.0 | bin | 1285.2 | 1384.6 | 2578.9 | 46.4 | 55.6 |

</details>

fox-agent headless vs scripted local provider: time to first token **65 ms**, peak RSS **61 MB**.

_Generated 2026-10-21T04:40:55Z on Linux x86_64 (6.17.0-1022-azure). [How this is measured](#benchmarks) · [raw JSON](bench/results.json)_
