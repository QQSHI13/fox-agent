![harness bench dashboard](bench/bench.svg)

| agent | bundle | `--version` | TUI 1st byte | TUI 1st input | input latency 1s | idle PSS |
|---|---|---|---|---|---|---|
| **fox-agent** | 99 MB | 12 ms | **14 ms** | **376 ms** | **1 ms** | 35 MB |
| claude code | 286 MB | 7 ms | **200 ms** | — | — | 191 MB |
| codex | 140 MB | 38 ms | **41 ms** | **819 ms** | **2 ms** | 49 MB |
| opencode v2 | 207 MB | 74 ms | **124 ms** | **491 ms** | **64 ms** | 129 MB |
| jcode | 170 MB | 7 ms | **9 ms** | **672 ms** | **0 ms** | 31 MB |
| pi | 140 MB | 196 ms | **266 ms** | **750 ms** | **7 ms** | 132 MB |
| gemini cli | 140 MB | 1249 ms | **1285 ms** | **1333 ms** | — | — |
| copilot cli | 140 MB | 87 ms | **673 ms** | — | — | 47 MB |
| crush | 140 MB | 131 ms | **406 ms** | **823 ms** | **57 ms** | 69 MB |
| goose | 304 MB | 6 ms | **6 ms** | **366 ms** | **0 ms** | 109 MB |
| aider | 140 MB | 645 ms | **571 ms** | **953 ms** | **8 ms** | 67 MB |
| amp | 135 MB | 216 ms | **227 ms** | **588 ms** | **1 ms** | 161 MB |
| cursor-agent | 140 MB | 384 ms | **357 ms** | — | — | 238 MB |
| qwen code | 140 MB | 32 ms | **690 ms** | **1153 ms** | — | 291 MB |
| codebuff | 140 MB | 822 ms | **804 ms** | **1318 ms** | **107 ms** | 58 MB |
| kilo code | 140 MB | 785 ms | **2318 ms** | **5923 ms** | **1215 ms** | 46 MB |
| droid | 294 MB | 84 ms | **100 ms** | **3166 ms** | **710 ms** | 272 MB |
| kimi code | 192 MB | 491 ms | **610 ms** | **996 ms** | **4 ms** | 353 MB |
| devin | 200 MB | 3 ms | **16 ms** | **1022 ms** | **1640 ms** | 98 MB |
| cline | 140 MB | 814 ms | **1061 ms** | — | — | 55 MB |
| continue | 140 MB | 933 ms | — | — | — | 317 MB |
| iflow cli | 140 MB | 1033 ms | **1108 ms** | **1872 ms** | **46 ms** | 57 MB |

<details><summary>full precision · all collected fields</summary>

| agent | version | bin | bundle (MB) | bundle kind | `--version` (ms) | TUI 1st byte (ms) | TUI 1st input (ms) | input latency 1s (ms) | idle PSS (MB) |
|---|---|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.6.0 | `/home/runner/work/fox-agent/fox-agent/bin/fox` | 99.0 | bin | 11.6 | 14.1 | 375.5 | 0.6 | 34.8 |
| claude code | 2.1.303 (Claude Code) | `/home/runner/.npm-global/bin/claude` | 285.8 | bin | 6.7 | 199.9 | — | — | 191.2 |
| codex | codex-cli 0.163.0 | `/home/runner/.npm-global/bin/codex` | 140.0 | bin | 37.9 | 40.9 | 819.3 | 1.6 | 49.1 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | `/home/runner/.npm-global/bin/opencode2` | 207.4 | bin | 74.1 | 123.5 | 490.6 | 64.0 | 129.3 |
| jcode | jcode v0.99.0 (774613c90) | `/home/runner/.local/bin/jcode` | 169.6 | bin | 6.8 | 9.5 | 672.3 | 0.3 | 31.5 |
| pi | 1.3.0 | `/home/runner/.npm-global/bin/pi` | 140.0 | bin | 196.5 | 266.2 | 749.7 | 7.5 | 132.0 |
| gemini cli | 0.64.0 | `/home/runner/.npm-global/bin/gemini` | 140.0 | bin | 1248.6 | 1285.4 | 1333.0 | — | — |
| copilot cli | GitHub Copilot CLI 1.0.98. | `/home/runner/.npm-global/bin/copilot` | 140.0 | bin | 87.0 | 672.6 | — | — | 47.3 |
| crush | crush version v0.98.1 | `/home/runner/.npm-global/bin/crush` | 140.0 | bin | 130.6 | 406.5 | 823.3 | 56.6 | 68.6 |
| goose | 1.55.0 | `/home/runner/.local/bin/goose` | 304.0 | bin | 5.5 | 5.6 | 365.9 | 0.2 | 108.8 |
| aider | aider 0.86.2 | `/home/runner/work/fox-agent/fox-agent/.venv-bench/bin/aider` | 140.0 | bin | 644.8 | 570.6 | 953.2 | 7.9 | 66.9 |
| amp | 0.0.1792397088-g3c824b (released 2026-10-19T08:04:48.000Z, 2 | `/home/runner/.local/bin/amp` | 135.0 | bin | 215.7 | 226.7 | 588.4 | 0.7 | 161.0 |
| cursor-agent | 2026.10.16-e3cb207 | `/home/runner/.local/bin/cursor-agent` | 140.0 | bin | 384.1 | 356.9 | — | — | 237.8 |
| qwen code | 0.25.3 | `/home/runner/.npm-global/bin/qwen` | 140.0 | bin | 32.5 | 689.7 | 1153.0 | — | 291.0 |
| codebuff | 1.0.688 | `/home/runner/.npm-global/bin/codebuff` | 140.0 | bin | 822.2 | 804.4 | 1317.6 | 106.9 | 57.7 |
| kilo code | 7.8.12 | `/home/runner/.npm-global/bin/kilocode` | 140.0 | bin | 784.6 | 2317.6 | 5923.0 | 1214.5 | 46.2 |
| droid | 0.244.0 | `/home/runner/.local/bin/droid` | 294.4 | bin | 84.1 | 100.5 | 3166.1 | 709.9 | 272.4 |
| kimi code | 2.2.0 | `/home/runner/.kimi-code/bin/kimi` | 191.9 | bin | 490.8 | 609.9 | 996.4 | 3.6 | 353.3 |
| devin | devin 3000.11.92 (7f4e64980e22) | `/home/runner/.local/bin/devin` | 200.4 | bin | 2.6 | 15.9 | 1021.8 | 1640.2 | 98.3 |
| cline | 3.0.73 | `/home/runner/.npm-global/bin/cline` | 140.0 | bin | 814.2 | 1060.8 | — | — | 54.9 |
| continue | 1.5.47 | `/home/runner/.npm-global/bin/cn` | 140.0 | bin | 932.8 | — | — | — | 317.0 |
| iflow cli | 0.5.19 | `/home/runner/.npm-global/bin/iflow` | 140.0 | bin | 1033.2 | 1107.8 | 1871.8 | 45.9 | 57.0 |

</details>

fox-agent headless vs scripted local provider: time to first token **53 ms**, peak RSS **60 MB**.

_Generated 2026-10-19T10:40:23Z on Linux x86_64 (6.17.0-1022-azure). [How this is measured](#benchmarks) · [raw JSON](bench/results.json)_
