# AGENTS.md

Working notes for agents (human or otherwise) editing fox-agent itself.

## Commands

- After code changes: `bun run typecheck` — must be clean. Then `bun test` — must be 0 failures.
- ACP protocol changes additionally need: `bun run build && bun scripts/acp-accept.ts` (requires `acpx` globally installed).
- `bun run typecheck` uses `bun check` — Bun's parallel typechecker, ~1.5 s for 202 files. Never run `tsc` directly; `bun check` is the gate.
- Never run `bun test` from the repo root for a single suite; run `bun test test/<file>.test.ts` directly.

## Git

- One logical change per commit. Commit messages are lowercase, `area: what changed` (e.g. `tui: draggable scrollbar`).
- Push is expected after committing: `git push origin HEAD`. Do not ask.
- Only commit files you changed. Stage explicit paths; never `git add -A` or `git add .`.
- Never `git reset --hard`, `git stash`, or `git clean -fd` unless the user explicitly asks.

## Code style

- No emoji in UI output. Status lines, tool labels, warnings: plain ASCII markers (`·`, `✓`, `✗` are established).
- No `any` unless the boundary genuinely requires it. Prefer `unknown` + narrowing.
- No boolean flag parameters that switch behavior. Two functions, or a tagged options object.
- Inline single-use helpers. Do not extract a function that has exactly one call site unless it names a real concept.
- One concept per file. If a file exceeds ~500 lines, that is a signal to split — not a hard limit, but a review trigger.
- Match the surrounding file's style. Do not reformat, rename, or "clean up" code the task doesn't touch.

## Architecture invariants

These are load-bearing. Violating one breaks a consumer you can't see.

- **`src/core/events.ts` is the single event contract.** Every frontend (TUI, ACP, headless JSON) maps from it. Add a field there, then map it in each sink — never invent a side channel.
- **Plugins load from the global config only.** Never read `plugins` from a project `fox-agent.toml`. This is a security boundary, not a preference.
- **The system prompt is static.** It is built once from the tool registry + project instructions. Per-step runtime state (cwd, todos, context figure) rides a runtime tail appended to the last user message — never modify the system prompt mid-turn.
- **Context is a view, not a copy.** Messages are an append-only log. `context/view.ts` projects it. Never mutate stored rows; emit ops (delete, replace, restore) instead.
- **The TUI is push-based, with dependencies declared by reads.** Each region is an `effect` over the version signals in `src/tui/reactive.ts`; a region repaints only when something it actually read changed. The frame loop drains pending effects, then does exactly ONE composite and one flush — it never calls paint code and never decides what to redraw. Do not reintroduce a “mark everything dirty” fan-out: if a region must repaint, make its paint function read the signal that changed.
- **Version lives in `package.json`.** `src/core/version.ts` re-exports it; nothing else hardcodes a version string.

## Testing

- Tests are hermetic. Set `FOX_AGENT_HOME` and `FOX_AGENT_CONFIG` to tmp paths; never touch the real `~/.config/fox-agent` or `~/.local/share/fox-agent` from a test.
- `bun test` runs the full suite. It is the final gate, not the iteration loop. During development, run the specific suite you are touching.
- Test actual behavior, not implementation details. Do not duplicate logic into tests.
- A regression test for a fixed bug should include a comment with the issue number or a short description of the bug.

## Dependencies

- Runtime deps are pinned. Do not add `^` or `~` prefixes to new dependencies.
- Do not add lifecycle scripts (`postinstall`, etc.) without explicit review.
- The SDK is a dynamic import at the MCP bridge and the pool daemon, so fox-agent runs without it. Keep it that way.

## Layout

See the README's Layout section — it is kept current and is the map.
