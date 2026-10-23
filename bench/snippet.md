| metric | fox-agent | rank |
|---|---|---|
| TUI 1st byte | **18 ms** | **#3** of 22 |
| TUI 1st input | **378 ms** | **#2** of 18 |
| input latency | **1 ms** | **#8** of 18 |
| bundle | **118 MB** | **#4** of 23 |
| idle PSS | **36 MB** | **#2** of 23 |
| `--version` | **7 ms** | **#3** of 23 |

fox-agent headless vs scripted local provider: time to first token **60 ms**, peak RSS **61 MB**.

<details><summary>every tool, every metric</summary>

![harness bench dashboard](bench/bench.svg)

| agent | bundle | `--version` | TUI 1st byte | TUI 1st input | input latency | idle PSS |
|---|---|---|---|---|---|---|
| **fox-agent** | 118 MB | 7 ms | 18 ms | 378 ms | 1 ms | 36 MB |
| claude code | 293 MB | 13 ms | 259 ms | — | — | 196 MB |
| codex | 430 MB | 42 ms | 46 ms | 813 ms | 2 ms | 49 MB |
| opencode v2 | 207 MB | 92 ms | 146 ms | 505 ms | 0 ms | 133 MB |
| jcode | 171 MB | 9 ms | 12 ms | 771 ms | 0 ms | 32 MB |
| pi | 112 MB | 255 ms | 331 ms | 859 ms | 8 ms | 131 MB |
| pi-bolt | 262 MB | 13 ms | 44 ms | 521 ms | 2 ms | 97 MB |
| gemini cli | 103 MB | 1550 ms | 1653 ms | 1677 ms | 0 ms | 146 MB |
| copilot cli | 198 MB | 108 ms | 808 ms | — | — | 47 MB |
| crush | 129 MB | 135 ms | 251 ms | 703 ms | 73 ms | 69 MB |
| goose | 304 MB | 7 ms | 7 ms | 368 ms | 0 ms | 109 MB |
| aider | 643 MB | 832 ms | 756 ms | 1130 ms | 10 ms | 67 MB |
| amp | 161 MB | 218 ms | 224 ms | 588 ms | 3 ms | 139 MB |
| cursor-agent | 583 MB | 493 ms | 450 ms | — | — | 251 MB |
| qwen code | 155 MB | 38 ms | 854 ms | 1335 ms | 0 ms | 241 MB |
| codebuff | 140 MB | 930 ms | 919 ms | 1434 ms | 0 ms | 58 MB |
| kilo code | 719 MB | 837 ms | 2267 ms | 6377 ms | 2776 ms | 46 MB |
| droid | 319 MB | 122 ms | 103 ms | 3237 ms | 1894 ms | 295 MB |
| kimi code | 192 MB | 603 ms | 770 ms | 1171 ms | 4 ms | 355 MB |
| devin | 200 MB | 5 ms | 26 ms | 1034 ms | 142 ms | 95 MB |
| cline | 330 MB | 866 ms | 1131 ms | — | — | 55 MB |
| continue | 83 MB | 1144 ms | — | — | — | 317 MB |
| iflow cli | 180 MB | 1244 ms | 1321 ms | 2558 ms | 0 ms | 56 MB |

</details>

<details><summary>full precision · all collected fields</summary>

