| metric | fox-agent | rank |
|---|---|---|
| TUI 1st byte | **17 ms** | **#2** of 21 |
| TUI 1st input | **394 ms** | **#1** of 11 |
| input latency | **3 ms** | **#3** of 10 |
| bundle | **117 MB** | **#4** of 22 |
| idle PSS | **45 MB** | **#2** of 21 |
| `--version` | **6 ms** | **#2** of 22 |

fox-agent headless vs scripted local provider: time to first token **55 ms**, peak RSS **57 MB**.

<details><summary>every tool, every metric</summary>

![harness bench dashboard](bench/bench.svg)

| agent | bundle | `--version` | TUI 1st byte | TUI 1st input | input latency | signal | idle PSS |
|---|---|---|---|---|---|---|---|
| **fox-agent** | 117 MB | 6 ms | 17 ms | 394 ms | 3 ms | render | 45 MB |
| claude code | 292 MB | 8 ms | 245 ms | — | — | render | 166 MB |
| codex | 444 MB | 40 ms | 46 ms | — | — | render | 235 MB |
| opencode v2 | 207 MB | 78 ms | 132 ms | 16797 ms | 57 ms | render | 126 MB |
| jcode | 171 MB | 8 ms | 11 ms | 679 ms | 1 ms | render | 33 MB |
| pi | 112 MB | 232 ms | 306 ms | 824 ms | 8 ms | render | 130 MB |
| pi-bolt | 263 MB | 11 ms | 34 ms | 524 ms | 2 ms | render | 87 MB |
| gemini cli | 103 MB | 1360 ms | 1451 ms | 1468 ms | 1 ms | — | — |
| copilot cli | 198 MB | 103 ms | 777 ms | — | — | render | 381 MB |
| crush | 129 MB | 132 ms | 430 ms | 17139 ms | 16303 ms | render | 158 MB |
| aider | 643 MB | 718 ms | 633 ms | 1022 ms | 9 ms | render | 67 MB |
| amp | 161 MB | 202 ms | 208 ms | 580 ms | 3 ms | render | 138 MB |
| cursor-agent | 583 MB | 433 ms | 415 ms | — | — | render | 251 MB |
| qwen code | 155 MB | 36 ms | 755 ms | — | — | render | 321 MB |
| codebuff | 140 MB | 906 ms | 874 ms | — | — | render | 246 MB |
| kilo code | 719 MB | 810 ms | 2174 ms | 18937 ms | 16046 ms | render | 967 MB |
| droid | 319 MB | 77 ms | 87 ms | — | — | render | 273 MB |
| kimi code | 192 MB | 528 ms | 657 ms | — | — | render | 331 MB |
| devin | 217 MB | 5 ms | 22 ms | — | — | render | 94 MB |
| cline | 330 MB | 906 ms | 1194 ms | — | — | render | 235 MB |
| continue | 83 MB | 1026 ms | — | — | 1 ms | kernel-echo (tty) | 317 MB |
| iflow cli | 180 MB | 1090 ms | 1160 ms | 2027 ms | 84 ms | render | 359 MB |

</details>

<details><summary>full precision · all collected fields</summary>

