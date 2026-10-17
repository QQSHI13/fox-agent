![harness bench dashboard](bench/bench.svg)

| agent | bundle | `--version` | TUI 1st byte | TUI 1st input | input latency 1s | idle PSS |
|---|---|---|---|---|---|---|
| **fox-agent** | 99 MB | 12 ms | **14 ms** | **374 ms** | **1 ms** | 35 MB |
| claude code | 286 MB | 8 ms | **168 ms** | — | — | 190 MB |
| codex | 140 MB | 37 ms | **39 ms** | **747 ms** | **2 ms** | 49 MB |
| opencode v2 | 207 MB | 64 ms | **104 ms** | **470 ms** | **50 ms** | 125 MB |
| jcode | 167 MB | 8 ms | **11 ms** | **698 ms** | **0 ms** | 31 MB |
| pi | 140 MB | 190 ms | **247 ms** | **759 ms** | **6 ms** | 131 MB |
| gemini cli | 140 MB | 1160 ms | **1242 ms** | **1287 ms** | **0 ms** | — |
| copilot cli | 140 MB | 87 ms | **631 ms** | — | — | 47 MB |
| crush | 140 MB | 121 ms | **240 ms** | **647 ms** | **56 ms** | 69 MB |
| goose | 304 MB | 7 ms | **7 ms** | **368 ms** | **0 ms** | 108 MB |
| aider | 140 MB | 636 ms | **557 ms** | **956 ms** | **8 ms** | 67 MB |
| amp | 135 MB | 202 ms | **204 ms** | **569 ms** | **0 ms** | 162 MB |
| cursor-agent | 140 MB | 351 ms | **331 ms** | — | — | 236 MB |
| qwen code | 140 MB | 32 ms | **642 ms** | **1065 ms** | — | 291 MB |
| codebuff | 140 MB | 746 ms | **729 ms** | **1241 ms** | **107 ms** | 58 MB |
| kilo code | 140 MB | 694 ms | **2025 ms** | **5449 ms** | **1099 ms** | 46 MB |
| droid | 294 MB | 88 ms | **77 ms** | **3153 ms** | **710 ms** | 274 MB |
| kimi code | 192 MB | 503 ms | **598 ms** | **974 ms** | **4 ms** | 353 MB |
| devin | 200 MB | 4 ms | **19 ms** | **1022 ms** | **1641 ms** | 92 MB |
| cline | 140 MB | 706 ms | **912 ms** | — | — | 55 MB |
| continue | 140 MB | 871 ms | — | — | — | 318 MB |
| iflow cli | 140 MB | 953 ms | **1017 ms** | **1763 ms** | **46 ms** | 58 MB |

<details><summary>full precision · all collected fields</summary>

| agent | version | bin | bundle (MB) | bundle kind | `--version` (ms) | TUI 1st byte (ms) | TUI 1st input (ms) | input latency 1s (ms) | idle PSS (MB) |
|---|---|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.5.0-beta.1 | `/home/runner/work/fox-agent/fox-agent/bin/fox` | 99.0 | bin | 12.4 | 14.4 | 374.0 | 0.6 | 35.0 |
| claude code | 2.1.302 (Claude Code) | `/home/runner/.npm-global/bin/claude` | 285.8 | bin | 8.3 | 168.0 | — | — | 190.2 |
| codex | codex-cli 0.163.0 | `/home/runner/.npm-global/bin/codex` | 140.0 | bin | 36.8 | 38.8 | 747.4 | 1.5 | 49.0 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | `/home/runner/.npm-global/bin/opencode2` | 207.4 | bin | 64.1 | 104.0 | 470.1 | 49.7 | 124.8 |
| jcode | jcode v0.98.1 (1c7426eb1) | `/home/runner/.local/bin/jcode` | 166.8 | bin | 8.2 | 10.5 | 697.7 | 0.3 | 30.5 |
| pi | 1.3.0 | `/home/runner/.npm-global/bin/pi` | 140.0 | bin | 190.4 | 247.3 | 759.3 | 6.3 | 131.2 |
| gemini cli | 0.64.0 | `/home/runner/.npm-global/bin/gemini` | 140.0 | bin | 1159.8 | 1242.2 | 1287.0 | 0.1 | — |
| copilot cli | GitHub Copilot CLI 1.0.98. | `/home/runner/.npm-global/bin/copilot` | 140.0 | bin | 86.6 | 631.4 | — | — | 47.3 |
| crush | crush version v0.98.1 | `/home/runner/.npm-global/bin/crush` | 140.0 | bin | 121.0 | 239.9 | 647.0 | 56.4 | 68.5 |
| goose | 1.55.0 | `/home/runner/.local/bin/goose` | 304.0 | bin | 6.6 | 6.6 | 367.5 | 0.2 | 108.5 |
| aider | aider 0.86.2 | `/home/runner/work/fox-agent/fox-agent/.venv-bench/bin/aider` | 140.0 | bin | 635.8 | 557.3 | 955.6 | 7.8 | 66.9 |
| amp | 0.0.1792195263-g037e53 (released 2026-10-17T00:01:03.000Z, 3 | `/home/runner/.local/bin/amp` | 134.9 | bin | 201.8 | 203.6 | 568.7 | 0.4 | 162.0 |
| cursor-agent | 2026.10.16-e3cb207 | `/home/runner/.local/bin/cursor-agent` | 140.0 | bin | 350.8 | 331.0 | — | — | 236.3 |
| qwen code | 0.25.2 | `/home/runner/.npm-global/bin/qwen` | 140.0 | bin | 32.5 | 641.6 | 1065.0 | — | 291.1 |
| codebuff | 1.0.688 | `/home/runner/.npm-global/bin/codebuff` | 140.0 | bin | 746.2 | 728.9 | 1241.0 | 107.3 | 57.7 |
| kilo code | 7.8.12 | `/home/runner/.npm-global/bin/kilocode` | 140.0 | bin | 693.6 | 2024.5 | 5448.9 | 1098.8 | 46.2 |
| droid | 0.244.0 | `/home/runner/.local/bin/droid` | 294.4 | bin | 88.3 | 77.1 | 3152.6 | 710.2 | 274.2 |
| kimi code | 2.2.0 | `/home/runner/.kimi-code/bin/kimi` | 191.9 | bin | 502.7 | 598.1 | 973.9 | 3.6 | 353.1 |
| devin | devin 3000.11.92 (7f4e64980e22) | `/home/runner/.local/bin/devin` | 200.4 | bin | 3.6 | 19.4 | 1022.2 | 1641.0 | 92.1 |
| cline | 3.0.72 | `/home/runner/.npm-global/bin/cline` | 140.0 | bin | 706.0 | 912.4 | — | — | 55.0 |
| continue | 1.5.47 | `/home/runner/.npm-global/bin/cn` | 140.0 | bin | 871.0 | — | — | — | 318.1 |
| iflow cli | 0.5.19 | `/home/runner/.npm-global/bin/iflow` | 140.0 | bin | 952.8 | 1017.5 | 1763.1 | 45.8 | 57.9 |

</details>

fox-agent headless vs scripted local provider: time to first token **50 ms**, peak RSS **60 MB**.

_Generated 2026-10-17T03:57:05Z on Linux x86_64 (6.17.0-1022-azure). [How this is measured](#benchmarks) · [raw JSON](bench/results.json)_
