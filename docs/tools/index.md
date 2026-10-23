# Tools

The model reaches the machine through tools. Two facts shape the whole set:

- **Nothing is withheld.** `exec` runs anything with your privileges, so every
  other tool is a convenience for doing the same thing *precisely*, not a sandbox
  boundary. Read the [security model](../architecture/index.md#security-model).
- **Most of them are plugins.** `pty`, `todo`, `fetch`, `repl`, `task`, `lsp`,
  `question` and `cost` ship as bundled plugins through the same merge path a
  third-party module gets. That means each can be shadowed by name or switched
  off with `disabledPlugins`, and none of them has a private path into the loop.

## The core set

These are the harness itself (`src/tools/index.ts` → `baseRegistry`):

| Tool | One line |
|---|---|
| [`read`](files.md) | File contents, line-numbered; images/audio/video attach as media when the model accepts them |
| [`write`](files.md) | Create or overwrite a file |
| [`edit`](files.md) | Patch a file through a whitespace-tolerant engine; reports what the change broke |
| [`glob`](files.md) | Find files by wildcard pattern |
| [`grep`](files.md) | Search contents with ripgrep when present |
| [`exec`](exec-pty.md) | Run a shell command; never drifts from the session directory |
| [`ctx`](ctx.md) | Search, hide and rewrite the model's own context window |

## Bundled plugin tools

| Tool | Plugin | One line |
|---|---|---|
| [`pty`](exec-pty.md) | `bundled:pty` | A persistent tmux-backed shell that keeps its cwd and env |
| [`fetch`](fetch-repl.md) | `bundled:fetch` | HTTP(S) → readable text, with the local network refused |
| [`repl`](fetch-repl.md) | `bundled:repl` | In-process JavaScript scratchpad with persistent variables and background jobs |
| [`todo`](index.md#todo) | `bundled:todo` | The session's task list, shown in the runtime header |
| [`task`](task.md) | `bundled:task` | Delegate a subtask to another agent over ACP or A2A |
| `lsp` | `bundled:lsp` | Definition / references / hover / symbols from a real language server |
| `question` | `bundled:question` | Ask the user a structured question mid-run and wait |
| `mcp` | `bundled:mcp` | Tools from every configured MCP server |

## Path resolution

Every tool that takes a path accepts a **relative** one and resolves it against
the session's cwd. Absolute paths are for paths genuinely outside the project.
`exec`'s `workdir` and `pty`'s starting directory follow the same rule — but only
`pty` keeps drifting after that. See [exec vs pty](exec-pty.md).

## Caps

Two config keys bound tool output, because a runaway command can otherwise
consume the context window in one step:

- `toolOutputCap` (default 30 000 chars) — per-result cap across tools.
- `readCap` (default 50 000 chars) — `read` refuses larger files and asks for
  `offset`/`limit` instead of silently truncating.

`exec` additionally takes `full: true` to lift the per-result cap for one call.

## `todo`

`todo` replaces the whole list each call. The current list rides the **runtime
header** of every step, at the message tail rather than in the system prompt —
that placement is deliberate: a live value in the cached system-prompt prefix
would re-bill the whole prompt on every step.

Statuses are `pending` / `in_progress` / `done`; the plain rendering uses
`[ ]` / `[~]` / `[x]` so it survives terminals without emoji support.
