# Contributing

Thanks for considering a contribution to fox-agent.

## Quick Start

**Prebuilt binary** (for users):

```bash
curl -fsSL https://github.com/QQSHI13/fox-agent/raw/main/install.sh | bash
```

**From source** (for contributors). Requires [Bun](https://bun.sh) >= 1.4.0.

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
bun run typecheck     # must be clean
bun test              # full suite, must be 0 failures
```

### ACP changes

If you touched anything under `src/acp/`, run the external acceptance script. It drives the built binary with the real `acpx` client and catches wire-format mistakes the in-process tests cannot:

```bash
bun run build && bun scripts/acp-accept.ts
```

Requires `acpx` globally installed (`npm i -g acpx`).

## Before Opening a PR

```bash
bun run typecheck    # must be clean
bun test             # must be 0 failures
```

If you touched `src/acp/`, also run the acceptance check above.

Tests must be hermetic: point `FOX_AGENT_HOME` / `FOX_AGENT_CONFIG` at tmp dirs, never the real user config. See existing suites under `test/` for the pattern.

## Style

- Match the file you're in. Terse comments, no decorative reformatting.
- No emoji in user-facing output.
- No `any` unless the boundary genuinely requires it.
- Inline single-use helpers. One concept per file; ~500 lines is a review trigger, not a hard limit.
- Commit messages are lowercase, `area: what changed` (e.g. `tui: draggable scrollbar`).
- `src/core/events.ts` is the event contract shared by every frontend — extend it there, not around it.

## Architecture rules that are easy to break

These invariants are what keep the frontends in sync. A PR that violates one will look fine in isolation and break a consumer you didn't touch.

- **Events**: `src/core/events.ts` is the single vocabulary of what a turn emits. Add a field there, then map it in each sink (TUI, ACP, A2A, headless).
- **System prompt**: static, built once. Per-step state (cwd, todos, context figure) rides a runtime tail on the last user message — never modify the system prompt mid-turn.
- **Context**: messages are an append-only log. `context/view.ts` projects it. Never mutate stored rows; emit ops instead.
- **Plugins**: read from `~/.config/fox-agent/config.toml` only. A project `fox-agent.toml` cannot add plugins — that is a security boundary, not a preference.
- **TUI**: push-based. Regions own their planes; the frame loop only composites and flushes. Never add pull-based signature checks to the frame tick.

## Reporting Bugs

Include the fox-agent version (`fox --version`), your OS/terminal, and the smallest repro you can. Debug logs live at `$FOX_AGENT_HOME/debug.log` (`~/.local/share/fox-agent` by default) — the tail of that file is usually the useful part.

## Project Layout

```
src/
  core/       config cascade (TOML), on-disk paths, structured errors, event vocabulary, discovery
  store/      per-session sqlite (messages/ops/refs/kv), session index, forks, prune
  context/    view projection + pairing repair, rendering, budgets, compaction
  loop/       turn manager (retries, parallel tools, step caps), static system prompt + per-step runtime tail
  providers/  openai-compatible + openai-responses + anthropic (cache_control) + google, models.dev catalog
  acp/        ACP server (fox --acp), ACP client (drives other agents), event mapping
  a2a/        A2A server (fox --a2a), A2A client (drives remote agents)
  lsp/        language server pool, frame codec, diagnostic formatting
  mcp/        MCP shared-daemon pool (one per config, many fox instances share it)
  tools/      builtins + MCP bridge + registry
  plugins/    plugin loader + the public FoxPlugin/PluginHooks types + bundled plugins
  skills/     SKILL.md discovery and frontmatter parsing
  tui/        ANSI renderer + push-based compositor + app
  cli/        headless/JSON output mode (fox json)
  gateway/    web chat host
  sdk.ts      library entry (createAgent)
test/         bun test suites
scripts/      acp-accept.ts
```
