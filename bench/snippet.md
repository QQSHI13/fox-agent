| metric | fox-agent | rank |
|---|---|---|
| TUI 1st byte | **20 ms** | **#3** of 22 |
| TUI 1st input | **394 ms** | **#2** of 12 |
| input latency | **3 ms** | **#4** of 11 |
| bundle | **117 MB** | **#4** of 23 |
| idle PSS | **45 MB** | **#2** of 22 |
| `--version` | **7 ms** | **#2** of 23 |

fox-agent headless vs scripted local provider: time to first token **55 ms**, peak RSS **57 MB**.

<details><summary>every tool, every metric</summary>

![harness bench dashboard](bench/bench.svg)

| agent | bundle | `--version` | TUI 1st byte | TUI 1st input | input latency | signal | idle PSS |
|---|---|---|---|---|---|---|---|
| **fox-agent** | 117 MB | 7 ms | 20 ms | 394 ms | 3 ms | render | 45 MB |
| claude code | 292 MB | 9 ms | 264 ms | — | — | render | 169 MB |
| codex | 444 MB | 43 ms | 44 ms | — | — | render | 49 MB |
| opencode v2 | 207 MB | 87 ms | 145 ms | 16862 ms | 65 ms | render | 129 MB |
| jcode | 171 MB | 9 ms | 12 ms | 773 ms | 1 ms | render | 33 MB |
| pi | 112 MB | 256 ms | 336 ms | 860 ms | 9 ms | render | 130 MB |
| pi-bolt | 263 MB | 16 ms | 37 ms | 516 ms | 2 ms | render | 87 MB |
| gemini cli | 103 MB | 1567 ms | 1640 ms | 1677 ms | 1 ms | — | 146 MB |
| copilot cli | 198 MB | 105 ms | 793 ms | — | — | render | 47 MB |
| crush | 129 MB | 133 ms | 572 ms | 17267 ms | 16340 ms | render | 69 MB |
| goose | 209 MB | 7 ms | 8 ms | 229 ms | 1 ms | render | — |
| aider | 643 MB | 797 ms | 732 ms | 1125 ms | 11 ms | render | 67 MB |
| amp | 161 MB | 204 ms | 220 ms | 618 ms | 3 ms | render | 138 MB |
| cursor-agent | 583 MB | 479 ms | 456 ms | — | — | render | 258 MB |
| qwen code | 155 MB | 37 ms | 835 ms | — | — | render | 237 MB |
| codebuff | 140 MB | 909 ms | 894 ms | — | — | render | 58 MB |
| kilo code | 719 MB | 816 ms | 2276 ms | 18985 ms | 16042 ms | render | 46 MB |
| droid | 319 MB | 126 ms | 94 ms | — | — | render | 326 MB |
| kimi code | 192 MB | 613 ms | 761 ms | — | — | render | 331 MB |
| devin | 217 MB | 5 ms | 23 ms | — | — | render | 110 MB |
| cline | 330 MB | 914 ms | 1229 ms | — | — | render | 55 MB |
| continue | 83 MB | 1131 ms | — | — | 1 ms | kernel-echo (tty) | 318 MB |
| iflow cli | 180 MB | 1250 ms | 1332 ms | 2182 ms | 50 ms | render | 56 MB |

</details>

<details><summary>full precision · all collected fields</summary>

