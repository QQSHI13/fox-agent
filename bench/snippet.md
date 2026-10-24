| metric | fox-agent | rank |
|---|---|---|
| TUI 1st byte | **35 ms** | **#3** of 21 |
| TUI 1st input | **47 ms** | **#1** of 14 |
| input latency | **4 ms** | **#2** of 10 |
| bundle | **117 MB** | **#4** of 22 |
| idle PSS | **45 MB** | **#2** of 21 |
| `--version` | **5 ms** | **#2** of 22 |

fox-agent headless vs scripted local provider: time to first token **62 ms**, peak RSS **57 MB**.

<details><summary>every tool, every metric</summary>

![harness bench dashboard](bench/bench.svg)

| agent | bundle | `--version` | TUI 1st byte | TUI 1st input | input latency | signal | idle PSS |
|---|---|---|---|---|---|---|---|
| **fox-agent** | 117 MB | 5 ms | 35 ms | 47 ms | 4 ms | render | 45 MB |
| claude code | 292 MB | 8 ms | 196 ms | — | — | render | 168 MB |
| codex | 444 MB | 30 ms | 342 ms | 355 ms | — | render | 238 MB |
| opencode v2 | 207 MB | 52 ms | 101 ms | 15203 ms | 41 ms | render | 122 MB |
| jcode | 171 MB | 8 ms | 28 ms | 75 ms | 6 ms | render | 34 MB |
| pi | 112 MB | 165 ms | 248 ms | 260 ms | 15 ms | render | 128 MB |
| pi-bolt | 263 MB | 12 ms | 51 ms | 51 ms | 5 ms | render | 89 MB |
| gemini cli | 103 MB | 845 ms | 985 ms | 964 ms | — | — | — |
| copilot cli | 198 MB | 67 ms | 669 ms | — | — | render | 356 MB |
| crush | 129 MB | 89 ms | 396 ms | 650 ms | 230 ms | render | 159 MB |
| aider | 643 MB | 444 ms | 421 ms | 431 ms | 13 ms | render | 67 MB |
| amp | 161 MB | 124 ms | 166 ms | 15054 ms | 4 ms | render | 138 MB |
| cursor-agent | 583 MB | 268 ms | 282 ms | — | — | render | 240 MB |
| qwen code | 155 MB | 23 ms | 675 ms | — | — | render | 323 MB |
| codebuff | 140 MB | 546 ms | 1666 ms | — | — | render | 278 MB |
| kilo code | 719 MB | 587 ms | 4585 ms | 16476 ms | 26 ms | render | 937 MB |
| droid | 320 MB | 52 ms | — | — | — | render | 275 MB |
| kimi code | 192 MB | 353 ms | 548 ms | — | — | render | 354 MB |
| devin | 217 MB | 4 ms | 34 ms | 52 ms | — | render | 103 MB |
| cline | 330 MB | 647 ms | 1207 ms | — | — | render | 270 MB |
| continue | 83 MB | 650 ms | 10978 ms | 8008 ms | — | render | 317 MB |
| iflow cli | 180 MB | 715 ms | 824 ms | 853 ms | 49 ms | render | 361 MB |

</details>

<details><summary>full precision · all collected fields</summary>

