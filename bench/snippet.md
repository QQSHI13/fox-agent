![harness bench dashboard](bench/bench.svg)

| agent | bundle | `--version` | TUI 1st byte | TUI 1st input | input latency 1s | idle PSS |
|---|---|---|---|---|---|---|
| **fox-agent** | 99 MB | 14 ms | **18 ms** | **380 ms** | **1 ms** | 35 MB |
| claude code | 286 MB | 10 ms | **213 ms** | — | — | 191 MB |
| codex | 140 MB | 42 ms | **44 ms** | **859 ms** | **2 ms** | 49 MB |
| opencode v2 | 207 MB | 85 ms | **135 ms** | **505 ms** | **58 ms** | 130 MB |
| jcode | 167 MB | 9 ms | **11 ms** | **765 ms** | **0 ms** | 30 MB |
| pi | 140 MB | 245 ms | **327 ms** | **854 ms** | **8 ms** | 130 MB |
| gemini cli | 140 MB | 1513 ms | **1627 ms** | **1655 ms** | **0 ms** | 146 MB |
| copilot cli | 140 MB | 102 ms | **775 ms** | — | — | 47 MB |
| crush | 140 MB | 138 ms | **440 ms** | **914 ms** | **73 ms** | 69 MB |
| goose | 304 MB | 8 ms | **8 ms** | **368 ms** | **0 ms** | 107 MB |
| aider | 140 MB | 830 ms | **742 ms** | **1136 ms** | **10 ms** | 67 MB |
| amp | 135 MB | 261 ms | **268 ms** | **628 ms** | **1 ms** | 162 MB |
| cursor-agent | 140 MB | 453 ms | **435 ms** | **809 ms** | — | 237 MB |
| qwen code | 140 MB | 37 ms | **830 ms** | **1301 ms** | — | 245 MB |
| codebuff | 140 MB | 922 ms | **911 ms** | **1440 ms** | **111 ms** | 58 MB |
| kilo code | 140 MB | 845 ms | **2525 ms** | **6496 ms** | **1651 ms** | 46 MB |
| droid | 294 MB | 113 ms | **137 ms** | **3230 ms** | **738 ms** | 278 MB |
| kimi code | 192 MB | 577 ms | **733 ms** | **1135 ms** | **4 ms** | 352 MB |
| devin | 200 MB | 4 ms | **23 ms** | **1028 ms** | **1641 ms** | 92 MB |
| cline | 140 MB | 944 ms | **1192 ms** | — | — | 55 MB |
| continue | 140 MB | 1099 ms | — | — | — | 317 MB |
| iflow cli | 140 MB | 1208 ms | **1305 ms** | **2078 ms** | **46 ms** | 56 MB |

<details><summary>full precision · all collected fields</summary>

| agent | version | bin | bundle (MB) | bundle kind | `--version` (ms) | TUI 1st byte (ms) | TUI 1st input (ms) | input latency 1s (ms) | idle PSS (MB) |
|---|---|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.6.0 | `/home/runner/work/fox-agent/fox-agent/bin/fox` | 99.0 | bin | 14.5 | 18.1 | 379.6 | 0.6 | 35.1 |
| claude code | 2.1.302 (Claude Code) | `/home/runner/.npm-global/bin/claude` | 285.8 | bin | 9.8 | 212.6 | — | — | 190.7 |
| codex | codex-cli 0.163.0 | `/home/runner/.npm-global/bin/codex` | 140.0 | bin | 42.4 | 44.3 | 858.6 | 1.6 | 49.1 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | `/home/runner/.npm-global/bin/opencode2` | 207.4 | bin | 85.3 | 135.4 | 505.1 | 58.3 | 130.1 |
| jcode | jcode v0.98.1 (1c7426eb1) | `/home/runner/.local/bin/jcode` | 166.8 | bin | 9.0 | 11.3 | 764.6 | 0.4 | 30.3 |
| pi | 1.3.0 | `/home/runner/.npm-global/bin/pi` | 140.0 | bin | 245.2 | 327.0 | 853.8 | 8.4 | 130.3 |
| gemini cli | 0.64.0 | `/home/runner/.npm-global/bin/gemini` | 140.0 | bin | 1513.5 | 1627.0 | 1655.1 | 0.1 | 146.1 |
| copilot cli | GitHub Copilot CLI 1.0.98. | `/home/runner/.npm-global/bin/copilot` | 140.0 | bin | 102.3 | 775.1 | — | — | 47.4 |
| crush | crush version v0.98.1 | `/home/runner/.npm-global/bin/crush` | 140.0 | bin | 137.9 | 440.0 | 913.5 | 72.6 | 68.7 |
| goose | 1.55.0 | `/home/runner/.local/bin/goose` | 304.0 | bin | 7.7 | 7.9 | 368.4 | 0.2 | 107.4 |
| aider | aider 0.86.2 | `/home/runner/work/fox-agent/fox-agent/.venv-bench/bin/aider` | 140.0 | bin | 829.8 | 741.9 | 1136.2 | 10.1 | 67.0 |
| amp | 0.0.1792224035-gabd4f6 (released 2026-10-17T08:00:35.000Z, 2 | `/home/runner/.local/bin/amp` | 134.9 | bin | 261.1 | 267.9 | 628.2 | 0.5 | 162.2 |
| cursor-agent | 2026.10.16-e3cb207 | `/home/runner/.local/bin/cursor-agent` | 140.0 | bin | 453.2 | 435.1 | 809.1 | — | 237.1 |
| qwen code | 0.25.2 | `/home/runner/.npm-global/bin/qwen` | 140.0 | bin | 36.9 | 830.3 | 1300.7 | — | 245.4 |
| codebuff | 1.0.688 | `/home/runner/.npm-global/bin/codebuff` | 140.0 | bin | 922.3 | 911.4 | 1440.4 | 111.2 | 57.5 |
| kilo code | 7.8.12 | `/home/runner/.npm-global/bin/kilocode` | 140.0 | bin | 845.3 | 2524.7 | 6496.1 | 1650.6 | 46.2 |
| droid | 0.244.0 | `/home/runner/.local/bin/droid` | 294.4 | bin | 113.3 | 136.7 | 3229.8 | 738.5 | 277.6 |
| kimi code | 2.2.0 | `/home/runner/.kimi-code/bin/kimi` | 191.9 | bin | 576.9 | 733.2 | 1135.4 | 4.5 | 351.8 |
| devin | devin 3000.11.92 (7f4e64980e22) | `/home/runner/.local/bin/devin` | 200.4 | bin | 4.4 | 22.8 | 1028.1 | 1641.0 | 91.9 |
| cline | 3.0.73 | `/home/runner/.npm-global/bin/cline` | 140.0 | bin | 944.3 | 1191.7 | — | — | 55.0 |
| continue | 1.5.47 | `/home/runner/.npm-global/bin/cn` | 140.0 | bin | 1098.7 | — | — | — | 317.3 |
| iflow cli | 0.5.19 | `/home/runner/.npm-global/bin/iflow` | 140.0 | bin | 1207.9 | 1304.5 | 2078.4 | 46.3 | 55.5 |

</details>

fox-agent headless vs scripted local provider: time to first token **62 ms**, peak RSS **60 MB**.

_Generated 2026-10-17T10:16:17Z on Linux x86_64 (6.17.0-1022-azure). [How this is measured](#benchmarks) · [raw JSON](bench/results.json)_
