![harness bench dashboard](bench/bench.svg)

| agent | bundle | `--version` | TUI 1st byte | TUI 1st input | input latency 1s | idle PSS |
|---|---|---|---|---|---|---|
| **fox-agent** | 99 MB | 12 ms | **14 ms** | — | — | 35 MB |
| claude code | 257 MB | 8 ms | **180 ms** | — | — | 187 MB |
| codex | 140 MB | 37 ms | **38 ms** | — | — | 49 MB |
| opencode v2 | 207 MB | 65 ms | **105 ms** | **467 ms** | **43 ms** | 125 MB |
| jcode | 138 MB | 9 ms | **10 ms** | — | — | 28 MB |
| pi | 140 MB | 178 ms | **233 ms** | **718 ms** | **6 ms** | 132 MB |
| gemini cli | 140 MB | 1133 ms | **1201 ms** | **1224 ms** | **0 ms** | — |
| copilot cli | 140 MB | 82 ms | **602 ms** | — | — | 47 MB |
| crush | 140 MB | 115 ms | **544 ms** | — | — | 69 MB |
| goose | 308 MB | 6 ms | **6 ms** | **182 ms** | — | — |
| aider | 140 MB | 606 ms | **551 ms** | **926 ms** | **8 ms** | 67 MB |
| amp | 134 MB | 190 ms | **198 ms** | **558 ms** | **0 ms** | 162 MB |
| cursor-agent | 140 MB | 350 ms | **329 ms** | — | — | 218 MB |
| qwen code | 140 MB | 30 ms | **623 ms** | — | — | 291 MB |
| codebuff | 140 MB | 715 ms | **698 ms** | — | — | 58 MB |
| kilo code | 140 MB | 682 ms | **2003 ms** | — | — | 46 MB |
| droid | 281 MB | 75 ms | **78 ms** | — | — | 238 MB |
| kimi code | 191 MB | 452 ms | **565 ms** | — | — | 351 MB |
| devin | 195 MB | 3 ms | **39 ms** | — | — | 49 MB |
| cline | 140 MB | 898 ms | **947 ms** | — | — | 55 MB |
| continue | 140 MB | 886 ms | — | — | — | 317 MB |
| iflow cli | 140 MB | 940 ms | **1011 ms** | **1829 ms** | **45 ms** | 58 MB |

<details><summary>full precision · all collected fields</summary>

| agent | version | bin | bundle (MB) | bundle kind | `--version` (ms) | TUI 1st byte (ms) | TUI 1st input (ms) | input latency 1s (ms) | idle PSS (MB) |
|---|---|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.5.0-beta.1 | `/home/runner/work/fox-agent/fox-agent/bin/fox` | 98.9 | bin | 12.3 | 13.6 | — | — | 34.6 |
| claude code | 2.1.296 (Claude Code) | `/home/runner/.npm-global/bin/claude` | 257.1 | bin | 8.3 | 179.8 | — | — | 187.0 |
| codex | codex-cli 0.162.1 | `/home/runner/.npm-global/bin/codex` | 140.0 | bin | 37.1 | 37.8 | — | — | 49.1 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | `/home/runner/.npm-global/bin/opencode2` | 207.4 | bin | 64.8 | 104.9 | 467.2 | 43.3 | 124.6 |
| jcode | jcode v0.95.0 (6487bbd7e) | `/home/runner/.local/bin/jcode` | 138.2 | bin | 9.4 | 10.1 | — | — | 27.8 |
| pi | 1.1.0 | `/home/runner/.npm-global/bin/pi` | 140.0 | bin | 177.7 | 232.6 | 718.0 | 6.2 | 131.9 |
| gemini cli | 0.63.0 | `/home/runner/.npm-global/bin/gemini` | 140.0 | bin | 1133.3 | 1201.0 | 1224.4 | 0.1 | — |
| copilot cli | GitHub Copilot CLI 1.0.95. | `/home/runner/.npm-global/bin/copilot` | 140.0 | bin | 82.2 | 602.3 | — | — | 47.3 |
| crush | crush version v0.98.1 | `/home/runner/.npm-global/bin/crush` | 140.0 | bin | 114.8 | 544.0 | — | — | 68.9 |
| goose | 1.54.0 | `/home/runner/.local/bin/goose` | 307.8 | bin | 6.1 | 5.7 | 182.2 | — | — |
| aider | aider 0.86.2 | `/home/runner/work/fox-agent/fox-agent/.venv-bench/bin/aider` | 140.0 | bin | 606.1 | 551.4 | 925.9 | 7.8 | 66.8 |
| amp | 0.0.1791763306-ged595a (released 2026-10-12T00:01:46.000Z, 3 | `/home/runner/.local/bin/amp` | 134.2 | bin | 190.5 | 197.9 | 558.2 | 0.5 | 161.7 |
| cursor-agent | 2026.10.01-e373342 | `/home/runner/.local/bin/cursor-agent` | 140.0 | bin | 349.9 | 329.1 | — | — | 217.8 |
| qwen code | 0.25.1 | `/home/runner/.npm-global/bin/qwen` | 140.0 | bin | 29.9 | 623.1 | — | — | 290.7 |
| codebuff | 1.0.688 | `/home/runner/.npm-global/bin/codebuff` | 140.0 | bin | 715.5 | 697.8 | — | — | 57.7 |
| kilo code | 7.8.8 | `/home/runner/.npm-global/bin/kilocode` | 140.0 | bin | 681.8 | 2002.7 | — | — | 46.1 |
| droid | 0.238.0 | `/home/runner/.local/bin/droid` | 281.4 | bin | 74.7 | 77.5 | — | — | 237.6 |
| kimi code | 2.1.1 | `/home/runner/.kimi-code/bin/kimi` | 190.8 | bin | 451.6 | 565.2 | — | — | 350.6 |
| devin | devin 3000.11.3 (9c803229faa4) | `/home/runner/.local/bin/devin` | 195.0 | bin | 3.0 | 38.7 | — | — | 48.8 |
| cline | 3.0.70 | `/home/runner/.npm-global/bin/cline` | 140.0 | bin | 897.6 | 947.0 | — | — | 55.0 |
| continue | 1.5.47 | `/home/runner/.npm-global/bin/cn` | 140.0 | bin | 886.3 | — | — | — | 316.7 |
| iflow cli | 0.5.19 | `/home/runner/.npm-global/bin/iflow` | 140.0 | bin | 939.9 | 1011.2 | 1828.6 | 45.3 | 57.9 |

</details>

fox-agent headless vs scripted local provider: time to first token **60 ms**, peak RSS **59 MB**.

_Generated 2026-10-12T04:19:57Z on Linux x86_64 (6.17.0-1022-azure). [How this is measured](#benchmarks) · [raw JSON](bench/results.json)_
