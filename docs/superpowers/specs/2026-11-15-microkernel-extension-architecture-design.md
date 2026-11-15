# Microkernel Extension Architecture Design

Date: 2026-11-15
Status: proposed design, direction approved by user
Priority: extensibility first, then UX and speed, then cost

## Summary

fox-agent should evolve toward a bundled-plugin microkernel: nearly every user-visible behavior becomes a plugin contribution, while a small kernel preserves the invariants that make the harness reliable.

This is not a one-step rewrite. The migration is incremental and keeps the existing test suite passing at every stage.

## Motivation

The current codebase has strong architecture invariants, but many extension surfaces are still implicit:

- provider behavior is partly encoded by provider format branches
- built-in tools are registered through internal paths
- hooks are powerful but not described by a public manifest
- commands are mixed into a large command module
- TUI behavior is concentrated in `src/tui/app.ts`
- frontend contributions are not modeled uniformly

Option 2 makes those surfaces explicit. The result should be a harness where users can add or replace providers, tools, hooks, commands, UI regions, gateway routes, and workflow policies without forking the kernel.

## Definitions

- **Kernel**: the non-replaceable core that owns storage, context invariants, turn composition, event vocabulary, trust policy, and validation.
- **Bundled plugin**: a plugin shipped inside the fox-agent binary and enabled by default.
- **External plugin**: a plugin loaded from the global config only.
- **Contribution**: a unit of behavior contributed by a plugin, such as a provider, tool, command, hook, route, region, or context policy.
- **Stage**: a named seam in the turn lifecycle where plugins can observe, wrap, or provide behavior.

## Design principles

1. The kernel owns invariants. Plugins customize behavior, not the rules that keep requests valid.
2. All extension behavior is declared in a manifest.
3. Bundled plugins are migrated first. External plugin support follows the same contracts.
4. Composition is deterministic: same config, same plugin set, same behavior.
5. Conflicts and dependency cycles fail closed with clear errors.
6. Provider prompt caching remains stable. Runtime state still travels in the runtime tail.
7. No side channel bypasses `AgentEvent`, append-only storage, or context projection.

## Target architecture

The target is a small kernel surrounded by bundled plugins and thin frontends.

```text
src/
  core/
    events.ts       # remains the event contract
    config/
    trust/
  kernel/
    store/
    context/
    turn/
    composition/
    capabilities/
  plugins/
    bundled/
      providers/
      tools/
      commands/
      hooks/
      pty/
      fetch/
      todo/
  frontends/
    tui/
    acp/
    cli/
    gateway/
  sdk.ts
```

This tree is the target model, not the required first refactor. Existing directories should migrate toward it in small steps.

## What remains kernel

The kernel remains directly responsible for:

- `AgentEvent` and event exhaustiveness
- session append-only storage and replay
- context projection and op validation
- provider request shape validation
- assistant tool-call and tool-result pairing
- turn state machine and stage composition
- global-only plugin loading and trust policy
- capability and permission auditing
- deterministic plugin ordering and conflict detection
- TUI frame scheduling and reactive invalidation

These are the guarantees that keep all frontends and extensions consistent.

## What becomes plugin contributions

The following move behind plugin contracts:

- provider adapters
- built-in file, shell, search, edit, ctx, task, and related tools
- bundled pty, fetch, and todo behavior
- slash commands
- hook implementations
- context policies
- gateway routes and socket methods
- TUI regions, panels, and renderers
- session metadata exporters
- future workflow policies

Built-in behavior does not disappear. It becomes a bundled plugin using the same public contract as external plugins.

## Extension manifest

Every plugin has a manifest. The manifest is the only entry contract used by the composer.

External plugins must provide the manifest as static data, for example `plugin.json`, before the plugin module is imported. This lets the kernel validate ID, version, dependencies, contributions, and permissions before executing plugin code. The code entry is loaded only after manifest validation.

Bundled plugins ship manifests generated at build time. They are trusted because they are compiled from this repository.

```json
{
  "id": "bundled:core-tools",
  "version": "1.0.0",
  "entry": "./index.ts",
  "permissions": ["fs.read", "fs.write", "shell"],
  "contributes": {
    "tools": ["read", "write", "edit"],
    "commands": ["clear", "model"],
    "hooks": ["diagnostics"]
  }
}
```

`definePlugin` may build the typed in-repo manifest, but it is not a substitute for a static external manifest. Static manifests name contribution IDs. The plugin module resolves those IDs to implementations.

Required manifest fields:

- `id`: stable, namespaced identifier
- `version`: semantic version
- `contributes`: declaration of all provided behavior IDs
- `permissions`: declared capability needs
- `entry`: required code entry point, except when `manifestOnly` is true

