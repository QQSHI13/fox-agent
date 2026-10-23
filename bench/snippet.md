![harness bench dashboard](bench/bench.svg)

| agent | bundle | `--version` | TUI 1st byte | TUI 1st input | input latency | idle PSS |
|---|---|---|---|---|---|---|
| **fox-agent** | 118 MB | 15 ms | **17 ms** | **377 ms** | **1 ms** | 37 MB |
| claude code | 293 MB | 11 ms | **251 ms** | — | — | 196 MB |
| codex | 140 MB | 42 ms | **43 ms** | **817 ms** | **2 ms** | 49 MB |
| opencode v2 | 207 MB | 83 ms | **133 ms** | **502 ms** | **0 ms** | 130 MB |
| jcode | 171 MB | 9 ms | **11 ms** | **768 ms** | **0 ms** | 32 MB |
| pi | 140 MB | 248 ms | **323 ms** | **829 ms** | **9 ms** | 130 MB |
| pi-bolt | 262 MB | 13 ms | **39 ms** | **519 ms** | **2 ms** | 97 MB |
| gemini cli | 140 MB | 1513 ms | **1615 ms** | **1629 ms** | **0 ms** | 146 MB |
| copilot cli | 140 MB | 105 ms | **792 ms** | — | — | 47 MB |
| crush | 140 MB | 154 ms | **584 ms** | **1024 ms** | **72 ms** | 68 MB |
| goose | 304 MB | 8 ms | **8 ms** | **369 ms** | **0 ms** | 109 MB |
| aider | 140 MB | 813 ms | **736 ms** | **1122 ms** | **10 ms** | 67 MB |
| amp | 161 MB | 211 ms | **225 ms** | **579 ms** | **0 ms** | 138 MB |
| cursor-agent | 140 MB | 460 ms | **444 ms** | — | — | 252 MB |
| qwen code | 140 MB | 37 ms | **827 ms** | **1299 ms** | **0 ms** | 238 MB |
| codebuff | 140 MB | 931 ms | **927 ms** | **1423 ms** | **0 ms** | 58 MB |
| kilo code | 140 MB | 852 ms | **2529 ms** | **6640 ms** | **2830 ms** | 46 MB |
| droid | 319 MB | 119 ms | **116 ms** | **895 ms** | **1892 ms** | 289 MB |
| kimi code | 192 MB | 587 ms | **747 ms** | **1177 ms** | **4 ms** | 355 MB |
| devin | 200 MB | 4 ms | **23 ms** | **1029 ms** | **143 ms** | 95 MB |
| cline | 140 MB | 884 ms | **1193 ms** | — | — | 55 MB |
| continue | 140 MB | 1117 ms | — | — | — | 317 MB |
| iflow cli | 140 MB | 1221 ms | **1291 ms** | **2502 ms** | **0 ms** | 56 MB |

<details><summary>full precision · all collected fields</summary>

