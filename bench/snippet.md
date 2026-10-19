![harness bench dashboard](bench/bench.svg)

| agent | bundle | `--version` | TUI 1st byte | TUI 1st input | input latency 1s | idle PSS |
|---|---|---|---|---|---|---|
| **fox-agent** | 99 MB | 17 ms | **16 ms** | **378 ms** | **1 ms** | 35 MB |
| claude code | 286 MB | 11 ms | **240 ms** | — | — | 191 MB |
| codex | 140 MB | 44 ms | **46 ms** | **803 ms** | **0 ms** | 49 MB |
| opencode v2 | 207 MB | 88 ms | **144 ms** | **506 ms** | **66 ms** | 129 MB |
| jcode | 170 MB | 9 ms | **12 ms** | **769 ms** | **0 ms** | 32 MB |
| pi | 140 MB | 261 ms | **329 ms** | **860 ms** | **8 ms** | 130 MB |
| pi-bolt | 260 MB | 15 ms | **43 ms** | **518 ms** | **2 ms** | 96 MB |
| gemini cli | 140 MB | 1548 ms | **1622 ms** | **1641 ms** | — | 146 MB |
| copilot cli | 140 MB | 105 ms | **764 ms** | — | — | 47 MB |
| crush | 140 MB | 131 ms | **272 ms** | **722 ms** | **72 ms** | 69 MB |
| goose | 304 MB | 7 ms | **8 ms** | **368 ms** | **0 ms** | 109 MB |
| aider | 140 MB | 847 ms | **758 ms** | **1149 ms** | **10 ms** | 67 MB |
| amp | 135 MB | 264 ms | **266 ms** | **624 ms** | **0 ms** | 159 MB |
| cursor-agent | 140 MB | 445 ms | **433 ms** | — | — | 234 MB |
| qwen code | 140 MB | 38 ms | **840 ms** | **1343 ms** | — | 237 MB |
| codebuff | 140 MB | 963 ms | **947 ms** | **1466 ms** | **112 ms** | 58 MB |
| kilo code | 140 MB | 893 ms | **2650 ms** | **6716 ms** | **1806 ms** | 46 MB |
| droid | 294 MB | 112 ms | **136 ms** | **3248 ms** | **758 ms** | 279 MB |
| kimi code | 192 MB | 612 ms | **766 ms** | **1164 ms** | **5 ms** | 355 MB |
| devin | 200 MB | 5 ms | **26 ms** | **1035 ms** | **1641 ms** | 96 MB |
| cline | 140 MB | 882 ms | **1167 ms** | — | — | 55 MB |
| continue | 140 MB | 1141 ms | — | — | — | 317 MB |
| iflow cli | 140 MB | 1258 ms | **1359 ms** | **2517 ms** | **47 ms** | 56 MB |

<details><summary>full precision · all collected fields</summary>

