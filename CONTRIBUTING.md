# Contributing

## Setup

Requires [Bun](https://bun.sh) (1.1+).

```bash
git clone https://github.com/QQSHI13/fox-agent
cd fox-agent
bun install
bun run build        # -> bin/fox
```

## Checks

Before opening a PR:

```bash
bun run typecheck    # must be clean
bun test             # must be 0 failures
```

If you touched anything under `src/acp/`, also run the external acceptance
script — it drives the built binary with the real `acpx` client and catches
wire-format mistakes the in-process tests cannot:

```bash
bun run build && bun scripts/acp-accept.ts
```

Tests must be hermetic: point `FOX_AGENT_HOME` / `FOX_AGENT_CONFIG` at tmp
dirs, never the real user config.

## Style

- Match the file you're in. Terse comments, no decorative reformatting.
- No emoji in user-facing output.
- One logical change per commit; commit messages are lowercase,
  `area: what changed` (e.g. `tui: draggable scrollbar`).
- `src/core/events.ts` is the event contract shared by every frontend —
  extend it there, not around it.

## Reporting bugs

Include the fox-agent version (`fox --version`), your OS/terminal, and the
smallest repro you can. Debug logs live at
`$FOX_AGENT_HOME/debug.log` (`~/.local/share/fox-agent` by default) — the
tail of that file is usually the useful part.
