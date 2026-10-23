# ACP (Agent Client Protocol)

fox-agent speaks ACP in both directions, over the same `runTurnCore` the TUI uses.

## As an agent (server)

`fox --acp` serves ACP on stdio, so any ACP client can drive it:

```jsonc
// Zed settings.json
"agent_servers": { "fox-agent": { "command": "fox", "args": ["--acp"] } }
```

Sessions are the real thing, not a protocol shim: `session/new`, `list`, `load`,
`resume`, `fork`, `delete` and `close` all map onto the same per-session SQLite
databases the TUI writes, so a session started in Zed shows up in `fox ls` and
resumes in the TUI.

How much history `session/load` replays is governed by `acpHistory`:

- `"full"` (default) — the whole transcript,
- `"last"` — the latest exchange only,
- a number — that many trailing nodes.

Tool calls, thoughts, token usage and compaction stream as native ACP updates;
`session/cancel` aborts the turn.

### Two things a client should know

- **fox-agent never sends `session/request_permission`.** It is a no-prompt
  harness (see the [security model](../architecture/index.md#security-model)), so
  tools just run. You will not be asked to approve anything.
- **fox-agent does not use the client's `fs/*` or `terminal/*`.** Its own
  `read`/`write`/`exec`/`pty` must behave identically with no client attached at
  all, and the [exec/pty cwd contracts](../tools/exec-pty.md) are fox-agent's own.

## As a client

`task` delegates to another agent — by default a spawned `fox --acp` child with
the *full* tool registry, in its own process and its own session, or any agent
named in `[agents.*]` with a `command`.

The client side reflects fox-agent's own posture rather than a generic host's:

- `fs/*` is honored — fox-agent has full disk access anyway, so refusing would be
  theater.
- `session/request_permission` auto-approves.
- `terminal/*` is left unimplemented: a child that wants a terminal should run its
  own, and a half-built terminal host is worse than a clear "unsupported".

See [`task`](../tools/task.md) for the delegation semantics.

## Verifying a protocol change

The in-repo ACP tests pair fox-agent's agent to a client **in the same process**,
which means both ends share one SDK's idea of the wire format — a wrong field name
or a capability that is advertised but mishandled passes all of them.

`scripts/acp-accept.ts` is the check that cannot. It builds `bin/fox`, starts a
scripted local provider (no API key, no network), and drives the binary with the
real external [`acpx`](https://www.npmjs.com/package/acpx) client:

```bash
bun run build && bun scripts/acp-accept.ts     # 38 checks
```

It covers `initialize` (protocol version and every advertised session
capability), `session/new`, `session/prompt` streaming to `stopReason:
"end_turn"`, the `tool_call{pending}` → `tool_call_update{completed}` pair with the
file verified on disk, `session/list` answered by the agent rather than by acpx's
own records, and — by directly reading fox-agent's stdout rather than acpx's
output — that **every line fox-agent writes to stdout is a JSON frame**.

Any change under `src/acp/` needs this, not just the unit tests.
