---
tags:
  - reference
  - cli
---

# CLI and slash commands

Two surfaces: what you type in a shell before fox-agent starts, and what you type
at the prompt once it is running. `--help` is generated from the same tables this
page documents, so the two cannot drift.

## `fox` with no arguments

Opens the TUI in a new session bound to your current directory. On a first visit
it asks whether the directory is trusted — see the
[security model](../architecture/security.md#the-trust-gate).

## Launch flags

| Flag | Does |
|---|---|
| `-c, --continue [n\|id]` | Continue a session: latest, a `fox ls` index, or an id. No argument plus a real terminal opens the picker |
| `--no-tui` | Plain streaming mode (same as `fox mini`) |
| `--trust` | Mark this directory trusted and skip the prompt |
| `-p, --print [prompt]` | Run one prompt headless, print the answer, exit. Reads stdin when no prompt is given or stdin is piped |
| `--json` | With `-p`: emit NDJSON agent events instead of text |
| `--acp` | Serve the Agent Client Protocol on stdio |
| `-h, --help` | Usage overview, or one subcommand's help when it follows a subcommand |
| `-v, --version` | Print the version and exit without evaluating the application |

`--version` and `--help` are answered before the store, the turn loop or any
tool is loaded, so they work in a broken checkout — and stay fast enough to call
from a shell prompt.

## Overrides

Each overrides the same config key for this run only. None of them are written
back to a file.

| Flag | Config key |
|---|---|
| `--model <id>` | `model` |
| `--provider <p>` | `provider` |
| `--base-url <u>` | `baseUrl` |
| `--max-steps <n>` | `maxSteps` |
| `--retry-limit <n>` | `retryLimit` |
| `--compact-warn-at <f>` | `compactWarnAt` |
| `--compact-ctx-only-at <f>` | `compactCtxOnlyAt` |
| `--request-timeout-ms <n>` | `requestTimeoutMs` |
| `--config <path>` | which config file to read |

An unknown flag is a hard error naming the flag, the command that rejected it,
and where the full list lives — never a silent ignore.

## Subcommands

| Command | Does |
|---|---|
| `fox ls` | List sessions, most recently worked-in first, across all directories. Pass an index to resume it: `fox -c 2` |
| `fox plugin [on\|off\|add\|rm\|info <name>]` | List plugins and switch them without the TUI. Names accept `pty`, `bundled:pty`, a plugin's own name, or its path |
| `fox export <id\|current> [file]` | Pack a session's database into a `.zip` to move to another device |
| `fox import <file.zip>` | Install a session exported elsewhere; it lands under its own id |
| `fox share [file]` | Render a session as one self-contained offline HTML file |
| `fox upgrade [beta\|<version>]` | Self-update from GitHub releases. `--beta` takes the newest prerelease |
| `fox mini` | Plain streaming REPL — no TUI, no markdown |
| `fox json` | Same as `--json`: NDJSON events |
| `fox acp` | Same as `--acp` |
| `fox gateway` | Web chat UI at TUI parity, bound local-only |

`export`, `import` and `share` also exist as slash commands inside a session, and
both spellings go through the same implementation.

## Slash commands

`/help` lists these, and the hint popup derives from the same table, so the list
in a session and the list on this page cannot disagree.

### Session

| Command | Does |
|---|---|
| `/new` | Start a fresh session |
| `/sessions`, `/ls` | Browse sessions — switch, fork, delete. Accepts `[id\|n]` to jump straight there |
| `/fork [N\|id]` | Fork this session at row N, or another session by id |
| `/delete <id\|n> yes` | Delete another session for good. Refuses the one you are in |
| `/export [file]`, `/import <file>` | Move a session as a `.zip` |
| `/share [file]` | One offline HTML file — the one to use for showing someone a transcript |
| `/exit`, `/quit` | Quit |

### Context

| Command | Does |
|---|---|
| `/ops` | Show what surgery `ctx` has done |
| `/undo` | Revert the last view op |
| `/view` | Preview the visible nodes with role and preview text |
| `/prune [compact] [yes]` | Reclaim the disk hidden context leaves behind |
| `/todo`, `/todos` | The agent's current task list |
| `/usage`, `/cost` | Token totals and spend |

### Configuration

| Command | Does |
|---|---|
| `/model [profile/][name]` | Show or switch model. The picker lists every logged-in provider's models |
| `/login` | Provider credentials — a wizard in the TUI, `key=value` pairs elsewhere |
| `/thinking [off\|minimal\|low\|medium\|high\|xhigh\|default]` | Reasoning effort |
| `/theme [name]` | Color theme; bare opens a searchable chooser |
| `/settings [key[=value]]` | Scalar config knobs — see below |
| `/plugin [on\|off\|add\|rm\|info]` | Manage plugins |
| `/reload` | Re-read config and re-apply model, theme, caps and plugins |
| `/upgrade [beta\|<version>]` | Self-update |
| `/init [focus]` | Analyze the repo and write or update `AGENTS.md` |

`/model`, `/theme` and `/thinking` have their own commands rather than being
`/settings` keys because each opens a chooser, and each saves globally.

## `/settings` keys

`/settings` with no argument lists every key with its current value and default.

| Key | Default | Range |
|---|---|---|
| `maxSteps` | `0` | `>= 0`; `0` = unlimited |
| `retryLimit` | `3` | `0`–`20` |
| `compactWarnAt` | `0.8` | `(0, 1]` |
| `compactCtxOnlyAt` | `0.9` | `(0, 1]` |
| `requestTimeoutMs` | `120000` | `>= 0`; `0` = never |
| `toolOutputCap` | `30000` | `>= 1000` |
| `readCap` | `50000` | `>= 1000` |
| `toolPresentationCap` | `60000` | `>= 0`; `0` = never truncate |
| `searchLimit` | `500` | `>= 1` |
| `searchHidden` | `false` | bool |
| `sessionListLimit` | `0` | `>= 0`; `0` = every session |
| `tuiCollapsedChars` | `240` | `>= 40` |
| `tuiKeptChars` | `4000` | `>= 200` |
| `tuiScrollStep` | `2` | `1`–`40` |
| `tuiScrollbar` | `true` | bool |
| `tuiFrameMs` | `16` | `8`–`250` |
| `statusBar` | `cwd provider model ctx` | space-separated segment names |
| `contextMarkers` | `true` | bool |
| `diagnostics` | `true` | bool |
| `acpHistory` | `full` | `full`, `last`, or a positive integer |

```
/settings                     # list everything
/settings compactWarnAt=0.7   # validated, saved globally, applied live
/settings compactWarnAt=      # reset to the default
```

`statusBar` actually accepts `cwd provider model ctx readOnly` plus any segment a
plugin registers through `statusSegments`. The `cost` segment comes from the
bundled cost plugin.

## Exit codes

| Code | Meaning |
|---|---|
| `0` | Success — including a headless run that answered |
| `1` | A usage error (unknown flag or subcommand), a config that fails to parse, or `-c` in a directory with no history |
| non-zero | A provider or tool failure surfaced in a headless run |

## Related

- [Quickstart](../getting-started/quickstart.md) — the first five minutes.
- [Configuration](../configuration/index.md) — the same keys, in TOML.
- [The TUI](../tui/index.md) — keybindings once you are inside.
