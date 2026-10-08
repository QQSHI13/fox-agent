# bench: verified install commands (ubuntu-latest x64)

Researched 2026-10-08 against official docs. All commands verified against the
vendor's own docs/installer source, not third-party blogs.

## Fixes for existing "n/a (not installed)" rows

### amp (Sourcegraph)

- Install: `curl -fsSL https://ampcode.com/install.sh | bash`
  (alternative, also official: `npm install -g @ampcode/cli`)
- Binary: `amp`
- Source: https://ampcode.com/docs/cli ; npm package change notice:
  https://ampcode.com/news/npm-package-changes
- Auth: `amp login` (Amp account, free tier) or `AMP_API_KEY` env for real use;
  version probe works unauthenticated. Note: docs use `amp version`
  (subcommand) -- verify `amp --version` also answers before relying on it.
- **Package rename:** was `@sourcegraph/amp`, now `@ampcode/cli`. The old name
  still publishes but is deprecated; do not use it in CI.

### cursor-agent (Cursor)

- Install: `curl https://cursor.com/install -fsS | bash`
- Binary: `cursor-agent` (legacy symlink; new primary name is `agent` -- the
  installer creates both in `~/.local/bin`). Actual install root:
  `~/.local/share/cursor-agent/versions/<ver>/`.
- Source: https://cursor.com/docs/cli/installation
- Auth: Cursor account sign-in needed for agent runs; `--version` and TUI
  first-paint work unauthenticated. Auto-update is on by default.
- CI note: add `echo "$HOME/.local/bin" >> $GITHUB_PATH` to be safe
  (ubuntu-latest usually already has it on PATH).

### codebuff (CodebuffAI)

- Install: `npm install -g codebuff`
- Binary: `codebuff`
- Source: https://www.codebuff.com/docs/help/quick-start ;
  https://github.com/CodebuffAI/codebuff
- Auth: account sign-in on first interactive run (free mode available);
  `--version` should not need it.
- CI caveat: first run downloads a platform binary to
  `~/.config/manicode/codebuff` -- keep network up during the bench run.
- **Do NOT install `codebuff-cli`** (npm) -- impersonator package. Official
  package is `codebuff`.

## Suggested new rows (verified one-line installs)

### droid (Factory AI) -- high notability

- Install: `curl -fsSL https://app.factory.ai/cli | sh`
  (also official: `npm install -g droid`)
- Binary: `droid`
- Source: https://docs.factory.ai/droid-cli/quickstart
- Auth: Factory account browser sign-in on first run (free tier); headless
  `droid exec` uses `FACTORY_API_KEY`. Linux needs `xdg-utils` installed.

### Kimi Code CLI (MoonshotAI) -- replaces the archived Python kimi-cli

- Install: `curl -fsSL https://code.kimi.com/kimi-code/install.sh | bash`
  (also official: `npm install -g @moonshot-ai/kimi-code`)
- Binary: `kimi`
- Source: https://github.com/MoonshotAI/kimi-code
- Auth: Kimi account/API key for real use (Kimi subscription or platform key);
  version probe works without.

### Devin CLI (Cognition, "Devin for Terminal")

- Install: `curl -fsSL https://cli.devin.ai/install.sh | bash`
- Binary: `devin`
- Source: https://docs.devin.ai/cli ; https://devin.ai/cli
- Auth: Cognition account sign-in (browser) or `DEVIN_API_KEY`; free tier
  exists. Runs agent locally with cloud handoff.

### Cline CLI

- Install: `npm install -g cline`
- Binary: `cline`
- Source: https://cline.bot/cli ; https://docs.cline.bot/usage/cli-overview
- Auth: BYO provider key or Cline account; needed only for actual tasks.

### Continue CLI (`cn`)

- Install: `npm install -g @continuedev/cli`
  (shell installer, bundles own runtime, no Node needed:
  `curl -fsSL https://raw.githubusercontent.com/continuedev/continue/main/extensions/cli/scripts/install.sh | bash`)
- Binary: `cn`
- Source: https://docs.continue.dev/cli/quickstart
- Auth: `cn login` (Continue account) or Anthropic API key; CI/headless uses
  `CONTINUE_API_KEY`.

### iFlow CLI (Alibaba) -- notable in CN ecosystem, Gemini-CLI fork

- Install: `npm install -g @iflow-ai/iflow-cli`
- Binary: `iflow`
- Source: https://github.com/iflow-ai/iflow-cli
- Auth: iFlow account login (free model access); needed only for real use.

### forge (forgecode.dev) -- honorable mention, moderate notability

- Install: `npm install -g @antinomyhq/forge`
- Binary: `forge`
- Source: https://github.com/tailcallhq/forgecode (formerly antinomyhq/forge) ;
  https://forgecode.dev/docs
- Auth: BYOK (own provider API keys) or `FORGE_KEY` from forgecode.dev.

## Investigated and excluded

- **Windsurf CLI** -- no standalone terminal-agent product exists. The
  `windsurf` npm package is an IDE launcher (Windsurf is now Cognition-owned).
  Nothing to benchmark as a TUI harness.
- **Trae** -- commercial Trae CLI ships with the IDE, no public one-line
  installer. Open-source bytedance/trae-agent (12k stars) has NO PyPI package;
  official install is `git clone` + `uv sync --all-extras` (binary `trae-cli`).
  Fails the one-line-install requirement.

## CI environment notes

- npm-based installs (amp, codebuff, cline, cn, iflow, forge, droid-npm) need
  Node 20+ -- preinstalled on ubuntu-latest.
- curl-based installers (cursor, droid, kimi, devin) drop binaries in
  `~/.local/bin` or similar; add it to `$GITHUB_PATH` defensively.
- Bundle-size comparisons will be skewed for wrapper packages that lazily
  download real binaries on first run (amp, codebuff, cursor): measure after a
  first launch, and say so in the table footnotes.
