![harness bench dashboard](bench/bench.svg)

| agent | bundle | `--version` | TUI 1st byte | TUI 1st input | input latency 1s | idle PSS |
|---|---|---|---|---|---|---|
| **fox-agent** | 120 MB | 17 ms | **19 ms** | — | — | 36 MB |
| claude code | 257 MB | 11 ms | **231 ms** | — | — | 187 MB |
| codex | 140 MB | 41 ms | **43 ms** | — | — | 49 MB |
| opencode v2 | 207 MB | 84 ms | **139 ms** | **509 ms** | **60 ms** | 129 MB |
| jcode | 138 MB | 10 ms | **12 ms** | — | — | 28 MB |
| pi | 140 MB | 252 ms | **336 ms** | **830 ms** | **9 ms** | 124 MB |
| gemini cli | 140 MB | 1625 ms | **1666 ms** | **1691 ms** | **0 ms** | 146 MB |
| copilot cli | 140 MB | 106 ms | **818 ms** | — | — | 47 MB |
| crush | 140 MB | 130 ms | **266 ms** | — | — | 69 MB |
| goose | 308 MB | 7 ms | **8 ms** | **209 ms** | **0 ms** | — |
| aider | 140 MB | 879 ms | **773 ms** | **1141 ms** | **12 ms** | 67 MB |
| amp | 134 MB | 257 ms | **272 ms** | **637 ms** | **1 ms** | 160 MB |
| cursor-agent | 140 MB | 466 ms | **455 ms** | — | — | 218 MB |
| qwen code | 140 MB | 38 ms | **846 ms** | — | — | 231 MB |
| codebuff | 140 MB | 1025 ms | **993 ms** | — | — | 58 MB |
| kilo code | 140 MB | 897 ms | **2687 ms** | — | — | 46 MB |
| droid | 281 MB | 93 ms | **120 ms** | — | — | 232 MB |
| kimi code | 191 MB | 605 ms | **761 ms** | — | — | 349 MB |
| devin | 195 MB | 4 ms | **50 ms** | — | — | 46 MB |
| cline | 140 MB | 897 ms | **1200 ms** | — | — | 55 MB |
| continue | 140 MB | 1182 ms | — | — | — | 317 MB |
| iflow cli | 140 MB | 1232 ms | **1320 ms** | **2545 ms** | **47 ms** | 56 MB |

<details><summary>full precision · all collected fields</summary>

| agent | version | bin | bundle (MB) | bundle kind | `--version` (ms) | TUI 1st byte (ms) | TUI 1st input (ms) | input latency 1s (ms) | idle PSS (MB) |
|---|---|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.5.0-beta.1 | `/home/runner/work/fox-agent/fox-agent/bin/fox` | 120.4 | bin | 17.1 | 18.6 | — | — | 36.5 |
| claude code | 2.1.296 (Claude Code) | `/home/runner/.npm-global/bin/claude` | 257.1 | bin | 10.9 | 231.3 | — | — | 187.2 |
| codex | codex-cli 0.162.1 | `/home/runner/.npm-global/bin/codex` | 140.0 | bin | 41.5 | 42.7 | — | — | 49.1 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | `/home/runner/.npm-global/bin/opencode2` | 207.4 | bin | 84.5 | 139.4 | 509.2 | 60.3 | 129.2 |
| jcode | jcode v0.95.0 (6487bbd7e) | `/home/runner/.local/bin/jcode` | 138.2 | bin | 9.6 | 11.7 | — | — | 27.6 |
| pi | 1.1.0 | `/home/runner/.npm-global/bin/pi` | 140.0 | bin | 251.9 | 336.0 | 829.7 | 8.8 | 124.3 |
| gemini cli | 0.63.0 | `/home/runner/.npm-global/bin/gemini` | 140.0 | bin | 1625.2 | 1665.7 | 1690.9 | 0.1 | 146.0 |
| copilot cli | GitHub Copilot CLI 1.0.95. | `/home/runner/.npm-global/bin/copilot` | 140.0 | bin | 106.4 | 817.9 | — | — | 47.4 |
| crush | crush version v0.98.1 | `/home/runner/.npm-global/bin/crush` | 140.0 | bin | 129.9 | 265.6 | — | — | 69.1 |
| goose | 1.54.0 | `/home/runner/.local/bin/goose` | 307.8 | bin | 7.5 | 7.9 | 208.8 | 0.1 | — |
| aider | aider 0.86.2 | `/home/runner/work/fox-agent/fox-agent/.venv-bench/bin/aider` | 140.0 | bin | 879.1 | 772.6 | 1140.6 | 11.8 | 66.8 |
| amp | 0.0.1791792883-gf1ab8d (released 2026-10-12T08:14:43.000Z, 3 | `/home/runner/.local/bin/amp` | 134.2 | bin | 256.7 | 272.0 | 637.3 | 0.6 | 159.6 |
| cursor-agent | 2026.10.01-e373342 | `/home/runner/.local/bin/cursor-agent` | 140.0 | bin | 466.3 | 454.8 | — | — | 217.6 |
| qwen code | 0.25.1 | `/home/runner/.npm-global/bin/qwen` | 140.0 | bin | 37.7 | 845.9 | — | — | 230.8 |
| codebuff | 1.0.688 | `/home/runner/.npm-global/bin/codebuff` | 140.0 | bin | 1024.7 | 992.9 | — | — | 57.6 |
| kilo code | 7.8.8 | `/home/runner/.npm-global/bin/kilocode` | 140.0 | bin | 897.3 | 2687.0 | — | — | 46.2 |
| droid | 0.238.0 | `/home/runner/.local/bin/droid` | 281.4 | bin | 93.2 | 120.1 | — | — | 232.4 |
| kimi code | 2.1.1 | `/home/runner/.kimi-code/bin/kimi` | 190.8 | bin | 604.8 | 760.7 | — | — | 349.5 |
| devin | devin 3000.11.3 (9c803229faa4) | `/home/runner/.local/bin/devin` | 195.0 | bin | 4.3 | 49.5 | — | — | 46.5 |
| cline | 3.0.70 | `/home/runner/.npm-global/bin/cline` | 140.0 | bin | 896.9 | 1200.1 | — | — | 55.0 |
| continue | 1.5.47 | `/home/runner/.npm-global/bin/cn` | 140.0 | bin | 1182.5 | — | — | — | 317.0 |
| iflow cli | 0.5.19 | `/home/runner/.npm-global/bin/iflow` | 140.0 | bin | 1231.8 | 1320.0 | 2544.9 | 46.5 | 55.7 |

</details>

fox-agent headless vs scripted local provider: time to first token **62 ms**, peak RSS **61 MB**.

_Generated 2026-10-12T12:20:11Z on Linux x86_64 (6.17.0-1022-azure). [How this is measured](#benchmarks) · [raw JSON](bench/results.json)_
