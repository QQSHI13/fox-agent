# MCP (Model Context Protocol)

MCP connects fox-agent **down** to its tools: a server you configure by command
line, whose tools join the registry alongside the built-ins.

```toml
[mcpServers.fs]
command = "npx"
args = ["-y", "@modelcontextprotocol/server-fs", "/tmp"]
```

Each configured server contributes tools that the model sees like any other. The
bridge itself is the `bundled:mcp` plugin, so:

- `disabledPlugins = ["mcp"]` disconnects every server at once,
- a plugin can pack servers with `mcpServers: { pg: { command: ... } }` and ship
  them without a config file,
- **explicit config wins** over a plugin pack on a name collision, and the
  collision is reported rather than resolved silently.

## Failure is a warning, never a throw

An unreachable server costs one `warn` line at the top of the turn. A broken
plugin and an unreachable MCP server get the same treatment, because a harness
that refuses to start has turned someone else's bug into your outage.

## Trust

MCP servers are **arbitrary executables** you configure by command line. fox-agent
spawns them and trusts their tool descriptions. A server that advertises a tool
called `write_file` gets a tool called `write_file` — with the model's full
attention on it.

They inherit the full environment (see
[Security](../architecture/index.md#security-model)). Vet a server the way you
would vet a shell script you were about to run.

## Alongside

- [Plugins](../plugins/index.md) — packing servers into a distributable module.
- [task](task.md) — MCP connects down to tools; `task` connects across to peers.
