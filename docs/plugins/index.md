# Plugins

A plugin is one TypeScript module with a default export. It can add tools, hook
the turn loop, register providers and themes, pack MCP servers and delegation
targets, and add slash commands.

It runs **inside fox-agent's own process**, with your credentials. That single
fact explains the rule that follows.

## Load it

```toml
# ~/.config/fox-agent/config.toml
plugins = ["~/my-fox-plugin.ts"]     # ~ expands; relative paths resolve against cwd
```

**Global config only.** A `plugins` entry in a project `fox-agent.toml` is
ignored, with a warning saying so.

### Why global-only

Every other extension point — `[mcpServers.*]`, `[agents.*]`, `[lsp.*]` — spawns a
*child process*. A plugin cannot be sandboxed that way: it is imported into
fox-agent's own process and gets your whole environment, including your API key.
So "clone a repo, cd in, run fox" must not be able to execute that repo's code.
Naming a plugin is a decision about your machine, and it lives in the file only
you write.

## The interface

```ts
import type { FoxPlugin } from "fox-agent/sdk";

const plugin: FoxPlugin = {
  name: "mine",                    // required; every warning about this plugin is keyed on it

  // structurally identical to a built-in tool — no adapter layer
  tools: [{
    def: { name: "ping", description: "...", parameters: { type: "object", properties: {} } },
    async run(args, ctx) { return { ok: true, output: "pong" }; },
  }],

  hooks: {
    onSessionStart({ sessionId, cwd, model }) { /* fires once, on a session's first turn */ },
    beforeLLMCall({ sessionId, step, messages, tools }) { return { appendSystem: "extra guidance" }; },
    afterTool({ sessionId, name, args, ok, output }) { return { output: `[seen] ${output}` }; },
  },

  providers: {
    // keyed by the `provider` config value
    async *["mine-gateway"](cfg, messages, tools, signal) { /* yield StreamEvents */ },
  },

  // integration packs: MCP servers and task agents without a config file.
  // Explicit config wins on collision, and the collision is reported.
  mcpServers: {
    pg: { command: "mcp-postgres", args: ["postgres://..."] },
  },
  agents: {
    reviewer: { url: "https://agent.example.com", headers: { authorization: "Bearer ..." } },
  },

  // slash commands, run through the same result as built-ins
  commands: [{
    name: "/deploy",
    description: "ship it",
    run: (arg, { sessionId, cwd }) => ({ handled: true as const, output: `deploying ${cwd}...` }),
  }],

  // extra status-bar slots; `statusBar = "... mine ..."` shows them
  statusSegments: { mine: () => "ok" },
};

export default plugin;
```

The types (`FoxPlugin`, `PluginHooks`, `PluginCommand`, `McpServerConfig`,
`ExternalAgentConfig`, and the context/patch types for each hook) are re-exported
from `fox-agent/sdk`, alongside `Tool`, `ToolContext`, `ok`/`fail`, `ChatFn` and
`UiBridge`/`UiStep`.

## Hooks are additive by design

`beforeLLMCall` can only **append** to the system prompt, and `afterTool` can only
**replace one tool's output text**. Neither can reorder or drop messages.

That is deliberate. `renderContext` guarantees every assistant `tool_call` is
followed by its `tool_result`, and a provider hard-400s on an orphan. A hook that
returned a message array would put that invariant in every plugin author's hands,
with a failure that surfaces as an opaque API error naming nothing. `messages` is
still passed in full, so a hook can decide *with* it.

One rule attaches to that append: **keep it byte-stable across steps**. The system
prompt is the provider's cached prefix, so a hook that injects a clock, a counter
or any other live value re-bills the system prompt *and every message behind it*
on every step. That is exactly the defect the live context figure had before it
moved to the message tail.

`afterTool` runs between the tool and the transcript write, so the patched text is
the only version in the system: what gets stored, what the model reads on the next
step, and what the `tool_end` event reports are the same string.

## The lifecycle hooks

