![harness bench dashboard](bench/bench.svg)

| agent | bundle | `--version` | TUI 1st byte | TUI 1st input | input latency 1s | idle PSS |
|---|---|---|---|---|---|---|
| **fox-agent** | 120 MB | 10 ms | **12 ms** | — | — | 37 MB |
| claude code | 257 MB | 7 ms | **124 ms** | — | — | 187 MB |
| codex | 140 MB | 29 ms | **29 ms** | — | — | 49 MB |
| opencode v2 | 207 MB | 53 ms | **84 ms** | **447 ms** | **34 ms** | 125 MB |
| jcode | 138 MB | 6 ms | **8 ms** | — | — | 27 MB |
| pi | 140 MB | 135 ms | **174 ms** | **654 ms** | **5 ms** | 123 MB |
| gemini cli | 140 MB | 827 ms | **898 ms** | **924 ms** | **0 ms** | — |
| copilot cli | 140 MB | 65 ms | **466 ms** | — | — | 47 MB |
| crush | 140 MB | 90 ms | **308 ms** | — | — | 68 MB |
| goose | 308 MB | 5 ms | **5 ms** | **151 ms** | — | — |
| aider | 140 MB | 440 ms | **394 ms** | **766 ms** | **5 ms** | 67 MB |
| amp | 134 MB | 145 ms | **155 ms** | **512 ms** | **0 ms** | 159 MB |
| cursor-agent | 140 MB | 254 ms | **241 ms** | — | — | 219 MB |
| qwen code | 140 MB | 24 ms | **464 ms** | — | — | 290 MB |
| codebuff | 140 MB | 549 ms | **530 ms** | — | — | 58 MB |
| kilo code | 140 MB | 506 ms | **1448 ms** | — | — | 46 MB |
| droid | 281 MB | 49 ms | **57 ms** | — | — | 229 MB |
| kimi code | 191 MB | 335 ms | **428 ms** | — | — | 352 MB |
| devin | 195 MB | 3 ms | **29 ms** | — | — | 49 MB |
| cline | 140 MB | 541 ms | **720 ms** | — | — | 55 MB |
| continue | 140 MB | 663 ms | — | — | — | 318 MB |
| iflow cli | 140 MB | 728 ms | **780 ms** | **1543 ms** | **44 ms** | 58 MB |

<details><summary>full precision · all collected fields</summary>

| agent | version | bin | bundle (MB) | bundle kind | `--version` (ms) | TUI 1st byte (ms) | TUI 1st input (ms) | input latency 1s (ms) | idle PSS (MB) |
|---|---|---|---|---|---|---|---|---|---|
| **fox-agent** | 0.5.0-beta.1 | `/home/runner/work/fox-agent/fox-agent/bin/fox` | 120.4 | bin | 10.1 | 12.3 | — | — | 36.6 |
| claude code | 2.1.296 (Claude Code) | `/home/runner/.npm-global/bin/claude` | 257.1 | bin | 6.9 | 123.7 | — | — | 187.0 |
| codex | codex-cli 0.162.1 | `/home/runner/.npm-global/bin/codex` | 140.0 | bin | 28.5 | 29.1 | — | — | 49.1 |
| opencode v2 | opencode2 v0.0.0-beta-19271 | `/home/runner/.npm-global/bin/opencode2` | 207.4 | bin | 52.6 | 84.2 | 447.3 | 34.0 | 125.2 |
| jcode | jcode v0.95.0 (6487bbd7e) | `/home/runner/.local/bin/jcode` | 138.2 | bin | 6.5 | 8.1 | — | — | 27.3 |
| pi | 1.1.0 | `/home/runner/.npm-global/bin/pi` | 140.0 | bin | 135.0 | 174.3 | 653.5 | 4.6 | 123.0 |
| gemini cli | 0.63.0 | `/home/runner/.npm-global/bin/gemini` | 140.0 | bin | 827.3 | 898.1 | 924.3 | 0.1 | — |
| copilot cli | GitHub Copilot CLI 1.0.95. | `/home/runner/.npm-global/bin/copilot` | 140.0 | bin | 64.7 | 466.1 | — | — | 47.3 |
| crush | crush version v0.98.1 | `/home/runner/.npm-global/bin/crush` | 140.0 | bin | 89.8 | 308.5 | — | — | 67.9 |
| goose | 1.54.0 | `/home/runner/.local/bin/goose` | 307.8 | bin | 5.0 | 4.8 | 151.2 | — | — |
| aider | aider 0.86.2 | `/home/runner/work/fox-agent/fox-agent/.venv-bench/bin/aider` | 140.0 | bin | 439.9 | 394.2 | 766.4 | 4.9 | 66.9 |
| amp | 0.0.1791806555-g425e34 (released 2026-10-12T12:02:35.000Z, 3 | `/home/runner/.local/bin/amp` | 134.2 | bin | 145.5 | 154.5 | 512.0 | 0.2 | 158.5 |
| cursor-agent | 2026.10.01-e373342 | `/home/runner/.local/bin/cursor-agent` | 140.0 | bin | 253.9 | 241.0 | — | — | 219.5 |
| qwen code | 0.25.1 | `/home/runner/.npm-global/bin/qwen` | 140.0 | bin | 23.6 | 464.3 | — | — | 289.8 |
| codebuff | 1.0.688 | `/home/runner/.npm-global/bin/codebuff` | 140.0 | bin | 548.5 | 529.7 | — | — | 57.7 |
| kilo code | 7.8.8 | `/home/runner/.npm-global/bin/kilocode` | 140.0 | bin | 506.2 | 1447.9 | — | — | 46.2 |
| droid | 0.238.0 | `/home/runner/.local/bin/droid` | 281.4 | bin | 48.8 | 57.2 | — | — | 228.8 |
| kimi code | 2.1.1 | `/home/runner/.kimi-code/bin/kimi` | 190.8 | bin | 335.0 | 428.2 | — | — | 352.0 |
| devin | devin 3000.11.3 (9c803229faa4) | `/home/runner/.local/bin/devin` | 195.0 | bin | 2.8 | 29.5 | — | — | 48.9 |
| cline | 3.0.70 | `/home/runner/.npm-global/bin/cline` | 140.0 | bin | 540.6 | 720.0 | — | — | 55.0 |
| continue | 1.5.47 | `/home/runner/.npm-global/bin/cn` | 140.0 | bin | 663.0 | — | — | — | 317.7 |
| iflow cli | 0.5.19 | `/home/runner/.npm-global/bin/iflow` | 140.0 | bin | 727.9 | 779.7 | 1543.1 | 43.7 | 57.9 |

</details>

fox-agent headless vs scripted local provider: time to first token **41 ms**, peak RSS **61 MB**.

_Generated 2026-10-12T12:55:27Z on Linux x86_64 (6.17.0-1022-azure). [How this is measured](#benchmarks) · [raw JSON](bench/results.json)_
