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
  a2a/        A2A server (fox --a2a), A2A client (drives remote agents)
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
A2A and the CLI all *map from* it — add a field there, then map it in each sink,
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
bun run typecheck  # tsc --noEmit; must be clean
bun test           # full suite; must be 0 fail
```

`--bytecode` caches compiled JS bytecode in the binary (measured: ~2x faster time
to first frame, ~6MB less idle PSS); `--minify` is a smaller extra win.

The docs under `docs/agent/` are embedded at build time via text imports and
materialized to `$FOX_AGENT_HOME/docs/` at startup, version-stamped so the files
never contradict the binary serving them. See
[`src/core/selfdocs.ts`](https://github.com/QQSHI13/fox-agent/blob/main/src/core/selfdocs.ts).

## Security model

fox-agent is a **trusted-workspace** tool. Read this before pointing it at code
you did not write.

- **No sandbox, no permission prompts.** `exec`, `pty`, `write`, `edit` and MCP
  tools run with your full user privileges in your cwd. Anything the model decides
  to run, runs.
- **Prompt injection is the real risk.** Tool output — file contents, `fetch`
  responses, MCP server replies — enters the context as data the model acts on. A
  repo or web page can therefore attempt to steer the agent. Treat a fox-agent
  session on untrusted input as equivalent to running that input's code.
- **No credential stripping: children get your full environment.** `exec`, `pty`
  (tmux), MCP servers, language servers and ACP agents all inherit `process.env`
  via `src/core/childenv.ts` with no filtering. Keys live in `~/.bashrc` / exported
  env and the agent can `read` those files directly, so stripping `*_API_KEY` was
  theater. Assume any command, MCP server, LSP server or delegated agent can see
  every env var.
- **Session data is local and unencrypted**: one SQLite file per session under
  `FOX_AGENT_HOME`, containing full transcripts and tool output. `pty/`
  additionally holds raw shell output logs. Delete a session with
  `/delete <id> yes` in the TUI or ACP `session/delete` (`deleteSession` in the
  SDK), which removes the file *and* its `index.db` row; removing only the file
  leaves it listed as an empty session.
- **MCP servers are arbitrary executables** you configure by command line;
  fox-agent spawns them and trusts their tool descriptions.
- **A plugin is not a child process — it is code inside fox-agent.** Imported into
  fox-agent's own process with your full environment, API key included, able to do
  anything fox-agent can. That is why `plugins` is read from
  `~/.config/fox-agent/config.toml` only. Vet a plugin the way you would vet a
  shell profile.
- **Language servers are spawned automatically** when diagnostics are on (the
  default): a built-in server found on `PATH`, or any command you name in
  `[lsp.*]`, started in the project root and shown the contents of files fox-agent
  edits. Unlike MCP, no server runs unless it is already installed — but a `PATH`
  you don't control means a program you don't control. `diagnostics = false`
  disables it.
- **Trust gate: trusted folders get full agent control, untrusted get safe
  defaults.** On interactive TUI start fox-agent shows the working directory and
  asks whether the folder is trusted — one keypress (`y` / `n` / `c`). Only
  continue in a repo you created, your team's, or a verified well-known project
  (stars can be faked). Trusted dirs are saved to `$FOX_AGENT_HOME/trusted_dirs`
  (`--trust` skips the prompt). In an **untrusted** directory, project
  `fox-agent.toml` executable sections (`[mcpServers.*]`, `[agents.*]`, `[lsp.*]`,
  `[providers.*]` including `!cmd`) plus project `baseUrl`/`apiKey` are ignored
  with warnings — safe keys (model, theme, …) still apply. Headless and ACP never
  prompt; they run restricted instead. `AGENTS.md`/`CLAUDE.md` instructions and any
  file the agent reads can still steer it — only trust a directory you verified.
- **`fetch` cannot reach the local network.** Loopback/private/link-local hosts
  and cloud metadata (`169.254.169.254`) are refused, every redirect hop is
  re-checked, and bodies are stream-capped before truncation.
  `FOX_AGENT_ALLOW_PRIVATE_FETCH=1` re-enables local URLs deliberately.
- **`--a2a` and `fox gateway` bind local-only by default**: they run tools with
  full machine access and have no auth layer.

Run it in a container or VM for anything you don't trust.