| Hook | Fires | Can |
|---|---|---|
| `onSessionStart` | Once, on a session's first turn | Initialize state |
| `onTurnStart` | Once per turn, after the user message is stored | Prepare per-turn state |
| `beforeTool` | Before each tool call | Patch the call |
| `afterTool` | After each tool, before the transcript write | Patch the output text |
| `beforeLLMCall` | Before each provider request | Append to the system prompt |
| `onTurnEnd` | Once per turn — any outcome, including errors and aborts | Clean up |
| `onSessionEnd` | Session going away: exit, session switch, or delete | Release what you hold |

`onSessionEnd` is the seam that makes bundled plugins ordinary: the `pty` plugin
kills its tmux session there, and `repl` drops its scratchpad there. No special
case in the harness.

## Failure is always a warning, never a throw

A plugin that throws at import, exports the wrong shape, or points at a missing
file costs you one `warn` line at the top of the turn — the same treatment an
unreachable MCP server gets.

A hook that throws mid-turn is caught per call, so a typo in `afterTool` cannot
take down a turn that has already done real work.

## Names, shadowing and collisions

- A plugin tool needs no prompt work: `buildSystemPrompt` derives the roster from
  the live registry, so the tool appears automatically.
- A plugin registering a name that already exists **shadows** it, and the
  collision is reported as a warning — allowed, but never silent.
- Registering a bundled *provider* name (`openai-compatible`,
  `openai-responses`, `anthropic`, `google` — the `bundled:providers` plugin) is
  refused.
- A command colliding with a built-in never fires (also warned).

## Bundled plugins

`pty`, `todo`, `fetch`, `repl`, `task`, `question`, `lsp`, `cost`, `gateway` ship
as plugins, as does each API format (`bundled:openai-compatible`,
`bundled:openai-responses`, `bundled:anthropic`, `bundled:google`), the MCP bridge
(`bundled:mcp`) and the provider set (`bundled:providers`) — same `FoxPlugin`
shape, same merge path.

So a user plugin shadows a bundled capability, and `disabledPlugins` switches one
off, exactly the way it does any other:

```toml
disabledPlugins = ["mcp"]        # disconnect every MCP server
disabledPlugins = ["pty"]        # no tmux shell
disabledPlugins = ["anthropic"]  # that format stops resolving
```

## A plugin tool can ask the user questions

`ctx.ui` is a `UiBridge` with `select` (an option menu), `input` (a text field,
optionally masked) and `wizard` (a multi-step mix of both). It exists only on
interactive hosts — check for it, and treat an `undefined` answer as "the user
cancelled". The same bridge backs the built-in [`question`](../tools/question.md)
tool.

## Managing plugins

`/plugin` lists everything — bundled capabilities plus configured files — with
what each contributes and whether it is on or off. In the TUI it opens the same
select-step wizard `/model` and `/login` use; elsewhere it prints the same list.

```
/plugin                       # list (wizard in the TUI)
/plugin on pty                # switch on; /plugin off pty to switch off
/plugin add ~/extra.ts        # install a file (must exist)
/plugin rm extra              # uninstall (clears its off-switch too)
/plugin info pg               # source, status, contributions, warnings
```

`fox plugin` does the same without entering the TUI, in terminal colors when
stdout is a TTY (piped output stays plain; `NO_COLOR` respected).

Flips apply immediately — the host re-reads the config right after the write, so
the next turn runs the new set. Names accept the short form (`pty`), the full form
(`bundled:pty`), the plugin's own name, or the configured path and its
basename/stem; an ambiguous spelling lists candidates instead of guessing. All
writes go to the effective global config (`--config`, else `FOX_AGENT_CONFIG`,
else the default) with a `.bak` beside it.

## Writing one: the short version

1. Write `~/my-fox-plugin.ts` with a default export that has a `name`.
2. Add it to `plugins` in `~/.config/fox-agent/config.toml`.
3. `/reload`.
4. `/plugin info my-fox-plugin` to confirm what it contributed.

If something is wrong, the warning at the top of the turn will name the plugin.
