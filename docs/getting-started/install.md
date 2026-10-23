# Install

## Prebuilt binary (recommended)

```bash
curl -fsSL https://github.com/QQSHI13/fox-agent/raw/main/install.sh | bash
```

This downloads the latest release binary for your platform into
`${INSTALL_DIR:-${XDG_BIN_HOME:-$HOME/.local/bin}}`. Installer flags:

```bash
curl -fsSL .../install.sh | bash -s -- --to /usr/local/bin   # custom directory
curl -fsSL .../install.sh | bash -s -- --version 0.6.0       # pin a version
curl -fsSL .../install.sh | bash -s -- --beta                # newest prerelease
```

Prebuilt binaries exist for **Linux** (x64, arm64) and **macOS** (x64, arm64) on
the [releases page](https://github.com/QQSHI13/fox-agent/releases). Download and
place one in your `PATH` if you would rather not run a script.

## From source

Requires [Bun](https://bun.sh) >= 1.4.0.

```bash
git clone https://github.com/QQSHI13/fox-agent.git
cd fox-agent
bun install
bun run build        # -> bin/fox
```

The binary lands at `bin/fox`. Add it to your `PATH` or run it directly.

## Upgrading

Installed binaries self-update with `fox upgrade` (`fox upgrade --beta` for the
newest prerelease, `fox upgrade <version>` to pin). Downloads are SHA-256 verified
against the release's `SHA256SUMS`, and the previous binary is kept as
`.fox-previous`.

A source checkout refuses `fox upgrade` — there the upgrade path is
`git pull && bun run build`.

## Requirements and optional extras

Only a provider endpoint is required. Everything below is optional, and each
feature that needs one says so plainly rather than failing obscurely:

| Tool | Needed for | Missing means |
|---|---|---|
| `tmux` | the `pty` tool | `pty` reports itself unavailable |
| `ripgrep` (`rg`) | faster `grep` | falls back to a built-in walker |
| a language server | post-edit diagnostics, the `lsp` tool | falls back to a bracket-balance check |
| `node` / `npx` | MCP servers you configure that way | that server fails to start, with a warning |