Optional fields:

- `manifestOnly`: declares a metadata-only plugin with no code entry
- `dependencies`: plugin IDs that must load first
- `activation`: startup, session, turn, tool, or lazy
- `api`: plugin API compatibility version
- `configSchema`: typed config contribution schema

## Composition rules

- Contribution IDs are namespaced by plugin ID.
- Duplicate contribution IDs are rejected.
- Plugin dependencies are sorted topologically.
- Dependency cycles are rejected.
- Bundled plugins load before external plugins unless a dependency requires otherwise.
- `disabledPlugins` can disable optional bundled plugins.
- Mandatory bundled plugins cannot be disabled.
- A plugin cannot redefine kernel services such as event vocabulary, context storage, or trust policy.
- Unknown manifest fields warn now and may become errors in a later API version.

## Turn pipeline

The turn loop becomes an explicit pipeline with validated stages.

```text
loadTurn
beforeContext
buildContext
validateContext
beforeLLMCall
callProvider
normalizeProviderResult
afterStep
beforeTool
runTool
afterTool
endTurn
```

Plugins can contribute stage behavior through hooks and middleware. They cannot bypass `validateContext`, pairing repair, persistence, or event emission.

Examples:

- a context policy contributes to `beforeContext` by returning validated ops
- a provider adapter owns `callProvider`
- a tool owns `runTool`
- a hook can observe `afterTool` and emit warnings through the normal event stream

Every plugin hook receives a typed context and returns a typed result. Hook execution has a timeout and a failure mode that cannot strand tool-call pairing.

## Core contracts

### ProviderAdapter

A provider adapter declares capabilities and converts kernel messages to provider requests.

Capabilities include:

- streaming
- tool calls
- media
- reasoning
- token usage
- cache breakpoints
- system role handling
- max output limits

The kernel still validates the message list before the adapter sees it.

### ToolContribution

A tool declares:

- name
- description
- JSON schema
- side effects
- risk class
- cancellation support
- output shape
- cost or latency hint
- idempotency notes

The kernel still handles scheduling, persistence, result pairing, truncation policy, and event emission.

### CommandContribution

A command declares:

- name and aliases
- help text
- mutation class
- handler
- optional interactive prompt
- optional ACP or gateway exposure

Command metadata should come from one registry so TUI, CLI, ACP, and gateway help stay consistent.

### HookContribution

A hook declares:

- stage
- priority
- timeout
- input contract
- output contract
- failure policy

Hooks cannot mutate stored rows directly. They return patches or ops.

### RegionContribution

A TUI contribution declares:

- region key
- dependencies
- reactive reads
- paint function
- optional key handling
- optional mouse handling

The frame loop remains kernel-owned. A region can repaint only through the existing dependency mechanism.

### ContextPolicyContribution

A context policy receives projected visible nodes and returns validated ops.

Allowed examples:

- hide nodes
- replace node content
- annotate pending summaries

Forbidden examples:

- rewrite stored rows
- bypass op versioning
- emit unpaired tool calls

## Security model

The current trusted-workspace stance remains. Option 2 increases extensibility, so the manifest must make risk explicit.

Security rules:

- external plugins load from global config only
- project config cannot add plugins
- permissions are declared before load
- the first milestone audits and warns
- later milestones can enforce permissions without changing the manifest format
- plugins cannot alter the event vocabulary
- plugins cannot mutate stored context rows
- gateway routes remain local-only by default
- MCP, LSP, ACP, pty, and shell permissions are listed separately

This design does not add a sandbox yet. It creates the contract where sandbox policy can be added without redesigning the plugin system.

## Public API and compatibility

`src/sdk.ts` is the public API boundary. Internal modules are not public.

The plugin API gets a compatibility version. Experimental APIs live under an explicit experimental namespace or config flag.

Compatibility policy:

- patch releases do not break manifests
- minor releases can add manifest fields and capabilities
- major releases can remove deprecated contribution types
- deprecated fields warn for at least one minor release

## Migration plan

### Phase 0: characterization

Add or strengthen tests that pin current behavior before extraction.

Focus:

- event ordering
- context render snapshots
- hook behavior
- provider adapter behavior
- command help and routing
- bundled plugin loading
- TUI region dependencies

Gate: `bun run typecheck` and `bun test` pass.

### Phase 1: manifest and composition kernel

Introduce manifest types and a composition layer without changing behavior.

Deliverables:

- `definePlugin`
- manifest schema
- contribution registry
- deterministic dependency ordering
- duplicate and cycle detection
- permission declarations

Existing plugin loader moves onto the new registry.

Gate: current plugin tests pass unchanged.

### Phase 2: provider registry extraction

