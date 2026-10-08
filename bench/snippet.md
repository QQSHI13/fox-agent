![bundle size](bench/bundle.svg)
![time to first char](bench/tui-first-char.svg)
![time to first input](bench/tui-first-input.svg)
![idle memory](bench/memory.svg)

| agent | version | bundle | `--version` | TUI 1st byte | TUI 1st input | idle PSS |
|---|---|---|---|---|---|---|
| **fox-agent** | 0.5.0-beta.1 | 89.7 MB | 14 ms | **16 ms** | — | 37 MB |
| claude code | 2.1.293 (Claude Code) | 252.8 MB | 10 ms | **210 ms** | — | 185 MB |
| codex | codex-cli 0.161.0 | 450.4 MB (pkg) | 42 ms | **44 ms** | — | 49 MB |
| opencode v1 | 1.18.35 | 185.7 MB | 613 ms | **1005 ms** | **44 ms** | 363 MB |
| opencode v2 | opencode2 v0.0.0-beta-19271 | 207.4 MB | 81 ms | **138 ms** | **64 ms** | 128 MB |
| jcode | jcode v0.91.0 (439a243bb) | 135.1 MB | 10 ms | **12 ms** | — | 27 MB |
| pi | 1.1.0 | 123.3 MB (pkg) | 242 ms | **326 ms** | **8 ms** | 132 MB |
| gemini cli | 0.63.0 | 102.3 MB (pkg) | 1584 ms | **1680 ms** | **0 ms** | 146 MB |
| copilot cli | GitHub Copilot CLI 1.0.93. | 181.6 MB (pkg) | 107 ms | **879 ms** | — | 48 MB |
| crush | crush version v0.97.1 | 128.5 MB (pkg) | 157 ms | **657 ms** | — | 69 MB |
| goose | 1.53.0 | 298.7 MB | 8 ms | **7 ms** | **0 ms** | — |
| aider | aider 0.86.2 | 642.8 MB (pkg) | 801 ms | **727 ms** | **11 ms** | 67 MB |
| amp | n/a (not installed) | — | — | — | — | — |
| cursor-agent | n/a (not installed) | — | — | — | — | — |
| qwen code | 0.25.0 | 146.2 MB (pkg) | 41 ms | **809 ms** | — | 233 MB |
| codebuff | n/a (not installed) | — | — | — | — | — |
| kilo code | 7.8.8 | 653.7 MB (pkg) | 850 ms | **2598 ms** | **43 ms** | 46 MB |

fox-agent headless vs scripted local provider: time to first token **65 ms**, peak RSS **66 MB**.

_Generated 2026-10-08T11:10:11Z on Linux x86_64 (6.17.0-1022-azure). [How this is measured](#benchmarks) · [raw JSON](bench/results.json)_
