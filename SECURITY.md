# Security Policy

## Supported Versions

| Version | Supported          |
|---------|--------------------|
| 0.3.x   | :white_check_mark: |
| < 0.3   | :x:                |

## Reporting a Vulnerability

If you discover a security vulnerability in fox-agent, please report it responsibly.

**Do not open a public GitHub issue for security vulnerabilities.**

Instead, please email security concerns to the maintainer (see `git log` for contact info) or use [GitHub's private vulnerability reporting](https://github.com/QQSHI13/fox-agent/security/advisories/new).

### What to include

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

### Response timeline

- Acknowledgment within 48 hours
- Assessment within 1 week
- Fix or mitigation for confirmed issues

## Security Model Overview

fox-agent is a **trusted-workspace** tool. Key points:

- **No sandbox, no permission prompts.** The agent runs with your full user privileges.
- **Prompt injection is the real risk.** Tool output enters the context as data the model acts on. Treat sessions on untrusted input as equivalent to running that input's code.
- **No credential stripping.** Children get your full environment. Assume any command can see every env var.
- **Plugins run in-process.** They are loaded from `~/.config/fox-agent/config.toml` only -- project files cannot introduce plugins.
- **Session data is local and unencrypted.** One SQLite file per session under `FOX_AGENT_HOME`.
- **`fetch` blocks local networks.** Loopback/private/link-local hosts and cloud metadata are refused by default.

For the full security model, see the [README](README.md#security-model).

## Hardening Tips

- Run in a container or VM for untrusted code.
- Use `diagnostics = false` to disable automatic language server spawning.
- Set `FOX_AGENT_HOME` to a dedicated directory if running multiple instances.
- Review `AGENTS.md`/`CLAUDE.md` files in repos you visit -- the agent follows their instructions.
