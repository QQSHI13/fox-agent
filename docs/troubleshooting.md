---
tags:
  - troubleshooting
  - reference
---

# Troubleshooting

Failures here are grouped by how loud they are: things that stop fox-agent from
starting, things that cost you a `warn` line and keep going, and things that are
quietly slower or smaller than you expected.

## It won't start

### `fox-agent: unknown flag --foo`

A hard error by design — an unknown flag never silently becomes a no-op.

The message lists the flags that command accepts and the command that rejected
it. Flags belong *after* their subcommand (`fox upgrade --beta`, not
`fox --beta upgrade`).

### `fox-agent: config at <path> is not valid TOML`

The file path and the parser error are printed. A malformed config **fails
loudly** rather than being ignored: a typo used to make a broken config
indistinguishable from no config at all, which is a much worse afternoon.

Nothing is written back on a failed parse, so fixing the reported line and
re-running is always safe.

### `unknown key 'foo' in <path>` (a warning, not a failure)

The rest of the config applies; that one key does not. The known key set is
`KNOWN_KEYS` in `src/core/config.ts`, and every key is documented in
[Configuration](configuration/index.md).

### `no provider configured` / `resolveChat` names the provider back to you

Either no key was found, or `provider = "..."` names a slot that does not exist.

- `fox` with no key still opens the TUI — `/login` walks you through provider,
  key, endpoint and model.
- `provider` accepts a `[providers.<name>]` profile name, a bare wire format
  (`openai-compatible`, `openai-responses`, `anthropic`, `google`), or a name a
  plugin registered. A disabled bundled format (`disabledPlugins = ["anthropic"]`)
  stops resolving, and says so.
- The error lists what *is* available rather than falling through to
  `openai-compatible` with your Anthropic key.

### The TUI opens but the first request fails immediately

Check the model id against the provider. An OpenAI-compatible endpoint that does
not serve the model returns a 404 that reads like an auth problem. `/model`
lists what the logged-in provider actually advertises, which is the faster
check than reading the error.

## It runs, with warnings

### `plugin 'x' failed to load: ...`

One `warn` line at the top of the turn; the session continues without that
plugin. Check that the path exists, that the module's default export satisfies
`FoxPlugin`, and that it does not throw at import time. `/plugin info <name>`
prints source, status and contributions.

### `plugin 'x' overrides existing tool 'y'`

