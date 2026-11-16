# Plugin Loader Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the approved-scope plugin-loader limitations and Phase 0-1 review follow-ups without adding any default sandbox, permission prompt, or permission-enforcement behavior.

**Architecture:** Three isolated background lanes run in separate git worktrees. Lane 1 owns all `src/plugins/*` and plugin loader/inventory behavior. Lane 2 owns host config-directory threading. Lane 3 owns docs and the architecture decision log. The coordinator merges the lane branches, resolves any conflicts, then runs the integrated gates.

**Tech Stack:** Bun, TypeScript, git worktrees.

**Spec:** `docs/superpowers/specs/2026-11-15-microkernel-extension-architecture-design.md`

## Global Constraints

- No sandbox, no permission prompts, and no permission enforcement. Permissions remain declarations only; expanded vocabulary is allowed.
- Plugins remain global-config-only. Project config must not load plugins.
- A plugin manifest is always read and composed before plugin code is imported.
- Composition errors fail the entire external plugin set closed.
- Keep the pre-existing dirty `src/context/render.ts` untouched; stage explicit paths only.
- Use `bun run typecheck`, never `tsc`.
- Use focused `bun test <file>` during iteration and full `bun test` before integration gates.
- Tests are hermetic: set `FOX_AGENT_HOME` and `FOX_AGENT_CONFIG` to temporary paths.
- No `any` unless the boundary genuinely requires it. Match surrounding style. ASCII only in user-facing output.
- Directory-form plugin support must resolve `manifest.entry` only inside the configured plugin directory.
- `manifest.entry` remains informational for file entries; file entries continue to import the configured path.

---

### Task 1: Plugin core loader behavior

**Files:**
- Modify: `src/plugins/manifest.ts`
- Modify: `src/plugins/compose.ts`
- Modify: `src/plugins/load.ts`
- Modify: `src/commands.ts`
- Test: `test/plugin-manifest.test.ts`
- Test: `test/plugins.test.ts`

**Interfaces:**
- Consumes: existing `PluginManifest`, `parsePluginManifest`, `composePluginManifests`, `loadPlugins`, and `pluginInventory`.
- Produces:
  - `PLUGIN_CONTRIBUTION_KEYS` exported from `src/plugins/manifest.ts`.
  - `PluginContributions = Partial<Record<PluginContributionKind, string[]>>`.
  - Expanded `PLUGIN_PERMISSIONS` including `mcp`, `lsp`, `acp`, and `pty`.
  - `ComposeResult.contributions: ReadonlyMap<string, string>` mapping `${kind}:${id}` to owning plugin ID.
  - Directory-form configured plugin entries import `resolve(configuredDirectory, manifest.entry)`.
  - `LoadedPluginFile.skipReason` always stores the full warning string shown to the user.
  - Runtime/declaration contribution mismatches produce warnings, never load failures.

- [ ] **Step 1: Write failing manifest schema and composition tests**

Add tests covering these exact behaviors:

1. `1.0.0-beta.1+build.5` is accepted as a valid manifest version.
2. Permissions `mcp`, `lsp`, `acp`, and `pty` are accepted.
3. `PluginContributions` still accepts every existing contribution kind and rejects an invalid kind at parse time.
4. `composePluginManifests` returns a queryable `contributions` map containing `tools:ping -> owner-id`.
5. `tools: ["ping", "ping"]` inside one manifest fails composition.
6. `tools:ping` in one plugin and `commands:ping` in another is allowed.
7. A loader-level unknown dependency reports `plugin composition failed` and loads no external plugins.

- [ ] **Step 2: Run the failing tests**

Run:

```bash
bun test test/plugin-manifest.test.ts test/plugins.test.ts
```

Expected: the new tests fail because the semver regex, permission vocabulary, queryable contribution map, and duplicate diagnostic are not implemented.

- [ ] **Step 3: Implement the minimal manifest and composition changes**

In `src/plugins/manifest.ts`:
- Widen semver validation to:

```ts
/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/
```

