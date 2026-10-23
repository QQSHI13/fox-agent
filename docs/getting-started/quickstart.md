# Quickstart

## 1. Point it at a provider

The fastest path is to set three environment variables:

```bash
export FOX_AGENT_BASE_URL=https://your-provider.com/v1
export FOX_AGENT_API_KEY=sk-...
export FOX_AGENT_MODEL=gpt-4o
```

Any OpenAI-compatible endpoint works this way; `FOX_AGENT_PROVIDER` picks the
wire format explicitly (`openai-compatible`, `openai-responses`, `anthropic`,
`google`). See [Providers](../configuration/providers.md) for native
Anthropic/Google, named profiles, and the 200+ provider catalog.

No key yet? Just run `fox`. The TUI opens anyway and `/login` walks you through
provider, key, endpoint and model as an interactive wizard, then writes
`~/.config/fox-agent/config.toml` and takes effect without a restart.

## 2. First run

```bash
fox
```

The TUI opens in a new session bound to your current directory. It shows the
working directory and asks whether the folder is **trusted** — one keypress,
`y` / `n` / `c`, no enter needed. Answer `n` in a repo you have not read: an
untrusted directory has its executable project config ignored. See
[Security](../architecture/index.md#security-model).

Then type a prompt and press enter.

## 3. Headless, when you want a script

```bash
fox -p "summarize this repo's layout"       # one-shot answer, prints text
fox json -p "..."                           # NDJSON agent events (also: -p ... --json)
echo "explain src/loop/turn.ts" | fox       # piped prompt
fox mini                                    # plain streaming REPL, no TUI
fox -c                                      # resume latest session (picker in a terminal)
fox -c 2                                    # resume by 'fox ls' index, or by id
fox --acp                                   # serve the Agent Client Protocol on stdio
fox --a2a                                   # serve the Agent2Agent protocol on HTTP
```

`fox --help` lists every flag and subcommand; it colours its flags when stdout
is a terminal.

## 4. What to try next

- **Change model mid-session** — `/model`. The picker lists each logged-in
  provider's own model list, plus config-described and catalog models.
- **Give it a task list** — ask for something multi-step and watch the `todo`
  tool appear in the runtime header. Or `/todo` to see the current list.
- **Watch it manage its own context** — start a long turn and watch for `ctx`
  calls; the transcript's `[N]` markers are the nodes it is editing. `/ops`
  shows the surgery it has done, `/undo` walks one back.
- **Delegate** — ask it to hand a self-contained subtask to a subagent; that is
  the `task` tool spawning another `fox --acp` child. `/agents` targets are
  configured under `[agents.*]`.
- **Write a plugin** — [Plugins](../plugins/index.md) is one module with a
  default export.

## Where your state lives

`$FOX_AGENT_HOME` (default `~/.local/share/fox-agent`) holds one SQLite database
per session, the session index, pty logs and the materialized agent docs.
Nothing leaves the machine. See [Sessions](../sessions/index.md).
