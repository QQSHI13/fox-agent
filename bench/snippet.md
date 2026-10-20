![harness bench dashboard](bench/bench.svg)

| agent | bundle | `--version` | TUI 1st byte | TUI 1st input | input latency 1s | idle PSS |
|---|---|---|---|---|---|---|
| **fox-agent** | 99 MB | 14 ms | **16 ms** | **378 ms** | **1 ms** | 35 MB |
| claude code | 289 MB | 8 ms | **227 ms** | — | — | 192 MB |
| codex | 140 MB | 42 ms | **45 ms** | **771 ms** | **0 ms** | 49 MB |
| opencode v2 | 207 MB | 83 ms | **132 ms** | **508 ms** | **62 ms** | 128 MB |
| jcode | 170 MB | 9 ms | **12 ms** | **765 ms** | **0 ms** | 32 MB |
| pi | 140 MB | 242 ms | **325 ms** | **840 ms** | **8 ms** | 129 MB |
| pi-bolt | 261 MB | 13 ms | **39 ms** | **517 ms** | **2 ms** | 96 MB |
| gemini cli | 140 MB | 1509 ms | **1591 ms** | **1614 ms** | **0 ms** | 146 MB |
| copilot cli | 140 MB | 104 ms | **766 ms** | — | — | 47 MB |
| crush | 140 MB | 146 ms | **265 ms** | **718 ms** | **73 ms** | 69 MB |
| goose | 304 MB | 7 ms | **7 ms** | **368 ms** | **0 ms** | 109 MB |
| aider | 140 MB | 790 ms | **728 ms** | **1110 ms** | **10 ms** | 67 MB |
| amp | 135 MB | 247 ms | **259 ms** | **617 ms** | **1 ms** | 161 MB |
| cursor-agent | 140 MB | 436 ms | **428 ms** | — | — | 249 MB |
| qwen code | 140 MB | 38 ms | **817 ms** | **1299 ms** | — | 248 MB |
| codebuff | 140 MB | 870 ms | **872 ms** | **1384 ms** | **112 ms** | 58 MB |
| kilo code | 140 MB | 835 ms | **2457 ms** | **6462 ms** | **1522 ms** | 46 MB |
| droid | 295 MB | 110 ms | **129 ms** | **3225 ms** | **740 ms** | 278 MB |
| kimi code | 192 MB | 605 ms | **733 ms** | **1118 ms** | **4 ms** | 353 MB |
| devin | 200 MB | 4 ms | **22 ms** | **1026 ms** | **1641 ms** | 96 MB |
| cline | 140 MB | 902 ms | **1110 ms** | — | — | 55 MB |
| continue | 140 MB | 1087 ms | — | — | — | 317 MB |
| iflow cli | 140 MB | 1194 ms | **1281 ms** | **2077 ms** | **46 ms** | 56 MB |

<details><summary>full precision · all collected fields</summary>

