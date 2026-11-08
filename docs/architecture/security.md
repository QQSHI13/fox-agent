---
tags:
  - security
  - architecture
---

# Security model

fox-agent is a **trusted-workspace** tool. Read this before pointing it at code
you did not write.

There is no sandbox and no permission prompt: that is the design, not an
oversight. What follows is the honest accounting of what that costs and which
smaller gates remain.

## No sandbox, no prompts

`exec`, `pty`, `write`, `edit` and every MCP tool run with **your** user
privileges in your cwd. Anything the model decides to run, runs. There is no
`session/request_permission` and no allowlist — see
[ACP](../protocols/acp.md#two-things-a-client-should-know) for what that means for
an editor-driven session.

!!! danger "A session on untrusted input is equivalent to running that input's code"

    Tool output — file contents, `fetch` responses, MCP server replies — enters
    the context as data the model acts on. A repo, a dependency's README or a web
    page can therefore attempt to steer the agent. Prompt injection is the real
    risk here, not a hypothetical: it needs no bug in fox-agent to succeed.

## Children inherit your whole environment

`exec`, `pty` (tmux), MCP servers, language servers and ACP agents all inherit
`process.env` through `src/core/childenv.ts` with no filtering.

This is deliberate. Keys live in `~/.bashrc` or exported environment and the agent
can `read` those files directly, so stripping `*_API_KEY` was theater — it broke
real workflows (a build that needs a token) to defend against an attacker who
already had `read`. Assume any command, MCP server, LSP server or delegated agent
can see every environment variable you have.

## Session data is local and unencrypted

One SQLite file per session under `FOX_AGENT_HOME`, containing full transcripts
and tool output. `pty/` additionally holds raw shell output logs.

Delete a session with `/delete <id> yes` in the TUI or ACP `session/delete`
(`deleteSession` in the SDK), which removes the file *and* its `index.db` row.
Removing only the file leaves it listed as an empty session. See
[Sessions](../sessions/index.md#privacy).

## Each extension point, and what it can do

| Surface | What it is | What it can reach |
|---|---|---|
| **Plugin** | Code **inside** fox-agent's process | Everything fox-agent can, API key included |
| **MCP server** | A child process you name by command line | Your env, your cwd, the network |
| **Language server** | A child process, spawned automatically | Your env, the files fox-agent edits |
| **ACP agent** | A child process, `[agents.*]` or `fox` itself | Your env; it is a harness with a model |
| **`task` subagent** | An ACP child with the *full* tool registry | Your env, your whole disk |

**A plugin is not a child process — it is code inside fox-agent.** It is imported
into fox-agent's own process with your full environment, API key included, able to
do anything fox-agent can. That is exactly why `plugins` is read from
`~/.config/fox-agent/config.toml` only: "clone a repo, cd in, run fox" must not be
able to execute that repo's code. Vet a plugin the way you would vet a shell
profile. See [Plugins](../plugins/index.md#why-global-only).

**MCP servers are arbitrary executables** you configure by command line. fox-agent
spawns them and trusts their tool descriptions — a server that advertises a tool
can describe it however it likes. See [MCP](../tools/mcp.md#trust).

**Language servers are spawned automatically** when diagnostics are on (the
default): a built-in server found on `PATH`, or any command you name in `[lsp.*]`,
started in the project root and shown the contents of files fox-agent edits.
Unlike MCP, no server runs unless it is already installed — but a `PATH` you don't
control means a program you don't control. `diagnostics = false` disables it.

**A delegated `task` child is a peer, not a reduced-privilege subagent.** It gets
the full tool registry in its own process and session. What keeps that bounded is
that *the model never chooses the command*: it picks a name from `[agents.*]` or
gets fox-agent itself. See [`task`](../tools/task.md#a-peer-not-a-reduced-privilege-subagent).

## The trust gate

Trusted folders get full agent control; untrusted ones get safe defaults.

On interactive TUI start, fox-agent shows the working directory and asks whether
the folder is trusted — one keypress (`y` / `n` / `c`). Only continue in a repo you
created, your team's, or a verified well-known project (stars can be faked).
Trusted directories are saved to `$FOX_AGENT_HOME/trusted_dirs`; `--trust` skips
the prompt.

In an **untrusted** directory these are ignored, each with a warning:

- project `[mcpServers.*]`, `[agents.*]`, `[lsp.*]`, `[providers.*]` (including
  `!cmd` values),
- project `baseUrl` / `apiKey`,
- project `skills` — a `SKILL.md` is instructions the model is told to follow,
  which is the same injection surface as an MCP server.

Safe keys (model, theme, caps) still apply. Headless and ACP runs never prompt;
they run restricted instead. `FOX_AGENT_NO_TRUST_CHECK=1` skips the check for
scripts.

!!! warning "The gate is not a sandbox"

    `AGENTS.md`/`CLAUDE.md` instructions and any file the agent reads can still
    steer it, in a trusted directory or not. Only trust a directory you verified.

## The two network gates

- **`fetch` cannot reach the local network.** Loopback / private / link-local
  hosts and cloud metadata (`169.254.169.254`) are refused. Hostnames are resolved
  and *every* answer is judged by the same rules (not just the URL's host), every
  redirect hop is re-checked, and bodies are stream-capped before truncation.
  `FOX_AGENT_ALLOW_PRIVATE_FETCH=1` re-enables local URLs deliberately.
- **`fox gateway` binds local-only by default.** It runs tools with full machine
  access and has no auth layer.

## What to do about it

Run fox-agent in a container or VM for anything you don't trust. Inside a trusted
workspace, the practical rules are:

- Read a plugin before you enable it, exactly as you would read a shell profile.
- Keep `diagnostics = false` in a repo whose toolchain you don't control.
- Don't point an agent at a repo *and* an API key you can't afford to lose.
- `fetch` is the one tool with a network gate; `exec` has none. Anything that can
  reach the network through `curl` is not stopped by it.
