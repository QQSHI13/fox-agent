![harness bench dashboard](bench/bench.svg)

| agent | bundle | `--version` | TUI 1st byte | TUI 1st input | input latency 1s | idle PSS |
|---|---|---|---|---|---|---|
| **fox-agent** | 120 MB | 12 ms | **15 ms** | — | — | 36 MB |
| claude code | 257 MB | 8 ms | **181 ms** | — | — | 187 MB |
| codex | 140 MB | 37 ms | **37 ms** | — | — | 49 MB |
| opencode v2 | 207 MB | 67 ms | **109 ms** | **469 ms** | **45 ms** | 124 MB |
| jcode | 138 MB | 8 ms | **10 ms** | — | — | 27 MB |
| pi | 140 MB | 182 ms | **235 ms** | **721 ms** | **6 ms** | 132 MB |
| gemini cli | 140 MB | 1147 ms | **1211 ms** | **1233 ms** | — | — |
| copilot cli | 140 MB | 84 ms | **612 ms** | — | — | 47 MB |
| crush | 140 MB | 116 ms | **560 ms** | — | — | 69 MB |
| goose | 308 MB | 6 ms | **6 ms** | **187 ms** | — | — |
| aider | 140 MB | 606 ms | **552 ms** | **926 ms** | **8 ms** | 67 MB |
| amp | 134 MB | 190 ms | **200 ms** | **563 ms** | **1 ms** | 158 MB |
| cursor-agent | 140 MB | 353 ms | **333 ms** | — | — | 214 MB |
| qwen code | 140 MB | 31 ms | **640 ms** | — | — | 282 MB |
| codebuff | 140 MB | 815 ms | **781 ms** | — | — | 58 MB |
| kilo code | 140 MB | 681 ms | **2070 ms** | — | — | 46 MB |
| droid | 281 MB | 74 ms | **77 ms** | — | — | 234 MB |
| kimi code | 191 MB | 446 ms | **573 ms** | — | — | 350 MB |
| devin | 195 MB | 3 ms | **38 ms** | — | — | 49 MB |
| cline | 140 MB | 688 ms | **937 ms** | — | — | 55 MB |
| continue | 140 MB | 854 ms | — | — | — | 318 MB |
| iflow cli | 140 MB | 936 ms | **1003 ms** | **1814 ms** | **46 ms** | 58 MB |

<details><summary>full precision · all collected fields</summary>

| agent | version | bin | bundle (MB) | bundle kind | `--version` (ms) | TUI 1st byte (ms) | TUI 1st input (ms) | input latency 1s (ms) | idle PSS (MB) |
|---|---|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.5.0-beta.1 | `/home/runner/work/fox-agent/fox-agent/bin/fox` | 120.4 | bin | 12.1 | 14.9 | — | — | 36.4 |
| claude code | 2.1.296 (Claude Code) | `/home/runner/.npm-global/bin/claude` | 257.1 | bin | 8.5 | 180.6 | — | — | 187.4 |
| codex | codex-cli 0.162.1 | `/home/runner/.npm-global/bin/codex` | 140.0 | bin | 37.5 | 37.4 | — | — | 49.0 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | `/home/runner/.npm-global/bin/opencode2` | 207.4 | bin | 66.6 | 109.3 | 469.5 | 44.6 | 123.7 |
| jcode | jcode v0.95.0 (6487bbd7e) | `/home/runner/.local/bin/jcode` | 138.2 | bin | 7.6 | 9.6 | — | — | 27.3 |
| pi | 1.1.0 | `/home/runner/.npm-global/bin/pi` | 140.0 | bin | 181.7 | 234.8 | 720.7 | 6.2 | 131.8 |
| gemini cli | 0.63.0 | `/home/runner/.npm-global/bin/gemini` | 140.0 | bin | 1146.9 | 1210.7 | 1233.2 | — | — |
| copilot cli | GitHub Copilot CLI 1.0.95. | `/home/runner/.npm-global/bin/copilot` | 140.0 | bin | 84.1 | 611.5 | — | — | 47.3 |
| crush | crush version v0.98.1 | `/home/runner/.npm-global/bin/crush` | 140.0 | bin | 115.6 | 560.5 | — | — | 68.7 |
| goose | 1.54.0 | `/home/runner/.local/bin/goose` | 307.8 | bin | 6.5 | 6.2 | 187.0 | — | — |
| aider | aider 0.86.2 | `/home/runner/work/fox-agent/fox-agent/.venv-bench/bin/aider` | 140.0 | bin | 606.2 | 551.5 | 926.2 | 7.8 | 66.9 |
| amp | 0.0.1791778148-g902162 (released 2026-10-12T04:09:08.000Z, 2 | `/home/runner/.local/bin/amp` | 134.2 | bin | 190.0 | 200.4 | 563.2 | 0.5 | 158.5 |
| cursor-agent | 2026.10.01-e373342 | `/home/runner/.local/bin/cursor-agent` | 140.0 | bin | 352.6 | 333.2 | — | — | 214.0 |
| qwen code | 0.25.1 | `/home/runner/.npm-global/bin/qwen` | 140.0 | bin | 31.5 | 640.2 | — | — | 282.2 |
| codebuff | 1.0.688 | `/home/runner/.npm-global/bin/codebuff` | 140.0 | bin | 814.8 | 780.7 | — | — | 57.7 |
| kilo code | 7.8.8 | `/home/runner/.npm-global/bin/kilocode` | 140.0 | bin | 681.4 | 2069.6 | — | — | 46.2 |
| droid | 0.238.0 | `/home/runner/.local/bin/droid` | 281.4 | bin | 73.8 | 77.2 | — | — | 234.0 |
| kimi code | 2.1.1 | `/home/runner/.kimi-code/bin/kimi` | 190.8 | bin | 445.9 | 572.7 | — | — | 350.0 |
| devin | devin 3000.11.3 (9c803229faa4) | `/home/runner/.local/bin/devin` | 195.0 | bin | 3.0 | 38.2 | — | — | 48.8 |
| cline | 3.0.70 | `/home/runner/.npm-global/bin/cline` | 140.0 | bin | 688.4 | 937.0 | — | — | 54.9 |
| continue | 1.5.47 | `/home/runner/.npm-global/bin/cn` | 140.0 | bin | 854.4 | — | — | — | 317.9 |
| iflow cli | 0.5.19 | `/home/runner/.npm-global/bin/iflow` | 140.0 | bin | 936.3 | 1003.2 | 1813.8 | 45.7 | 58.0 |

</details>

fox-agent headless vs scripted local provider: time to first token **52 ms**, peak RSS **61 MB**.

_Generated 2026-10-12T06:52:13Z on Linux x86_64 (6.17.0-1022-azure). [How this is measured](#benchmarks) · [raw JSON](bench/results.json)_
