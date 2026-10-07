# fox-agent plugins

A plugin is one TypeScript module that default-exports a `FoxPlugin`. It runs inside fox-agent's own process with the user's credentials, which is why plugins load from the **GLOBAL config only** — a project `fox-agent.toml` cannot introduce one. A project `plugins` array is ignored with a warning; that rule is a security boundary, not a taste choice.

```toml
# ~/.config/fox-agent/config.toml
[plugins]
mytools = "/abs/path/mytools.ts"      # key = plugin name (used in warnings)
```

A broken plugin (throws on import, bad shape) costs a warning, never the run. Editing a plugin file takes effect after `/reload` (plugins re-import on the next turn's registry build).

## The FoxPlugin interface

```ts
export default {
  name: "mytools",                    // required — used in warnings
  tools: [ ... ],                     // extra tools, same shape as built-ins
  hooks: { onSessionStart, beforeLLMCall, afterTool },
  providers: { myprovider: chatFn },  // custom providers; config `provider = "myprovider"` selects
  themes: { mytheme: {...} },         // TUI themes, selectable via /theme or theme = "mytheme"
  mcpServers: { name: {...} },        # packed MCP servers (config entries of the same name win)
  agents: { name: {...} },            # packed task targets (ACP command or A2A url)
  commands: [ ... ],                  # slash commands through the same result path as built-ins
  statusSegments: { seg: () => "…" }, # status bar slots; statusBar = "... seg ..." shows them
} satisfies FoxPlugin;
```

Lifecycle hooks:

- `onSessionStart` — session metadata; a place to set up state.
- `beforeLLMCall` — inspect/patch the outgoing request (headers, system prompt suffix).
- `afterTool` — observe tool name + result; the diagnostics-after-edit reporting is hook-shaped the same way.

Tool shape: `{ name, description, parameters (JSON schema), execute(args) → string }`. Throw to report an error result; return a string for success.

Plugin slash commands and status segments re-resolve when plugins reload (`/reload`, or `statsRev` bumps for status slots).

## Rules worth remembering

- Tests and sandboxes: plugins still load from the path `FOX_AGENT_CONFIG`'s config names — point `FOX_AGENT_CONFIG` at a temp config to isolate.
- Never read project `fox-agent.toml` for plugins — even if a user asks for it, explain the boundary instead.
- A plugin tool named like a built-in does NOT override it; duplicates are reported and dropped.