| agent | version | bin | bundle (MB) | bundle kind | `--version` (ms) | TUI 1st byte (ms) | TUI 1st input (ms) | input latency (ms) | signal | idle PSS (MB) |
|---|---|---|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.6.0 | `/home/runner/work/fox-agent/fox-agent/bin/fox` | 116.6 | bin | 7.3 | 20.4 | 393.9 | 2.7 | render | 44.8 |
| claude code | 2.1.310 (Claude Code) | `/home/runner/.npm-global/bin/claude` | 291.6 | bin | 9.4 | 263.9 | — | — | render | 168.7 |
| codex | codex-cli 0.164.0 | `/home/runner/.npm-global/bin/codex` | 444.4 | pkg | 43.2 | 44.0 | — | — | render | 49.1 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | `/home/runner/.npm-global/bin/opencode2` | 207.4 | bin | 87.3 | 145.2 | 16862.3 | 65.4 | render | 129.1 |
| jcode | jcode v0.99.1 (7206efd0c) | `/home/runner/.local/bin/jcode` | 171.3 | bin | 9.4 | 12.1 | 773.4 | 1.4 | render | 33.3 |
| pi | 1.4.0 | `/home/runner/.npm-global/bin/pi` | 111.8 | pkg | 256.2 | 335.7 | 859.8 | 9.0 | render | 130.3 |
| pi-bolt | 1.4.0 (Pi-Bolt 1.0.0, linux-x64, JIT off) | `/home/runner/.local/bin/pi-bolt` | 263.2 | bin | 15.7 | 37.1 | 515.8 | 2.2 | render | 86.7 |
| gemini cli | 0.65.0 | `/home/runner/.npm-global/bin/gemini` | 102.6 | pkg | 1567.1 | 1640.3 | 1676.9 | 1.0 | — | 146.1 |
| copilot cli | GitHub Copilot CLI 1.0.103. | `/home/runner/.npm-global/bin/copilot` | 198.5 | pkg | 105.1 | 793.1 | — | — | render | 47.4 |
| crush | crush version v0.98.2 | `/home/runner/.npm-global/bin/crush` | 128.9 | pkg | 133.3 | 572.4 | 17266.9 | 16339.9 | render | 69.0 |
| goose | 1.56.0 | `/home/runner/.local/bin/goose` | 209.2 | bin | 7.5 | 7.6 | 228.6 | 0.9 | render | — |
| aider | aider 0.86.2 | `/home/runner/work/fox-agent/fox-agent/.venv-bench/bin/aider` | 642.8 | pkg | 797.3 | 731.8 | 1125.1 | 11.0 | render | 66.8 |
| amp | 0.0.1792785637-g8d232a (released 2026-10-23T20:00:37.000Z, 4 | `/home/runner/.local/bin/amp` | 161.1 | bin | 204.3 | 219.6 | 617.7 | 2.9 | render | 138.5 |
| cursor-agent | 2026.10.22-27dcf5f | `/home/runner/.local/bin/cursor-agent` | 583.2 | pkg | 478.7 | 455.8 | — | — | render | 257.8 |
| qwen code | 0.26.0 | `/home/runner/.npm-global/bin/qwen` | 154.7 | pkg | 37.4 | 835.5 | — | — | render | 236.9 |
| codebuff | 1.0.688 | `/home/runner/.npm-global/bin/codebuff` | 140.0 | bin | 908.6 | 894.2 | — | — | render | 57.6 |
| kilo code | 7.8.17 | `/home/runner/.npm-global/bin/kilocode` | 718.6 | pkg | 815.8 | 2275.8 | 18985.5 | 16042.1 | render | 46.2 |
| droid | 0.248.0 | `/home/runner/.local/bin/droid` | 319.2 | bin | 126.1 | 94.4 | — | — | render | 326.1 |
| kimi code | 2.3.1 | `/home/runner/.kimi-code/bin/kimi` | 192.3 | bin | 613.3 | 761.3 | — | — | render | 330.9 |
| devin | devin 3000.11.205 (6dea39440ae3) | `/home/runner/.local/bin/devin` | 217.5 | bin | 4.5 | 23.4 | — | — | render | 109.5 |
| cline | 3.0.73 | `/home/runner/.npm-global/bin/cline` | 330.3 | pkg | 913.5 | 1229.2 | — | — | render | 55.0 |
| continue | 1.5.47 | `/home/runner/.npm-global/bin/cn` | 82.7 | pkg | 1131.5 | — | — | 0.9 | kernel-echo | 318.3 |
| iflow cli | 0.5.19 | `/home/runner/.npm-global/bin/iflow` | 180.2 | pkg | 1249.7 | 1332.3 | 2182.3 | 50.3 | render | 55.6 |

</details>

_Generated 2026-10-24T00:49:50Z on Linux x86_64 (6.17.0-1022-azure). [Method and caveats](#benchmarks) · [raw JSON](bench/results.json)_