Shadowing is allowed and always reported. If it was an accident, rename the tool.
If it was the point — a guard around `exec`, say — this line is expected; see
[wrapping a tool](plugins/index.md#wrapping-a-tool-instead-of-replacing-it).

### `MCP server 'x' failed to start`

The server is spawned by the command line you gave it. Run that command by hand:

```bash
npx -y @modelcontextprotocol/server-fs /tmp
```

Common causes: the package is not installed, `npx` prompts interactively (it
cannot, under fox-agent), or the command is relative to a directory you did not
expect. Fox-agent runs with your cwd, not the config file's.

An unreachable server costs one warning per turn, never the run.

### `project config: N [mcpServers.*] entries ignored in untrusted directory`

You are in a directory fox-agent does not consider trusted, so the project
config's executable sections are ignored. That is the security boundary, not a
bug — see [the trust gate](architecture/security.md#the-trust-gate).

Bare `/trust` is not a command; the ways to change it are the prompt on TUI
start, `fox --trust`, or `FOX_AGENT_NO_TRUST_CHECK=1` for scripts.

### `env baseUrl '<x>' is not an http(s) URL — ignored`

`FOX_AGENT_BASE_URL` (and its `OPENAI_BASE_URL` fallback) must be absolute.
A trailing slash is stripped, so `https://api.example.com/v1/` is fine; a bare
`api.example.com/v1` is not.

## Slower or bigger than you expected

### A tool result never showed up — the turn moved on

That is `autoBackgroundMs` (default `3000`). A tool call still running after that
window stops being waited on, and the step continues; the result lands in the
transcript when it finishes.

If you want every call waited on, set `autoBackgroundMs = 0`, either in config or
per run with `/settings autoBackgroundMs=0`. See
[slow calls](tools/index.md#slow-calls).

### The context figure jumps and the model starts compacting

Read the runtime header: `compactWarnAt` (default `0.8`) is where the header
starts telling the agent to compact, and `compactCtxOnlyAt` (default `0.9`) is
where every tool except `ctx` is disabled until the window comes down.

The usual culprit is one enormous result — a build log, a `grep` across a
vendored tree. `toolOutputCap` bounds what a tool may *produce*, and
`toolPresentationCap` bounds what the *view* shows (the stored row stays whole).
`ctx` then hides or rewrites what is already there.

To find out what is actually big: `/usage` for totals, `/view` for the visible
nodes, and `ctx {op:"stats"}` in-session for the largest ones.

### Frames feel slow

Rendering is O(window) — only the visible slice paints, and counts come from a
per-item cache — so a slow frame is one specific row's cost. Find it with
`FOX_AGENT_FRAMEPROFILE=<file>`, which writes per-frame phase timings (paint,
composite, flush).

`tuiFrameMs` is the frame interval, not a budget to raise: lower is snappier and
costs more wakeups.

### A tool is missing from the model's roster

The roster is derived from the live registry, so a missing tool means it is not
in the registry:

```bash
fox plugin          # bundled capabilities, configured files, what each contributes
```

- `disabledPlugins` takes short (`pty`) or prefixed (`bundled:pty`) names.
- An MCP server that failed to start contributes nothing, with a warning.
- A tool whose `extensions` do not match any file is never selected — that is the
  `[lsp.*]` rule, and it is why an entry with no `extensions` is dropped rather
  than kept.

## Sessions and state

### `fox -c 3` resumed a different session than `/sessions` showed as 3

Two different lists. `fox ls` and `fox -c <n>` are always all-directories;
`/sessions` (and bare `fox -c` in a terminal) defaults to *this* directory, with
`a` to widen. The numeric index is a position in a recency-sorted list, so it
shifts as you work. For anything scripted, use the id. See
[sessions](sessions/index.md#how-fox-c-n-resolves).

### `/delete` refuses with "this is the current session"

Its database handle is open and the turn loop is appending to it; unlinking the
file would leave fox-agent writing into a vanished inode. `/new` first, then
delete.

### A session is listed but opens empty

Something removed the session's `.db` without its `index.db` row. Use
`/delete <id> yes` (or `deleteSession` from the SDK) instead of deleting the file:
that removes both halves.

### `locks/<id>.json` is stale

It should not be — the lock is turn-scoped and released in `runTurnCore`'s
`finally` — but a `kill -9` during a turn can leave the marker behind. It makes a
second opener read-only until it clears.

### Disk usage keeps climbing

`/prune` reports what hidden context is costing and changes nothing;
`/prune yes` reclaims it. `pty/` holds raw shell logs and is not pruned by either
— delete the directory when no session needs it.

## Provider and network

### `provider timed out after Ns with no response`

`requestTimeoutMs` bounds **time without progress**, not total duration: the clock
re-arms on every streamed chunk. So a model that reasons for ten minutes is fine,
and one that goes quiet past the window is not.

A flaky gateway is the usual cause. Raise it (`/settings requestTimeoutMs=300000`)
or, for a batch job, set it to `0` to disable the bound entirely.

### `fetch` refuses a URL

Loopback, private and link-local addresses, and `169.254.169.254`, are refused.
Hostnames are *resolved* and every answer is judged, so a public hostname that
resolves to `127.0.0.1` is refused too, and every redirect hop is re-checked.

`FOX_AGENT_ALLOW_PRIVATE_FETCH=1` re-enables it deliberately. Note that `exec`
has no such gate — `curl` is unaffected, so this is a guard against accident, not
a boundary against intent.

### `FOX_AGENT_MODELS_OFFLINE=1` and model lists are empty

That variable is precisely "never reach the network for the models.dev catalog".
Without it and with no network, the catalog load warns and the bundled presets
still work — a config-described model always works.

## Tests and sandboxing

### A test touched my real config

It should not: set both `FOX_AGENT_HOME` and `FOX_AGENT_CONFIG` to temp paths.
Every writer goes through `effectiveConfigPath`, which honours
`FOX_AGENT_CONFIG`. See [hacking](https://github.com/QQSHI13/fox-agent/blob/main/CLAUDE.md).

### `bun test` passes alone and fails in the full suite

Almost always shared state: a real `~/.config/fox-agent`, a real
`~/.local/share/fox-agent`, or a port. Run the suite with both variables pointed
at a tmp dir to confirm before chasing anything else.

## Reporting a problem

Include the version (`fox --version`), the OS and terminal, and whether it
reproduces with `FOX_AGENT_CONFIG=/tmp/empty.toml`. That last one removes config
and plugin load from the picture in one command, which is the difference between
a bug report and a conversation.
