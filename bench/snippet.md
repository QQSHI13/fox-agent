![harness bench dashboard](bench/bench.svg)

| agent | bundle | `--version` | TUI 1st byte | TUI 1st input | input latency 1s | idle PSS |
|---|---|---|---|---|---|---|
| **fox-agent** | 120 MB | 17 ms | **17 ms** | — | — | 36 MB |
| claude code | 257 MB | 9 ms | **209 ms** | — | — | 187 MB |
| codex | 140 MB | 44 ms | **45 ms** | — | — | 49 MB |
| opencode v2 | 207 MB | 87 ms | **140 ms** | **507 ms** | **58 ms** | 131 MB |
| jcode | 138 MB | 10 ms | **13 ms** | — | — | 27 MB |
| pi | 140 MB | 240 ms | **324 ms** | **859 ms** | **9 ms** | 129 MB |
| gemini cli | 140 MB | 1581 ms | **1680 ms** | **1697 ms** | — | 146 MB |
| copilot cli | 140 MB | 106 ms | **803 ms** | — | — | 47 MB |
| crush | 140 MB | 140 ms | **277 ms** | — | — | 69 MB |
| goose | 308 MB | 7 ms | **7 ms** | **211 ms** | — | — |
| aider | 140 MB | 853 ms | **768 ms** | **1138 ms** | **10 ms** | 67 MB |
| amp | 134 MB | 251 ms | **262 ms** | **624 ms** | **0 ms** | 159 MB |
| cursor-agent | 140 MB | 476 ms | **450 ms** | — | — | 219 MB |
| qwen code | 140 MB | 35 ms | **811 ms** | — | — | 246 MB |
| codebuff | 140 MB | 899 ms | **867 ms** | — | — | 58 MB |
| kilo code | 140 MB | 845 ms | **2485 ms** | — | — | 46 MB |
| droid | 281 MB | 90 ms | **121 ms** | — | — | 221 MB |
| kimi code | 191 MB | 570 ms | **743 ms** | — | — | 349 MB |
| devin | 195 MB | 4 ms | **49 ms** | — | — | 46 MB |
| cline | 140 MB | 830 ms | **1085 ms** | — | — | 55 MB |
| continue | 140 MB | 1086 ms | — | — | — | 317 MB |
| iflow cli | 140 MB | 1232 ms | **1315 ms** | **2541 ms** | **46 ms** | 56 MB |

<details><summary>full precision · all collected fields</summary>

| agent | version | bin | bundle (MB) | bundle kind | `--version` (ms) | TUI 1st byte (ms) | TUI 1st input (ms) | input latency 1s (ms) | idle PSS (MB) |
|---|---|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.5.0-beta.1 | `/home/runner/work/fox-agent/fox-agent/bin/fox` | 120.3 | bin | 16.5 | 16.5 | — | — | 36.4 |
| claude code | 2.1.296 (Claude Code) | `/home/runner/.npm-global/bin/claude` | 257.1 | bin | 8.9 | 208.8 | — | — | 186.9 |
| codex | codex-cli 0.162.1 | `/home/runner/.npm-global/bin/codex` | 140.0 | bin | 43.7 | 45.5 | — | — | 49.1 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | `/home/runner/.npm-global/bin/opencode2` | 207.4 | bin | 87.4 | 139.6 | 507.2 | 57.6 | 130.9 |
| jcode | jcode v0.95.0 (6487bbd7e) | `/home/runner/.local/bin/jcode` | 138.2 | bin | 9.7 | 12.9 | — | — | 27.5 |
| pi | 1.1.0 | `/home/runner/.npm-global/bin/pi` | 140.0 | bin | 239.7 | 323.6 | 859.5 | 8.7 | 129.0 |
| gemini cli | 0.63.0 | `/home/runner/.npm-global/bin/gemini` | 140.0 | bin | 1580.7 | 1679.5 | 1696.9 | — | 145.7 |
| copilot cli | GitHub Copilot CLI 1.0.95. | `/home/runner/.npm-global/bin/copilot` | 140.0 | bin | 106.2 | 803.5 | — | — | 47.4 |
| crush | crush version v0.98.1 | `/home/runner/.npm-global/bin/crush` | 140.0 | bin | 140.3 | 277.1 | — | — | 69.1 |
| goose | 1.54.0 | `/home/runner/.local/bin/goose` | 307.8 | bin | 7.4 | 7.4 | 210.9 | — | — |
| aider | aider 0.86.2 | `/home/runner/work/fox-agent/fox-agent/.venv-bench/bin/aider` | 140.0 | bin | 853.5 | 768.4 | 1137.9 | 10.4 | 66.9 |
| amp | 0.0.1791778148-g902162 (released 2026-10-12T04:09:08.000Z, 1 | `/home/runner/.local/bin/amp` | 134.2 | bin | 251.1 | 261.6 | 624.4 | 0.5 | 158.7 |
| cursor-agent | 2026.10.01-e373342 | `/home/runner/.local/bin/cursor-agent` | 140.0 | bin | 475.6 | 450.0 | — | — | 218.7 |
| qwen code | 0.25.1 | `/home/runner/.npm-global/bin/qwen` | 140.0 | bin | 35.0 | 811.5 | — | — | 245.9 |
| codebuff | 1.0.688 | `/home/runner/.npm-global/bin/codebuff` | 140.0 | bin | 899.1 | 867.1 | — | — | 57.6 |
| kilo code | 7.8.8 | `/home/runner/.npm-global/bin/kilocode` | 140.0 | bin | 845.0 | 2484.7 | — | — | 46.3 |
| droid | 0.238.0 | `/home/runner/.local/bin/droid` | 281.4 | bin | 90.4 | 120.5 | — | — | 221.3 |
| kimi code | 2.1.1 | `/home/runner/.kimi-code/bin/kimi` | 190.8 | bin | 570.1 | 742.8 | — | — | 349.1 |
| devin | devin 3000.11.3 (9c803229faa4) | `/home/runner/.local/bin/devin` | 195.0 | bin | 4.1 | 49.3 | — | — | 46.4 |
| cline | 3.0.70 | `/home/runner/.npm-global/bin/cline` | 140.0 | bin | 829.9 | 1084.9 | — | — | 55.1 |
| continue | 1.5.47 | `/home/runner/.npm-global/bin/cn` | 140.0 | bin | 1086.1 | — | — | — | 317.2 |
| iflow cli | 0.5.19 | `/home/runner/.npm-global/bin/iflow` | 140.0 | bin | 1231.8 | 1315.0 | 2541.4 | 46.0 | 55.8 |

</details>

fox-agent headless vs scripted local provider: time to first token **60 ms**, peak RSS **61 MB**.

_Generated 2026-10-12T05:58:32Z on Linux x86_64 (6.17.0-1022-azure). [How this is measured](#benchmarks) · [raw JSON](bench/results.json)_
