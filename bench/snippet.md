| metric | fox-agent | rank |
|---|---|---|
| TUI 1st byte | **15 ms** | **#3** of 23 |
| TUI 1st input | — | — |
| input latency | — | — |
| bundle | **117 MB** | **#4** of 23 |
| idle PSS | **36 MB** | **#2** of 22 |
| `--version` | **7 ms** | **#2** of 23 |

fox-agent headless vs scripted local provider: time to first token **53 ms**, peak RSS **57 MB**.

<details><summary>every tool, every metric</summary>

![harness bench dashboard](bench/bench.svg)

| agent | bundle | `--version` | TUI 1st byte | TUI 1st input | input latency | signal | idle PSS |
|---|---|---|---|---|---|---|---|
| **fox-agent** | 117 MB | 7 ms | 15 ms | — | — | render | 36 MB |
| claude code | 293 MB | 12 ms | 244 ms | — | — | render | 196 MB |
| codex | 444 MB | 42 ms | 45 ms | — | — | render | 49 MB |
| opencode v2 | 207 MB | 81 ms | 138 ms | 500 ms | 67 ms | render | 131 MB |
| jcode | 171 MB | 9 ms | 12 ms | — | — | render | 32 MB |
| pi | 112 MB | 254 ms | 330 ms | 826 ms | 8 ms | render | 130 MB |
| pi-bolt | 262 MB | 12 ms | 43 ms | 523 ms | 2 ms | render | 97 MB |
| gemini cli | 103 MB | 1556 ms | 1630 ms | 1664 ms | 0 ms | kernel-echo (tty) | 146 MB |
| copilot cli | 198 MB | 107 ms | 799 ms | — | — | render | 47 MB |
| crush | 129 MB | 135 ms | 597 ms | — | — | render | 69 MB |
| goose | 304 MB | 7 ms | 8 ms | 236 ms | — | kernel-echo (tty) | — |
| aider | 643 MB | 843 ms | 758 ms | 1142 ms | 11 ms | render | 67 MB |
| amp | 161 MB | 226 ms | 224 ms | 584 ms | 1 ms | render | 140 MB |
| cursor-agent | 583 MB | 478 ms | 461 ms | — | — | render | 253 MB |
| qwen code | 155 MB | 38 ms | 830 ms | — | — | render | 240 MB |
| codebuff | 140 MB | 940 ms | 908 ms | — | — | render | 58 MB |
| kilo code | 719 MB | 838 ms | 2269 ms | — | — | render | 46 MB |
| droid | 319 MB | 111 ms | 149 ms | — | — | render | 346 MB |
| kimi code | 192 MB | 594 ms | 756 ms | — | — | render | 330 MB |
| devin | 217 MB | 4 ms | 23 ms | — | — | render | 93 MB |
| cline | 330 MB | 933 ms | 1144 ms | — | — | render | 55 MB |
| continue | 83 MB | 1136 ms | 1334 ms | — | — | render | 320 MB |
| iflow cli | 180 MB | 1235 ms | 1312 ms | 2518 ms | 47 ms | render | 56 MB |

</details>

<details><summary>full precision · all collected fields</summary>

