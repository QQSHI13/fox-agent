| metric | fox-agent | rank |
|---|---|---|
| TUI 1st byte | **19 ms** | **#3** of 23 |
| TUI 1st input | — | — |
| input latency | — | — |
| bundle | **117 MB** | **#4** of 23 |
| idle PSS | **36 MB** | **#2** of 22 |
| `--version` | **8 ms** | **#3** of 23 |

fox-agent headless vs scripted local provider: time to first token **54 ms**, peak RSS **57 MB**.

<details><summary>every tool, every metric</summary>

![harness bench dashboard](bench/bench.svg)

| agent | bundle | `--version` | TUI 1st byte | TUI 1st input | input latency | signal | idle PSS |
|---|---|---|---|---|---|---|---|
| **fox-agent** | 117 MB | 8 ms | 19 ms | — | — | render | 36 MB |
| claude code | 293 MB | 14 ms | 255 ms | — | — | render | 196 MB |
| codex | 444 MB | 46 ms | 49 ms | — | — | render | 49 MB |
| opencode v2 | 207 MB | 102 ms | 143 ms | 517 ms | 74 ms | render | 129 MB |
| jcode | 171 MB | 11 ms | 13 ms | — | — | render | 32 MB |
| pi | 112 MB | 260 ms | 339 ms | 871 ms | 9 ms | render | 130 MB |
| pi-bolt | 262 MB | 13 ms | 42 ms | 524 ms | 2 ms | render | 96 MB |
| gemini cli | 103 MB | 1548 ms | 1698 ms | 1672 ms | 0 ms | kernel-echo (tty) | 146 MB |
| copilot cli | 198 MB | 110 ms | 840 ms | — | — | render | 47 MB |
| crush | 129 MB | 149 ms | 287 ms | — | — | render | 69 MB |
| goose | 304 MB | 7 ms | 8 ms | — | 0 ms | kernel-echo (tty) | — |
| aider | 643 MB | 879 ms | 751 ms | 1139 ms | 11 ms | render | 67 MB |
| amp | 161 MB | 216 ms | 233 ms | 593 ms | 1 ms | render | 138 MB |
| cursor-agent | 583 MB | 484 ms | 466 ms | 844 ms | — | render | 251 MB |
| qwen code | 155 MB | 38 ms | 852 ms | — | — | render | 240 MB |
| codebuff | 140 MB | 1007 ms | 955 ms | — | — | render | 58 MB |
| kilo code | 719 MB | 830 ms | 2270 ms | — | — | render | 46 MB |
| droid | 319 MB | 122 ms | 101 ms | — | — | render | 327 MB |
| kimi code | 192 MB | 609 ms | 774 ms | — | — | render | 329 MB |
| devin | 217 MB | 5 ms | 24 ms | — | — | render | 93 MB |
| cline | 330 MB | 920 ms | 1259 ms | — | — | render | 55 MB |
| continue | 83 MB | 1142 ms | 1384 ms | — | — | render | 309 MB |
| iflow cli | 180 MB | 1258 ms | 1349 ms | 2558 ms | 48 ms | render | 55 MB |

</details>

<details><summary>full precision · all collected fields</summary>

