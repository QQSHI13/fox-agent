# AGENTS.md

Working notes for agents (human or otherwise) editing fox-agent itself.

## Build, test, verify

```bash
bun install
bun run build          # -> bin/fox
bun run typecheck      # tsc --noEmit; must stay clean
bun test               # full suite, must be 0 fail
```

Run typecheck + tests before every commit. The commit workflow is: one logical
change per commit, `git commit && git push origin HEAD` — pushing is expected,
do not ask.

Protocol changes under `src/acp/` additionally need the external acceptance
check, which cannot be faked by the in-process tests:

```bash
bun run build && bun scripts/acp-accept.ts
```

## Conventions

- **No emoji in UI output.** Status lines, tool labels, warnings: plain ASCII
  markers (`·`, `✓`, `✗` are established).
- **Tests are hermetic.** Set `FOX_AGENT_HOME` and `FOX_AGENT_CONFIG` to tmp
  paths; never touch the real `~/.config/fox-agent` or `~/.local/share/fox-agent`
  from a test. See existing suites under `test/` for the pattern.
- **`src/core/events.ts` is the single event contract.** TUI, ACP, A2A and the
  CLI all map from it — add a field there, then map it in each sink, rather
  than inventing a side channel.
- **Plugins load from the global config only.** Never read a `plugins` array
  from project `fox-agent.toml`; that rule is a security boundary, not a taste
  choice (see the README's plugin section).
- **Version lives in `package.json`.** `src/core/version.ts` re-exports it;
  nothing else hardcodes a version string.
- **Minimal diffs.** Match the surrounding file's style; do not reformat,
  rename, or "clean up" code the task doesn't touch.

## Layout

See the README's Layout section — it is kept current and is the map.
