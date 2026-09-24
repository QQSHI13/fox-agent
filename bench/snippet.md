![bundle size](bench/bundle.svg)
![time to first char](bench/tui-first-char.svg)
![time to first input](bench/tui-first-input.svg)
![idle memory](bench/memory.svg)

| agent | version | bundle | `--version` | TUI 1st byte | TUI 1st input | idle PSS |
|---|---|---|---|---|---|---|
| **fox-agent** | 0.5.0-beta.1 | 89.2 MB | 12 ms | **15 ms** | — | 33 MB |
| claude code | 2.1.281 (Claude Code) | 237.4 MB | 9 ms | **187 ms** | — | 174 MB |
| codex | codex-cli 0.156.1 | 386.9 MB (pkg) | 44 ms | **47 ms** | — | 49 MB |
| opencode v1 | 1.18.32 | 185.2 MB | 571 ms | **939 ms** | **40 ms** | 364 MB |
| opencode v2 | opencode2 v0.0.0-beta-19271 | 207.4 MB | 79 ms | **128 ms** | **59 ms** | 128 MB |
| jcode | jcode v0.88.0 (ee4cd3db3) | 130.1 MB | 9 ms | **12 ms** | — | 24 MB |
| pi | 0.87.1 | 403.5 MB (pkg) | 221 ms | **280 ms** | **7 ms** | 145 MB |
| gemini cli | 0.61.0 | 102.1 MB (pkg) | 1431 ms | **1509 ms** | **0 ms** | 145 MB |
| copilot cli | GitHub Copilot CLI 1.0.88. | 169.6 MB (pkg) | 588 ms | **692 ms** | — | 48 MB |
| crush | crush version v0.96.1 | 123.7 MB (pkg) | 152 ms | **452 ms** | — | 69 MB |
| goose | 1.52.0 | 300.8 MB | 7 ms | **7 ms** | **0 ms** | — |
| aider | aider 0.86.2 | 642.8 MB (pkg) | 771 ms | **698 ms** | **10 ms** | 67 MB |
| amp | n/a (not installed) | — | — | — | — | — |
| cursor-agent | n/a (not installed) | — | — | — | — | — |
| qwen code | 0.24.4 | 154.6 MB (pkg) | 37 ms | **1547 ms** | — | 26 MB |
| codebuff | n/a (not installed) | — | — | — | — | — |
| kilo code | 7.7.9 | 542.5 MB (pkg) | 985 ms | **1695 ms** | **46 ms** | 46 MB |

fox-agent headless vs scripted local provider: time to first token **51 ms**, peak RSS **59 MB**.

_Generated 2026-09-24T13:23:42Z on Linux x86_64 (6.17.0-1022-azure). [How this is measured](#benchmarks) · [raw JSON](bench/results.json)_
