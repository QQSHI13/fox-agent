![harness bench dashboard](bench/bench.svg)

| agent | bundle | `--version` | TUI 1st byte | TUI 1st input | input latency 1s | idle PSS |
|---|---|---|---|---|---|---|
| **fox-agent** | 120 MB | 15 ms | **16 ms** | **376 ms** | **1 ms** | 36 MB |
| claude code | 257 MB | 9 ms | **210 ms** | — | — | 188 MB |
| codex | 140 MB | 40 ms | **44 ms** | **820 ms** | **1 ms** | 49 MB |
| opencode v2 | 207 MB | 84 ms | **139 ms** | **498 ms** | **63 ms** | 130 MB |
| jcode | 138 MB | 7 ms | **9 ms** | **589 ms** | **0 ms** | 26 MB |
| pi | 140 MB | 222 ms | **296 ms** | **793 ms** | **9 ms** | 130 MB |
| gemini cli | 140 MB | 1373 ms | **1557 ms** | **1598 ms** | — | 146 MB |
| copilot cli | 140 MB | 98 ms | **755 ms** | — | — | 47 MB |
| crush | 140 MB | 117 ms | **400 ms** | **928 ms** | **73 ms** | 69 MB |
| goose | 308 MB | 5 ms | **5 ms** | **366 ms** | **0 ms** | 105 MB |
| aider | 140 MB | 697 ms | **637 ms** | **1017 ms** | **10 ms** | 67 MB |
| amp | 134 MB | 223 ms | **244 ms** | **602 ms** | **0 ms** | 162 MB |
| cursor-agent | 140 MB | 417 ms | **398 ms** | — | — | 217 MB |
| qwen code | 140 MB | 34 ms | **758 ms** | **1222 ms** | — | 254 MB |
| codebuff | 140 MB | 897 ms | **852 ms** | **1375 ms** | **109 ms** | 58 MB |
| kilo code | 140 MB | 856 ms | **2548 ms** | **6245 ms** | **1400 ms** | 46 MB |
| droid | 292 MB | 103 ms | **126 ms** | **3175 ms** | **728 ms** | 220 MB |
| kimi code | 191 MB | 558 ms | **688 ms** | **1087 ms** | **5 ms** | 349 MB |
| devin | 195 MB | 3 ms | **37 ms** | **1040 ms** | **641 ms** | 49 MB |
| cline | 140 MB | 808 ms | **1277 ms** | — | — | 55 MB |
| continue | 140 MB | 1081 ms | — | — | — | 317 MB |
| iflow cli | 140 MB | 1156 ms | **1223 ms** | **2017 ms** | **47 ms** | 55 MB |

<details><summary>full precision · all collected fields</summary>

| agent | version | bin | bundle (MB) | bundle kind | `--version` (ms) | TUI 1st byte (ms) | TUI 1st input (ms) | input latency 1s (ms) | idle PSS (MB) |
|---|---|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.5.0-beta.1 | `/home/runner/work/fox-agent/fox-agent/bin/fox` | 120.4 | bin | 15.4 | 16.5 | 375.7 | 0.6 | 36.5 |
| claude code | 2.1.296 (Claude Code) | `/home/runner/.npm-global/bin/claude` | 257.1 | bin | 9.0 | 210.2 | — | — | 187.5 |
| codex | codex-cli 0.162.1 | `/home/runner/.npm-global/bin/codex` | 140.0 | bin | 40.1 | 44.1 | 820.0 | 0.6 | 49.0 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | `/home/runner/.npm-global/bin/opencode2` | 207.4 | bin | 83.6 | 139.0 | 497.9 | 63.3 | 129.8 |
| jcode | jcode v0.95.0 (6487bbd7e) | `/home/runner/.local/bin/jcode` | 138.2 | bin | 7.0 | 9.4 | 589.4 | 0.3 | 26.5 |
| pi | 1.2.0 | `/home/runner/.npm-global/bin/pi` | 140.0 | bin | 221.6 | 295.8 | 792.5 | 8.9 | 129.9 |
| gemini cli | 0.63.0 | `/home/runner/.npm-global/bin/gemini` | 140.0 | bin | 1372.8 | 1557.2 | 1598.3 | — | 145.6 |
| copilot cli | GitHub Copilot CLI 1.0.96. | `/home/runner/.npm-global/bin/copilot` | 140.0 | bin | 98.3 | 755.1 | — | — | 47.3 |
| crush | crush version v0.98.1 | `/home/runner/.npm-global/bin/crush` | 140.0 | bin | 116.9 | 399.5 | 927.7 | 73.4 | 68.7 |
| goose | 1.54.0 | `/home/runner/.local/bin/goose` | 307.8 | bin | 5.1 | 5.4 | 366.1 | 0.2 | 105.0 |
| aider | aider 0.86.2 | `/home/runner/work/fox-agent/fox-agent/.venv-bench/bin/aider` | 140.0 | bin | 697.1 | 637.2 | 1017.4 | 10.0 | 66.8 |
| amp | 0.0.1791864325-g52e626 (released 2026-10-13T04:05:25.000Z, 1 | `/home/runner/.local/bin/amp` | 134.4 | bin | 223.3 | 244.3 | 601.8 | 0.5 | 161.5 |
| cursor-agent | 2026.10.01-e373342 | `/home/runner/.local/bin/cursor-agent` | 140.0 | bin | 416.9 | 398.0 | — | — | 217.5 |
| qwen code | 0.25.1 | `/home/runner/.npm-global/bin/qwen` | 140.0 | bin | 33.8 | 757.9 | 1222.5 | — | 253.9 |
| codebuff | 1.0.688 | `/home/runner/.npm-global/bin/codebuff` | 140.0 | bin | 897.3 | 852.5 | 1374.7 | 109.4 | 57.5 |
| kilo code | 7.8.8 | `/home/runner/.npm-global/bin/kilocode` | 140.0 | bin | 855.8 | 2547.9 | 6244.8 | 1400.2 | 46.2 |
| droid | 0.240.0 | `/home/runner/.local/bin/droid` | 291.7 | bin | 102.6 | 126.1 | 3174.6 | 728.2 | 220.4 |
| kimi code | 2.1.1 | `/home/runner/.kimi-code/bin/kimi` | 190.8 | bin | 557.9 | 688.5 | 1087.2 | 4.6 | 349.2 |
| devin | devin 3000.11.3 (9c803229faa4) | `/home/runner/.local/bin/devin` | 195.0 | bin | 2.8 | 37.1 | 1039.8 | 641.2 | 48.6 |
| cline | 3.0.70 | `/home/runner/.npm-global/bin/cline` | 140.0 | bin | 808.4 | 1276.9 | — | — | 55.0 |
| continue | 1.5.47 | `/home/runner/.npm-global/bin/cn` | 140.0 | bin | 1080.7 | — | — | — | 316.9 |
| iflow cli | 0.5.19 | `/home/runner/.npm-global/bin/iflow` | 140.0 | bin | 1156.2 | 1223.4 | 2017.4 | 47.1 | 55.5 |

</details>

fox-agent headless vs scripted local provider: time to first token **66 ms**, peak RSS **60 MB**.

_Generated 2026-10-13T06:08:30Z on Linux x86_64 (6.17.0-1022-azure). [How this is measured](#benchmarks) · [raw JSON](bench/results.json)_
