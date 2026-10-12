![harness bench dashboard](bench/bench.svg)

| agent | bundle | `--version` | TUI 1st byte | TUI 1st input | input latency 1s | idle PSS |
|---|---|---|---|---|---|---|
| **fox-agent** | 120 MB | 15 ms | **16 ms** | — | — | 36 MB |
| claude code | 257 MB | 9 ms | **203 ms** | — | — | 187 MB |
| codex | 140 MB | 41 ms | **47 ms** | — | — | 49 MB |
| opencode v2 | 207 MB | 79 ms | **133 ms** | **494 ms** | **58 ms** | 128 MB |
| jcode | 138 MB | 7 ms | **11 ms** | — | — | 27 MB |
| pi | 140 MB | 215 ms | **290 ms** | **809 ms** | **8 ms** | 131 MB |
| gemini cli | 140 MB | 1367 ms | **1444 ms** | **1465 ms** | **0 ms** | — |
| copilot cli | 140 MB | 96 ms | **739 ms** | — | — | 47 MB |
| crush | 140 MB | 135 ms | **463 ms** | — | — | 69 MB |
| goose | 308 MB | 6 ms | **6 ms** | **180 ms** | **0 ms** | — |
| aider | 140 MB | 712 ms | **638 ms** | **1025 ms** | **9 ms** | 67 MB |
| amp | 134 MB | 239 ms | **249 ms** | **613 ms** | **1 ms** | 162 MB |
| cursor-agent | 140 MB | 409 ms | **404 ms** | — | — | 215 MB |
| qwen code | 140 MB | 36 ms | **756 ms** | — | — | 264 MB |
| codebuff | 140 MB | 910 ms | **903 ms** | — | — | 58 MB |
| kilo code | 140 MB | 868 ms | **2505 ms** | — | — | 46 MB |
| droid | 281 MB | 77 ms | **99 ms** | — | — | 219 MB |
| kimi code | 191 MB | 530 ms | **671 ms** | — | — | 350 MB |
| devin | 195 MB | 3 ms | **40 ms** | — | — | 49 MB |
| cline | 140 MB | 969 ms | **1128 ms** | — | — | 55 MB |
| continue | 140 MB | 1007 ms | — | — | — | 319 MB |
| iflow cli | 140 MB | 1101 ms | **1190 ms** | **2030 ms** | **48 ms** | 57 MB |

<details><summary>full precision · all collected fields</summary>

| agent | version | bin | bundle (MB) | bundle kind | `--version` (ms) | TUI 1st byte (ms) | TUI 1st input (ms) | input latency 1s (ms) | idle PSS (MB) |
|---|---|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.5.0-beta.1 | `/home/runner/work/fox-agent/fox-agent/bin/fox` | 120.3 | bin | 14.6 | 15.8 | — | — | 36.4 |
| claude code | 2.1.296 (Claude Code) | `/home/runner/.npm-global/bin/claude` | 257.1 | bin | 9.0 | 203.1 | — | — | 187.5 |
| codex | codex-cli 0.162.1 | `/home/runner/.npm-global/bin/codex` | 140.0 | bin | 41.0 | 46.9 | — | — | 49.1 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | `/home/runner/.npm-global/bin/opencode2` | 207.4 | bin | 79.2 | 133.1 | 493.8 | 57.6 | 128.5 |
| jcode | jcode v0.95.0 (6487bbd7e) | `/home/runner/.local/bin/jcode` | 138.2 | bin | 7.4 | 10.6 | — | — | 27.3 |
| pi | 1.1.0 | `/home/runner/.npm-global/bin/pi` | 140.0 | bin | 215.0 | 290.2 | 809.3 | 7.6 | 131.1 |
| gemini cli | 0.63.0 | `/home/runner/.npm-global/bin/gemini` | 140.0 | bin | 1367.0 | 1443.6 | 1464.7 | 0.1 | — |
| copilot cli | GitHub Copilot CLI 1.0.95. | `/home/runner/.npm-global/bin/copilot` | 140.0 | bin | 95.9 | 738.5 | — | — | 47.3 |
| crush | crush version v0.98.1 | `/home/runner/.npm-global/bin/crush` | 140.0 | bin | 134.9 | 462.6 | — | — | 68.6 |
| goose | 1.54.0 | `/home/runner/.local/bin/goose` | 307.8 | bin | 6.4 | 6.3 | 180.5 | 0.1 | — |
| aider | aider 0.86.2 | `/home/runner/work/fox-agent/fox-agent/.venv-bench/bin/aider` | 140.0 | bin | 711.8 | 638.3 | 1025.4 | 8.9 | 66.9 |
| amp | 0.0.1791778148-g902162 (released 2026-10-12T04:09:08.000Z, 1 | `/home/runner/.local/bin/amp` | 134.2 | bin | 238.5 | 248.6 | 612.6 | 0.7 | 161.7 |
| cursor-agent | 2026.10.01-e373342 | `/home/runner/.local/bin/cursor-agent` | 140.0 | bin | 409.2 | 404.4 | — | — | 215.0 |
| qwen code | 0.25.1 | `/home/runner/.npm-global/bin/qwen` | 140.0 | bin | 36.4 | 755.7 | — | — | 263.6 |
| codebuff | 1.0.688 | `/home/runner/.npm-global/bin/codebuff` | 140.0 | bin | 909.5 | 902.7 | — | — | 57.7 |
| kilo code | 7.8.8 | `/home/runner/.npm-global/bin/kilocode` | 140.0 | bin | 868.4 | 2504.9 | — | — | 46.2 |
| droid | 0.238.0 | `/home/runner/.local/bin/droid` | 281.4 | bin | 76.6 | 98.5 | — | — | 219.1 |
| kimi code | 2.1.1 | `/home/runner/.kimi-code/bin/kimi` | 190.8 | bin | 529.8 | 671.3 | — | — | 350.3 |
| devin | devin 3000.11.3 (9c803229faa4) | `/home/runner/.local/bin/devin` | 195.0 | bin | 2.9 | 40.1 | — | — | 48.6 |
| cline | 3.0.70 | `/home/runner/.npm-global/bin/cline` | 140.0 | bin | 969.4 | 1127.6 | — | — | 55.0 |
| continue | 1.5.47 | `/home/runner/.npm-global/bin/cn` | 140.0 | bin | 1007.1 | — | — | — | 319.0 |
| iflow cli | 0.5.19 | `/home/runner/.npm-global/bin/iflow` | 140.0 | bin | 1100.9 | 1190.2 | 2030.2 | 47.9 | 57.4 |

</details>

fox-agent headless vs scripted local provider: time to first token **59 ms**, peak RSS **61 MB**.

_Generated 2026-10-12T06:15:38Z on Linux x86_64 (6.17.0-1022-azure). [How this is measured](#benchmarks) · [raw JSON](bench/results.json)_
