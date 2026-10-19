![harness bench dashboard](bench/bench.svg)

| agent | bundle | `--version` | TUI 1st byte | TUI 1st input | input latency 1s | idle PSS |
|---|---|---|---|---|---|---|
| **fox-agent** | 99 MB | 12 ms | **14 ms** | **373 ms** | **1 ms** | 35 MB |
| claude code | 286 MB | 9 ms | **150 ms** | — | — | 191 MB |
| codex | 140 MB | 31 ms | **34 ms** | **785 ms** | **0 ms** | 49 MB |
| opencode v2 | 207 MB | 54 ms | **88 ms** | **451 ms** | **44 ms** | 125 MB |
| jcode | 170 MB | 7 ms | **9 ms** | **709 ms** | **0 ms** | 32 MB |
| pi | 140 MB | 156 ms | **203 ms** | **706 ms** | **6 ms** | 131 MB |
| gemini cli | 140 MB | 935 ms | **972 ms** | **1035 ms** | — | — |
| copilot cli | 140 MB | 72 ms | **521 ms** | — | — | 47 MB |
| crush | 140 MB | 102 ms | **312 ms** | **717 ms** | **39 ms** | 69 MB |
| goose | 304 MB | 6 ms | **6 ms** | **366 ms** | **0 ms** | 109 MB |
| aider | 140 MB | 500 ms | **410 ms** | **814 ms** | **6 ms** | 67 MB |
| amp | 135 MB | 162 ms | **167 ms** | **530 ms** | **0 ms** | 163 MB |
| cursor-agent | 140 MB | 278 ms | **256 ms** | — | — | 237 MB |
| qwen code | 140 MB | 26 ms | **530 ms** | **955 ms** | — | 295 MB |
| codebuff | 140 MB | 659 ms | **614 ms** | **1175 ms** | **106 ms** | 58 MB |
| kilo code | 140 MB | 590 ms | **1650 ms** | **4837 ms** | **797 ms** | 46 MB |
| droid | 294 MB | 61 ms | **66 ms** | **3114 ms** | **724 ms** | 279 MB |
| kimi code | 192 MB | 372 ms | **477 ms** | **861 ms** | **3 ms** | 355 MB |
| devin | 200 MB | 3 ms | **17 ms** | **1020 ms** | **1641 ms** | 96 MB |
| cline | 140 MB | 592 ms | **808 ms** | — | — | 55 MB |
| continue | 140 MB | 663 ms | — | — | — | 318 MB |
| iflow cli | 140 MB | 781 ms | **816 ms** | **1576 ms** | **44 ms** | 58 MB |

<details><summary>full precision · all collected fields</summary>

| agent | version | bin | bundle (MB) | bundle kind | `--version` (ms) | TUI 1st byte (ms) | TUI 1st input (ms) | input latency 1s (ms) | idle PSS (MB) |
|---|---|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.6.0 | `/home/runner/work/fox-agent/fox-agent/bin/fox` | 99.0 | bin | 12.3 | 13.9 | 373.4 | 0.5 | 35.4 |
| claude code | 2.1.303 (Claude Code) | `/home/runner/.npm-global/bin/claude` | 285.8 | bin | 8.8 | 150.2 | — | — | 191.1 |
| codex | codex-cli 0.163.0 | `/home/runner/.npm-global/bin/codex` | 140.0 | bin | 30.8 | 34.1 | 784.6 | 0.5 | 49.0 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | `/home/runner/.npm-global/bin/opencode2` | 207.4 | bin | 54.3 | 88.1 | 451.4 | 44.1 | 124.5 |
| jcode | jcode v0.99.0 (774613c90) | `/home/runner/.local/bin/jcode` | 169.6 | bin | 6.8 | 8.8 | 708.7 | 0.3 | 31.7 |
| pi | 1.3.0 | `/home/runner/.npm-global/bin/pi` | 140.0 | bin | 155.6 | 203.4 | 705.9 | 5.5 | 131.3 |
| gemini cli | 0.64.0 | `/home/runner/.npm-global/bin/gemini` | 140.0 | bin | 935.3 | 971.8 | 1035.4 | — | — |
| copilot cli | GitHub Copilot CLI 1.0.98. | `/home/runner/.npm-global/bin/copilot` | 140.0 | bin | 72.5 | 521.0 | — | — | 47.3 |
| crush | crush version v0.98.1 | `/home/runner/.npm-global/bin/crush` | 140.0 | bin | 101.9 | 311.9 | 717.2 | 39.3 | 68.7 |
| goose | 1.55.0 | `/home/runner/.local/bin/goose` | 304.0 | bin | 5.9 | 5.7 | 366.3 | 0.2 | 108.8 |
| aider | aider 0.86.2 | `/home/runner/work/fox-agent/fox-agent/.venv-bench/bin/aider` | 140.0 | bin | 500.3 | 409.8 | 814.2 | 5.8 | 66.9 |
| amp | 0.0.1792397088-g3c824b (released 2026-10-19T08:04:48.000Z, 2 | `/home/runner/.local/bin/amp` | 135.0 | bin | 162.1 | 166.5 | 529.9 | 0.5 | 163.2 |
| cursor-agent | 2026.10.16-e3cb207 | `/home/runner/.local/bin/cursor-agent` | 140.0 | bin | 277.6 | 256.0 | — | — | 236.8 |
| qwen code | 0.25.3 | `/home/runner/.npm-global/bin/qwen` | 140.0 | bin | 26.5 | 530.0 | 955.1 | — | 295.1 |
| codebuff | 1.0.688 | `/home/runner/.npm-global/bin/codebuff` | 140.0 | bin | 659.0 | 614.0 | 1175.0 | 106.1 | 57.7 |
| kilo code | 7.8.12 | `/home/runner/.npm-global/bin/kilocode` | 140.0 | bin | 590.0 | 1649.8 | 4837.4 | 797.1 | 46.2 |
| droid | 0.244.0 | `/home/runner/.local/bin/droid` | 294.4 | bin | 60.6 | 66.2 | 3114.4 | 723.6 | 278.6 |
| kimi code | 2.2.0 | `/home/runner/.kimi-code/bin/kimi` | 191.9 | bin | 372.4 | 477.2 | 860.9 | 3.0 | 355.3 |
| devin | devin 3000.11.92 (7f4e64980e22) | `/home/runner/.local/bin/devin` | 200.4 | bin | 3.3 | 16.7 | 1019.5 | 1640.9 | 96.3 |
| cline | 3.0.73 | `/home/runner/.npm-global/bin/cline` | 140.0 | bin | 592.3 | 808.5 | — | — | 54.9 |
| continue | 1.5.47 | `/home/runner/.npm-global/bin/cn` | 140.0 | bin | 663.4 | — | — | — | 317.9 |
| iflow cli | 0.5.19 | `/home/runner/.npm-global/bin/iflow` | 140.0 | bin | 780.9 | 815.9 | 1576.2 | 43.9 | 58.1 |

</details>

fox-agent headless vs scripted local provider: time to first token **48 ms**, peak RSS **60 MB**.

_Generated 2026-10-19T10:31:55Z on Linux x86_64 (6.17.0-1022-azure). [How this is measured](#benchmarks) · [raw JSON](bench/results.json)_
