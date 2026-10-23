# fox-agent docs (for the agent)

You are reading the agent-facing docs. They are embedded in the binary and
materialized as real files under `$FOX_AGENT_HOME/docs/` (default
`~/.local/share/fox-agent/docs/`), version-stamped: when the running binary's
version changes the directory is rewritten, so these files never contradict the
binary serving them.

Read the file you need in full — they are short on purpose. Do not read them when
the user is asking about their own code; they describe fox-agent itself.

| File | Read it when |
|---|---|
| `config.md` | Changing config (the user's, or your own provider/model/theme). The cascade, every key, trust rules |
| `tools.md` | You need the exact contract of a tool — caps, cwd rules, failure modes |
| `plugins.md` | Writing or managing a plugin; what a hook can and cannot do |
| `sessions-acp.md` | Sessions on disk, forking/pruning, ACP and A2A, headless/`createAgent` |
| `themes-tui.md` | Themes, TUI internals, keybindings |
| `hacking.md` | Modifying fox-agent's own source: build, tests, conventions, where features land |

The human-facing docs are the same material written for a person — a site built
from `docs/` by docsforge (`docsforge.yml` at the repo root, `docsforge build`).
`docs/agent/` is excluded from that site.

## Rules that trip agents up

- **`plugins` is an array**, in the global config only:
  `plugins = ["~/p.ts"]`. The `[plugins]` table form does not exist.
- **`FOX_AGENT_HOME`/`FOX_AGENT_CONFIG` are the isolation levers.** Tests and
  experiments must set both to temp paths; never touch the real
  `~/.config/fox-agent` or `~/.local/share/fox-agent` from a test.
- **A project `fox-agent.toml` cannot list plugins** (ignored with a warning) and
  its executable sections are ignored in an untrusted directory. Do not "fix"
  either — they are security boundaries.
- **Config `validate` callbacks throw.** A config edit is not verified by parsing
  it; run `/reload` or load it headlessly.
- **Everything the model sees is a view.** Session storage is append-only; `ctx`
  ops, compaction and `/undo` are projections. Never assume a hidden node is gone.
