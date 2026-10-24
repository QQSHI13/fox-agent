| metric | fox-agent | rank |
|---|---|---|
| TUI 1st byte | **39 ms** | **#3** of 21 |
| TUI 1st input | **59 ms** | **#2** of 13 |
| input latency | **5 ms** | **#4** of 10 |
| bundle | **117 MB** | **#4** of 22 |
| idle PSS | **45 MB** | **#2** of 21 |
| `--version` | **6 ms** | **#2** of 22 |

fox-agent headless vs scripted local provider: time to first token **81 ms**, peak RSS **57 MB**.

<details><summary>every tool, every metric</summary>

![harness bench dashboard](bench/bench.svg)

| agent | bundle | `--version` | TUI 1st byte | TUI 1st input | input latency | signal | idle PSS |
|---|---|---|---|---|---|---|---|
| **fox-agent** | 117 MB | 6 ms | 39 ms | 59 ms | 5 ms | render | 45 MB |
| claude code | 292 MB | 9 ms | 221 ms | — | — | render | 167 MB |
| codex | 444 MB | 33 ms | 347 ms | 369 ms | — | render | 237 MB |
| opencode v2 | 207 MB | 55 ms | 120 ms | 15201 ms | 41 ms | render | 122 MB |
| jcode | 171 MB | 8 ms | 27 ms | 74 ms | 4 ms | render | 34 MB |
| pi | 112 MB | 158 ms | 250 ms | 263 ms | 15 ms | render | 130 MB |
| pi-bolt | 263 MB | 12 ms | 51 ms | 52 ms | 4 ms | render | 88 MB |
| gemini cli | 103 MB | 959 ms | 1129 ms | 1119 ms | — | — | — |
| copilot cli | 198 MB | 76 ms | 809 ms | — | — | render | 356 MB |
| crush | 129 MB | 97 ms | 402 ms | 625 ms | 247 ms | render | 158 MB |
| aider | 643 MB | 536 ms | 505 ms | 524 ms | 15 ms | render | 67 MB |
| amp | 161 MB | 146 ms | 190 ms | 15059 ms | 5 ms | render | 138 MB |
| cursor-agent | 583 MB | 306 ms | 326 ms | — | — | render | 231 MB |
| qwen code | 155 MB | 27 ms | 763 ms | — | — | render | 320 MB |
| codebuff | 140 MB | 588 ms | 1762 ms | — | — | render | 279 MB |
| kilo code | 719 MB | 561 ms | 4932 ms | 16578 ms | 25 ms | render | 936 MB |
| droid | 320 MB | 53 ms | — | — | — | render | 272 MB |
| kimi code | 192 MB | 376 ms | 597 ms | — | — | render | 332 MB |
| devin | 217 MB | 4 ms | 35 ms | — | — | render | 103 MB |
| cline | 330 MB | 631 ms | 1251 ms | — | — | render | 271 MB |
| continue | 83 MB | 680 ms | 10994 ms | 8006 ms | — | render | 318 MB |
| iflow cli | 180 MB | 756 ms | 882 ms | 972 ms | 52 ms | render | 360 MB |

</details>

<details><summary>full precision · all collected fields</summary>

