![harness bench dashboard](bench/bench.svg)

| agent | bundle | `--version` | TUI 1st byte | TUI 1st input | input latency 1s | idle PSS |
|---|---|---|---|---|---|---|
| **fox-agent** | 117 MB | 12 ms | **13 ms** | **376 ms** | **1 ms** | 39 MB |
| claude code | 292 MB | 11 ms | **188 ms** | — | — | 194 MB |
| codex | 140 MB | 37 ms | **38 ms** | **795 ms** | **0 ms** | 48 MB |
| opencode v2 | 207 MB | 64 ms | **106 ms** | **468 ms** | **48 ms** | 122 MB |
| jcode | 170 MB | 8 ms | **10 ms** | **692 ms** | **0 ms** | 35 MB |
| pi | 140 MB | 196 ms | **253 ms** | **744 ms** | **6 ms** | 131 MB |
| pi-bolt | 262 MB | 10 ms | **34 ms** | **512 ms** | **1 ms** | 96 MB |
| gemini cli | 140 MB | 1183 ms | **1253 ms** | **1294 ms** | — | — |
| copilot cli | 140 MB | 85 ms | **628 ms** | — | — | 46 MB |
| crush | 140 MB | 130 ms | **575 ms** | **1011 ms** | **56 ms** | 68 MB |
| goose | 304 MB | 7 ms | **7 ms** | **367 ms** | **0 ms** | 112 MB |
| aider | 140 MB | 664 ms | **570 ms** | **966 ms** | **8 ms** | 68 MB |
| amp | 135 MB | 211 ms | **213 ms** | **571 ms** | **1 ms** | 169 MB |
| cursor-agent | 140 MB | 370 ms | **354 ms** | — | — | 250 MB |
| qwen code | 140 MB | 32 ms | **648 ms** | **1083 ms** | — | 293 MB |
| codebuff | 140 MB | 713 ms | **703 ms** | **1189 ms** | **108 ms** | 57 MB |
| kilo code | 140 MB | 671 ms | **1963 ms** | **5519 ms** | **1116 ms** | 45 MB |
| droid | 300 MB | 102 ms | **82 ms** | **3196 ms** | **708 ms** | 349 MB |
| kimi code | 192 MB | 478 ms | **608 ms** | **997 ms** | **3 ms** | 356 MB |
| devin | 200 MB | 4 ms | **19 ms** | **1025 ms** | **1641 ms** | 71 MB |
| cline | 140 MB | 682 ms | **935 ms** | — | — | 53 MB |
| continue | 140 MB | 898 ms | — | — | — | 316 MB |
| iflow cli | 140 MB | 978 ms | **1044 ms** | **1804 ms** | **45 ms** | 57 MB |

<details><summary>full precision · all collected fields</summary>

| agent | version | bin | bundle (MB) | bundle kind | `--version` (ms) | TUI 1st byte (ms) | TUI 1st input (ms) | input latency 1s (ms) | idle PSS (MB) |
|---|---|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.6.0 | `/home/runner/work/fox-agent/fox-agent/bin/fox` | 117.5 | bin | 11.6 | 13.5 | 376.3 | 0.5 | 38.9 |
| claude code | 2.1.308 (Claude Code) | `/home/runner/.npm-global/bin/claude` | 292.2 | bin | 11.4 | 187.9 | — | — | 194.2 |
| codex | codex-cli 0.163.0 | `/home/runner/.npm-global/bin/codex` | 140.0 | bin | 37.2 | 37.7 | 795.0 | 0.5 | 47.6 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | `/home/runner/.npm-global/bin/opencode2` | 207.4 | bin | 64.3 | 105.9 | 468.4 | 47.6 | 122.1 |
| jcode | jcode v0.99.0 (774613c90) | `/home/runner/.local/bin/jcode` | 169.6 | bin | 8.0 | 10.1 | 692.3 | 0.3 | 34.9 |
| pi | 1.4.0 | `/home/runner/.npm-global/bin/pi` | 140.0 | bin | 195.5 | 253.4 | 744.4 | 6.3 | 131.1 |
| pi-bolt | 1.4.0 (Pi-Bolt 0.9.8, linux-x64, JIT off) | `/home/runner/.local/bin/pi-bolt` | 262.0 | bin | 9.9 | 33.9 | 512.4 | 1.4 | 96.4 |
| gemini cli | 0.65.0 | `/home/runner/.npm-global/bin/gemini` | 140.0 | bin | 1183.1 | 1252.6 | 1293.9 | — | — |
| copilot cli | GitHub Copilot CLI 1.0.102. | `/home/runner/.npm-global/bin/copilot` | 140.0 | bin | 84.9 | 628.0 | — | — | 45.8 |
| crush | crush version v0.98.1 | `/home/runner/.npm-global/bin/crush` | 140.0 | bin | 130.3 | 575.2 | 1011.2 | 56.0 | 67.8 |
| goose | 1.55.0 | `/home/runner/.local/bin/goose` | 304.0 | bin | 6.7 | 6.8 | 367.2 | 0.2 | 111.6 |
| aider | aider 0.86.2 | `/home/runner/work/fox-agent/fox-agent/.venv-bench/bin/aider` | 140.0 | bin | 663.8 | 570.4 | 965.6 | 7.8 | 67.6 |
| amp | 0.0.1792656060-g6af3d5 (released 2026-10-22T08:01:00.000Z, 3 | `/home/runner/.local/bin/amp` | 135.3 | bin | 210.6 | 213.4 | 571.0 | 0.5 | 169.1 |
| cursor-agent | 2026.10.19-6bbf2c4 | `/home/runner/.local/bin/cursor-agent` | 140.0 | bin | 370.2 | 354.3 | — | — | 249.6 |
| qwen code | 0.26.0 | `/home/runner/.npm-global/bin/qwen` | 140.0 | bin | 32.3 | 647.8 | 1082.7 | — | 292.6 |
| codebuff | 1.0.688 | `/home/runner/.npm-global/bin/codebuff` | 140.0 | bin | 712.6 | 702.6 | 1189.0 | 107.8 | 56.8 |
| kilo code | 7.8.15 | `/home/runner/.npm-global/bin/kilocode` | 140.0 | bin | 670.6 | 1962.8 | 5519.0 | 1116.5 | 44.8 |
| droid | 0.247.0 | `/home/runner/.local/bin/droid` | 299.5 | bin | 101.9 | 82.4 | 3196.0 | 707.8 | 349.5 |
| kimi code | 2.3.0 | `/home/runner/.kimi-code/bin/kimi` | 192.5 | bin | 478.3 | 607.6 | 996.7 | 3.3 | 355.9 |
| devin | devin 3000.11.92 (7f4e64980e22) | `/home/runner/.local/bin/devin` | 200.4 | bin | 3.8 | 19.3 | 1025.1 | 1640.9 | 70.5 |
| cline | 3.0.73 | `/home/runner/.npm-global/bin/cline` | 140.0 | bin | 682.1 | 934.6 | — | — | 53.3 |
| continue | 1.5.47 | `/home/runner/.npm-global/bin/cn` | 140.0 | bin | 897.5 | — | — | — | 316.4 |
| iflow cli | 0.5.19 | `/home/runner/.npm-global/bin/iflow` | 140.0 | bin | 977.9 | 1044.2 | 1803.7 | 44.7 | 56.8 |

</details>

fox-agent headless vs scripted local provider: time to first token **81 ms**, peak RSS **65 MB**.

_Generated 2026-10-22T11:35:05Z on Linux x86_64 (7.0.0-1017-azure). [How this is measured](#benchmarks) · [raw JSON](bench/results.json)_
