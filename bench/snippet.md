| metric | fox-agent | rank |
|---|---|---|
| TUI 1st byte | **15 ms** | **#3** of 22 |
| TUI 1st input | **377 ms** | **#2** of 18 |
| input latency | **1 ms** | **#9** of 18 |
| bundle | **117 MB** | **#4** of 23 |
| idle PSS | **36 MB** | **#2** of 23 |
| `--version` | **8 ms** | **#3** of 23 |

fox-agent headless vs scripted local provider: time to first token **54 ms**, peak RSS **57 MB**.

<details><summary>every tool, every metric</summary>

![harness bench dashboard](bench/bench.svg)

| agent | bundle | `--version` | TUI 1st byte | TUI 1st input | input latency | idle PSS |
|---|---|---|---|---|---|---|
| **fox-agent** | 117 MB | 8 ms | 15 ms | 377 ms | 1 ms | 36 MB |
| claude code | 293 MB | 11 ms | 236 ms | — | — | 196 MB |
| codex | 444 MB | 41 ms | 44 ms | 703 ms | 0 ms | 49 MB |
| opencode v2 | 207 MB | 80 ms | 132 ms | 494 ms | 0 ms | 130 MB |
| jcode | 171 MB | 9 ms | 12 ms | 767 ms | 0 ms | 32 MB |
| pi | 112 MB | 246 ms | 324 ms | 853 ms | 8 ms | 129 MB |
| pi-bolt | 262 MB | 12 ms | 41 ms | 518 ms | 2 ms | 97 MB |
| gemini cli | 103 MB | 1504 ms | 1583 ms | 1607 ms | 0 ms | 146 MB |
| copilot cli | 198 MB | 104 ms | 777 ms | — | — | 47 MB |
| crush | 129 MB | 130 ms | 253 ms | 697 ms | 72 ms | 69 MB |
| goose | 304 MB | 7 ms | 7 ms | 368 ms | 0 ms | 108 MB |
| aider | 643 MB | 837 ms | 760 ms | 1153 ms | 10 ms | 67 MB |
| amp | 161 MB | 216 ms | 226 ms | 586 ms | 3 ms | 138 MB |
| cursor-agent | 583 MB | 471 ms | 439 ms | — | — | 249 MB |
| qwen code | 155 MB | 39 ms | 836 ms | 1305 ms | 0 ms | 247 MB |
| codebuff | 140 MB | 908 ms | 883 ms | 1388 ms | 0 ms | 58 MB |
| kilo code | 719 MB | 794 ms | 2178 ms | 6010 ms | 2572 ms | 46 MB |
| droid | 319 MB | 117 ms | 97 ms | 3253 ms | 1890 ms | 288 MB |
| kimi code | 192 MB | 570 ms | 730 ms | 1121 ms | 4 ms | 330 MB |
| devin | 217 MB | 5 ms | 22 ms | 1025 ms | 143 ms | 95 MB |
| cline | 330 MB | 850 ms | 1111 ms | — | — | 55 MB |
| continue | 83 MB | 1085 ms | — | — | — | 317 MB |
| iflow cli | 180 MB | 1190 ms | 1268 ms | 2471 ms | 0 ms | 56 MB |

</details>

<details><summary>full precision · all collected fields</summary>

