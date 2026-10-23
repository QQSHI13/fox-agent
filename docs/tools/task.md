# `task`: delegation

`task` hands a self-contained subtask to another agent: a separate process with
its own context window and its own session. It is the reason long work does not
have to fit in one window.

```jsonc
{ "description": "map the auth flow",              // one-line label in the UI
  "prompt": "...",                                  // complete, standalone instructions
  "agent": "default" }                              // "default" = another fox-agent
```

The subagent **cannot see this conversation**. Give it complete, standalone
instructions — the prompt is the entire briefing.

## Protocol follows the target's shape

An `[agents.<name>]` entry picks the protocol:

```toml
[agents.reviewer]              # spawn a child process, speak ACP
command = "some-other-acp-agent"
args = ["--acp"]

[agents.remote]                # reach a running agent, speak A2A
url = "https://agent.example.com"
headers = { authorization = "Bearer token" }
```

- `command` → fox-agent spawns it and speaks **ACP**. Tool calls stream into the
  parent's UI live.
- `url` → fox-agent reaches it over HTTP/JSON-RPC and speaks **A2A** (SSE when
  offered, polling when not). The final report arrives when the remote task
  completes.

`default` is fox-agent delegating to itself — a spawned `fox --acp` child with
the *full* tool registry. It is always available and cannot be rebound by a
plugin or config.

## A peer, not a reduced-privilege subagent

Nothing is withheld from a delegated agent, including `task` itself. That is why
delegation depth is capped at 3: `FOX_AGENT_DELEGATION_DEPTH` carries the count
across the process boundary, and the child's session id is recorded so lineage
stays visible.

Unlike `exec`/`pty`/MCP children, an ACP child is **not** given a
credential-stripped env — it is a harness whose whole job is to call a model.
What keeps that safe is that *the model never chooses the command*: it picks a
name from `[agents.*]` or gets fox-agent itself.

## When to delegate

- The subtask is self-contained and its working state is disposable.
- It would pollute this context with material that only matters while it runs
  (a large search, a long build triage).
- You want a second opinion with a fresh window.

## When not to

- The work needs *this* conversation's context — a subagent cannot see it, and
  pasting the whole thing in defeats the point.
- The task is two steps. The setup cost of a spawn exceeds the work.

## Background jobs

`task` is foreground-only: it returns the child's final report. For work you want
to keep running while you do something else, use the `repl` tool's `jobs` API —
`background: true` returns a job id immediately and notifies you on completion.

## Related

- [ACP](../protocols/acp.md) — the server side, and what a client should know.
- [A2A](../protocols/a2a.md) — the remote agent protocol.
