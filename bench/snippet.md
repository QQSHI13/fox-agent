![bundle size](bench/bundle.svg)
![time to first char](bench/tui-first-char.svg)
![time to first input](bench/tui-first-input.svg)
![idle memory](bench/memory.svg)

| agent | version | bundle | `--version` | TUI 1st byte | TUI 1st input | idle PSS |
|---|---|---|---|---|---|---|
| **fox-agent** | 0.5.0-beta.1 | 89.8 MB | 9 ms | **11 ms** | — | 36 MB |
| claude code | 2.1.293 (Claude Code) | 252.8 MB | 9 ms | **138 ms** | — | 185 MB |
| codex | codex-cli 0.161.0 | 450.4 MB (pkg) | 31 ms | **33 ms** | — | 49 MB |
| opencode v2 | opencode2 v0.0.0-beta-19271 | 207.4 MB | 56 ms | **88 ms** | **38 ms** | 123 MB |
| jcode | jcode v0.91.0 (439a243bb) | 135.1 MB | 7 ms | **9 ms** | — | 27 MB |
| pi | 1.1.0 | 123.3 MB (pkg) | 146 ms | **187 ms** | **5 ms** | 133 MB |
| gemini cli | 0.63.0 | 102.3 MB (pkg) | 964 ms | **1023 ms** | **0 ms** | — |
| copilot cli | GitHub Copilot CLI 1.0.93. | 181.6 MB (pkg) | 73 ms | **609 ms** | — | 47 MB |
| crush | crush version v0.97.1 | 128.5 MB (pkg) | 98 ms | **381 ms** | — | 68 MB |
| goose | 1.53.0 | 298.7 MB | 6 ms | **7 ms** | **0 ms** | — |
| aider | aider 0.86.2 | 642.8 MB (pkg) | 581 ms | **475 ms** | **6 ms** | 67 MB |
| amp | 0.0.1791460855-g1f688c (released 2026-10-08T12:00:55.000Z, 1 | 133.9 MB | 168 ms | **177 ms** | **0 ms** | 165 MB |
| cursor-agent | 2026.10.01-e373342 | 581.7 MB (pkg) | 296 ms | **274 ms** | — | 215 MB |
| qwen code | 0.25.0 | 146.2 MB (pkg) | 28 ms | **516 ms** | — | 288 MB |
| codebuff | 1.0.688 | 3.1 MB (pkg) | 645 ms | **590 ms** | — | 58 MB |
| kilo code | 7.8.8 | 653.7 MB (pkg) | 560 ms | **1554 ms** | **23 ms** | 46 MB |
| droid | 0.236.0 | 278.9 MB | 51 ms | **58 ms** | — | 232 MB |
| kimi code | 2.1.1 | 190.8 MB | 355 ms | **456 ms** | **10 ms** | 354 MB |
| devin | devin 3000.11.3 (9c803229faa4) | 195.0 MB | 3 ms | **31 ms** | — | 49 MB |
| cline | 3.0.70 | 322.1 MB (pkg) | 666 ms | **807 ms** | — | 55 MB |
| continue | 1.5.47 | 82.7 MB (pkg) | 699 ms | — | — | 318 MB |
| iflow cli | 0.5.19 | 180.2 MB (pkg) | 743 ms | **798 ms** | **43 ms** | 58 MB |

fox-agent headless vs scripted local provider: time to first token **44 ms**, peak RSS **66 MB**.

_Generated 2026-10-08T13:28:15Z on Linux x86_64 (6.17.0-1022-azure). [How this is measured](#benchmarks) · [raw JSON](bench/results.json)_
