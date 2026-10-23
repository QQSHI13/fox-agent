# fox-agent plugins

A plugin is one TypeScript module that default-exports a `FoxPlugin`. It runs inside fox-agent's own process with the user's credentials, which is why plugins load from the **GLOBAL config only** — a project `fox-agent.toml` cannot introduce one. A project `plugins` array is ignored with a warning; that rule is a security boundary, not a taste choice.

```toml
# ~/.config/fox-agent/config.toml
plugins = ["/abs/path/mytools.ts"]    # ARRAY of paths; ~ expands, relative resolves against cwd
disabledPlugins = ["pty"]             # names switched off entirely
```

There is no `[plugins]` table form — `plugins` is a plain array of file paths. A broken plugin (throws on import, bad shape) costs a warning, never the run. Editing a plugin file takes effect after `/reload` (plugins re-import on the next turn's registry build).

## The FoxPlugin interface

```ts
export default {
  name: "mytools",                    // required — every warning about this plugin is keyed on it
  tools: [ ... ],                     // extra tools: { def, run(args, ctx) -> ToolResult | string }
  hooks: {                            // additive patches only (see below)
    onSessionStart, onTurnStart, beforeTool, afterTool,
    beforeLLMCall, onTurnEnd, onSessionEnd,
  },
  providers: { myprovider: chatFn },  // custom providers; config `provider = "myprovider"` selects
  themes: { mytheme: {...} },         // TUI themes, selectable via /theme or theme = "mytheme"
  mcpServers: { name: {...} },        // packed MCP servers (explicit config entries win)
  agents: { name: {...} },            // packed task targets (ACP command or A2A url)
  commands: [ ... ],                  // slash commands through the same result path as built-ins
  statusSegments: { seg: () => "…" }, // status bar slots; statusBar = "... seg ..." shows them
  regions: { name: {...} },           // TUI compositing planes (paint per frame, clip to a rect)
} satisfies FoxPlugin;
```

Lifecycle hooks:

- `onSessionStart` — session metadata; a place to set up state.
- `onTurnStart` / `onTurnEnd` — once per turn, before the first request and after the loop ends (any outcome).
- `beforeTool` / `afterTool` — around each tool call. `afterTool` runs **between the tool and the transcript write**, so its patched text is the only version in the system.
- `beforeLLMCall` — inspect/patch the outgoing request; may only **append** to the system prompt.
- `onSessionEnd` — session going away (exit, switch, delete). Where the bundled `pty` plugin kills its tmux session and `repl` drops its scratchpad.

Tool shape: `{ def: { name, description, parameters (JSON schema) }, run(args, ctx) → ToolResult | string }`. Return `ok(...)`/`fail("error: …")`; a throw is caught but loses the message the model needs.

Plugin slash commands and status segments re-resolve when plugins reload (`/reload`, or `statsRev` bumps for status slots).

## Why hooks are patch-based, not array-rewriting

`renderContext` guarantees every assistant `tool_call` is followed by its `tool_result`; a provider hard-400s on an orphan. A hook returning a message array would put that invariant in every plugin author's hands. So `beforeLLMCall` may only append to the system prompt and `afterTool` may only replace one tool's output text. Keep the append **byte-stable across steps** or the cached system-prompt prefix is re-billed every step.

## Collisions and shadowing

- A tool named like an existing one **shadows** it (later registration wins) and the collision is warned.
- A plugin tool needs no prompt work: `buildSystemPrompt` derives the roster from the live registry.
- Registering a bundled *provider* name (`openai-compatible`, `openai-responses`, `anthropic`, `google`) is refused.
- A command colliding with a built-in never fires (warned).

## Bundled plugins

`pty`, `todo`, `fetch`, `repl`, `task`, `question`, `lsp`, `cost`, `gateway`, the four API formats (`bundled:<format>`), the MCP bridge (`bundled:mcp`) and the provider set (`bundled:providers`). Same `FoxPlugin` shape and merge path, so `disabledPlugins = ["mcp"]` disconnects every MCP server, `["pty"]` kills the tmux shell, `["anthropic"]` makes that format unresolvable. Names accept short (`pty`) or full (`bundled:pty`).

## UI mid-run

`ctx.ui` is a `UiBridge` with `select`, `input` and `wizard`; it exists only on interactive hosts. Check for it and treat an `undefined` answer as "the user cancelled". `question` is the built-in tool over the same bridge.

## Managing plugins

`/plugin` (wizard in the TUI, printed list elsewhere) and `fox plugin` (no TUI) share one implementation: `list`, `on <name>`, `off <name>`, `add <path>`, `rm <name>`, `info <name>`. Flips apply immediately — the host re-reads config after the write. Writes go to the effective global config (`--config`, else `FOX_AGENT_CONFIG`, else the default) with a `.bak` beside it.

## Rules worth remembering

- Tests and sandboxes: plugins still load from the path `FOX_AGENT_CONFIG`'s config names — point `FOX_AGENT_CONFIG` at a temp config to isolate.
- Never read project `fox-agent.toml` for plugins — even if a user asks for it, explain the boundary instead.
- Types are re-exported from `fox-agent/sdk`: `FoxPlugin`, `PluginHooks`, `PluginCommand`, every hook context/patch type, `McpServerConfig`, `ExternalAgentConfig`, `Tool`, `ToolContext`, `ok`/`fail`, `ChatFn`, `UiBridge`/`UiStep`.
