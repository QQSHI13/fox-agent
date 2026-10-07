# fox-agent themes and TUI

## Themes

A theme is a record of named colors (`fg`, `dim`, `accent`, `user`, `think`, `tool`, `error`, `selBg`, ... — full shape in `src/tui/themes.ts`, `Theme` interface). Built-in presets live in `THEME_PRESETS` in the same file.

- Switch: `/theme` (searchable chooser) or `/theme <name>`; saves to the global config.
- Custom themes come from plugins (`FoxPlugin.themes`, keyed by name) — see the plugins doc. `theme = "<name>"` in config selects one; `registerThemes` makes it available.
- No config-file theme definition (TOML colors) exists yet — custom looks go through a plugin module.

## TUI behavior facts (the ones that matter when debugging)

- Frame loop is O(window): only the visible slice of the transcript renders per frame; counts come from a per-item cache. A slow frame (over the budget) is logged to `debug.log` when `debug = true` (`/debug on|off|tail`).
- The viewport is virtualized: `rows[0]` is an absolute row offset, painting maps window rows to screen rows via `winOffset`. Scroll-to-top (Home) clamps `scrollTop` to `[0, total - vh]`; stick-to-bottom wins when clamped to the max.
- Status bar segments drop whole segments left-to-right on narrow terminals; the dock (input area) never truncates mid-text. `statusBar` config: space-separated segment names (`cwd provider model ctx`); plugins contribute extra names via `statusSegments`.
- Selection is a re-style over painted cells (drag with mouse), never a second text pass.
- Scrollbar paints only on overflow, in the last column; tool rows leave that column free so the track shows through.
- `ctx` markers `[N]` in the transcript are stable node ids; `[mN]`-style inline markers in text are display aliases of the same ids.

## Keybindings (default)

`enter` send · `ctrl+up` withdraw last queued message · `ctrl+s` steer (inject after current tool) · `esc` interrupt turn · `pgup/pgdn` page · `home/end` top/bottom of transcript · `ctrl+c` cancel picker/box, twice to exit · `!cmd` shell mode (first char) · `/cmd` slash command (first char) · `@path` mention inlines a file.