| agent | version | bin | bundle (MB) | bundle kind | `--version` (ms) | TUI 1st byte (ms) | TUI 1st input (ms) | input latency (ms) | signal | idle PSS (MB) |
|---|---|---|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.6.0 | `/home/runner/work/fox-agent/fox-agent/bin/fox` | 116.6 | bin | 8.0 | 19.5 | — | — | render | 36.1 |
| claude code | 2.1.309 (Claude Code) | `/home/runner/.npm-global/bin/claude` | 293.5 | bin | 13.9 | 255.5 | — | — | render | 196.4 |
| codex | codex-cli 0.164.0 | `/home/runner/.npm-global/bin/codex` | 444.4 | pkg | 46.2 | 49.1 | — | — | render | 49.1 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | `/home/runner/.npm-global/bin/opencode2` | 207.4 | bin | 102.3 | 143.4 | 517.1 | 73.7 | render | 129.2 |
| jcode | jcode v0.99.1 (7206efd0c) | `/home/runner/.local/bin/jcode` | 171.3 | bin | 10.6 | 12.6 | — | — | render | 32.4 |
| pi | 1.4.0 | `/home/runner/.npm-global/bin/pi` | 111.8 | pkg | 260.1 | 338.8 | 870.8 | 9.1 | render | 129.7 |
| pi-bolt | 1.4.0 (Pi-Bolt 0.9.9, linux-x64, JIT off) | `/home/runner/.local/bin/pi-bolt` | 262.0 | bin | 13.4 | 42.0 | 523.8 | 2.0 | render | 96.5 |
| gemini cli | 0.65.0 | `/home/runner/.npm-global/bin/gemini` | 102.6 | pkg | 1548.5 | 1697.9 | 1672.3 | 0.1 | kernel-echo | 146.2 |
| copilot cli | GitHub Copilot CLI 1.0.103. | `/home/runner/.npm-global/bin/copilot` | 198.5 | pkg | 110.1 | 840.4 | — | — | render | 47.4 |
| crush | crush version v0.98.1 | `/home/runner/.npm-global/bin/crush` | 128.7 | pkg | 148.5 | 287.3 | — | — | render | 69.2 |
| goose | 1.55.0 | `/home/runner/.local/bin/goose` | 304.0 | bin | 7.4 | 8.1 | — | 0.1 | kernel-echo | — |
| aider | aider 0.86.2 | `/home/runner/work/fox-agent/fox-agent/.venv-bench/bin/aider` | 642.8 | pkg | 878.6 | 750.9 | 1138.6 | 11.0 | render | 66.8 |
| amp | 0.0.1792756861-g6187a2 (released 2026-10-23T12:01:01.000Z, 3 | `/home/runner/.local/bin/amp` | 161.0 | bin | 216.3 | 233.3 | 593.3 | 1.0 | render | 137.9 |
| cursor-agent | 2026.10.22-27dcf5f | `/home/runner/.local/bin/cursor-agent` | 583.2 | pkg | 484.1 | 465.8 | 843.7 | — | render | 250.5 |
| qwen code | 0.26.0 | `/home/runner/.npm-global/bin/qwen` | 154.7 | pkg | 37.7 | 852.4 | — | — | render | 240.4 |
| codebuff | 1.0.688 | `/home/runner/.npm-global/bin/codebuff` | 140.0 | bin | 1006.7 | 955.5 | — | — | render | 57.6 |
| kilo code | 7.8.17 | `/home/runner/.npm-global/bin/kilocode` | 718.6 | pkg | 830.0 | 2270.4 | — | — | render | 46.2 |
| droid | 0.248.0 | `/home/runner/.local/bin/droid` | 319.2 | bin | 121.6 | 101.1 | — | — | render | 326.7 |
| kimi code | 2.3.1 | `/home/runner/.kimi-code/bin/kimi` | 192.3 | bin | 609.0 | 773.7 | — | — | render | 329.1 |
| devin | devin 3000.11.205 (6dea39440ae3) | `/home/runner/.local/bin/devin` | 217.5 | bin | 4.5 | 23.8 | — | — | render | 93.3 |
| cline | 3.0.73 | `/home/runner/.npm-global/bin/cline` | 330.3 | pkg | 920.4 | 1259.1 | — | — | render | 54.9 |
| continue | 1.5.47 | `/home/runner/.npm-global/bin/cn` | 82.7 | pkg | 1141.6 | 1384.1 | — | — | render | 308.9 |
| iflow cli | 0.5.19 | `/home/runner/.npm-global/bin/iflow` | 180.2 | pkg | 1257.5 | 1349.4 | 2557.7 | 48.0 | render | 55.5 |

</details>

_Generated 2026-10-23T15:33:19Z on Linux x86_64 (6.17.0-1022-azure). [Method and caveats](#benchmarks) · [raw JSON](bench/results.json)_
