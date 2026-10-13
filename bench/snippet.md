![harness bench dashboard](bench/bench.svg)

| agent | bundle | `--version` | TUI 1st byte | TUI 1st input | input latency 1s | idle PSS |
|---|---|---|---|---|---|---|
| **fox-agent** | 99 MB | 16 ms | **17 ms** | **380 ms** | **1 ms** | 35 MB |
| claude code | 257 MB | 10 ms | **212 ms** | — | — | 188 MB |
| codex | 140 MB | 42 ms | **46 ms** | **831 ms** | **1 ms** | 49 MB |
| opencode v2 | 207 MB | 87 ms | **154 ms** | **508 ms** | **62 ms** | 127 MB |
| jcode | 138 MB | 10 ms | **12 ms** | **715 ms** | **0 ms** | 28 MB |
| pi | 140 MB | 254 ms | **340 ms** | **874 ms** | **9 ms** | 129 MB |
| gemini cli | 140 MB | 1609 ms | **1698 ms** | **1716 ms** | — | 146 MB |
| copilot cli | 140 MB | 107 ms | **810 ms** | — | — | 47 MB |
| crush | 140 MB | 139 ms | **287 ms** | **733 ms** | **72 ms** | 69 MB |
| goose | 308 MB | 8 ms | **8 ms** | **369 ms** | **0 ms** | 104 MB |
| aider | 140 MB | 876 ms | **774 ms** | **1166 ms** | **11 ms** | 67 MB |
| amp | 134 MB | 263 ms | **273 ms** | **640 ms** | **1 ms** | 160 MB |
| cursor-agent | 140 MB | 473 ms | **454 ms** | — | — | 218 MB |
| qwen code | 140 MB | 41 ms | **850 ms** | **1329 ms** | — | 236 MB |
| codebuff | 140 MB | 960 ms | **944 ms** | **1470 ms** | **113 ms** | 58 MB |
| kilo code | 140 MB | 872 ms | **2627 ms** | **6671 ms** | **1653 ms** | 46 MB |
| droid | 292 MB | 104 ms | **137 ms** | **915 ms** | **739 ms** | 220 MB |
| kimi code | 191 MB | 578 ms | **745 ms** | **1119 ms** | **4 ms** | 349 MB |
| devin | 195 MB | 4 ms | **48 ms** | **1051 ms** | **641 ms** | 46 MB |
| cline | 140 MB | 876 ms | **1125 ms** | — | — | 55 MB |
| continue | 140 MB | 1167 ms | — | — | — | 317 MB |
| iflow cli | 140 MB | 1253 ms | **1367 ms** | **2542 ms** | **46 ms** | 56 MB |

<details><summary>full precision · all collected fields</summary>

| agent | version | bin | bundle (MB) | bundle kind | `--version` (ms) | TUI 1st byte (ms) | TUI 1st input (ms) | input latency 1s (ms) | idle PSS (MB) |
|---|---|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.5.0-beta.1 | `/home/runner/work/fox-agent/fox-agent/bin/fox` | 99.0 | bin | 16.0 | 16.8 | 380.3 | 0.6 | 35.3 |
| claude code | 2.1.296 (Claude Code) | `/home/runner/.npm-global/bin/claude` | 257.1 | bin | 10.2 | 212.2 | — | — | 187.6 |
| codex | codex-cli 0.162.1 | `/home/runner/.npm-global/bin/codex` | 140.0 | bin | 42.2 | 45.9 | 831.4 | 0.6 | 49.1 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | `/home/runner/.npm-global/bin/opencode2` | 207.4 | bin | 87.3 | 154.3 | 507.6 | 62.3 | 127.2 |
| jcode | jcode v0.95.0 (6487bbd7e) | `/home/runner/.local/bin/jcode` | 138.2 | bin | 9.6 | 11.6 | 714.9 | 0.5 | 27.8 |
| pi | 1.2.0 | `/home/runner/.npm-global/bin/pi` | 140.0 | bin | 253.9 | 339.6 | 873.7 | 8.7 | 128.6 |
| gemini cli | 0.63.0 | `/home/runner/.npm-global/bin/gemini` | 140.0 | bin | 1609.3 | 1698.2 | 1715.6 | — | 146.0 |
| copilot cli | GitHub Copilot CLI 1.0.96. | `/home/runner/.npm-global/bin/copilot` | 140.0 | bin | 107.1 | 809.7 | — | — | 47.4 |
| crush | crush version v0.98.1 | `/home/runner/.npm-global/bin/crush` | 140.0 | bin | 138.5 | 286.7 | 733.2 | 72.4 | 68.9 |
| goose | 1.54.0 | `/home/runner/.local/bin/goose` | 307.8 | bin | 8.2 | 7.7 | 368.9 | 0.2 | 104.3 |
| aider | aider 0.86.2 | `/home/runner/work/fox-agent/fox-agent/.venv-bench/bin/aider` | 140.0 | bin | 875.7 | 774.2 | 1166.2 | 10.7 | 66.9 |
| amp | 0.0.1791878731-g2f7fd0 (released 2026-10-13T08:05:31.000Z, 2 | `/home/runner/.local/bin/amp` | 134.4 | bin | 262.6 | 272.7 | 639.9 | 0.6 | 159.6 |
| cursor-agent | 2026.10.01-e373342 | `/home/runner/.local/bin/cursor-agent` | 140.0 | bin | 472.9 | 454.3 | — | — | 217.7 |
| qwen code | 0.25.1 | `/home/runner/.npm-global/bin/qwen` | 140.0 | bin | 40.6 | 849.8 | 1329.2 | — | 236.2 |
| codebuff | 1.0.688 | `/home/runner/.npm-global/bin/codebuff` | 140.0 | bin | 960.1 | 943.8 | 1469.6 | 112.6 | 57.6 |
| kilo code | 7.8.8 | `/home/runner/.npm-global/bin/kilocode` | 140.0 | bin | 871.7 | 2626.9 | 6670.8 | 1652.7 | 46.2 |
| droid | 0.240.0 | `/home/runner/.local/bin/droid` | 291.7 | bin | 104.3 | 137.5 | 915.0 | 738.6 | 219.7 |
| kimi code | 2.1.1 | `/home/runner/.kimi-code/bin/kimi` | 190.8 | bin | 577.7 | 744.9 | 1119.5 | 4.4 | 349.0 |
| devin | devin 3000.11.3 (9c803229faa4) | `/home/runner/.local/bin/devin` | 195.0 | bin | 3.9 | 48.2 | 1051.3 | 641.0 | 46.4 |
| cline | 3.0.71 | `/home/runner/.npm-global/bin/cline` | 140.0 | bin | 875.7 | 1124.7 | — | — | 55.0 |
| continue | 1.5.47 | `/home/runner/.npm-global/bin/cn` | 140.0 | bin | 1167.4 | — | — | — | 317.3 |
| iflow cli | 0.5.19 | `/home/runner/.npm-global/bin/iflow` | 140.0 | bin | 1252.8 | 1366.7 | 2542.2 | 46.0 | 55.6 |

</details>

fox-agent headless vs scripted local provider: time to first token **65 ms**, peak RSS **60 MB**.

_Generated 2026-10-13T11:14:26Z on Linux x86_64 (6.17.0-1022-azure). [How this is measured](#benchmarks) · [raw JSON](bench/results.json)_
