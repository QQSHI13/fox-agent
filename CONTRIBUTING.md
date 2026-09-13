# Contributing

Thanks for considering a contribution to fox-agent.

## Quick Start

### Option 1: Prebuilt binary (for users)

```bash
curl -fsSL https://github.com/QQSHI13/fox-agent/raw/main/install.sh | bash
```

### Option 2: From source (for contributors)

Requires [Bun](https://bun.sh) >= 1.4.0.

```bash
git clone https://github.com/QQSHI13/fox-agent.git
cd fox-agent
bun install
bun run build        # -> bin/fox
```

## Development

```bash
bun run dev           # run from source without building
bun run build         # build binary to bin/fox
bun run typecheck     # tsc --noEmit; must be clean
bun test              # full suite, must be 0 failures
```

### ACP changes

If you touched anything under `src/acp/`, run the external acceptance script.
It drives the built binary with the real `acpx` client and catches wire-format
mistakes the in-process tests cannot:

```bash
bun run build && bun scripts/acp-accept.ts
```

This requires `acpx` to be installed globally (`npm i -g acpx`).

## Before Opening a PR

```bash
bun run typecheck    # must be clean
bun test             # must be 0 failures
```

If you touched `src/acp/`, also run the acceptance check above.

Tests must be hermetic: point `FOX_AGENT_HOME` / `FOX_AGENT_CONFIG` at tmp
dirs, never the real user config. See existing suites under `test/` for the
pattern.

## Style

- Match the file you're in. Terse comments, no decorative reformatting.
- No emoji in user-facing output.
- One logical change per commit; commit messages are lowercase,
  `area: what changed` (e.g. `tui: draggable scrollbar`).
- `src/core/events.ts` is the event contract shared by every frontend --
  extend it there, not around it.

## Reporting Bugs

Include the fox-agent version (`fox --version`), your OS/terminal, and the
smallest repro you can. Debug logs live at
`$FOX_AGENT_HOME/debug.log` (`~/.local/share/fox-agent` by default) -- the
tail of that file is usually the useful part.

## Project Layout

```
src/
  core/       config cascade (TOML), on-disk paths, structured errors, event vocabulary
  store/      per-session sqlite (messages/ops/refs/kv), session index, forks, prune
  context/    view projection + pairing repair, rendering, budgets, compaction
  loop/       turn manager (retries, parallel tools, step caps), system prompt
  providers/  openai-compatible + openai-responses + anthropic (cache_control) + google, models.dev catalog
  acp/        ACP server (fox --acp), ACP client (drives other agents), event mapping
  lsp/        language server pool, frame codec, diagnostic formatting
  tools/      builtins + MCP bridge + registry
  plugins/    plugin loader + the public FoxPlugin/PluginHooks types
  tui/        ANSI renderer + app
  sdk.ts      library entry (createAgent)
test/         bun test suites
scripts/      acp-accept.ts
```
