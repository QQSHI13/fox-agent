![bundle size](bench/bundle.svg)
![time to first char](bench/tui-first-char.svg)
![time to first input](bench/tui-first-input.svg)
![idle memory](bench/memory.svg)

| agent | version | bundle | `--version` | TUI 1st byte | TUI 1st input | idle PSS |
|---|---|---|---|---|---|---|
| **fox-agent** | 0.5.0-beta.1 | 89.2 MB | 14 ms | **15 ms** | — | 33 MB |
| claude code | 2.1.281 (Claude Code) | 237.4 MB | 8 ms | **187 ms** | — | 174 MB |
| codex | codex-cli 0.156.1 | 386.9 MB (pkg) | 42 ms | **43 ms** | — | 49 MB |
| opencode v1 | 1.18.32 | 185.2 MB | 590 ms | **990 ms** | **40 ms** | 364 MB |
| opencode v2 | opencode2 v0.0.0-beta-19271 | 207.4 MB | 81 ms | **132 ms** | **59 ms** | 128 MB |
| jcode | jcode v0.88.0 (ee4cd3db3) | 130.1 MB | 9 ms | **11 ms** | — | 24 MB |
| pi | 0.87.1 | 403.5 MB (pkg) | 227 ms | **293 ms** | **7 ms** | 144 MB |
| gemini cli | 0.61.0 | 102.1 MB (pkg) | 1498 ms | **1578 ms** | **0 ms** | 145 MB |
| copilot cli | GitHub Copilot CLI 1.0.88. | 169.6 MB (pkg) | 596 ms | **721 ms** | — | 48 MB |
| crush | crush version v0.96.1 | 123.7 MB (pkg) | 150 ms | **507 ms** | — | 69 MB |
| goose | 1.52.0 | 300.8 MB | 7 ms | **7 ms** | **0 ms** | — |
| aider | aider 0.86.2 | 642.8 MB (pkg) | 789 ms | **724 ms** | **11 ms** | 67 MB |
| amp | n/a (not installed) | — | — | — | — | — |
| cursor-agent | n/a (not installed) | — | — | — | — | — |
| qwen code | 0.24.4 | 154.6 MB (pkg) | 37 ms | **1623 ms** | — | 27 MB |
| codebuff | n/a (not installed) | — | — | — | — | — |
| kilo code | 7.7.9 | 542.5 MB (pkg) | 979 ms | **1743 ms** | **46 ms** | 46 MB |

fox-agent headless vs scripted local provider: time to first token **49 ms**, peak RSS **58 MB**.

_Generated 2026-09-24T14:28:15Z on Linux x86_64 (6.17.0-1022-azure). [How this is measured](#benchmarks) · [raw JSON](bench/results.json)_
