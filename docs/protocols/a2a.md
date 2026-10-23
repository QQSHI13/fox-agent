# A2A (Agent2Agent)

A2A is how fox-agent reaches — and is reached by — agents that already live
somewhere on the network behind a URL. Where ACP spawns a child process, A2A dials
a peer.

## Serving

```bash
fox --a2a              # bind an ephemeral port (printed to stderr)
fox --a2a --port 8787  # bind a specific port
```

The server exposes the four surfaces the client already speaks:

| Surface | Path | Purpose |
|---|---|---|
| Agent card | `/.well-known/agent-card.json` (legacy `/agent.json`) | Discovery: name, capabilities |
| `message/send` | — | One-shot task |
| `message/stream` | — | SSE live progress |
| `tasks/get` | — | Poll a long-running task |

A turn runs through the same `runTurnCore` engine the TUI, headless and ACP paths
use, so behavior — compaction, budget, hooks — is identical across surfaces.
Sessions created this way are real sessions in the store.

**It binds local-only by default.** This endpoint runs tools with full machine
access, so it must not face an untrusted network without a separate auth layer.

## Reaching a peer

```toml
[agents.researcher]
url = "https://agent.example.com"
headers = { authorization = "Bearer token" }
```

Then `task` with `agent: "researcher"`.

The client is not credulous about the spec:

- **Streaming first.** `message/stream` (SSE) for live progress, falling back to
  `message/send` + `tasks/get` polling when the server does not implement
  streaming.
- **`configuration.blocking` is requested but not trusted.** Servers may ignore
  it, so the poll loop is the real wait, not an error path.
- **The agent card is read for the agent's name only.** A missing card is not a
  failure — a peer that works but does not advertise itself is still a peer.
- An overall delegation is capped at 30 minutes by default.

## When A2A is the right transport

- The peer is already running, long-lived, and shared (a service, not a spawn),
- The peer is behind an HTTP boundary you control (a gateway, an internal host),
- You want progress streaming across that boundary rather than a child's stdout.

When the peer is just "another fox-agent on this machine", prefer `default` (ACP)
— it is a process you can see, kill and debug.

## Trust

Headers carry whatever you put in them; the peer sees your prompts. Delegation
depth is capped at 3 and carried across the boundary so a cycle of peers stops.
