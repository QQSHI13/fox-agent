![harness bench dashboard](bench/bench.svg)

| agent | bundle | `--version` | TUI 1st byte | TUI 1st input | input latency 1s | idle PSS |
|---|---|---|---|---|---|---|
| **fox-agent** | 99 MB | 16 ms | **20 ms** | **378 ms** | **1 ms** | 35 MB |
| claude code | 286 MB | 9 ms | **224 ms** | — | — | 191 MB |
| codex | 140 MB | 44 ms | **46 ms** | **810 ms** | **1 ms** | 49 MB |
| opencode v2 | 207 MB | 81 ms | **130 ms** | **504 ms** | **67 ms** | 129 MB |
| jcode | 170 MB | 10 ms | **13 ms** | **764 ms** | **0 ms** | 32 MB |
| pi | 140 MB | 262 ms | **324 ms** | **834 ms** | **9 ms** | 129 MB |
| gemini cli | 140 MB | 1519 ms | **1628 ms** | **1687 ms** | — | 146 MB |
| copilot cli | 140 MB | 104 ms | **783 ms** | — | — | 47 MB |
| crush | 140 MB | 150 ms | **442 ms** | **890 ms** | **72 ms** | 69 MB |
| goose | 304 MB | 7 ms | **7 ms** | **368 ms** | **0 ms** | 108 MB |
| aider | 140 MB | 813 ms | **735 ms** | **1122 ms** | **10 ms** | 67 MB |
| amp | 135 MB | 248 ms | **264 ms** | **624 ms** | **1 ms** | 160 MB |
| cursor-agent | 140 MB | 445 ms | **439 ms** | **837 ms** | — | 236 MB |
| qwen code | 140 MB | 37 ms | **837 ms** | **1310 ms** | — | 235 MB |
| codebuff | 140 MB | 912 ms | **913 ms** | **1419 ms** | **112 ms** | 58 MB |
| kilo code | 140 MB | 891 ms | **2616 ms** | **6669 ms** | **1719 ms** | 46 MB |
| droid | 294 MB | 113 ms | **123 ms** | **740 ms** | **733 ms** | 277 MB |
| kimi code | 192 MB | 584 ms | **745 ms** | **1196 ms** | **5 ms** | 352 MB |
| devin | 200 MB | 5 ms | **24 ms** | **1027 ms** | **1640 ms** | 92 MB |
| cline | 140 MB | 901 ms | **1204 ms** | — | — | 55 MB |
| continue | 140 MB | 1145 ms | — | — | — | 317 MB |
| iflow cli | 140 MB | 1205 ms | **1265 ms** | **2086 ms** | **46 ms** | 56 MB |

<details><summary>full precision · all collected fields</summary>

| agent | version | bin | bundle (MB) | bundle kind | `--version` (ms) | TUI 1st byte (ms) | TUI 1st input (ms) | input latency 1s (ms) | idle PSS (MB) |
|---|---|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.6.0 | `/home/runner/work/fox-agent/fox-agent/bin/fox` | 99.1 | bin | 16.4 | 19.6 | 378.2 | 0.7 | 35.4 |
| claude code | 2.1.303 (Claude Code) | `/home/runner/.npm-global/bin/claude` | 285.8 | bin | 9.2 | 224.4 | — | — | 191.4 |
| codex | codex-cli 0.163.0 | `/home/runner/.npm-global/bin/codex` | 140.0 | bin | 44.0 | 45.7 | 809.9 | 0.6 | 49.1 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | `/home/runner/.npm-global/bin/opencode2` | 207.4 | bin | 80.6 | 129.9 | 503.7 | 66.7 | 129.1 |
| jcode | jcode v0.99.0 (774613c90) | `/home/runner/.local/bin/jcode` | 169.6 | bin | 10.2 | 13.0 | 763.8 | 0.4 | 32.2 |
| pi | 1.3.0 | `/home/runner/.npm-global/bin/pi` | 140.0 | bin | 262.0 | 323.6 | 834.1 | 8.5 | 129.1 |
| gemini cli | 0.64.0 | `/home/runner/.npm-global/bin/gemini` | 140.0 | bin | 1519.4 | 1628.1 | 1687.5 | — | 146.2 |
| copilot cli | GitHub Copilot CLI 1.0.98. | `/home/runner/.npm-global/bin/copilot` | 140.0 | bin | 103.7 | 782.5 | — | — | 47.4 |
| crush | crush version v0.98.1 | `/home/runner/.npm-global/bin/crush` | 140.0 | bin | 149.8 | 441.9 | 889.9 | 72.4 | 68.7 |
| goose | 1.55.0 | `/home/runner/.local/bin/goose` | 304.0 | bin | 7.3 | 7.0 | 367.9 | 0.2 | 108.5 |
| aider | aider 0.86.2 | `/home/runner/work/fox-agent/fox-agent/.venv-bench/bin/aider` | 140.0 | bin | 812.9 | 734.6 | 1122.4 | 10.3 | 66.8 |
| amp | 0.0.1792397088-g3c824b (released 2026-10-19T08:04:48.000Z, 3 | `/home/runner/.local/bin/amp` | 135.0 | bin | 248.3 | 263.8 | 624.1 | 0.6 | 160.1 |
| cursor-agent | 2026.10.16-e3cb207 | `/home/runner/.local/bin/cursor-agent` | 140.0 | bin | 445.0 | 439.0 | 836.6 | — | 235.9 |
| qwen code | 0.25.3 | `/home/runner/.npm-global/bin/qwen` | 140.0 | bin | 37.1 | 836.7 | 1310.5 | — | 235.3 |
| codebuff | 1.0.688 | `/home/runner/.npm-global/bin/codebuff` | 140.0 | bin | 912.2 | 912.7 | 1419.3 | 111.6 | 57.5 |
| kilo code | 7.8.12 | `/home/runner/.npm-global/bin/kilocode` | 140.0 | bin | 890.8 | 2616.2 | 6669.3 | 1719.0 | 46.2 |
| droid | 0.244.0 | `/home/runner/.local/bin/droid` | 294.4 | bin | 112.7 | 122.7 | 740.2 | 733.1 | 276.6 |
| kimi code | 2.2.0 | `/home/runner/.kimi-code/bin/kimi` | 191.9 | bin | 583.6 | 745.2 | 1195.8 | 4.6 | 351.9 |
| devin | devin 3000.11.92 (7f4e64980e22) | `/home/runner/.local/bin/devin` | 200.4 | bin | 4.9 | 23.8 | 1027.3 | 1640.1 | 92.0 |
| cline | 3.0.73 | `/home/runner/.npm-global/bin/cline` | 140.0 | bin | 900.8 | 1204.2 | — | — | 55.0 |
| continue | 1.5.47 | `/home/runner/.npm-global/bin/cn` | 140.0 | bin | 1144.5 | — | — | — | 317.1 |
| iflow cli | 0.5.19 | `/home/runner/.npm-global/bin/iflow` | 140.0 | bin | 1205.1 | 1265.3 | 2085.8 | 45.5 | 55.5 |

</details>

fox-agent headless vs scripted local provider: time to first token **59 ms**, peak RSS **61 MB**.

_Generated 2026-10-19T11:33:24Z on Linux x86_64 (6.17.0-1022-azure). [How this is measured](#benchmarks) · [raw JSON](bench/results.json)_