- Add `mcp`, `lsp`, `acp`, and `pty` to `PLUGIN_PERMISSIONS`.
- Export `PLUGIN_CONTRIBUTION_KEYS`.
- Derive `PluginContributionKind` and `PluginContributions` from `PLUGIN_CONTRIBUTION_KEYS`; remove the manually repeated key list.
- Export the module-extension list and add a helper used by both `manifestPathFor` and disabled-plugin matching so `.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, `.mts`, and `.cjs` cannot diverge.

In `src/plugins/compose.ts`:
- Iterate `PLUGIN_CONTRIBUTION_KEYS` directly; remove the cast in `contributionPairs`.
- Return `contributions: contributionOwner` in `ComposeResult`.
- Improve duplicate-in-one-manifest diagnostics to name one owner clearly instead of reporting `from 'one' and 'one'`.

- [ ] **Step 4: Run manifest and composition tests**

Run:

```bash
bun test test/plugin-manifest.test.ts test/plugins.test.ts
bun run typecheck
```

Expected: all tests pass and typecheck is clean.

- [ ] **Step 5: Write failing loader-behavior tests**

Add tests covering these exact behaviors:

1. A configured directory `/tmp/plugin-dir` loads `/tmp/plugin-dir/plugin.json` and imports `/tmp/plugin-dir/index.ts` when the manifest entry is `index.ts`.
2. A directory manifest entry of `../outside.ts` is rejected before import.
3. A directory manifest entry that resolves to another directory is rejected before import.
4. A missing directory manifest produces the existing missing-manifest warning shape.
5. A file entry keeps the current behavior and imports the configured file path.
6. `skipReason` equals the full warning string for missing manifests and import failures.
7. A `manifestOnly` plugin appears in `pluginInventory` with `metadata only`, not `not loaded — see warnings`.
8. A plugin declaring `tools: ["declared"]` but implementing no such tool emits a declaration mismatch warning.
9. A plugin implementing a tool without declaring it emits an implementation mismatch warning.
10. Dynamic function-form tools are not statically cross-checked.
11. `disabledPlugins = ["x"]` matches `x.tsx` and `x.cjs`.

- [ ] **Step 6: Run the failing loader tests**

Run:

```bash
bun test test/plugins.test.ts
```

Expected: the new tests fail because directory entry resolution, normalized `skipReason`, metadata-only inventory text, and declaration cross-checking are not implemented.

- [ ] **Step 7: Implement loader and inventory behavior**

In `src/plugins/load.ts`:
- Extend the pending external plugin shape with an import path.
- For configured module files, keep the current import path.
- For configured directories:
  - Read `manifestPathFor(configuredPath)`, which already returns `<dir>/plugin.json`.
  - Require `manifest.entry` to be relative.
  - Resolve it with `resolve(configuredPath, manifest.entry)`.
  - Reject paths escaping the configured directory using `relative`.
  - Require the resolved entry to have a known module extension.
  - Import the resolved path.
- Set `skipReason` to the exact warning string everywhere the loader currently stores a shorter reason.
- After validating the runtime plugin and manifest ID match, compare static runtime contribution IDs against `manifest.contributes`:
  - `tools`: `def.name` for array form only.
  - `commands`: `name`.
  - `providers`, `themes`, `mcpServers`, `agents`, `statusSegments`, `regions`: object keys.
  - `keybindings`: `key`.
  - `hooks`: hook object keys.
  - Warn on declared-but-not-implemented and implemented-but-not-declared IDs.
  - Do not fail load for either mismatch.
  - Skip `tools` cross-check when `tools` is a function.
- Use the shared module-extension helper for disabled-plugin matching so every extension in the manifest list behaves consistently.

In `src/commands.ts`:
- In `pluginInventory`, when a loaded file has `manifest.manifestOnly`, render `metadata only` before looking for a runtime plugin.

- [ ] **Step 8: Run loader tests and typecheck**

Run:

```bash
bun test test/plugins.test.ts
bun run typecheck
```

Expected: all tests pass and typecheck is clean.

- [ ] **Step 9: Commit the lane**

```bash
git add src/plugins/manifest.ts src/plugins/compose.ts src/plugins/load.ts src/commands.ts test/plugin-manifest.test.ts test/plugins.test.ts
git commit -m "plugins: harden manifest and loader behavior"
```

---

### Task 2: Relocated-config plugin path threading

**Files:**
- Modify: `src/app.ts`
- Modify: `src/cli.ts`
- Modify: `src/loop/turn.ts`
- Test: create `test/plugin-config-path.test.ts`

**Interfaces:**
- Consumes: `effectiveConfigPath`, `loadConfig`, and `loadPlugins`.
- Produces: every production `loadPlugins` caller passes the directory of the effective config file instead of `undefined`.

- [ ] **Step 1: Write the failing relocation test**

Create a hermetic test that:
1. Writes a temporary config file at a non-default path.
2. Writes a relative plugin entry and sidecar manifest beside that config.
3. Exercises the turn fallback plugin-load path with `registryOverride` and no `pluginsOverride`.
4. Asserts the relative plugin resolves against the temporary config directory and loads.

Keep the test independent from `test/plugins.test.ts` so it can run in a separate worktree lane.

- [ ] **Step 2: Run the failing test**

Run:

```bash
bun test test/plugin-config-path.test.ts
```

Expected: fail because `src/loop/turn.ts` still calls `loadPlugins(effCfg.plugins)` with the default home-directory base.

- [ ] **Step 3: Thread the effective config directory**

In `src/loop/turn.ts`, pass `dirname(effectiveConfigPath())` as the second argument to `loadPlugins` in the `registryOverride` fallback path.

In `src/cli.ts`, retain the resolved `configPath` from `effectiveConfigPath(...)` and pass `dirname(configPath)` to `loadPlugins`.

In `src/app.ts`, pass the directory of the config path used for the current TUI boot. If no explicit path is present, use `dirname(effectiveConfigPath())`.

Do not add sandbox or security behavior. This only changes path resolution.

- [ ] **Step 4: Run focused tests and typecheck**

Run:

```bash
bun test test/plugin-config-path.test.ts
bun test test/plugins.test.ts
bun run typecheck
```

Expected: all pass.

- [ ] **Step 5: Commit the lane**

```bash
git add src/app.ts src/cli.ts src/loop/turn.ts test/plugin-config-path.test.ts
git commit -m "plugins: resolve relocated config paths"
```

---

### Task 3: Docs and architecture decision log

**Files:**
- Modify: `docs/plugins/index.md`
- Modify: `docs/agent/plugins.md`
- Modify: `docs/superpowers/specs/2026-11-15-microkernel-extension-architecture-design.md`

**Interfaces:**
- Consumes: Task 1 behavior and the user’s ruling that fox-agent adds no default sandbox or security layer.
- Produces: user docs that match the implementation and a spec decision log that prevents later agents from reintroducing sandbox scope.

- [ ] **Step 1: Update user-facing plugin docs**

Document exactly:
- File entry: `my-plugin.ts` + `my-plugin.plugin.json`.
- Directory entry: `my-plugin/` + `my-plugin/plugin.json` + `manifest.entry` resolving inside that directory.
- Relative configured plugin paths resolve against the global config file’s directory.
- Expanded permission values: `env`, `network`, `shell`, `fs.read`, `fs.write`, `sessions`, `provider`, `mcp`, `lsp`, `acp`, `pty`.
- Permissions are declarations only. There is no default sandbox, permission prompt, or permission enforcement in fox-agent.
- Security controls, if desired, are plugin-provided rather than kernel defaults.

- [ ] **Step 2: Update the decision log**

Append decisions stating:
- Directory-form plugin entries and `manifest.entry` resolution are now supported.
- Permission vocabulary is expanded, while permission enforcement and sandboxing remain out of scope by user decision.
- Phase 1 contribution uniqueness remains global-per-kind; lifecycle hooks remain shared.
- Composition exposes a queryable contribution ownership map.
- Runtime declaration mismatches warn without failing load.

- [ ] **Step 3: Commit the lane**

```bash
git add docs/plugins/index.md docs/agent/plugins.md docs/superpowers/specs/2026-11-15-microkernel-extension-architecture-design.md
git commit -m "docs: update plugin loader cleanup decisions"
```

---

### Task 4: Integrate lanes and run gates

**Files:**
- Integrate branches from Task 1, Task 2, and Task 3.
- No direct code edits unless merging requires conflict resolution.

- [ ] **Step 1: Merge lanes in order**

Merge Task 1, then Task 2, then Task 3. Resolve conflicts in favor of the completed lane behavior, preserving every global constraint.

- [ ] **Step 2: Run integrated gates**

Run:

```bash
bun run typecheck
bun test
bun run build
git diff --check
```

Expected:
- Typecheck clean.
- Full suite passes.
- Build succeeds.
- `git diff --check` clean.
- `src/context/render.ts` remains the only pre-existing dirty file.

- [ ] **Step 3: Review the integrated diff**

Verify:
- No sandbox or permission-enforcement code was added.
- Manifest-before-import still holds.
- Directory entry resolution cannot escape the plugin directory.
- Composition still fails closed.
- No staged or committed changes to `src/context/render.ts`.

- [ ] **Step 4: Commit merge and push**

Stage explicit paths only, commit the integration if needed, and push `HEAD` to `origin`.
