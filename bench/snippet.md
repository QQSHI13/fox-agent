![harness bench dashboard](bench/bench.svg)

| agent | bundle | `--version` | TUI 1st byte | TUI 1st input | input latency 1s | idle PSS |
|---|---|---|---|---|---|---|
| **fox-agent** | 99 MB | 10 ms | **11 ms** | **371 ms** | **0 ms** | 35 MB |
| claude code | 286 MB | 7 ms | **124 ms** | — | — | 190 MB |
| codex | 140 MB | 28 ms | **30 ms** | **769 ms** | **0 ms** | 49 MB |
| opencode v2 | 207 MB | 50 ms | **79 ms** | **1104 ms** | **37 ms** | 125 MB |
| jcode | 167 MB | 6 ms | **8 ms** | **621 ms** | **0 ms** | 30 MB |
| pi | 140 MB | 136 ms | **180 ms** | **673 ms** | **5 ms** | 132 MB |
| gemini cli | 140 MB | 846 ms | **906 ms** | **924 ms** | — | — |
| copilot cli | 140 MB | 65 ms | **472 ms** | — | — | 47 MB |
| crush | 140 MB | 96 ms | **384 ms** | **773 ms** | **39 ms** | 68 MB |
| goose | 304 MB | 5 ms | **5 ms** | **365 ms** | **0 ms** | 109 MB |
| aider | 140 MB | 442 ms | **388 ms** | **762 ms** | **5 ms** | 67 MB |
| amp | 135 MB | 152 ms | **153 ms** | **516 ms** | **0 ms** | 161 MB |
| cursor-agent | 140 MB | 247 ms | **235 ms** | — | — | 235 MB |
| qwen code | 140 MB | 24 ms | **462 ms** | **856 ms** | — | 292 MB |
| codebuff | 140 MB | 546 ms | **530 ms** | **1033 ms** | **106 ms** | 58 MB |
| kilo code | 140 MB | 509 ms | **1447 ms** | **4398 ms** | **564 ms** | 46 MB |
| droid | 294 MB | 48 ms | **56 ms** | **3079 ms** | **647 ms** | 274 MB |
| kimi code | 192 MB | 331 ms | **437 ms** | **812 ms** | **2 ms** | 354 MB |
| devin | 200 MB | 3 ms | **15 ms** | **1018 ms** | **1640 ms** | 97 MB |
| cline | 140 MB | 604 ms | **768 ms** | — | — | 55 MB |
| continue | 140 MB | 628 ms | — | — | — | 319 MB |
| iflow cli | 140 MB | 703 ms | **754 ms** | **1489 ms** | **44 ms** | 58 MB |

<details><summary>full precision · all collected fields</summary>

| agent | version | bin | bundle (MB) | bundle kind | `--version` (ms) | TUI 1st byte (ms) | TUI 1st input (ms) | input latency 1s (ms) | idle PSS (MB) |
|---|---|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.6.0 | `/home/runner/work/fox-agent/fox-agent/bin/fox` | 99.0 | bin | 10.0 | 10.9 | 371.3 | 0.4 | 35.5 |
| claude code | 2.1.302 (Claude Code) | `/home/runner/.npm-global/bin/claude` | 285.8 | bin | 6.6 | 123.9 | — | — | 190.5 |
| codex | codex-cli 0.163.0 | `/home/runner/.npm-global/bin/codex` | 140.0 | bin | 28.3 | 29.9 | 769.4 | 0.2 | 49.0 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | `/home/runner/.npm-global/bin/opencode2` | 207.4 | bin | 50.0 | 79.3 | 1104.4 | 37.2 | 125.0 |
| jcode | jcode v0.98.1 (1c7426eb1) | `/home/runner/.local/bin/jcode` | 166.8 | bin | 6.5 | 8.1 | 621.3 | 0.2 | 30.5 |
| pi | 1.3.0 | `/home/runner/.npm-global/bin/pi` | 140.0 | bin | 135.9 | 179.9 | 672.6 | 4.7 | 132.3 |
| gemini cli | 0.64.0 | `/home/runner/.npm-global/bin/gemini` | 140.0 | bin | 846.1 | 906.4 | 924.0 | — | — |
| copilot cli | GitHub Copilot CLI 1.0.98. | `/home/runner/.npm-global/bin/copilot` | 140.0 | bin | 65.4 | 471.8 | — | — | 47.3 |
| crush | crush version v0.98.1 | `/home/runner/.npm-global/bin/crush` | 140.0 | bin | 95.9 | 384.0 | 772.5 | 39.4 | 68.4 |
| goose | 1.55.0 | `/home/runner/.local/bin/goose` | 304.0 | bin | 5.1 | 4.7 | 365.3 | 0.1 | 108.7 |
| aider | aider 0.86.2 | `/home/runner/work/fox-agent/fox-agent/.venv-bench/bin/aider` | 140.0 | bin | 441.6 | 388.0 | 761.8 | 4.9 | 66.9 |
| amp | 0.0.1792310430-g2972dc (released 2026-10-18T08:00:30.000Z, 4 | `/home/runner/.local/bin/amp` | 135.0 | bin | 152.3 | 153.5 | 516.4 | 0.3 | 160.7 |
| cursor-agent | 2026.10.16-e3cb207 | `/home/runner/.local/bin/cursor-agent` | 140.0 | bin | 247.4 | 235.2 | — | — | 234.9 |
| qwen code | 0.25.2 | `/home/runner/.npm-global/bin/qwen` | 140.0 | bin | 23.6 | 461.6 | 856.2 | — | 291.8 |
| codebuff | 1.0.688 | `/home/runner/.npm-global/bin/codebuff` | 140.0 | bin | 546.5 | 530.1 | 1033.2 | 105.5 | 57.7 |
| kilo code | 7.8.12 | `/home/runner/.npm-global/bin/kilocode` | 140.0 | bin | 509.1 | 1446.6 | 4397.5 | 564.3 | 46.2 |
| droid | 0.244.0 | `/home/runner/.local/bin/droid` | 294.4 | bin | 48.0 | 56.1 | 3078.9 | 646.8 | 274.2 |
| kimi code | 2.2.0 | `/home/runner/.kimi-code/bin/kimi` | 191.9 | bin | 331.0 | 437.2 | 812.0 | 2.4 | 353.9 |
| devin | devin 3000.11.92 (7f4e64980e22) | `/home/runner/.local/bin/devin` | 200.4 | bin | 2.9 | 15.2 | 1018.5 | 1640.0 | 96.9 |
| cline | 3.0.73 | `/home/runner/.npm-global/bin/cline` | 140.0 | bin | 604.3 | 768.1 | — | — | 54.9 |
| continue | 1.5.47 | `/home/runner/.npm-global/bin/cn` | 140.0 | bin | 628.2 | — | — | — | 318.6 |
| iflow cli | 0.5.19 | `/home/runner/.npm-global/bin/iflow` | 140.0 | bin | 702.8 | 753.7 | 1489.4 | 44.0 | 57.9 |

</details>

fox-agent headless vs scripted local provider: time to first token **36 ms**, peak RSS **60 MB**.

_Generated 2026-10-18T12:28:31Z on Linux x86_64 (6.17.0-1022-azure). [How this is measured](#benchmarks) · [raw JSON](bench/results.json)_
