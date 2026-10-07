![bundle size](bench/bundle.svg)
![time to first char](bench/tui-first-char.svg)
![time to first input](bench/tui-first-input.svg)
![idle memory](bench/memory.svg)

| agent | version | bundle | `--version` | TUI 1st byte | TUI 1st input | idle PSS |
|---|---|---|---|---|---|---|
| **fox-agent** | 0.5.0-beta.1 | 89.3 MB | 13 ms | **14 ms** | — | 33 MB |
| claude code | 2.1.292 (Claude Code) | 251.5 MB | 9 ms | **199 ms** | — | 185 MB |
| codex | codex-cli 0.160.1 | 446.8 MB (pkg) | 40 ms | **43 ms** | — | 49 MB |
| opencode v1 | 1.18.35 | 185.7 MB | 597 ms | **990 ms** | **46 ms** | 362 MB |
| opencode v2 | opencode2 v0.0.0-beta-19271 | 207.4 MB | 82 ms | **132 ms** | **63 ms** | 130 MB |
| jcode | jcode v0.91.0 (439a243bb) | 135.1 MB | 9 ms | **11 ms** | — | 27 MB |
| pi | 1.0.4 | 123.1 MB (pkg) | 239 ms | **308 ms** | **8 ms** | 132 MB |
| gemini cli | 0.63.0 | 102.3 MB (pkg) | 1505 ms | **1584 ms** | **0 ms** | 146 MB |
| copilot cli | GitHub Copilot CLI 1.0.92. | 180.1 MB (pkg) | 101 ms | **873 ms** | — | 48 MB |
| crush | crush version v0.97.1 | 128.5 MB (pkg) | 149 ms | **562 ms** | — | 69 MB |
| goose | 1.53.0 | 298.7 MB | 7 ms | **7 ms** | **0 ms** | — |
| aider | aider 0.86.2 | 642.8 MB (pkg) | 792 ms | **730 ms** | **11 ms** | 67 MB |
| amp | n/a (not installed) | — | — | — | — | — |
| cursor-agent | n/a (not installed) | — | — | — | — | — |
| qwen code | 0.25.0 | 146.2 MB (pkg) | 37 ms | **802 ms** | — | 244 MB |
| codebuff | n/a (not installed) | — | — | — | — | — |
| kilo code | 7.8.3 | 542.3 MB (pkg) | 1043 ms | **1798 ms** | **49 ms** | 46 MB |

fox-agent headless vs scripted local provider: time to first token **57 ms**, peak RSS **64 MB**.

_Generated 2026-10-07T05:17:42Z on Linux x86_64 (6.17.0-1022-azure). [How this is measured](#benchmarks) · [raw JSON](bench/results.json)_
