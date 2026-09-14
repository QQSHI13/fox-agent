![bundle size](bench/bundle.svg)
![time to first char](bench/tui-first-char.svg)
![idle memory](bench/memory.svg)

| agent | version | bundle | `--version` | TUI 1st byte | idle PSS |
|---|---|---|---|---|---|
| **fox-agent** | 0.4.0 | 88.9 MB | 12 ms | **14 ms** | 35 MB |
| claude code | 2.1.270 (Claude Code) | 224.0 MB | 9 ms | **207 ms** | 176 MB |
| codex | codex-cli 0.154.0 | 339.1 MB (pkg) | 41 ms | **38 ms** | 49 MB |
| opencode v1 | 1.18.30 | 0.0 MB (entry) | 618 ms | **1024 ms** | 329 MB |
| opencode v2 | opencode2 v0.0.0-beta-19271 | 207.4 MB | 82 ms | **135 ms** | 97 MB |
| jcode | jcode v0.84.0 (57d587899) | 0.0 MB (entry) | 10 ms | **13 ms** | 28 MB |
| pi | 0.85.1 | 415.1 MB (pkg) | 291 ms | **352 ms** | 144 MB |
| gemini cli | 0.59.0 | 101.8 MB (pkg) | 1521 ms | **1604 ms** | 146 MB |
| copilot cli | GitHub Copilot CLI 1.0.83. | 309.5 MB (pkg) | 590 ms | **692 ms** | 47 MB |
| crush | crush version v0.94.1 | 122.1 MB (pkg) | 160 ms | **483 ms** | 69 MB |
| goose | 1.50.0 | 314.5 MB | 8 ms | **8 ms** | 25 MB |
| aider | aider 0.86.2 | 642.8 MB (pkg) | 822 ms | **739 ms** | 67 MB |
| amp | n/a (not installed) | — | — | — | — |
| cursor-agent | n/a (not installed) | — | — | — | — |
| qwen code | 0.23.3 | 138.0 MB (pkg) | 37 ms | **1580 ms** | 27 MB |
| codebuff | n/a (not installed) | — | — | — | — |
| kilo code | 7.6.2 | 538.8 MB (pkg) | 998 ms | **1830 ms** | 46 MB |

fox-agent headless vs scripted local provider: time to first token **52 ms**, peak RSS **58 MB**.

_Generated 2026-09-14T12:52:17Z on Linux x86_64 (6.17.0-1022-azure). [How this is measured](#benchmarks) · [raw JSON](bench/results.json)_