| agent | version | bin | bundle (MB) | bundle kind | `--version` (ms) | TUI 1st byte (ms) | TUI 1st input (ms) | input latency (ms) | idle PSS (MB) |
|---|---|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.6.0 | `/home/runner/work/fox-agent/fox-agent/bin/fox` | 117.5 | bin | 7.4 | 17.6 | 377.9 | 0.6 | 36.5 |
| claude code | 2.1.309 (Claude Code) | `/home/runner/.npm-global/bin/claude` | 293.5 | bin | 13.1 | 258.9 | — | — | 196.2 |
| codex | codex-cli 0.163.0 | `/home/runner/.npm-global/bin/codex` | 430.0 | pkg | 41.7 | 45.8 | 813.3 | 1.6 | 49.1 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | `/home/runner/.npm-global/bin/opencode2` | 207.4 | bin | 91.7 | 146.4 | 505.5 | 0.1 | 132.5 |
| jcode | jcode v0.99.1 (7206efd0c) | `/home/runner/.local/bin/jcode` | 171.3 | bin | 9.3 | 11.8 | 771.4 | 0.4 | 31.8 |
| pi | 1.4.0 | `/home/runner/.npm-global/bin/pi` | 111.8 | pkg | 255.1 | 330.9 | 858.9 | 8.5 | 131.3 |
| pi-bolt | 1.4.0 (Pi-Bolt 0.9.9, linux-x64, JIT off) | `/home/runner/.local/bin/pi-bolt` | 262.0 | bin | 13.4 | 43.7 | 521.1 | 1.7 | 96.6 |
| gemini cli | 0.65.0 | `/home/runner/.npm-global/bin/gemini` | 102.6 | pkg | 1549.6 | 1653.5 | 1677.3 | 0.1 | 145.9 |
| copilot cli | GitHub Copilot CLI 1.0.103. | `/home/runner/.npm-global/bin/copilot` | 198.5 | pkg | 107.6 | 807.7 | — | — | 47.4 |
| crush | crush version v0.98.1 | `/home/runner/.npm-global/bin/crush` | 128.7 | pkg | 134.9 | 251.4 | 702.9 | 72.6 | 68.8 |
| goose | 1.55.0 | `/home/runner/.local/bin/goose` | 304.0 | bin | 7.2 | 7.2 | 367.9 | 0.2 | 109.5 |
| aider | aider 0.86.2 | `/home/runner/work/fox-agent/fox-agent/.venv-bench/bin/aider` | 642.8 | pkg | 832.0 | 755.5 | 1130.4 | 10.4 | 66.8 |
| amp | 0.0.1792713681-g9b55f0 (released 2026-10-23T00:01:21.000Z, 3 | `/home/runner/.local/bin/amp` | 161.0 | bin | 218.2 | 224.2 | 587.9 | 2.9 | 138.7 |
| cursor-agent | 2026.10.22-27dcf5f | `/home/runner/.local/bin/cursor-agent` | 583.2 | pkg | 492.5 | 449.6 | — | — | 250.8 |
| qwen code | 0.26.0 | `/home/runner/.npm-global/bin/qwen` | 154.7 | pkg | 37.9 | 853.9 | 1335.1 | 0.1 | 241.2 |
| codebuff | 1.0.688 | `/home/runner/.npm-global/bin/codebuff` | 140.0 | bin | 930.3 | 918.9 | 1433.9 | 0.1 | 57.5 |
| kilo code | 7.8.17 | `/home/runner/.npm-global/bin/kilocode` | 718.6 | pkg | 836.5 | 2266.7 | 6376.8 | 2776.2 | 46.2 |
| droid | 0.248.0 | `/home/runner/.local/bin/droid` | 319.2 | bin | 122.4 | 103.3 | 3236.7 | 1893.5 | 295.1 |
| kimi code | 2.3.0 | `/home/runner/.kimi-code/bin/kimi` | 192.5 | bin | 603.0 | 769.8 | 1171.2 | 4.3 | 354.8 |
| devin | devin 3000.11.92 (7f4e64980e22) | `/home/runner/.local/bin/devin` | 200.4 | bin | 5.3 | 26.1 | 1033.5 | 142.2 | 95.4 |
| cline | 3.0.73 | `/home/runner/.npm-global/bin/cline` | 330.3 | pkg | 866.0 | 1130.7 | — | — | 55.0 |
| continue | 1.5.47 | `/home/runner/.npm-global/bin/cn` | 82.7 | pkg | 1143.8 | — | — | — | 316.5 |
| iflow cli | 0.5.19 | `/home/runner/.npm-global/bin/iflow` | 180.2 | pkg | 1243.8 | 1320.6 | 2558.4 | 0.1 | 55.6 |

</details>

_Generated 2026-10-23T04:11:16Z on Linux x86_64 (6.17.0-1022-azure). [Method and caveats](#benchmarks) · [raw JSON](bench/results.json)_
