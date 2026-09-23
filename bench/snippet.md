![bundle size](bench/bundle.svg)
![time to first char](bench/tui-first-char.svg)
![time to first input](bench/tui-first-input.svg)
![idle memory](bench/memory.svg)

| agent | version | bundle | `--version` | TUI 1st byte | TUI 1st input | idle PSS |
|---|---|---|---|---|---|---|
| **fox-agent** | 0.5.0-beta.1 | 89.2 MB | 11 ms | **12 ms** | — | 35 MB |
| claude code | 2.1.280 (Claude Code) | 233.7 MB | 6 ms | **157 ms** | — | 172 MB |
| codex | codex-cli 0.156.1 | 386.9 MB (pkg) | 35 ms | **38 ms** | — | 49 MB |
| opencode v1 | 1.18.32 | 185.2 MB | 496 ms | **837 ms** | **35 ms** | 361 MB |
| opencode v2 | opencode2 v0.0.0-beta-19271 | 207.4 MB | 64 ms | **113 ms** | **59 ms** | 128 MB |
| jcode | jcode v0.88.0 (ee4cd3db3) | 130.1 MB | 6 ms | **8 ms** | — | 24 MB |
| pi | 0.87.1 | 403.5 MB (pkg) | 187 ms | **238 ms** | **6 ms** | 148 MB |
| gemini cli | 0.60.0 | 102.0 MB (pkg) | 1190 ms | **1274 ms** | **0 ms** | — |
| copilot cli | GitHub Copilot CLI 1.0.88. | 169.6 MB (pkg) | 490 ms | **608 ms** | — | 47 MB |
| crush | crush version v0.96.1 | 123.7 MB (pkg) | 122 ms | **427 ms** | — | 69 MB |
| goose | 1.51.0 | 312.5 MB | 5 ms | **5 ms** | — | — |
| aider | aider 0.86.2 | 642.8 MB (pkg) | 612 ms | **545 ms** | **8 ms** | 67 MB |
| amp | n/a (not installed) | — | — | — | — | — |
| cursor-agent | n/a (not installed) | — | — | — | — | — |
| qwen code | 0.24.4 | 154.6 MB (pkg) | 30 ms | **1291 ms** | — | 26 MB |
| codebuff | n/a (not installed) | — | — | — | — | — |
| kilo code | 7.7.9 | 542.5 MB (pkg) | 878 ms | **1546 ms** | **42 ms** | 46 MB |

fox-agent headless vs scripted local provider: time to first token **50 ms**, peak RSS **58 MB**.

_Generated 2026-09-23T13:34:02Z on Linux x86_64 (6.17.0-1022-azure). [How this is measured](#benchmarks) · [raw JSON](bench/results.json)_