| agent | version | bin | bundle (MB) | bundle kind | `--version` (ms) | TUI 1st byte (ms) | TUI 1st input (ms) | input latency (ms) | signal | idle PSS (MB) |
|---|---|---|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.6.0 | `/home/runner/work/fox-agent/fox-agent/bin/fox` | 116.6 | bin | 5.3 | 34.7 | 47.0 | 4.2 | render | 44.8 |
| claude code | 2.1.310 (Claude Code) | `/home/runner/.npm-global/bin/claude` | 291.6 | bin | 8.4 | 196.0 | — | — | render | 167.8 |
| codex | codex-cli 0.164.0 | `/home/runner/.npm-global/bin/codex` | 444.4 | pkg | 29.8 | 342.4 | 354.8 | — | render | 238.4 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | `/home/runner/.npm-global/bin/opencode2` | 207.4 | bin | 51.9 | 101.2 | 15203.1 | 41.3 | render | 122.4 |
| jcode | jcode v0.99.1 (7206efd0c) | `/home/runner/.local/bin/jcode` | 171.3 | bin | 8.0 | 27.9 | 75.4 | 6.1 | render | 33.8 |
| pi | 1.4.0 | `/home/runner/.npm-global/bin/pi` | 111.8 | pkg | 164.9 | 247.9 | 260.3 | 15.4 | render | 127.9 |
| pi-bolt | 1.4.0 (Pi-Bolt 1.0.0, linux-x64, JIT off) | `/home/runner/.local/bin/pi-bolt` | 263.2 | bin | 11.6 | 51.0 | 50.8 | 4.9 | render | 88.6 |
| gemini cli | 0.65.0 | `/home/runner/.npm-global/bin/gemini` | 102.6 | pkg | 844.6 | 984.9 | 964.4 | — | — | — |
| copilot cli | GitHub Copilot CLI 1.0.103. | `/home/runner/.npm-global/bin/copilot` | 198.5 | pkg | 66.8 | 669.0 | — | — | render | 356.2 |
| crush | crush version v0.98.2 | `/home/runner/.npm-global/bin/crush` | 128.9 | pkg | 89.3 | 396.0 | 649.8 | 230.4 | render | 159.5 |
| aider | aider 0.86.2 | `/home/runner/work/fox-agent/fox-agent/.venv-bench/bin/aider` | 642.8 | pkg | 443.8 | 421.1 | 430.9 | 12.9 | render | 67.3 |
| amp | 0.0.1792800065-ga5b55b (released 2026-10-24T00:01:05.000Z, 2 | `/home/runner/.local/bin/amp` | 161.1 | bin | 123.8 | 166.0 | 15053.7 | 4.0 | render | 138.0 |
| cursor-agent | 2026.10.22-27dcf5f | `/home/runner/.local/bin/cursor-agent` | 583.2 | pkg | 268.3 | 282.1 | — | — | render | 239.5 |
| qwen code | 0.26.0 | `/home/runner/.npm-global/bin/qwen` | 154.7 | pkg | 23.4 | 674.8 | — | — | render | 322.9 |
| codebuff | 1.0.688 | `/home/runner/.npm-global/bin/codebuff` | 140.0 | bin | 546.2 | 1665.9 | — | — | render | 277.8 |
| kilo code | 7.8.17 | `/home/runner/.npm-global/bin/kilocode` | 718.6 | pkg | 586.8 | 4584.9 | 16476.3 | 25.6 | render | 936.8 |
| droid | 0.249.0 | `/home/runner/.local/bin/droid` | 319.7 | bin | 51.8 | — | — | — | render | 274.6 |
| kimi code | 2.3.1 | `/home/runner/.kimi-code/bin/kimi` | 192.3 | bin | 352.7 | 548.3 | — | — | render | 354.0 |
| devin | devin 3000.11.205 (6dea39440ae3) | `/home/runner/.local/bin/devin` | 217.5 | bin | 3.5 | 34.3 | 52.4 | — | render | 103.1 |
| cline | 3.0.73 | `/home/runner/.npm-global/bin/cline` | 330.3 | pkg | 646.7 | 1206.5 | — | — | render | 270.2 |
| continue | 1.5.47 | `/home/runner/.npm-global/bin/cn` | 82.7 | pkg | 649.6 | 10978.1 | 8008.5 | — | render | 317.0 |
| iflow cli | 0.5.19 | `/home/runner/.npm-global/bin/iflow` | 180.2 | pkg | 715.2 | 824.4 | 852.5 | 48.9 | render | 360.7 |

</details>

_Generated 2026-10-24T03:22:40Z on Linux x86_64 (6.17.0-1022-azure). [Method and caveats](#benchmarks) · [raw JSON](bench/results.json)_
