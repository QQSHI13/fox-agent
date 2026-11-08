---
tags:
  - architecture
---

# Architecture

## Layout

```
src/
  core/       config cascade (TOML), on-disk paths, structured errors, event vocabulary
  store/      per-session sqlite (messages/ops/refs/kv), session index, forks, prune
  context/    view projection + pairing repair, rendering, budgets
  loop/       turn manager (retries, parallel tools, step caps), static system prompt + per-step runtime tail
  providers/  openai-compatible + openai-responses + anthropic (cache_control) + google, models.dev catalog
  acp/        ACP server (fox --acp), ACP client (drives other agents), event mapping
  lsp/        language server pool, frame codec, diagnostic formatting
  tools/      builtins + MCP bridge + registry
  plugins/    plugin loader + the public FoxPlugin/PluginHooks types + bundled plugins
  gateway/    `fox gateway` web chat host
  tui/        ANSI renderer + app
  sdk.ts      library entry (createAgent)
test/         bun test suites (projection, turn manager, patch engine, acp, lsp, plugins, ...)
scripts/      acp-accept.ts -- drives bin/fox --acp with a real external ACP client
docs/         this site, plus agent/ (docs embedded into the binary for the agent itself)
```

## One event contract

`src/core/events.ts` is the single vocabulary of what a turn emits. The TUI, ACP,
and the CLI all *map from* it — add a field there, then map it in each sink,
rather than inventing a side channel.

That is why a feature added for the TUI shows up in `fox json` and over ACP without
a second implementation, and why the headless NDJSON stream is a faithful record
of a turn rather than a reduced view of one.

## One turn loop

`src/loop/turn.ts` (`runTurnCore`) is the only turn implementation. It owns step
caps, retry/backoff on 429/5xx, parallel tool execution, abort-safe partial
persistence, compaction and hook dispatch. Every surface in the table above is a
thin adapter over it.

The system prompt is **static** — built once from the live tool registry and
project instructions — and everything per-step (cwd, todos, context figure) rides
a **runtime tail** appended to the last user message. That split exists because the
system prompt is the provider's cached prefix: a live value there re-bills the
entire prompt on every step.

## Context as a view

Messages are an append-only log. What the model sees is a **projection** of that
log through view ops, computed by `src/context/view.ts`.

The invariant worth protecting: every assistant `tool_call` is followed by its
`tool_result`. Projection repairs pairs, because a provider hard-400s on an
orphan. This is also why plugin hooks return patches instead of message arrays —
see [Plugins](../plugins/index.md#hooks-are-additive-by-design).

## Build

A single binary compiled straight from source, no `dist` intermediates:

```bash
bun run build      # bun build --compile --bytecode --minify src/cli.ts
bun run typecheck  # bun check --no-pretty; must be clean
bun test           # full suite; must be 0 fail
```

`--bytecode` caches compiled JS bytecode in the binary (measured: ~2x faster time
to first frame, ~6MB less idle PSS); `--minify` is a smaller extra win.

The docs under `docs/agent/` are embedded at build time via text imports and
materialized to `$FOX_AGENT_HOME/docs/` at startup, stamped with a fingerprint of
their own content (version **and** text hash) so a doc edit that ships without a
release bump still rewrites the dir — the files never contradict the binary
serving them. See
[`src/core/selfdocs.ts`](https://github.com/QQSHI13/fox-agent/blob/main/src/core/selfdocs.ts).

## Security model

There is no sandbox, no permission prompt and no credential stripping; every
child process inherits your environment, and a plugin is code inside fox-agent's
own process. Those are design decisions with consequences, so they get their own
page: **[Security model](security.md)**.
