# Security Policy

## Reporting a Vulnerability

Do not open a public GitHub issue.

Report privately via [GitHub Security Advisories](https://github.com/QQSHI13/fox-agent/security/advisories/new).

Include: what happened, how to reproduce, what you expected.

## Scope

fox-agent is a **trusted-workspace tool**. It runs with your full permissions by design. The following are documented behavior, not vulnerabilities:

- The agent can execute arbitrary shell commands, read/write files, and spawn processes.
- Tool output (file contents, fetch responses, MCP replies) enters the model's context as data — prompt injection through tool output is a known risk, not a bug.
- Children inherit the full environment, including API keys.
- Session data is local and unencrypted.
- `fetch` blocks private networks by default; `FOX_AGENT_ALLOW_PRIVATE_FETCH=1` overrides this.

If you believe you've found something outside this scope — a way to escalate privileges beyond what the user granted, a sandbox escape, a credential leak that isn't the documented full-env inheritance — report it.

See the [README](README.md#security-model) for the full security model and the [docs](docs/) for configuration.
