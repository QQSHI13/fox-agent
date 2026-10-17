![harness bench dashboard](bench/bench.svg)

| agent | bundle | `--version` | TUI 1st byte | TUI 1st input | input latency 1s | idle PSS |
|---|---|---|---|---|---|---|
| **fox-agent** | 99 MB | 12 ms | **14 ms** | **374 ms** | **1 ms** | 35 MB |
| claude code | 286 MB | 8 ms | **164 ms** | — | — | 190 MB |
| codex | 140 MB | 35 ms | **36 ms** | **794 ms** | **0 ms** | 49 MB |
| opencode v2 | 207 MB | 64 ms | **105 ms** | **471 ms** | **53 ms** | 125 MB |
| jcode | 167 MB | 8 ms | **10 ms** | **694 ms** | **0 ms** | 30 MB |
| pi | 140 MB | 184 ms | **242 ms** | **725 ms** | **6 ms** | 131 MB |
| gemini cli | 140 MB | 1136 ms | **1227 ms** | **1229 ms** | — | — |
| copilot cli | 140 MB | 84 ms | **625 ms** | — | — | 47 MB |
| crush | 140 MB | 123 ms | **341 ms** | **886 ms** | **56 ms** | 69 MB |
| goose | 304 MB | 6 ms | **6 ms** | **367 ms** | **0 ms** | 107 MB |
| aider | 140 MB | 609 ms | **556 ms** | **943 ms** | **8 ms** | 67 MB |
| amp | 135 MB | 196 ms | **202 ms** | **567 ms** | **0 ms** | 163 MB |
| cursor-agent | 140 MB | 357 ms | **336 ms** | — | — | 237 MB |
| qwen code | 140 MB | 31 ms | **637 ms** | **1067 ms** | — | 290 MB |
| codebuff | 140 MB | 755 ms | **716 ms** | **1229 ms** | **107 ms** | 58 MB |
| kilo code | 140 MB | 708 ms | **2082 ms** | **5725 ms** | **1273 ms** | 46 MB |
| droid | 294 MB | 83 ms | **82 ms** | **3178 ms** | **726 ms** | 332 MB |
| kimi code | 192 MB | 459 ms | **588 ms** | **960 ms** | **3 ms** | 353 MB |
| devin | 200 MB | 4 ms | **18 ms** | **1025 ms** | **1641 ms** | 96 MB |
| cline | 140 MB | 711 ms | **928 ms** | — | — | 55 MB |
| continue | 140 MB | 878 ms | — | — | — | 318 MB |
| iflow cli | 140 MB | 936 ms | **993 ms** | **1769 ms** | **45 ms** | 57 MB |

<details><summary>full precision · all collected fields</summary>

| agent | version | bin | bundle (MB) | bundle kind | `--version` (ms) | TUI 1st byte (ms) | TUI 1st input (ms) | input latency 1s (ms) | idle PSS (MB) |
|---|---|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.5.0-beta.1 | `/home/runner/work/fox-agent/fox-agent/bin/fox` | 99.0 | bin | 12.3 | 14.0 | 374.3 | 0.6 | 35.1 |
| claude code | 2.1.302 (Claude Code) | `/home/runner/.npm-global/bin/claude` | 285.8 | bin | 8.4 | 163.9 | — | — | 190.2 |
| codex | codex-cli 0.163.0 | `/home/runner/.npm-global/bin/codex` | 140.0 | bin | 34.9 | 36.2 | 793.6 | 0.5 | 49.0 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | `/home/runner/.npm-global/bin/opencode2` | 207.4 | bin | 63.9 | 104.5 | 470.6 | 52.9 | 124.6 |
| jcode | jcode v0.98.1 (1c7426eb1) | `/home/runner/.local/bin/jcode` | 166.8 | bin | 7.6 | 9.7 | 694.1 | 0.3 | 30.2 |
| pi | 1.3.0 | `/home/runner/.npm-global/bin/pi` | 140.0 | bin | 183.5 | 241.6 | 724.6 | 6.3 | 130.5 |
| gemini cli | 0.64.0 | `/home/runner/.npm-global/bin/gemini` | 140.0 | bin | 1136.1 | 1226.5 | 1229.4 | — | — |
| copilot cli | GitHub Copilot CLI 1.0.98. | `/home/runner/.npm-global/bin/copilot` | 140.0 | bin | 83.9 | 624.9 | — | — | 47.3 |
| crush | crush version v0.98.1 | `/home/runner/.npm-global/bin/crush` | 140.0 | bin | 122.9 | 341.1 | 886.0 | 56.3 | 68.7 |
| goose | 1.55.0 | `/home/runner/.local/bin/goose` | 304.0 | bin | 6.2 | 5.7 | 366.6 | 0.1 | 107.4 |
| aider | aider 0.86.2 | `/home/runner/work/fox-agent/fox-agent/.venv-bench/bin/aider` | 140.0 | bin | 609.2 | 555.8 | 943.4 | 7.7 | 66.9 |
| amp | 0.0.1792195263-g037e53 (released 2026-10-17T00:01:03.000Z, 3 | `/home/runner/.local/bin/amp` | 134.9 | bin | 195.7 | 201.9 | 566.7 | 0.5 | 163.3 |
| cursor-agent | 2026.10.16-e3cb207 | `/home/runner/.local/bin/cursor-agent` | 140.0 | bin | 356.7 | 335.7 | — | — | 236.5 |
| qwen code | 0.25.2 | `/home/runner/.npm-global/bin/qwen` | 140.0 | bin | 30.8 | 637.1 | 1066.9 | — | 289.5 |
| codebuff | 1.0.688 | `/home/runner/.npm-global/bin/codebuff` | 140.0 | bin | 754.9 | 716.0 | 1228.8 | 107.0 | 57.7 |
| kilo code | 7.8.12 | `/home/runner/.npm-global/bin/kilocode` | 140.0 | bin | 708.4 | 2081.8 | 5725.4 | 1273.5 | 46.2 |
| droid | 0.244.0 | `/home/runner/.local/bin/droid` | 294.4 | bin | 83.2 | 81.9 | 3177.8 | 726.2 | 332.3 |
| kimi code | 2.2.0 | `/home/runner/.kimi-code/bin/kimi` | 191.9 | bin | 459.1 | 587.9 | 959.9 | 3.3 | 353.2 |
| devin | devin 3000.11.92 (7f4e64980e22) | `/home/runner/.local/bin/devin` | 200.4 | bin | 3.6 | 17.8 | 1024.7 | 1641.0 | 96.0 |
| cline | 3.0.72 | `/home/runner/.npm-global/bin/cline` | 140.0 | bin | 711.5 | 928.5 | — | — | 55.0 |
| continue | 1.5.47 | `/home/runner/.npm-global/bin/cn` | 140.0 | bin | 878.1 | — | — | — | 318.0 |
| iflow cli | 0.5.19 | `/home/runner/.npm-global/bin/iflow` | 140.0 | bin | 936.5 | 993.3 | 1768.6 | 45.0 | 57.2 |

</details>

fox-agent headless vs scripted local provider: time to first token **96 ms**, peak RSS **60 MB**.

_Generated 2026-10-17T03:40:49Z on Linux x86_64 (6.17.0-1022-azure). [How this is measured](#benchmarks) · [raw JSON](bench/results.json)_
