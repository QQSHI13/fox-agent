![harness bench dashboard](bench/bench.svg)

| agent | bundle | `--version` | TUI 1st byte | TUI 1st input | input latency 1s | idle PSS |
|---|---|---|---|---|---|---|
| **fox-agent** | 120 MB | 15 ms | **17 ms** | — | — | 37 MB |
| claude code | 257 MB | 8 ms | **203 ms** | — | — | 187 MB |
| codex | 140 MB | 40 ms | **43 ms** | — | — | 49 MB |
| opencode v2 | 207 MB | 82 ms | **135 ms** | **497 ms** | **60 ms** | 127 MB |
| jcode | 138 MB | 9 ms | **11 ms** | — | — | 27 MB |
| pi | 140 MB | 235 ms | **317 ms** | **805 ms** | **8 ms** | 129 MB |
| gemini cli | 140 MB | 1507 ms | **1583 ms** | **1625 ms** | — | 146 MB |
| copilot cli | 140 MB | 102 ms | **779 ms** | — | — | 47 MB |
| crush | 140 MB | 133 ms | **531 ms** | — | — | 68 MB |
| goose | 308 MB | 7 ms | **7 ms** | **205 ms** | — | — |
| aider | 140 MB | 815 ms | **752 ms** | **1131 ms** | **10 ms** | 67 MB |
| amp | 134 MB | 249 ms | **260 ms** | **619 ms** | **1 ms** | 160 MB |
| cursor-agent | 140 MB | 450 ms | **439 ms** | — | — | 219 MB |
| qwen code | 140 MB | 37 ms | **817 ms** | — | — | 246 MB |
| codebuff | 140 MB | 888 ms | **888 ms** | — | — | 58 MB |
| kilo code | 140 MB | 843 ms | **2488 ms** | — | — | 46 MB |
| droid | 281 MB | 95 ms | **113 ms** | — | — | 233 MB |
| kimi code | 191 MB | 577 ms | **716 ms** | — | — | 350 MB |
| devin | 195 MB | 4 ms | **49 ms** | — | — | 48 MB |
| cline | 140 MB | 875 ms | **1189 ms** | — | — | 55 MB |
| continue | 140 MB | 1093 ms | — | — | — | 318 MB |
| iflow cli | 140 MB | 1214 ms | **1304 ms** | **2111 ms** | **46 ms** | 56 MB |

<details><summary>full precision · all collected fields</summary>

| agent | version | bin | bundle (MB) | bundle kind | `--version` (ms) | TUI 1st byte (ms) | TUI 1st input (ms) | input latency 1s (ms) | idle PSS (MB) |
|---|---|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.5.0-beta.1 | `/home/runner/work/fox-agent/fox-agent/bin/fox` | 120.3 | bin | 15.3 | 17.4 | — | — | 36.6 |
| claude code | 2.1.296 (Claude Code) | `/home/runner/.npm-global/bin/claude` | 257.1 | bin | 7.8 | 202.5 | — | — | 187.3 |
| codex | codex-cli 0.162.1 | `/home/runner/.npm-global/bin/codex` | 140.0 | bin | 40.5 | 42.5 | — | — | 49.0 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | `/home/runner/.npm-global/bin/opencode2` | 207.4 | bin | 82.4 | 134.9 | 496.5 | 60.3 | 127.0 |
| jcode | jcode v0.95.0 (6487bbd7e) | `/home/runner/.local/bin/jcode` | 138.2 | bin | 8.9 | 11.3 | — | — | 27.4 |
| pi | 1.1.0 | `/home/runner/.npm-global/bin/pi` | 140.0 | bin | 234.8 | 317.3 | 805.3 | 7.9 | 129.2 |
| gemini cli | 0.63.0 | `/home/runner/.npm-global/bin/gemini` | 140.0 | bin | 1507.0 | 1582.6 | 1625.2 | — | 145.9 |
| copilot cli | GitHub Copilot CLI 1.0.95. | `/home/runner/.npm-global/bin/copilot` | 140.0 | bin | 101.6 | 778.6 | — | — | 47.4 |
| crush | crush version v0.98.1 | `/home/runner/.npm-global/bin/crush` | 140.0 | bin | 132.8 | 531.2 | — | — | 68.4 |
| goose | 1.54.0 | `/home/runner/.local/bin/goose` | 307.8 | bin | 7.2 | 6.9 | 205.4 | — | — |
| aider | aider 0.86.2 | `/home/runner/work/fox-agent/fox-agent/.venv-bench/bin/aider` | 140.0 | bin | 815.0 | 752.1 | 1131.5 | 10.2 | 66.9 |
| amp | 0.0.1791778148-g902162 (released 2026-10-12T04:09:08.000Z, 1 | `/home/runner/.local/bin/amp` | 134.2 | bin | 248.8 | 260.2 | 618.7 | 0.5 | 160.4 |
| cursor-agent | 2026.10.01-e373342 | `/home/runner/.local/bin/cursor-agent` | 140.0 | bin | 449.6 | 438.8 | — | — | 219.1 |
| qwen code | 0.25.1 | `/home/runner/.npm-global/bin/qwen` | 140.0 | bin | 37.5 | 816.7 | — | — | 246.1 |
| codebuff | 1.0.688 | `/home/runner/.npm-global/bin/codebuff` | 140.0 | bin | 887.9 | 887.9 | — | — | 57.5 |
| kilo code | 7.8.8 | `/home/runner/.npm-global/bin/kilocode` | 140.0 | bin | 842.7 | 2488.0 | — | — | 46.2 |
| droid | 0.238.0 | `/home/runner/.local/bin/droid` | 281.4 | bin | 94.7 | 113.5 | — | — | 232.8 |
| kimi code | 2.1.1 | `/home/runner/.kimi-code/bin/kimi` | 190.8 | bin | 577.2 | 716.2 | — | — | 349.9 |
| devin | devin 3000.11.3 (9c803229faa4) | `/home/runner/.local/bin/devin` | 195.0 | bin | 3.9 | 48.6 | — | — | 48.3 |
| cline | 3.0.70 | `/home/runner/.npm-global/bin/cline` | 140.0 | bin | 874.7 | 1188.6 | — | — | 55.0 |
| continue | 1.5.47 | `/home/runner/.npm-global/bin/cn` | 140.0 | bin | 1093.4 | — | — | — | 318.0 |
| iflow cli | 0.5.19 | `/home/runner/.npm-global/bin/iflow` | 140.0 | bin | 1213.8 | 1304.2 | 2111.0 | 45.6 | 55.6 |

</details>

fox-agent headless vs scripted local provider: time to first token **60 ms**, peak RSS **61 MB**.

_Generated 2026-10-12T05:55:29Z on Linux x86_64 (6.17.0-1022-azure). [How this is measured](#benchmarks) · [raw JSON](bench/results.json)_
