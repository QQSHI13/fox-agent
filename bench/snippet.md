![harness bench dashboard](bench/bench.svg)

| agent | bundle | `--version` | TUI 1st byte | TUI 1st input | input latency 1s | idle PSS |
|---|---|---|---|---|---|---|
| **fox-agent** | 99 MB | 15 ms | **15 ms** | **377 ms** | **1 ms** | 35 MB |
| claude code | 286 MB | 9 ms | **206 ms** | — | — | 190 MB |
| codex | 140 MB | 42 ms | **44 ms** | **839 ms** | **0 ms** | 49 MB |
| opencode v2 | 207 MB | 80 ms | **134 ms** | **498 ms** | **58 ms** | 130 MB |
| jcode | 167 MB | 9 ms | **11 ms** | **766 ms** | **0 ms** | 31 MB |
| pi | 140 MB | 242 ms | **324 ms** | **810 ms** | **8 ms** | 131 MB |
| gemini cli | 140 MB | 1522 ms | **1606 ms** | **1627 ms** | **0 ms** | 146 MB |
| copilot cli | 140 MB | 102 ms | **775 ms** | — | — | 47 MB |
| crush | 140 MB | 152 ms | **382 ms** | **837 ms** | **73 ms** | 69 MB |
| goose | 304 MB | 7 ms | **7 ms** | **368 ms** | **0 ms** | 107 MB |
| aider | 140 MB | 792 ms | **731 ms** | **1115 ms** | **10 ms** | 67 MB |
| amp | 135 MB | 256 ms | **253 ms** | **616 ms** | **1 ms** | 161 MB |
| cursor-agent | 140 MB | 437 ms | **425 ms** | — | — | 237 MB |
| qwen code | 140 MB | 37 ms | **820 ms** | **1297 ms** | — | 246 MB |
| codebuff | 140 MB | 889 ms | **866 ms** | **1369 ms** | **111 ms** | 58 MB |
| kilo code | 140 MB | 843 ms | **2557 ms** | **6623 ms** | **1684 ms** | 46 MB |
| droid | 294 MB | 117 ms | **135 ms** | **3222 ms** | **769 ms** | 279 MB |
| kimi code | 192 MB | 604 ms | **758 ms** | **1141 ms** | **4 ms** | 352 MB |
| devin | 200 MB | 5 ms | **23 ms** | **1029 ms** | **1641 ms** | 91 MB |
| cline | 140 MB | 897 ms | **1204 ms** | — | — | 55 MB |
| continue | 140 MB | 1149 ms | — | — | — | 317 MB |
| iflow cli | 140 MB | 1212 ms | **1295 ms** | **2083 ms** | **46 ms** | 56 MB |

<details><summary>full precision · all collected fields</summary>

| agent | version | bin | bundle (MB) | bundle kind | `--version` (ms) | TUI 1st byte (ms) | TUI 1st input (ms) | input latency 1s (ms) | idle PSS (MB) |
|---|---|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.5.0-beta.1 | `/home/runner/work/fox-agent/fox-agent/bin/fox` | 99.0 | bin | 14.5 | 15.2 | 377.2 | 0.7 | 35.4 |
| claude code | 2.1.302 (Claude Code) | `/home/runner/.npm-global/bin/claude` | 285.8 | bin | 8.9 | 205.5 | — | — | 190.4 |
| codex | codex-cli 0.163.0 | `/home/runner/.npm-global/bin/codex` | 140.0 | bin | 41.7 | 43.6 | 839.5 | 0.4 | 49.1 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | `/home/runner/.npm-global/bin/opencode2` | 207.4 | bin | 80.1 | 134.5 | 498.2 | 58.2 | 129.8 |
| jcode | jcode v0.98.1 (1c7426eb1) | `/home/runner/.local/bin/jcode` | 166.8 | bin | 8.7 | 11.3 | 765.6 | 0.4 | 30.6 |
| pi | 1.3.0 | `/home/runner/.npm-global/bin/pi` | 140.0 | bin | 242.1 | 323.9 | 810.0 | 8.4 | 131.5 |
| gemini cli | 0.64.0 | `/home/runner/.npm-global/bin/gemini` | 140.0 | bin | 1522.0 | 1605.9 | 1627.3 | 0.1 | 146.0 |
| copilot cli | GitHub Copilot CLI 1.0.98. | `/home/runner/.npm-global/bin/copilot` | 140.0 | bin | 101.5 | 774.7 | — | — | 47.4 |
| crush | crush version v0.98.1 | `/home/runner/.npm-global/bin/crush` | 140.0 | bin | 151.8 | 382.2 | 837.4 | 73.0 | 69.1 |
| goose | 1.55.0 | `/home/runner/.local/bin/goose` | 304.0 | bin | 7.3 | 6.8 | 367.6 | 0.2 | 107.1 |
| aider | aider 0.86.2 | `/home/runner/work/fox-agent/fox-agent/.venv-bench/bin/aider` | 140.0 | bin | 792.1 | 730.9 | 1115.2 | 10.1 | 66.8 |
| amp | 0.0.1792224035-gabd4f6 (released 2026-10-17T08:00:35.000Z, 1 | `/home/runner/.local/bin/amp` | 134.9 | bin | 256.1 | 252.7 | 616.4 | 0.6 | 161.2 |
| cursor-agent | 2026.10.16-e3cb207 | `/home/runner/.local/bin/cursor-agent` | 140.0 | bin | 437.4 | 424.9 | — | — | 236.6 |
| qwen code | 0.25.2 | `/home/runner/.npm-global/bin/qwen` | 140.0 | bin | 36.7 | 819.7 | 1297.0 | — | 246.0 |
| codebuff | 1.0.688 | `/home/runner/.npm-global/bin/codebuff` | 140.0 | bin | 889.3 | 866.4 | 1369.3 | 110.6 | 57.6 |
| kilo code | 7.8.12 | `/home/runner/.npm-global/bin/kilocode` | 140.0 | bin | 843.3 | 2557.3 | 6622.8 | 1683.8 | 46.2 |
| droid | 0.244.0 | `/home/runner/.local/bin/droid` | 294.4 | bin | 116.7 | 134.8 | 3222.1 | 769.3 | 279.4 |
| kimi code | 2.2.0 | `/home/runner/.kimi-code/bin/kimi` | 191.9 | bin | 604.5 | 757.6 | 1141.1 | 4.5 | 352.0 |
| devin | devin 3000.11.92 (7f4e64980e22) | `/home/runner/.local/bin/devin` | 200.4 | bin | 4.9 | 22.7 | 1028.5 | 1641.1 | 91.3 |
| cline | 3.0.73 | `/home/runner/.npm-global/bin/cline` | 140.0 | bin | 896.9 | 1204.2 | — | — | 54.9 |
| continue | 1.5.47 | `/home/runner/.npm-global/bin/cn` | 140.0 | bin | 1148.7 | — | — | — | 317.4 |
| iflow cli | 0.5.19 | `/home/runner/.npm-global/bin/iflow` | 140.0 | bin | 1212.5 | 1294.6 | 2083.2 | 45.6 | 55.6 |

</details>

fox-agent headless vs scripted local provider: time to first token **62 ms**, peak RSS **60 MB**.

_Generated 2026-10-17T10:11:04Z on Linux x86_64 (6.17.0-1022-azure). [How this is measured](#benchmarks) · [raw JSON](bench/results.json)_