| agent | version | bin | bundle (MB) | bundle kind | `--version` (ms) | TUI 1st byte (ms) | TUI 1st input (ms) | input latency (ms) | idle PSS (MB) |
|---|---|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.6.0 | `/home/runner/work/fox-agent/fox-agent/bin/fox` | 117.5 | bin | 15.4 | 16.7 | 377.4 | 0.6 | 36.8 |
| claude code | 2.1.309 (Claude Code) | `/home/runner/.npm-global/bin/claude` | 293.5 | bin | 11.3 | 250.8 | — | — | 195.9 |
| codex | codex-cli 0.163.0 | `/home/runner/.npm-global/bin/codex` | 140.0 | bin | 42.4 | 42.6 | 816.7 | 1.6 | 49.1 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | `/home/runner/.npm-global/bin/opencode2` | 207.4 | bin | 82.8 | 133.1 | 502.0 | 0.1 | 129.9 |
| jcode | jcode v0.99.1 (7206efd0c) | `/home/runner/.local/bin/jcode` | 171.3 | bin | 8.9 | 11.3 | 767.8 | 0.4 | 32.4 |
| pi | 1.4.0 | `/home/runner/.npm-global/bin/pi` | 140.0 | bin | 247.7 | 323.3 | 829.3 | 8.5 | 130.0 |
| pi-bolt | 1.4.0 (Pi-Bolt 0.9.9, linux-x64, JIT off) | `/home/runner/.local/bin/pi-bolt` | 262.0 | bin | 12.6 | 39.2 | 519.1 | 1.6 | 96.6 |
| gemini cli | 0.65.0 | `/home/runner/.npm-global/bin/gemini` | 140.0 | bin | 1513.0 | 1615.3 | 1628.6 | 0.1 | 146.2 |
| copilot cli | GitHub Copilot CLI 1.0.103. | `/home/runner/.npm-global/bin/copilot` | 140.0 | bin | 104.6 | 792.2 | — | — | 47.3 |
| crush | crush version v0.98.1 | `/home/runner/.npm-global/bin/crush` | 140.0 | bin | 153.8 | 583.7 | 1023.8 | 72.4 | 68.4 |
| goose | 1.55.0 | `/home/runner/.local/bin/goose` | 304.0 | bin | 7.8 | 7.7 | 368.6 | 0.2 | 108.9 |
| aider | aider 0.86.2 | `/home/runner/work/fox-agent/fox-agent/.venv-bench/bin/aider` | 140.0 | bin | 813.5 | 736.3 | 1122.4 | 10.1 | 67.0 |
| amp | 0.0.1792713681-g9b55f0 (released 2026-10-23T00:01:21.000Z, 1 | `/home/runner/.local/bin/amp` | 161.0 | bin | 210.9 | 225.4 | 579.1 | 0.5 | 138.1 |
| cursor-agent | 2026.10.22-27dcf5f | `/home/runner/.local/bin/cursor-agent` | 140.0 | bin | 460.4 | 444.3 | — | — | 251.8 |
| qwen code | 0.26.0 | `/home/runner/.npm-global/bin/qwen` | 140.0 | bin | 37.1 | 826.6 | 1299.1 | 0.1 | 238.4 |
| codebuff | 1.0.688 | `/home/runner/.npm-global/bin/codebuff` | 140.0 | bin | 930.8 | 927.3 | 1422.7 | 0.1 | 57.5 |
| kilo code | 7.8.15 | `/home/runner/.npm-global/bin/kilocode` | 140.0 | bin | 852.0 | 2529.5 | 6640.1 | 2830.1 | 46.2 |
| droid | 0.248.0 | `/home/runner/.local/bin/droid` | 319.2 | bin | 118.9 | 116.0 | 894.8 | 1891.8 | 288.7 |
| kimi code | 2.3.0 | `/home/runner/.kimi-code/bin/kimi` | 192.5 | bin | 587.4 | 747.0 | 1177.2 | 4.2 | 354.8 |
| devin | devin 3000.11.92 (7f4e64980e22) | `/home/runner/.local/bin/devin` | 200.4 | bin | 4.3 | 22.8 | 1028.7 | 142.9 | 94.6 |
| cline | 3.0.73 | `/home/runner/.npm-global/bin/cline` | 140.0 | bin | 883.6 | 1192.9 | — | — | 55.1 |
| continue | 1.5.47 | `/home/runner/.npm-global/bin/cn` | 140.0 | bin | 1116.6 | — | — | — | 317.3 |
| iflow cli | 0.5.19 | `/home/runner/.npm-global/bin/iflow` | 140.0 | bin | 1221.1 | 1290.7 | 2502.3 | 0.1 | 55.6 |

</details>

fox-agent headless vs scripted local provider: time to first token **65 ms**, peak RSS **61 MB**.

_Generated 2026-10-23T02:08:26Z on Linux x86_64 (6.17.0-1022-azure). [How this is measured](#benchmarks) · [raw JSON](bench/results.json)_