| agent | version | bin | bundle (MB) | bundle kind | `--version` (ms) | TUI 1st byte (ms) | TUI 1st input (ms) | input latency (ms) | idle PSS (MB) |
|---|---|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.6.0 | `/home/runner/work/fox-agent/fox-agent/bin/fox` | 116.6 | bin | 7.5 | 15.4 | 377.4 | 0.6 | 36.3 |
| claude code | 2.1.309 (Claude Code) | `/home/runner/.npm-global/bin/claude` | 293.5 | bin | 11.3 | 235.7 | — | — | 196.3 |
| codex | codex-cli 0.164.0 | `/home/runner/.npm-global/bin/codex` | 444.4 | pkg | 40.9 | 43.8 | 702.9 | 0.4 | 49.1 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | `/home/runner/.npm-global/bin/opencode2` | 207.4 | bin | 80.1 | 132.4 | 493.5 | 0.1 | 129.6 |
| jcode | jcode v0.99.1 (7206efd0c) | `/home/runner/.local/bin/jcode` | 171.3 | bin | 8.9 | 11.6 | 766.6 | 0.5 | 32.3 |
| pi | 1.4.0 | `/home/runner/.npm-global/bin/pi` | 111.8 | pkg | 246.4 | 323.5 | 852.9 | 8.4 | 128.9 |
| pi-bolt | 1.4.0 (Pi-Bolt 0.9.9, linux-x64, JIT off) | `/home/runner/.local/bin/pi-bolt` | 262.0 | bin | 11.9 | 40.8 | 518.3 | 1.6 | 96.7 |
| gemini cli | 0.65.0 | `/home/runner/.npm-global/bin/gemini` | 102.6 | pkg | 1503.9 | 1583.3 | 1607.2 | 0.1 | 146.2 |
| copilot cli | GitHub Copilot CLI 1.0.103. | `/home/runner/.npm-global/bin/copilot` | 198.5 | pkg | 104.3 | 777.1 | — | — | 47.4 |
| crush | crush version v0.98.1 | `/home/runner/.npm-global/bin/crush` | 128.7 | pkg | 129.8 | 253.2 | 697.4 | 72.3 | 69.0 |
| goose | 1.55.0 | `/home/runner/.local/bin/goose` | 304.0 | bin | 7.3 | 7.1 | 368.4 | 0.2 | 108.4 |
| aider | aider 0.86.2 | `/home/runner/work/fox-agent/fox-agent/.venv-bench/bin/aider` | 642.8 | pkg | 836.8 | 759.9 | 1153.2 | 10.3 | 67.0 |
| amp | 0.0.1792743733-g57207c (released 2026-10-23T08:22:13.000Z, 3 | `/home/runner/.local/bin/amp` | 161.1 | bin | 215.8 | 225.5 | 585.7 | 2.5 | 138.4 |
| cursor-agent | 2026.10.22-27dcf5f | `/home/runner/.local/bin/cursor-agent` | 583.2 | pkg | 470.8 | 438.9 | — | — | 248.5 |
| qwen code | 0.26.0 | `/home/runner/.npm-global/bin/qwen` | 154.7 | pkg | 39.0 | 836.0 | 1304.5 | 0.1 | 247.2 |
| codebuff | 1.0.688 | `/home/runner/.npm-global/bin/codebuff` | 140.0 | bin | 908.1 | 882.6 | 1388.5 | 0.1 | 57.6 |
| kilo code | 7.8.17 | `/home/runner/.npm-global/bin/kilocode` | 718.6 | pkg | 793.8 | 2177.9 | 6009.6 | 2571.7 | 46.2 |
| droid | 0.248.0 | `/home/runner/.local/bin/droid` | 319.2 | bin | 116.5 | 97.1 | 3252.7 | 1889.9 | 287.6 |
| kimi code | 2.3.1 | `/home/runner/.kimi-code/bin/kimi` | 192.3 | bin | 569.5 | 729.8 | 1121.0 | 4.1 | 330.2 |
| devin | devin 3000.11.205 (6dea39440ae3) | `/home/runner/.local/bin/devin` | 217.5 | bin | 4.6 | 22.0 | 1024.9 | 142.8 | 94.6 |
| cline | 3.0.73 | `/home/runner/.npm-global/bin/cline` | 330.3 | pkg | 849.7 | 1110.7 | — | — | 55.0 |
| continue | 1.5.47 | `/home/runner/.npm-global/bin/cn` | 82.7 | pkg | 1085.4 | — | — | — | 317.3 |
| iflow cli | 0.5.19 | `/home/runner/.npm-global/bin/iflow` | 180.2 | pkg | 1189.8 | 1267.5 | 2471.2 | 0.1 | 55.6 |

</details>

_Generated 2026-10-23T11:59:16Z on Linux x86_64 (6.17.0-1022-azure). [Method and caveats](#benchmarks) · [raw JSON](bench/results.json)_