Move provider adapters behind `ProviderAdapter`.

Deliverables:

- provider capability declarations
- provider contribution registry
- bundled provider plugin
- conformance tests for each adapter

Gate: provider tests, endpoint model tests, and full suite pass.

### Phase 3: tool registry extraction

Move built-in tools behind `ToolContribution`.

Deliverables:

- tool manifest metadata
- bundled core-tools plugin
- task, ctx, pty, fetch, and todo contributions keep working
- tool conflict detection

Gate: `test/tools.test.ts`, plugin tests, and full suite pass.

### Phase 4: command registry extraction

Move commands to `CommandContribution`.

Deliverables:

- command metadata registry
- handlers split by domain
- ACP and gateway command discovery from the registry
- help output generated from one source

Gate: command, CLI, ACP, and gateway tests pass.

### Phase 5: frontend contribution extraction

Move TUI regions and renderers to `RegionContribution`.

Deliverables:

- transcript, input, status, wizard, and related regions behind contributions
- frame loop still owned by the kernel
- mouse and key routing declared by regions

Gate: TUI region-graph and repaint tests pass.

### Phase 6: turn stage pipeline

Refactor the turn loop into explicit stages.

Deliverables:

- typed stage contexts
- stage middleware
- hook priority and timeout policy
- stage-level tests
- no changes to event order or persistence semantics

Gate: turn, timeout, retry, hook, and ACP tests pass.

### Phase 7: conformance and docs

Add external-facing guarantees.

Deliverables:

- external fixture plugins for each contribution type
- SDK conformance tests
- plugin authoring docs
- compatibility policy
- performance and binary-size report

Gate: build, typecheck, full tests, ACP acceptance, and docs review pass.

## Testing strategy

The migration needs five test layers.

1. **Kernel invariant tests**
   - append-only storage
   - context projection
   - event vocabulary
   - provider request validity
   - tool pairing

2. **Contract tests**
   - provider adapter capabilities
   - tool manifests
   - hook input and output types
   - command metadata
   - region contribution shape

3. **Composition tests**
   - deterministic load order
   - dependency cycles
   - duplicate contributions
   - disabled plugins
   - permission warnings

4. **External conformance tests**
   - an example plugin outside `src/` imports only the public API
   - each contribution type registers and runs
   - accidental internal imports fail the test

5. **Performance tests**
   - median turn-loop overhead introduced by composition stays at or below 1 ms in the benchmark harness
   - p95 context render time stays within 3 percent of the phase 0 baseline
   - TUI repaint counts stay equal to the phase 0 baseline for fixed fixtures
   - binary size is recorded every phase, and no phase may grow it by more than 5 percent over phase 0 without an explicit size-budget exception

## Acceptance criteria

The option 2 migration is successful when:

- built-in providers, tools, hooks, and commands are ordinary bundled plugins
- external plugins can add the same contribution types through `src/sdk.ts`
- project configs still cannot load plugins
- `AgentEvent` remains the only live event contract
- context remains append-only and projection-based
- system prompt cache stability is preserved
- TUI remains push-based
- duplicate or cyclic plugin composition fails with clear errors
- performance gates pass against the phase 0 baseline
- full typecheck, tests, build, and ACP acceptance pass
- external fixture plugins verify the public API without internal imports

## Risks and mitigations

### Risk: public API hardens too early

Mitigation: mark the first plugin API as experimental until phase 7 conformance tests exist.

### Risk: dynamic composition hurts speed

Mitigation: compose registries once per config reload, not per step. Keep hot turn paths free of manifest parsing and dependency sorting.

### Risk: plugin ordering becomes unpredictable

Mitigation: topological sort, explicit priorities for hooks, duplicate rejection, and composition snapshot tests.

### Risk: plugins break context invariants

Mitigation: context changes only happen through validated ops. The kernel replays and repairs projection after plugin patches.

### Risk: provider adapters leak format-specific behavior into the loop

Mitigation: capabilities are declared on the adapter, and the loop branches only on capabilities.

### Risk: TUI extensibility reintroduces dirty-marking

Mitigation: regions remain reactive effects. Contributions declare reads and paint functions, not frame-loop hooks.

## Out of scope

This design does not include:

- a plugin marketplace
- remote plugin installation
- plugin sandbox enforcement
- permission prompts by default
- replacing the event vocabulary
- arbitrary replacement of the frame loop
- mutable stored context rows

## Decision log

- Option 2, bundled-plugin microkernel, is the chosen target.
- The kernel remains small and invariant-owning.
- Built-in behavior migrates to bundled plugins first.
- External plugin support uses the same contracts.
- Security remains trusted-workspace by default, with explicit permission declarations added before enforcement.
