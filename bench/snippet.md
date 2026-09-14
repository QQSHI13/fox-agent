![bundle size](bench/bundle.svg)
![time to first char](bench/tui-first-char.svg)
![idle memory](bench/memory.svg)

| agent | version | bundle | `--version` | TUI 1st byte | idle PSS |
|---|---|---|---|---|---|
| **fox-agent** | 0.3.1 | 88.9 MB | 17 ms | **20 ms** | 33 MB |
| claude code | n/a (not installed) | — | — | — | — |
| codex | n/a (not installed) | — | — | — | — |
| opencode v1 | n/a (not installed) | — | — | — | — |
| opencode v2 | opencode v2.0.3 | 206.4 MB | 122 ms | **230 ms** | 98 MB |
| jcode | n/a (not installed) | — | — | — | — |
| pi | n/a (not installed) | — | — | — | — |
| gemini cli | n/a (not installed) | — | — | — | — |
| copilot cli | GitHub Copilot CLI 1.0.83. | 177.3 MB | 787 ms | **958 ms** | 236 MB |
| crush | n/a (not installed) | — | — | — | — |
| goose | n/a (not installed) | — | — | — | — |
| aider | n/a (not installed) | — | — | — | — |
| amp | n/a (not installed) | — | — | — | — |
| cursor-agent | n/a (not installed) | — | — | — | — |
| qwen code | n/a (not installed) | — | — | — | — |
| codebuff | n/a (not installed) | — | — | — | — |
| kilo code | n/a (not installed) | — | — | — | — |

fox-agent headless vs scripted local provider: time to first token **83 ms**, peak RSS **n/a on this machine (/usr/bin/time missing)**.

_Generated 2026-09-14T12:42:01Z on Linux x86_64 (6.8.0-1064-azure). [How this is measured](#benchmarks) · [raw JSON](bench/results.json)_