| agent | version | bin | bundle (MB) | bundle kind | `--version` (ms) | TUI 1st byte (ms) | TUI 1st input (ms) | input latency (ms) | signal | idle PSS (MB) |
|---|---|---|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.6.0 | `/home/runner/work/fox-agent/fox-agent/bin/fox` | 116.6 | bin | 6.1 | 39.4 | 59.2 | 4.9 | render | 44.6 |
| claude code | 2.1.310 (Claude Code) | `/home/runner/.npm-global/bin/claude` | 291.6 | bin | 9.3 | 220.9 | — | — | render | 167.4 |
| codex | codex-cli 0.164.0 | `/home/runner/.npm-global/bin/codex` | 444.4 | pkg | 32.8 | 346.8 | 369.2 | — | render | 236.6 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | `/home/runner/.npm-global/bin/opencode2` | 207.4 | bin | 55.4 | 119.6 | 15200.6 | 41.2 | render | 122.5 |
| jcode | jcode v0.99.1 (7206efd0c) | `/home/runner/.local/bin/jcode` | 171.3 | bin | 7.6 | 27.0 | 73.9 | 4.3 | render | 33.6 |
| pi | 1.4.0 | `/home/runner/.npm-global/bin/pi` | 111.8 | pkg | 158.2 | 250.1 | 263.1 | 15.1 | render | 129.8 |
| pi-bolt | 1.4.0 (Pi-Bolt 1.0.0, linux-x64, JIT off) | `/home/runner/.local/bin/pi-bolt` | 263.2 | bin | 11.8 | 51.4 | 51.9 | 4.2 | render | 88.4 |
| gemini cli | 0.65.0 | `/home/runner/.npm-global/bin/gemini` | 102.6 | pkg | 958.7 | 1129.2 | 1118.8 | — | — | — |
| copilot cli | GitHub Copilot CLI 1.0.103. | `/home/runner/.npm-global/bin/copilot` | 198.5 | pkg | 76.3 | 809.1 | — | — | render | 355.6 |
| crush | crush version v0.98.2 | `/home/runner/.npm-global/bin/crush` | 128.9 | pkg | 97.4 | 401.7 | 625.3 | 246.6 | render | 158.2 |
| aider | aider 0.86.2 | `/home/runner/work/fox-agent/fox-agent/.venv-bench/bin/aider` | 642.8 | pkg | 536.3 | 505.5 | 524.1 | 14.9 | render | 67.3 |
| amp | 0.0.1792814442-g8ccdc4 (released 2026-10-24T04:00:42.000Z, 4 | `/home/runner/.local/bin/amp` | 161.1 | bin | 146.0 | 189.8 | 15059.0 | 4.8 | render | 137.8 |
| cursor-agent | 2026.10.22-27dcf5f | `/home/runner/.local/bin/cursor-agent` | 583.2 | pkg | 305.8 | 325.5 | — | — | render | 231.3 |
| qwen code | 0.26.0 | `/home/runner/.npm-global/bin/qwen` | 154.7 | pkg | 27.5 | 763.1 | — | — | render | 319.6 |
| codebuff | 1.0.688 | `/home/runner/.npm-global/bin/codebuff` | 140.0 | bin | 588.0 | 1762.4 | — | — | render | 279.0 |
| kilo code | 7.8.17 | `/home/runner/.npm-global/bin/kilocode` | 718.6 | pkg | 561.4 | 4931.7 | 16578.4 | 24.8 | render | 935.9 |
| droid | 0.249.0 | `/home/runner/.local/bin/droid` | 319.7 | bin | 53.4 | — | — | — | render | 271.6 |
| kimi code | 2.3.1 | `/home/runner/.kimi-code/bin/kimi` | 192.3 | bin | 375.8 | 597.4 | — | — | render | 332.0 |
| devin | devin 3000.11.205 (6dea39440ae3) | `/home/runner/.local/bin/devin` | 217.5 | bin | 3.5 | 35.3 | — | — | render | 103.0 |
| cline | 3.0.73 | `/home/runner/.npm-global/bin/cline` | 330.3 | pkg | 631.3 | 1251.2 | — | — | render | 271.4 |
| continue | 1.5.47 | `/home/runner/.npm-global/bin/cn` | 82.7 | pkg | 679.5 | 10994.5 | 8005.8 | — | render | 317.6 |
| iflow cli | 0.5.19 | `/home/runner/.npm-global/bin/iflow` | 180.2 | pkg | 756.5 | 881.9 | 972.5 | 51.7 | render | 359.8 |

</details>

_Generated 2026-10-24T05:12:16Z on Linux x86_64 (6.17.0-1022-azure). [Method and caveats](#benchmarks) · [raw JSON](bench/results.json)_
