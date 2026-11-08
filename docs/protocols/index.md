---
tags:
  - protocols
---

# Protocols

fox-agent speaks the Agent Client Protocol (ACP), in both directions, over the
same `runTurnCore` the TUI uses. There is no second loop.

| | ACP |
|---|---|
| Full name | Agent Client Protocol |
| Transport | stdio (JSON-RPC) |
| Used to | be driven by an editor; drive a spawned child |
| fox-agent as server | `fox --acp` |
| fox-agent as client | `task` with an `[agents.x] command` |
| Shape chosen by | `command` in config |

The rule of thumb: **MCP connects an agent down to its tools; ACP connects an
agent across to peers.** ACP when the peer is a process fox-agent can spawn.

## Sessions are shared, not shimmed

The protocol maps onto the same per-session SQLite databases the TUI writes. A
session started in Zed shows up in `fox ls` and resumes in the TUI.

## Binds local by default

`--acp` is stdio, so the editor owns the process; `fox gateway` binds
local-only. Both run tools with full machine access. See
[Security](../architecture/security.md) before exposing either one
to anything.

## Read next

- [ACP](acp.md) — the server, the client, and the acceptance check that cannot be
  faked by in-process tests.
