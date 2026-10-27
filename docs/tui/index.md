# The TUI

The terminal UI is a custom ANSI renderer, not a widget library: streaming
markdown, inline `[N]` message markers, slash commands, `!` shell mode, mouse
selection and themes.

```bash
fox            # TUI in a new session bound to cwd
fox -c         # resume latest (picker in a terminal)
fox -c 2       # resume by 'fox ls' index, or by id
fox mini       # plain streaming REPL — everything but markdown and live rewrites
```

## Keybindings

| Key | Does |
|---|---|
| `enter` | Send |
| `ctrl+up` | Withdraw the last queued message back into the editor |
| `ctrl+s` | Steer: inject after the current tool finishes |
| `esc` | Interrupt the turn (or clear a selection first) |
| `pgup` / `pgdn` | Page the transcript |
| `home` / `end` | Top / bottom of the transcript |
| `ctrl+c` | Cancel a picker or box; with nothing open, interrupt — twice to exit |
| `!cmd` | Shell mode (first character of the input) |
| `/cmd` | Slash command (first character) |
| `@path` | Mention: inline the file's contents at dispatch |

Ctrl+C copies a live selection instead of interrupting. Press it again with
nothing selected to abort the turn.

## Steering mid-turn

Two ways to stay in the loop while the agent works:

- **Queue a message** — just type and press enter. Queued messages stack above
  the input until sent; `ctrl+up` withdraws the last one back into the editor.
- **Steer** — `ctrl+s` injects after the current tool call finishes, so a
  correction lands at the next step rather than waiting for the turn to end.

## Mouse and selection

fox-agent puts the terminal into button-event tracking, so it owns the mouse while
it runs — including drags, which your terminal's own selection normally handles.

- **click** a thinking block or tool output to fold/unfold it. The toggle fires on
  *release*, so a misdrag never flips it.
- **drag** across the transcript to select; release copies. Selection follows what
  is on screen, so wide characters (CJK, emoji) come back whole and trailing
  padding from wrapping is stripped.

Copy tries `powershell.exe` (WSL, UTF-8-safe — `clip.exe` mangles non-ASCII
through the console codepage), `wl-copy`, `xclip`, `pbcopy`, then OSC 52 — the
last of which works over SSH with no helper installed.

Your terminal's native selection is still available with the usual override key
(**shift**-drag in most terminals, **fn** or **option** on macOS).

## Slash commands

`/help` lists them; the hint popup derives from the same table, so the two can
never disagree.

| Command | Does |
|---|---|
| `/new` | Start a fresh session |
| `/init [focus]` | Analyze the repo and write/update `AGENTS.md` |
| `/sessions`, `/fork`, `/delete`, `/undo`, `/prune`, `/ops`, `/view` | Session and context surgery — see [Sessions](../sessions/index.md) |
| `/model [profile/][name]` | Show or switch model |
| `/login` | Provider credentials, live and in the global config |
| `/thinking [off\|minimal\|low\|medium\|high\|xhigh\|default]` | Reasoning effort |
| `/theme [name]` | Color theme |
| `/plugin` | Manage plugins |
| `/settings [key[=value]]` | Scalar config knobs |
| `/reload` | Re-read config, re-apply model, theme, caps and plugins |
| `/todo`, `/usage`, `/cost` | Task list, token totals, spend |
| `/export`, `/import`, `/share` | Move a session as a `.zip`, or render it as one offline HTML file |
| `/upgrade`, `/exit` | Self-update, quit |

Commands that mutate (`/new`, `/login`, `/settings`, `/upgrade`, …) say so in
`/help`; the TUI-only interactive parts ride `CommandResult` (`picker`, `prompt`,
`task`, `ephemeral`), which is how a plugin command behaves like a built-in.

## Status bar

A space-separated segment template — default `cwd provider model ctx cost`.
Segment names come from the built-ins plus plugin `statusSegments`. On a narrow
terminal, whole segments drop left-to-right; the input dock never truncates
mid-text.

## Themes

`/theme` opens a searchable chooser; `/theme <name>` switches and saves to the
global config. Built-in presets: `default`, `light`, `mono`, `solarized-dark`,
`dracula`, `nord`, `catppuccin-mocha`, `gruvbox-dark`, `rose-pine`, `tokyo-day`,
`everforest`. Custom themes come from plugins — see [Plugins](../plugins/index.md).

## When it feels slow

Rendering is O(window): only the visible slice of the transcript is painted per
frame, and counts come from a per-item cache — so a slow frame is a specific
row's cost, not a global one. `FOX_AGENT_FRAMEPROFILE=<file>` writes per-frame
phase timings (paint, composite, flush) for measuring one.
