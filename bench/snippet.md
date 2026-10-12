![harness bench dashboard](bench/bench.svg)

| agent | bundle | `--version` | TUI 1st byte | TUI 1st input | input latency 1s | idle PSS |
|---|---|---|---|---|---|---|
| **fox-agent** | 99 MB | 12 ms | **15 ms** | — | — | 35 MB |
| claude code | 257 MB | 9 ms | **203 ms** | — | — | 187 MB |
| codex | 140 MB | 41 ms | **43 ms** | — | — | 49 MB |
| opencode v2 | 207 MB | 79 ms | **133 ms** | **495 ms** | **57 ms** | 128 MB |
| jcode | 138 MB | 9 ms | **12 ms** | — | — | 28 MB |
| pi | 140 MB | 232 ms | **312 ms** | **808 ms** | **8 ms** | 131 MB |
| gemini cli | 140 MB | 1502 ms | **1587 ms** | **1610 ms** | — | 146 MB |
| copilot cli | 140 MB | 102 ms | **755 ms** | — | — | 47 MB |
| crush | 140 MB | 125 ms | **373 ms** | — | — | 69 MB |
| goose | 308 MB | 7 ms | **7 ms** | **200 ms** | — | — |
| aider | 140 MB | 791 ms | **735 ms** | **1111 ms** | **10 ms** | 67 MB |
| amp | 134 MB | 242 ms | **254 ms** | **614 ms** | **1 ms** | 163 MB |
| cursor-agent | 140 MB | 452 ms | **425 ms** | — | — | 213 MB |
| qwen code | 140 MB | 37 ms | **814 ms** | — | — | 246 MB |
| codebuff | 140 MB | 885 ms | **882 ms** | — | — | 58 MB |
| kilo code | 140 MB | 811 ms | **2461 ms** | — | — | 46 MB |
| droid | 281 MB | 89 ms | **104 ms** | — | — | 227 MB |
| kimi code | 191 MB | 574 ms | **723 ms** | — | — | 350 MB |
| devin | 195 MB | 4 ms | **48 ms** | — | — | 48 MB |
| cline | 140 MB | 869 ms | **1102 ms** | — | — | 55 MB |
| continue | 140 MB | 1090 ms | — | — | — | 317 MB |
| iflow cli | 140 MB | 1200 ms | **1274 ms** | **2468 ms** | **46 ms** | 56 MB |

<details><summary>full precision · all collected fields</summary>

| agent | version | bin | bundle (MB) | bundle kind | `--version` (ms) | TUI 1st byte (ms) | TUI 1st input (ms) | input latency 1s (ms) | idle PSS (MB) |
|---|---|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.5.0-beta.1 | `/home/runner/work/fox-agent/fox-agent/bin/fox` | 98.9 | bin | 12.3 | 14.7 | — | — | 34.6 |
| claude code | 2.1.296 (Claude Code) | `/home/runner/.npm-global/bin/claude` | 257.1 | bin | 8.7 | 202.9 | — | — | 187.1 |
| codex | codex-cli 0.162.1 | `/home/runner/.npm-global/bin/codex` | 140.0 | bin | 41.4 | 43.4 | — | — | 49.1 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | `/home/runner/.npm-global/bin/opencode2` | 207.4 | bin | 78.7 | 132.8 | 495.3 | 57.2 | 127.6 |
| jcode | jcode v0.95.0 (6487bbd7e) | `/home/runner/.local/bin/jcode` | 138.2 | bin | 9.2 | 11.6 | — | — | 28.0 |
| pi | 1.1.0 | `/home/runner/.npm-global/bin/pi` | 140.0 | bin | 231.9 | 311.7 | 808.4 | 8.3 | 130.8 |
| gemini cli | 0.63.0 | `/home/runner/.npm-global/bin/gemini` | 140.0 | bin | 1502.3 | 1587.5 | 1609.8 | — | 145.9 |
| copilot cli | GitHub Copilot CLI 1.0.95. | `/home/runner/.npm-global/bin/copilot` | 140.0 | bin | 101.5 | 755.1 | — | — | 47.4 |
| crush | crush version v0.98.1 | `/home/runner/.npm-global/bin/crush` | 140.0 | bin | 125.3 | 373.0 | — | — | 69.0 |
| goose | 1.54.0 | `/home/runner/.local/bin/goose` | 307.8 | bin | 7.2 | 7.4 | 200.3 | — | — |
| aider | aider 0.86.2 | `/home/runner/work/fox-agent/fox-agent/.venv-bench/bin/aider` | 140.0 | bin | 790.7 | 735.3 | 1110.5 | 10.3 | 66.9 |
| amp | 0.0.1791763306-ged595a (released 2026-10-12T00:01:46.000Z, 3 | `/home/runner/.local/bin/amp` | 134.2 | bin | 242.0 | 254.2 | 614.1 | 0.6 | 162.6 |
| cursor-agent | 2026.10.01-e373342 | `/home/runner/.local/bin/cursor-agent` | 140.0 | bin | 452.1 | 424.7 | — | — | 213.3 |
| qwen code | 0.25.1 | `/home/runner/.npm-global/bin/qwen` | 140.0 | bin | 36.6 | 814.3 | — | — | 245.7 |
| codebuff | 1.0.688 | `/home/runner/.npm-global/bin/codebuff` | 140.0 | bin | 884.8 | 881.9 | — | — | 57.6 |
| kilo code | 7.8.8 | `/home/runner/.npm-global/bin/kilocode` | 140.0 | bin | 811.4 | 2460.9 | — | — | 46.3 |
| droid | 0.238.0 | `/home/runner/.local/bin/droid` | 281.4 | bin | 88.6 | 104.0 | — | — | 227.0 |
| kimi code | 2.1.1 | `/home/runner/.kimi-code/bin/kimi` | 190.8 | bin | 573.6 | 722.7 | — | — | 349.6 |
| devin | devin 3000.11.3 (9c803229faa4) | `/home/runner/.local/bin/devin` | 195.0 | bin | 3.7 | 48.0 | — | — | 48.3 |
| cline | 3.0.70 | `/home/runner/.npm-global/bin/cline` | 140.0 | bin | 868.7 | 1101.7 | — | — | 55.0 |
| continue | 1.5.47 | `/home/runner/.npm-global/bin/cn` | 140.0 | bin | 1090.0 | — | — | — | 316.8 |
| iflow cli | 0.5.19 | `/home/runner/.npm-global/bin/iflow` | 140.0 | bin | 1199.5 | 1273.6 | 2467.7 | 46.1 | 55.6 |

</details>

fox-agent headless vs scripted local provider: time to first token **62 ms**, peak RSS **59 MB**.

_Generated 2026-10-12T04:11:36Z on Linux x86_64 (6.17.0-1022-azure). [How this is measured](#benchmarks) · [raw JSON](bench/results.json)_