| agent | version | bin | bundle (MB) | bundle kind | `--version` (ms) | TUI 1st byte (ms) | TUI 1st input (ms) | input latency (ms) | signal | idle PSS (MB) |
|---|---|---|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.6.0 | `/home/runner/work/fox-agent/fox-agent/bin/fox` | 116.6 | bin | 6.0 | 17.5 | 394.3 | 2.5 | render | 44.5 |
| claude code | 2.1.310 (Claude Code) | `/home/runner/.npm-global/bin/claude` | 291.6 | bin | 7.9 | 244.6 | — | — | render | 166.3 |
| codex | codex-cli 0.164.0 | `/home/runner/.npm-global/bin/codex` | 444.4 | pkg | 40.4 | 45.6 | — | — | render | 234.9 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | `/home/runner/.npm-global/bin/opencode2` | 207.4 | bin | 78.2 | 131.6 | 16796.7 | 56.7 | render | 126.1 |
| jcode | jcode v0.99.1 (7206efd0c) | `/home/runner/.local/bin/jcode` | 171.3 | bin | 7.9 | 10.9 | 679.2 | 1.3 | render | 33.4 |
| pi | 1.4.0 | `/home/runner/.npm-global/bin/pi` | 111.8 | pkg | 232.1 | 305.7 | 823.9 | 8.5 | render | 130.2 |
| pi-bolt | 1.4.0 (Pi-Bolt 1.0.0, linux-x64, JIT off) | `/home/runner/.local/bin/pi-bolt` | 263.2 | bin | 10.8 | 34.3 | 523.7 | 2.1 | render | 86.8 |
| gemini cli | 0.65.0 | `/home/runner/.npm-global/bin/gemini` | 102.6 | pkg | 1359.7 | 1451.0 | 1468.0 | 0.7 | — | — |
| copilot cli | GitHub Copilot CLI 1.0.103. | `/home/runner/.npm-global/bin/copilot` | 198.5 | pkg | 103.3 | 776.7 | — | — | render | 381.1 |
| crush | crush version v0.98.2 | `/home/runner/.npm-global/bin/crush` | 128.9 | pkg | 132.2 | 430.0 | 17139.3 | 16303.2 | render | 157.7 |
| aider | aider 0.86.2 | `/home/runner/work/fox-agent/fox-agent/.venv-bench/bin/aider` | 642.8 | pkg | 718.3 | 633.0 | 1022.2 | 9.3 | render | 66.8 |
| amp | 0.0.1792800065-ga5b55b (released 2026-10-24T00:01:05.000Z, 1 | `/home/runner/.local/bin/amp` | 161.1 | bin | 202.3 | 208.0 | 579.6 | 3.0 | render | 138.1 |
| cursor-agent | 2026.10.22-27dcf5f | `/home/runner/.local/bin/cursor-agent` | 583.2 | pkg | 432.8 | 415.4 | — | — | render | 251.0 |
| qwen code | 0.26.0 | `/home/runner/.npm-global/bin/qwen` | 154.7 | pkg | 36.2 | 755.0 | — | — | render | 321.0 |
| codebuff | 1.0.688 | `/home/runner/.npm-global/bin/codebuff` | 140.0 | bin | 905.8 | 874.2 | — | — | render | 245.9 |
| kilo code | 7.8.17 | `/home/runner/.npm-global/bin/kilocode` | 718.6 | pkg | 810.4 | 2174.4 | 18937.2 | 16045.8 | render | 967.4 |
| droid | 0.248.0 | `/home/runner/.local/bin/droid` | 319.2 | bin | 77.3 | 87.3 | — | — | render | 272.7 |
| kimi code | 2.3.1 | `/home/runner/.kimi-code/bin/kimi` | 192.3 | bin | 528.5 | 656.8 | — | — | render | 331.4 |
| devin | devin 3000.11.205 (6dea39440ae3) | `/home/runner/.local/bin/devin` | 217.5 | bin | 4.6 | 21.7 | — | — | render | 93.5 |
| cline | 3.0.73 | `/home/runner/.npm-global/bin/cline` | 330.3 | pkg | 906.0 | 1194.2 | — | — | render | 235.0 |
| continue | 1.5.47 | `/home/runner/.npm-global/bin/cn` | 82.7 | pkg | 1026.0 | — | — | 0.8 | kernel-echo | 316.5 |
| iflow cli | 0.5.19 | `/home/runner/.npm-global/bin/iflow` | 180.2 | pkg | 1089.7 | 1160.3 | 2026.8 | 84.0 | render | 358.5 |

</details>

_Generated 2026-10-24T01:38:13Z on Linux x86_64 (6.17.0-1022-azure). [Method and caveats](#benchmarks) · [raw JSON](bench/results.json)_