| agent | version | bin | bundle (MB) | bundle kind | `--version` (ms) | TUI 1st byte (ms) | TUI 1st input (ms) | input latency 1s (ms) | idle PSS (MB) |
|---|---|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.6.0 | `/home/runner/work/fox-agent/fox-agent/bin/fox` | 99.1 | bin | 13.8 | 15.7 | 378.5 | 0.6 | 34.9 |
| claude code | 2.1.304 (Claude Code) | `/home/runner/.npm-global/bin/claude` | 288.7 | bin | 8.1 | 227.3 | — | — | 192.0 |
| codex | codex-cli 0.163.0 | `/home/runner/.npm-global/bin/codex` | 140.0 | bin | 41.8 | 44.9 | 770.6 | 0.3 | 49.1 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | `/home/runner/.npm-global/bin/opencode2` | 207.4 | bin | 83.0 | 131.9 | 507.8 | 61.8 | 127.5 |
| jcode | jcode v0.99.0 (774613c90) | `/home/runner/.local/bin/jcode` | 169.6 | bin | 9.0 | 11.7 | 765.3 | 0.3 | 31.6 |
| pi | 1.3.0 | `/home/runner/.npm-global/bin/pi` | 140.0 | bin | 242.1 | 324.9 | 839.6 | 8.4 | 129.2 |
| pi-bolt | 1.3.0 (Pi-Bolt 0.9.6, linux-x64, JIT off) | `/home/runner/.local/bin/pi-bolt` | 261.1 | bin | 12.5 | 39.2 | 517.3 | 1.7 | 96.3 |
| gemini cli | 0.64.0 | `/home/runner/.npm-global/bin/gemini` | 140.0 | bin | 1509.4 | 1591.3 | 1613.7 | 0.1 | 146.1 |
| copilot cli | GitHub Copilot CLI 1.0.100. | `/home/runner/.npm-global/bin/copilot` | 140.0 | bin | 103.6 | 765.8 | — | — | 47.4 |
| crush | crush version v0.98.1 | `/home/runner/.npm-global/bin/crush` | 140.0 | bin | 145.6 | 264.6 | 717.7 | 72.6 | 69.0 |
| goose | 1.55.0 | `/home/runner/.local/bin/goose` | 304.0 | bin | 7.0 | 6.9 | 367.5 | 0.2 | 109.1 |
| aider | aider 0.86.2 | `/home/runner/work/fox-agent/fox-agent/.venv-bench/bin/aider` | 140.0 | bin | 790.1 | 727.9 | 1110.2 | 10.0 | 66.9 |
| amp | 0.0.1792470027-g8c393d (released 2026-10-20T04:20:27.000Z, 2 | `/home/runner/.local/bin/amp` | 135.1 | bin | 247.3 | 258.8 | 616.9 | 0.6 | 161.4 |
| cursor-agent | 2026.10.19-6bbf2c4 | `/home/runner/.local/bin/cursor-agent` | 140.0 | bin | 436.3 | 427.8 | — | — | 248.6 |
| qwen code | 0.25.3 | `/home/runner/.npm-global/bin/qwen` | 140.0 | bin | 37.6 | 816.8 | 1298.6 | — | 247.6 |
| codebuff | 1.0.688 | `/home/runner/.npm-global/bin/codebuff` | 140.0 | bin | 870.2 | 872.2 | 1384.1 | 111.5 | 57.6 |
| kilo code | 7.8.15 | `/home/runner/.npm-global/bin/kilocode` | 140.0 | bin | 835.4 | 2457.1 | 6461.5 | 1521.5 | 46.2 |
| droid | 0.245.0 | `/home/runner/.local/bin/droid` | 295.5 | bin | 109.7 | 128.6 | 3225.3 | 740.0 | 278.4 |
| kimi code | 2.2.0 | `/home/runner/.kimi-code/bin/kimi` | 191.9 | bin | 605.2 | 733.0 | 1118.4 | 4.2 | 352.7 |
| devin | devin 3000.11.92 (7f4e64980e22) | `/home/runner/.local/bin/devin` | 200.4 | bin | 4.3 | 21.8 | 1025.7 | 1641.0 | 95.9 |
| cline | 3.0.73 | `/home/runner/.npm-global/bin/cline` | 140.0 | bin | 902.0 | 1109.9 | — | — | 54.9 |
| continue | 1.5.47 | `/home/runner/.npm-global/bin/cn` | 140.0 | bin | 1087.1 | — | — | — | 317.1 |
| iflow cli | 0.5.19 | `/home/runner/.npm-global/bin/iflow` | 140.0 | bin | 1194.2 | 1281.1 | 2077.3 | 46.0 | 55.7 |

</details>

fox-agent headless vs scripted local provider: time to first token **43 ms**, peak RSS **64 MB**.

_Generated 2026-10-20T06:46:09Z on Linux x86_64 (6.17.0-1022-azure). [How this is measured](#benchmarks) · [raw JSON](bench/results.json)_
