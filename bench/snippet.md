![harness bench dashboard](bench/bench.svg)

| agent | bundle | `--version` | TUI 1st byte | TUI 1st input | input latency 1s | idle PSS |
|---|---|---|---|---|---|---|
| **fox-agent** | 99 MB | 13 ms | **15 ms** | **377 ms** | **1 ms** | 35 MB |
| claude code | 286 MB | 8 ms | **199 ms** | — | — | 191 MB |
| codex | 140 MB | 40 ms | **45 ms** | **815 ms** | **1 ms** | 49 MB |
| opencode v2 | 207 MB | 77 ms | **130 ms** | **489 ms** | **65 ms** | 128 MB |
| jcode | 167 MB | 8 ms | **10 ms** | **632 ms** | **0 ms** | 30 MB |
| pi | 140 MB | 222 ms | **299 ms** | **790 ms** | **9 ms** | 130 MB |
| gemini cli | 140 MB | 1397 ms | **1502 ms** | **1508 ms** | **0 ms** | 146 MB |
| copilot cli | 140 MB | 98 ms | **753 ms** | — | — | 47 MB |
| crush | 140 MB | 149 ms | **522 ms** | **951 ms** | **73 ms** | 69 MB |
| goose | 304 MB | 6 ms | **6 ms** | **367 ms** | **0 ms** | 108 MB |
| aider | 140 MB | 731 ms | **651 ms** | **1029 ms** | **10 ms** | 67 MB |
| amp | 135 MB | 230 ms | **254 ms** | **618 ms** | **1 ms** | 164 MB |
| cursor-agent | 140 MB | 429 ms | **414 ms** | — | — | 237 MB |
| qwen code | 140 MB | 37 ms | **770 ms** | **1244 ms** | — | 255 MB |
| codebuff | 140 MB | 912 ms | **898 ms** | **1388 ms** | **109 ms** | 58 MB |
| kilo code | 140 MB | 886 ms | **2634 ms** | **6557 ms** | **1551 ms** | 46 MB |
| droid | 294 MB | 95 ms | **112 ms** | **3231 ms** | **740 ms** | 337 MB |
| kimi code | 192 MB | 577 ms | **720 ms** | **1105 ms** | **5 ms** | 352 MB |
| devin | 200 MB | 4 ms | **21 ms** | **1029 ms** | **1640 ms** | 100 MB |
| cline | 140 MB | 885 ms | **1152 ms** | — | — | 55 MB |
| continue | 140 MB | 1031 ms | — | — | — | 317 MB |
| iflow cli | 140 MB | 1130 ms | **1222 ms** | **2015 ms** | **48 ms** | 56 MB |

<details><summary>full precision · all collected fields</summary>

| agent | version | bin | bundle (MB) | bundle kind | `--version` (ms) | TUI 1st byte (ms) | TUI 1st input (ms) | input latency 1s (ms) | idle PSS (MB) |
|---|---|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.5.0-beta.1 | `/home/runner/work/fox-agent/fox-agent/bin/fox` | 99.0 | bin | 13.2 | 14.7 | 377.3 | 0.6 | 34.9 |
| claude code | 2.1.302 (Claude Code) | `/home/runner/.npm-global/bin/claude` | 285.8 | bin | 7.9 | 198.8 | — | — | 191.0 |
| codex | codex-cli 0.163.0 | `/home/runner/.npm-global/bin/codex` | 140.0 | bin | 40.2 | 44.6 | 815.0 | 0.6 | 49.1 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | `/home/runner/.npm-global/bin/opencode2` | 207.4 | bin | 76.5 | 130.1 | 489.3 | 64.9 | 128.0 |
| jcode | jcode v0.98.1 (1c7426eb1) | `/home/runner/.local/bin/jcode` | 166.8 | bin | 7.7 | 9.7 | 631.5 | 0.3 | 30.3 |
| pi | 1.3.0 | `/home/runner/.npm-global/bin/pi` | 140.0 | bin | 221.6 | 299.3 | 789.7 | 8.7 | 130.2 |
| gemini cli | 0.64.0 | `/home/runner/.npm-global/bin/gemini` | 140.0 | bin | 1396.5 | 1502.1 | 1507.5 | 0.1 | 145.9 |
| copilot cli | GitHub Copilot CLI 1.0.98. | `/home/runner/.npm-global/bin/copilot` | 140.0 | bin | 98.4 | 753.1 | — | — | 47.3 |
| crush | crush version v0.98.1 | `/home/runner/.npm-global/bin/crush` | 140.0 | bin | 148.9 | 521.8 | 950.7 | 72.9 | 68.7 |
| goose | 1.55.0 | `/home/runner/.local/bin/goose` | 304.0 | bin | 6.3 | 6.4 | 367.0 | 0.4 | 107.8 |
| aider | aider 0.86.2 | `/home/runner/work/fox-agent/fox-agent/.venv-bench/bin/aider` | 140.0 | bin | 730.8 | 650.5 | 1029.3 | 10.3 | 66.8 |
| amp | 0.0.1792209635-g24a9fe (released 2026-10-17T04:00:35.000Z, 3 | `/home/runner/.local/bin/amp` | 134.9 | bin | 229.5 | 254.4 | 618.1 | 0.5 | 164.0 |
| cursor-agent | 2026.10.16-e3cb207 | `/home/runner/.local/bin/cursor-agent` | 140.0 | bin | 428.6 | 413.7 | — | — | 237.1 |
| qwen code | 0.25.2 | `/home/runner/.npm-global/bin/qwen` | 140.0 | bin | 36.7 | 769.8 | 1243.7 | — | 255.1 |
| codebuff | 1.0.688 | `/home/runner/.npm-global/bin/codebuff` | 140.0 | bin | 911.7 | 897.5 | 1387.8 | 108.9 | 57.7 |
| kilo code | 7.8.12 | `/home/runner/.npm-global/bin/kilocode` | 140.0 | bin | 886.4 | 2634.3 | 6557.0 | 1550.5 | 46.1 |
| droid | 0.244.0 | `/home/runner/.local/bin/droid` | 294.4 | bin | 95.2 | 111.9 | 3230.7 | 740.1 | 336.6 |
| kimi code | 2.2.0 | `/home/runner/.kimi-code/bin/kimi` | 191.9 | bin | 577.1 | 719.6 | 1105.1 | 4.9 | 352.2 |
| devin | devin 3000.11.92 (7f4e64980e22) | `/home/runner/.local/bin/devin` | 200.4 | bin | 3.9 | 20.7 | 1029.4 | 1640.3 | 100.3 |
| cline | 3.0.73 | `/home/runner/.npm-global/bin/cline` | 140.0 | bin | 884.9 | 1152.5 | — | — | 55.0 |
| continue | 1.5.47 | `/home/runner/.npm-global/bin/cn` | 140.0 | bin | 1030.6 | — | — | — | 316.9 |
| iflow cli | 0.5.19 | `/home/runner/.npm-global/bin/iflow` | 140.0 | bin | 1130.4 | 1221.7 | 2014.6 | 47.8 | 56.1 |

</details>

fox-agent headless vs scripted local provider: time to first token **52 ms**, peak RSS **60 MB**.

_Generated 2026-10-17T07:27:06Z on Linux x86_64 (6.17.0-1022-azure). [How this is measured](#benchmarks) · [raw JSON](bench/results.json)_
