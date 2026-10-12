![harness bench dashboard](bench/bench.svg)

| agent | bundle | `--version` | TUI 1st byte | TUI 1st input | input latency 1s | idle PSS |
|---|---|---|---|---|---|---|
| **fox-agent** | 120 MB | 13 ms | **14 ms** | — | — | 36 MB |
| claude code | 257 MB | 8 ms | **142 ms** | — | — | 187 MB |
| codex | 140 MB | 35 ms | **36 ms** | — | — | 48 MB |
| opencode v2 | 207 MB | 54 ms | **91 ms** | **466 ms** | **36 ms** | 125 MB |
| jcode | 138 MB | 8 ms | **11 ms** | — | — | 27 MB |
| pi | 140 MB | 154 ms | **206 ms** | **681 ms** | **5 ms** | 128 MB |
| gemini cli | 140 MB | 957 ms | **1020 ms** | **1061 ms** | — | — |
| copilot cli | 140 MB | 73 ms | **518 ms** | — | — | 47 MB |
| crush | 140 MB | 105 ms | **328 ms** | — | — | 68 MB |
| goose | 308 MB | 5 ms | **5 ms** | **167 ms** | **0 ms** | — |
| aider | 140 MB | 469 ms | **418 ms** | **791 ms** | **5 ms** | 67 MB |
| amp | 134 MB | 152 ms | **169 ms** | **533 ms** | **0 ms** | 160 MB |
| cursor-agent | 140 MB | 273 ms | **257 ms** | — | — | 221 MB |
| qwen code | 140 MB | 26 ms | **503 ms** | — | — | 292 MB |
| codebuff | 140 MB | 644 ms | **613 ms** | — | — | 58 MB |
| kilo code | 140 MB | 621 ms | **1774 ms** | — | — | 46 MB |
| droid | 281 MB | 54 ms | **66 ms** | — | — | 219 MB |
| kimi code | 191 MB | 368 ms | **475 ms** | — | — | 351 MB |
| devin | 195 MB | 3 ms | **33 ms** | — | — | 44 MB |
| cline | 140 MB | 577 ms | **810 ms** | — | — | 55 MB |
| continue | 140 MB | 752 ms | — | — | — | 317 MB |
| iflow cli | 140 MB | 840 ms | **883 ms** | **1693 ms** | **46 ms** | 58 MB |

<details><summary>full precision · all collected fields</summary>

| agent | version | bin | bundle (MB) | bundle kind | `--version` (ms) | TUI 1st byte (ms) | TUI 1st input (ms) | input latency 1s (ms) | idle PSS (MB) |
|---|---|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.5.0-beta.1 | `/home/runner/work/fox-agent/fox-agent/bin/fox` | 120.3 | bin | 12.7 | 14.2 | — | — | 36.2 |
| claude code | 2.1.296 (Claude Code) | `/home/runner/.npm-global/bin/claude` | 257.1 | bin | 8.3 | 142.3 | — | — | 187.1 |
| codex | codex-cli 0.162.1 | `/home/runner/.npm-global/bin/codex` | 140.0 | bin | 34.9 | 35.8 | — | — | 48.4 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | `/home/runner/.npm-global/bin/opencode2` | 207.4 | bin | 53.5 | 90.8 | 466.1 | 36.2 | 124.9 |
| jcode | jcode v0.95.0 (6487bbd7e) | `/home/runner/.local/bin/jcode` | 138.2 | bin | 7.9 | 10.9 | — | — | 27.3 |
| pi | 1.1.0 | `/home/runner/.npm-global/bin/pi` | 140.0 | bin | 154.4 | 206.1 | 681.2 | 5.4 | 128.3 |
| gemini cli | 0.63.0 | `/home/runner/.npm-global/bin/gemini` | 140.0 | bin | 957.1 | 1019.6 | 1061.3 | — | — |
| copilot cli | GitHub Copilot CLI 1.0.95. | `/home/runner/.npm-global/bin/copilot` | 140.0 | bin | 73.3 | 517.9 | — | — | 47.3 |
| crush | crush version v0.98.1 | `/home/runner/.npm-global/bin/crush` | 140.0 | bin | 104.7 | 328.3 | — | — | 68.4 |
| goose | 1.54.0 | `/home/runner/.local/bin/goose` | 307.8 | bin | 5.4 | 5.3 | 167.3 | 0.1 | — |
| aider | aider 0.86.2 | `/home/runner/work/fox-agent/fox-agent/.venv-bench/bin/aider` | 140.0 | bin | 468.5 | 417.5 | 791.2 | 5.5 | 66.9 |
| amp | 0.0.1791778148-g902162 (released 2026-10-12T04:09:08.000Z, 1 | `/home/runner/.local/bin/amp` | 134.2 | bin | 152.2 | 168.7 | 532.9 | 0.5 | 160.0 |
| cursor-agent | 2026.10.01-e373342 | `/home/runner/.local/bin/cursor-agent` | 140.0 | bin | 273.0 | 256.9 | — | — | 220.7 |
| qwen code | 0.25.1 | `/home/runner/.npm-global/bin/qwen` | 140.0 | bin | 26.2 | 503.0 | — | — | 291.8 |
| codebuff | 1.0.688 | `/home/runner/.npm-global/bin/codebuff` | 140.0 | bin | 644.2 | 612.8 | — | — | 57.6 |
| kilo code | 7.8.8 | `/home/runner/.npm-global/bin/kilocode` | 140.0 | bin | 621.0 | 1773.8 | — | — | 46.2 |
| droid | 0.238.0 | `/home/runner/.local/bin/droid` | 281.4 | bin | 53.9 | 65.9 | — | — | 219.5 |
| kimi code | 2.1.1 | `/home/runner/.kimi-code/bin/kimi` | 190.8 | bin | 368.5 | 474.9 | — | — | 351.0 |
| devin | devin 3000.11.3 (9c803229faa4) | `/home/runner/.local/bin/devin` | 195.0 | bin | 3.3 | 33.4 | — | — | 44.4 |
| cline | 3.0.70 | `/home/runner/.npm-global/bin/cline` | 140.0 | bin | 576.7 | 810.3 | — | — | 55.0 |
| continue | 1.5.47 | `/home/runner/.npm-global/bin/cn` | 140.0 | bin | 752.2 | — | — | — | 317.2 |
| iflow cli | 0.5.19 | `/home/runner/.npm-global/bin/iflow` | 140.0 | bin | 840.2 | 882.7 | 1692.9 | 45.6 | 57.8 |

</details>

fox-agent headless vs scripted local provider: time to first token **43 ms**, peak RSS **61 MB**.

_Generated 2026-10-12T06:19:37Z on Linux x86_64 (6.17.0-1022-azure). [How this is measured](#benchmarks) · [raw JSON](bench/results.json)_
