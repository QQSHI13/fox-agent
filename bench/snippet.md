![bundle size](bench/bundle.svg)
![time to first char](bench/tui-first-char.svg)
![idle memory](bench/memory.svg)

| agent | version | bundle | `--version` | TUI 1st byte | idle PSS |
|---|---|---|---|---|---|
| **fox-agent** | 0.4.0 | 89.0 MB | 10 ms | **12 ms** | 35 MB |
| claude code | 2.1.274 (Claude Code) | 230.6 MB | 8 ms | **164 ms** | 183 MB |
| codex | codex-cli 0.154.0 | 339.1 MB (pkg) | 36 ms | **32 ms** | 49 MB |
| opencode v1 | 1.18.31 | 185.0 MB | 465 ms | **752 ms** | 354 MB |
| opencode v2 | opencode2 v0.0.0-beta-19271 | 207.4 MB | 68 ms | **111 ms** | 97 MB |
| jcode | jcode v0.84.0 (57d587899) | 0.0 MB (entry) | 8 ms | **10 ms** | 29 MB |
| pi | 0.85.1 | 415.1 MB (pkg) | 229 ms | **279 ms** | 148 MB |
| gemini cli | 0.60.0 | 102.0 MB (pkg) | 1192 ms | **1242 ms** | — |
| copilot cli | GitHub Copilot CLI 1.0.85. | 166.5 MB (pkg) | 459 ms | **539 ms** | 48 MB |
| crush | crush version v0.95.0 | 122.4 MB (pkg) | 122 ms | **492 ms** | 68 MB |
| goose | 1.50.1 | 314.6 MB | 6 ms | **6 ms** | 26 MB |
| aider | aider 0.86.2 | 642.8 MB (pkg) | 607 ms | **561 ms** | 69 MB |
| amp | n/a (not installed) | — | — | — | — |
| cursor-agent | n/a (not installed) | — | — | — | — |
| qwen code | 0.24.0 | 140.7 MB (pkg) | 33 ms | **1234 ms** | 26 MB |
| codebuff | n/a (not installed) | — | — | — | — |
| kilo code | 7.7.3 | 539.9 MB (pkg) | 817 ms | **1378 ms** | 46 MB |

fox-agent headless vs scripted local provider: time to first token **43 ms**, peak RSS **58 MB**.

_Generated 2026-09-17T12:17:41Z on Linux x86_64 (6.17.0-1022-azure). [How this is measured](#benchmarks) · [raw JSON](bench/results.json)_
