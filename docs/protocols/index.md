# Protocols

fox-agent speaks two agent protocols, in both directions, over the same
`runTurnCore` the TUI uses. There is no second loop.

| | ACP | A2A |
|---|---|---|
| Full name | Agent Client Protocol | Agent2Agent |
| Transport | stdio (JSON-RPC) | HTTP + JSON-RPC, SSE streaming when offered |
| Used to | be driven by an editor; drive a spawned child | be driven over a network; drive a remote agent |
| fox-agent as server | `fox --acp` | `fox --a2a` |
| fox-agent as client | `task` with an `[agents.x] command` | `task` with an `[agents.x] url` |
| Shape chosen by | `command` in config | `url` in config |

The rule of thumb: **MCP connects an agent down to its tools; ACP and A2A connect
an agent across to peers.** ACP when the peer is a process fox-agent can spawn;
A2A when the peer already lives somewhere behind a URL.

## Sessions are shared, not shimmed

Both protocols map onto the same per-session SQLite databases the TUI writes. A
session started in Zed shows up in `fox ls` and resumes in the TUI. A remote A2A
call creates a real session too.

## Both bind local by default

`--a2a` binds local-only unless you say otherwise, and both surfaces run tools
with full machine access. See [Security](../architecture/index.md#security-model)
before exposing either one to anything.

## Read next

- [ACP](acp.md) — the server, the client, and the acceptance check that cannot be
  faked by in-process tests.
- [A2A](a2a.md) — the wire format, the agent card, streaming and polling.
