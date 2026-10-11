![harness bench dashboard](bench/bench.svg)

| agent | bundle | `--version` | TUI 1st byte | TUI 1st input | input latency 1s | idle PSS |
|---|---|---|---|---|---|---|
| **fox-agent** | 99 MB | 10 ms | **12 ms** | — | — | 34 MB |
| claude code | 257 MB | 9 ms | **134 ms** | — | — | 187 MB |
| codex | 140 MB | 32 ms | **32 ms** | — | — | 49 MB |
| opencode v2 | 207 MB | 55 ms | **88 ms** | **449 ms** | **35 ms** | 123 MB |
| jcode | 137 MB | 6 ms | **8 ms** | — | — | 28 MB |
| pi | 140 MB | 142 ms | **193 ms** | **689 ms** | **5 ms** | 131 MB |
| gemini cli | 140 MB | 888 ms | **964 ms** | **979 ms** | — | — |
| copilot cli | 140 MB | 66 ms | **469 ms** | — | — | 47 MB |
| crush | 140 MB | 97 ms | **402 ms** | — | — | 68 MB |
| goose | 308 MB | 5 ms | **5 ms** | **158 ms** | — | — |
| aider | 140 MB | 446 ms | **394 ms** | **765 ms** | **5 ms** | 67 MB |
| amp | 134 MB | 159 ms | **164 ms** | **527 ms** | **0 ms** | 159 MB |
| cursor-agent | 140 MB | 269 ms | **256 ms** | — | — | 220 MB |
| qwen code | 140 MB | 25 ms | **467 ms** | — | — | 288 MB |
| codebuff | 140 MB | 570 ms | **550 ms** | — | — | 58 MB |
| kilo code | 140 MB | 510 ms | **1449 ms** | — | — | 46 MB |
| droid | 281 MB | 50 ms | **58 ms** | — | — | 236 MB |
| kimi code | 191 MB | 348 ms | **460 ms** | — | — | 352 MB |
| devin | 195 MB | 3 ms | **33 ms** | — | — | 49 MB |
| cline | 140 MB | 592 ms | **736 ms** | — | — | 55 MB |
| continue | 140 MB | 702 ms | — | — | — | 319 MB |
| iflow cli | 140 MB | 755 ms | **804 ms** | **1652 ms** | **45 ms** | 58 MB |

<details><summary>full precision · all collected fields</summary>

| agent | version | bin | bundle (MB) | bundle kind | `--version` (ms) | TUI 1st byte (ms) | TUI 1st input (ms) | input latency 1s (ms) | idle PSS (MB) |
|---|---|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.5.0-beta.1 | `/home/runner/work/fox-agent/fox-agent/bin/fox` | 98.9 | bin | 9.8 | 11.8 | — | — | 34.3 |
| claude code | 2.1.296 (Claude Code) | `/home/runner/.npm-global/bin/claude` | 257.1 | bin | 8.9 | 133.9 | — | — | 186.9 |
| codex | codex-cli 0.162.1 | `/home/runner/.npm-global/bin/codex` | 140.0 | bin | 31.7 | 31.9 | — | — | 49.1 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | `/home/runner/.npm-global/bin/opencode2` | 207.4 | bin | 55.4 | 88.4 | 448.6 | 35.1 | 123.1 |
| jcode | jcode v0.94.0 (b6c63ff04) | `/home/runner/.local/bin/jcode` | 137.1 | bin | 6.4 | 8.1 | — | — | 27.9 |
| pi | 1.1.0 | `/home/runner/.npm-global/bin/pi` | 140.0 | bin | 141.9 | 193.0 | 689.0 | 5.1 | 131.3 |
| gemini cli | 0.63.0 | `/home/runner/.npm-global/bin/gemini` | 140.0 | bin | 888.2 | 963.7 | 978.8 | — | — |
| copilot cli | GitHub Copilot CLI 1.0.95. | `/home/runner/.npm-global/bin/copilot` | 140.0 | bin | 65.8 | 469.0 | — | — | 47.3 |
| crush | crush version v0.98.1 | `/home/runner/.npm-global/bin/crush` | 140.0 | bin | 96.5 | 402.2 | — | — | 68.4 |
| goose | 1.54.0 | `/home/runner/.local/bin/goose` | 307.8 | bin | 5.2 | 4.9 | 158.3 | — | — |
| aider | aider 0.86.2 | `/home/runner/work/fox-agent/fox-agent/.venv-bench/bin/aider` | 140.0 | bin | 446.5 | 394.1 | 765.4 | 5.0 | 66.9 |
| amp | 0.0.1791705634-g3bdda1 (released 2026-10-11T08:00:34.000Z, 2 | `/home/runner/.local/bin/amp` | 134.2 | bin | 158.9 | 164.3 | 526.9 | 0.3 | 158.9 |
| cursor-agent | 2026.10.01-e373342 | `/home/runner/.local/bin/cursor-agent` | 140.0 | bin | 268.9 | 256.4 | — | — | 219.8 |
| qwen code | 0.25.0 | `/home/runner/.npm-global/bin/qwen` | 140.0 | bin | 25.0 | 466.5 | — | — | 288.1 |
| codebuff | 1.0.688 | `/home/runner/.npm-global/bin/codebuff` | 140.0 | bin | 569.6 | 550.1 | — | — | 57.7 |
| kilo code | 7.8.8 | `/home/runner/.npm-global/bin/kilocode` | 140.0 | bin | 510.3 | 1448.8 | — | — | 46.2 |
| droid | 0.238.0 | `/home/runner/.local/bin/droid` | 281.4 | bin | 50.5 | 58.1 | — | — | 235.5 |
| kimi code | 2.1.1 | `/home/runner/.kimi-code/bin/kimi` | 190.8 | bin | 348.2 | 460.2 | — | — | 351.8 |
| devin | devin 3000.11.3 (9c803229faa4) | `/home/runner/.local/bin/devin` | 195.0 | bin | 3.2 | 32.7 | — | — | 48.7 |
| cline | 3.0.70 | `/home/runner/.npm-global/bin/cline` | 140.0 | bin | 591.9 | 736.3 | — | — | 55.0 |
| continue | 1.5.47 | `/home/runner/.npm-global/bin/cn` | 140.0 | bin | 701.6 | — | — | — | 318.9 |
| iflow cli | 0.5.19 | `/home/runner/.npm-global/bin/iflow` | 140.0 | bin | 754.8 | 803.6 | 1652.5 | 45.0 | 57.9 |

</details>

fox-agent headless vs scripted local provider: time to first token **39 ms**, peak RSS **59 MB**.

_Generated 2026-10-11T10:37:28Z on Linux x86_64 (6.17.0-1022-azure). [How this is measured](#benchmarks) · [raw JSON](bench/results.json)_
