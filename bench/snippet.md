![harness bench dashboard](bench/bench.svg)

| agent | bundle | `--version` | TUI 1st byte | TUI 1st input | input latency 1s | idle PSS |
|---|---|---|---|---|---|---|
| **fox-agent** | 120 MB | 18 ms | **18 ms** | — | — | 36 MB |
| claude code | 257 MB | 9 ms | **223 ms** | — | — | 187 MB |
| codex | 140 MB | 46 ms | **45 ms** | — | — | 49 MB |
| opencode v2 | 207 MB | 88 ms | **147 ms** | **511 ms** | **63 ms** | 131 MB |
| jcode | 138 MB | 10 ms | **13 ms** | — | — | 28 MB |
| pi | 140 MB | 241 ms | **323 ms** | **860 ms** | **8 ms** | 130 MB |
| gemini cli | 140 MB | 1597 ms | **1697 ms** | **1661 ms** | — | 146 MB |
| copilot cli | 140 MB | 106 ms | **815 ms** | — | — | 47 MB |
| crush | 140 MB | 143 ms | **274 ms** | — | — | 69 MB |
| goose | 308 MB | 8 ms | **8 ms** | **218 ms** | — | — |
| aider | 140 MB | 926 ms | **803 ms** | **1185 ms** | **11 ms** | 67 MB |
| amp | 134 MB | 273 ms | **272 ms** | **646 ms** | **1 ms** | 163 MB |
| cursor-agent | 140 MB | 472 ms | **457 ms** | — | — | 212 MB |
| qwen code | 140 MB | 39 ms | **855 ms** | — | — | 244 MB |
| codebuff | 140 MB | 946 ms | **917 ms** | — | — | 58 MB |
| kilo code | 140 MB | 853 ms | **2603 ms** | — | — | 46 MB |
| droid | 281 MB | 91 ms | **124 ms** | — | — | 233 MB |
| kimi code | 191 MB | 604 ms | **754 ms** | — | — | 329 MB |
| devin | 195 MB | 4 ms | **48 ms** | — | — | 48 MB |
| cline | 140 MB | 872 ms | **1153 ms** | — | — | 55 MB |
| continue | 140 MB | 1150 ms | — | — | — | 317 MB |
| iflow cli | 140 MB | 1242 ms | **1332 ms** | **2540 ms** | **46 ms** | 56 MB |

<details><summary>full precision · all collected fields</summary>

| agent | version | bin | bundle (MB) | bundle kind | `--version` (ms) | TUI 1st byte (ms) | TUI 1st input (ms) | input latency 1s (ms) | idle PSS (MB) |
|---|---|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.5.0-beta.1 | `/home/runner/work/fox-agent/fox-agent/bin/fox` | 120.4 | bin | 17.6 | 17.9 | — | — | 36.5 |
| claude code | 2.1.296 (Claude Code) | `/home/runner/.npm-global/bin/claude` | 257.1 | bin | 9.3 | 223.1 | — | — | 187.1 |
| codex | codex-cli 0.162.1 | `/home/runner/.npm-global/bin/codex` | 140.0 | bin | 46.3 | 45.1 | — | — | 49.1 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | `/home/runner/.npm-global/bin/opencode2` | 207.4 | bin | 88.3 | 146.6 | 511.1 | 63.3 | 130.9 |
| jcode | jcode v0.95.0 (6487bbd7e) | `/home/runner/.local/bin/jcode` | 138.2 | bin | 10.0 | 13.2 | — | — | 27.5 |
| pi | 1.1.0 | `/home/runner/.npm-global/bin/pi` | 140.0 | bin | 241.1 | 322.7 | 859.7 | 8.4 | 129.7 |
| gemini cli | 0.63.0 | `/home/runner/.npm-global/bin/gemini` | 140.0 | bin | 1596.8 | 1696.7 | 1661.3 | — | 146.1 |
| copilot cli | GitHub Copilot CLI 1.0.95. | `/home/runner/.npm-global/bin/copilot` | 140.0 | bin | 106.0 | 815.3 | — | — | 47.4 |
| crush | crush version v0.98.1 | `/home/runner/.npm-global/bin/crush` | 140.0 | bin | 142.9 | 273.6 | — | — | 68.8 |
| goose | 1.54.0 | `/home/runner/.local/bin/goose` | 307.8 | bin | 7.7 | 7.9 | 218.4 | — | — |
| aider | aider 0.86.2 | `/home/runner/work/fox-agent/fox-agent/.venv-bench/bin/aider` | 140.0 | bin | 925.7 | 802.9 | 1184.9 | 10.7 | 66.9 |
| amp | 0.0.1791778148-g902162 (released 2026-10-12T04:09:08.000Z, 4 | `/home/runner/.local/bin/amp` | 134.2 | bin | 272.6 | 272.2 | 646.1 | 0.6 | 162.7 |
| cursor-agent | 2026.10.01-e373342 | `/home/runner/.local/bin/cursor-agent` | 140.0 | bin | 471.7 | 456.6 | — | — | 212.0 |
| qwen code | 0.25.1 | `/home/runner/.npm-global/bin/qwen` | 140.0 | bin | 39.2 | 854.7 | — | — | 244.2 |
| codebuff | 1.0.688 | `/home/runner/.npm-global/bin/codebuff` | 140.0 | bin | 945.6 | 917.1 | — | — | 57.6 |
| kilo code | 7.8.8 | `/home/runner/.npm-global/bin/kilocode` | 140.0 | bin | 853.4 | 2603.1 | — | — | 46.2 |
| droid | 0.238.0 | `/home/runner/.local/bin/droid` | 281.4 | bin | 91.4 | 124.5 | — | — | 233.5 |
| kimi code | 2.1.1 | `/home/runner/.kimi-code/bin/kimi` | 190.8 | bin | 604.1 | 753.7 | — | — | 328.8 |
| devin | devin 3000.11.3 (9c803229faa4) | `/home/runner/.local/bin/devin` | 195.0 | bin | 4.1 | 48.5 | — | — | 48.3 |
| cline | 3.0.70 | `/home/runner/.npm-global/bin/cline` | 140.0 | bin | 871.8 | 1153.0 | — | — | 55.0 |
| continue | 1.5.47 | `/home/runner/.npm-global/bin/cn` | 140.0 | bin | 1150.4 | — | — | — | 317.1 |
| iflow cli | 0.5.19 | `/home/runner/.npm-global/bin/iflow` | 140.0 | bin | 1241.8 | 1332.1 | 2540.0 | 46.5 | 55.6 |

</details>

fox-agent headless vs scripted local provider: time to first token **64 ms**, peak RSS **61 MB**.

_Generated 2026-10-12T08:48:39Z on Linux x86_64 (6.17.0-1022-azure). [How this is measured](#benchmarks) · [raw JSON](bench/results.json)_