| agent | version | bin | bundle (MB) | bundle kind | `--version` (ms) | TUI 1st byte (ms) | TUI 1st input (ms) | input latency (ms) | signal | idle PSS (MB) |
|---|---|---|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.6.0 | `/home/runner/work/fox-agent/fox-agent/bin/fox` | 116.6 | bin | 6.8 | 15.5 | — | — | render | 36.1 |
| claude code | 2.1.309 (Claude Code) | `/home/runner/.npm-global/bin/claude` | 293.5 | bin | 11.6 | 243.9 | — | — | render | 195.9 |
| codex | codex-cli 0.164.0 | `/home/runner/.npm-global/bin/codex` | 444.4 | pkg | 41.7 | 45.0 | — | — | render | 49.1 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | `/home/runner/.npm-global/bin/opencode2` | 207.4 | bin | 81.1 | 138.3 | 499.7 | 66.7 | render | 131.1 |
| jcode | jcode v0.99.1 (7206efd0c) | `/home/runner/.local/bin/jcode` | 171.3 | bin | 9.2 | 11.9 | — | — | render | 32.1 |
| pi | 1.4.0 | `/home/runner/.npm-global/bin/pi` | 111.8 | pkg | 254.1 | 329.9 | 825.7 | 8.4 | render | 130.2 |
| pi-bolt | 1.4.0 (Pi-Bolt 0.9.9, linux-x64, JIT off) | `/home/runner/.local/bin/pi-bolt` | 262.0 | bin | 12.5 | 42.8 | 522.9 | 1.8 | render | 96.7 |
| gemini cli | 0.65.0 | `/home/runner/.npm-global/bin/gemini` | 102.6 | pkg | 1556.2 | 1630.2 | 1663.9 | 0.1 | kernel-echo | 146.1 |
| copilot cli | GitHub Copilot CLI 1.0.103. | `/home/runner/.npm-global/bin/copilot` | 198.5 | pkg | 107.2 | 799.0 | — | — | render | 47.3 |
| crush | crush version v0.98.1 | `/home/runner/.npm-global/bin/crush` | 128.7 | pkg | 135.2 | 597.4 | — | — | render | 68.8 |
| goose | 1.55.0 | `/home/runner/.local/bin/goose` | 304.0 | bin | 7.5 | 8.1 | 236.0 | — | kernel-echo | — |
| aider | aider 0.86.2 | `/home/runner/work/fox-agent/fox-agent/.venv-bench/bin/aider` | 642.8 | pkg | 842.7 | 757.8 | 1141.6 | 10.6 | render | 66.9 |
| amp | 0.0.1792756861-g6187a2 (released 2026-10-23T12:01:01.000Z, 1 | `/home/runner/.local/bin/amp` | 161.0 | bin | 226.1 | 224.1 | 584.1 | 0.9 | render | 139.7 |
| cursor-agent | 2026.10.22-27dcf5f | `/home/runner/.local/bin/cursor-agent` | 583.2 | pkg | 478.4 | 461.2 | — | — | render | 252.6 |
| qwen code | 0.26.0 | `/home/runner/.npm-global/bin/qwen` | 154.7 | pkg | 37.9 | 829.8 | — | — | render | 239.5 |
| codebuff | 1.0.688 | `/home/runner/.npm-global/bin/codebuff` | 140.0 | bin | 939.9 | 907.5 | — | — | render | 57.6 |
| kilo code | 7.8.17 | `/home/runner/.npm-global/bin/kilocode` | 718.6 | pkg | 837.7 | 2269.0 | — | — | render | 46.2 |
| droid | 0.248.0 | `/home/runner/.local/bin/droid` | 319.2 | bin | 111.1 | 149.5 | — | — | render | 346.2 |
| kimi code | 2.3.1 | `/home/runner/.kimi-code/bin/kimi` | 192.3 | bin | 594.4 | 755.9 | — | — | render | 329.6 |
| devin | devin 3000.11.205 (6dea39440ae3) | `/home/runner/.local/bin/devin` | 217.5 | bin | 4.5 | 22.9 | — | — | render | 93.1 |
| cline | 3.0.73 | `/home/runner/.npm-global/bin/cline` | 330.3 | pkg | 933.3 | 1144.0 | — | — | render | 54.9 |
| continue | 1.5.47 | `/home/runner/.npm-global/bin/cn` | 82.7 | pkg | 1136.2 | 1333.5 | — | — | render | 319.9 |
| iflow cli | 0.5.19 | `/home/runner/.npm-global/bin/iflow` | 180.2 | pkg | 1234.8 | 1312.4 | 2518.3 | 47.1 | render | 55.5 |

</details>

_Generated 2026-10-23T13:51:18Z on Linux x86_64 (6.17.0-1022-azure). [Method and caveats](#benchmarks) · [raw JSON](bench/results.json)_