| agent | version | bin | bundle (MB) | bundle kind | `--version` (ms) | TUI 1st byte (ms) | TUI 1st input (ms) | input latency 1s (ms) | idle PSS (MB) |
|---|---|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.6.0 | `/home/runner/work/fox-agent/fox-agent/bin/fox` | 99.1 | bin | 17.3 | 16.3 | 377.9 | 0.7 | 35.4 |
| claude code | 2.1.303 (Claude Code) | `/home/runner/.npm-global/bin/claude` | 285.8 | bin | 10.9 | 239.7 | — | — | 191.2 |
| codex | codex-cli 0.163.0 | `/home/runner/.npm-global/bin/codex` | 140.0 | bin | 44.0 | 45.5 | 802.6 | 0.5 | 49.1 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | `/home/runner/.npm-global/bin/opencode2` | 207.4 | bin | 87.7 | 143.7 | 506.0 | 65.8 | 129.5 |
| jcode | jcode v0.99.0 (774613c90) | `/home/runner/.local/bin/jcode` | 169.6 | bin | 9.3 | 12.1 | 769.1 | 0.4 | 32.3 |
| pi | 1.3.0 | `/home/runner/.npm-global/bin/pi` | 140.0 | bin | 261.0 | 329.0 | 860.2 | 8.4 | 130.2 |
| pi-bolt | 1.3.0 (Pi-Bolt 0.9.5, linux-x64, JIT off) | `/home/runner/.local/bin/pi-bolt` | 260.4 | bin | 15.0 | 42.6 | 517.9 | 1.8 | 96.3 |
| gemini cli | 0.64.0 | `/home/runner/.npm-global/bin/gemini` | 140.0 | bin | 1547.7 | 1622.2 | 1640.6 | — | 146.0 |
| copilot cli | GitHub Copilot CLI 1.0.98. | `/home/runner/.npm-global/bin/copilot` | 140.0 | bin | 104.9 | 763.6 | — | — | 47.4 |
| crush | crush version v0.98.1 | `/home/runner/.npm-global/bin/crush` | 140.0 | bin | 130.6 | 271.7 | 722.1 | 72.5 | 69.1 |
| goose | 1.55.0 | `/home/runner/.local/bin/goose` | 304.0 | bin | 7.4 | 7.5 | 368.5 | 0.2 | 109.3 |
| aider | aider 0.86.2 | `/home/runner/work/fox-agent/fox-agent/.venv-bench/bin/aider` | 140.0 | bin | 846.7 | 757.6 | 1148.8 | 10.3 | 66.9 |
| amp | 0.0.1792411243-gb8cffc (released 2026-10-19T12:00:43.000Z, 3 | `/home/runner/.local/bin/amp` | 135.0 | bin | 264.1 | 265.8 | 624.3 | 0.5 | 158.9 |
| cursor-agent | 2026.10.16-e3cb207 | `/home/runner/.local/bin/cursor-agent` | 140.0 | bin | 445.4 | 433.0 | — | — | 234.3 |
| qwen code | 0.25.3 | `/home/runner/.npm-global/bin/qwen` | 140.0 | bin | 38.0 | 840.4 | 1343.4 | — | 237.1 |
| codebuff | 1.0.688 | `/home/runner/.npm-global/bin/codebuff` | 140.0 | bin | 963.4 | 947.2 | 1465.9 | 111.7 | 57.5 |
| kilo code | 7.8.12 | `/home/runner/.npm-global/bin/kilocode` | 140.0 | bin | 893.2 | 2650.3 | 6716.4 | 1806.1 | 46.2 |
| droid | 0.244.0 | `/home/runner/.local/bin/droid` | 294.4 | bin | 112.3 | 135.6 | 3247.5 | 757.7 | 279.1 |
| kimi code | 2.2.0 | `/home/runner/.kimi-code/bin/kimi` | 191.9 | bin | 612.3 | 765.5 | 1164.3 | 4.5 | 354.9 |
| devin | devin 3000.11.92 (7f4e64980e22) | `/home/runner/.local/bin/devin` | 200.4 | bin | 5.2 | 25.8 | 1034.7 | 1641.0 | 95.6 |
| cline | 3.0.73 | `/home/runner/.npm-global/bin/cline` | 140.0 | bin | 882.3 | 1167.3 | — | — | 55.0 |
| continue | 1.5.47 | `/home/runner/.npm-global/bin/cn` | 140.0 | bin | 1140.7 | — | — | — | 317.5 |
| iflow cli | 0.5.19 | `/home/runner/.npm-global/bin/iflow` | 140.0 | bin | 1257.9 | 1358.6 | 2516.8 | 47.4 | 55.6 |

</details>

fox-agent headless vs scripted local provider: time to first token **66 ms**, peak RSS **61 MB**.

_Generated 2026-10-19T12:43:44Z on Linux x86_64 (6.17.0-1022-azure). [How this is measured](#benchmarks) · [raw JSON](bench/results.json)_
