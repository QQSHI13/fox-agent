# `ctx`: the agent's own context window

This is the tool the project is named for. Every message in the transcript
carries a stable `[N]` node marker, and `ctx` lets the model search, hide and
rewrite what it sees.

**`ctx` is a view operation.** Storage is append-only and never touched. Hiding a
node writes a view op; `restore` writes another; `/undo` walks the last one back.
Nothing is ever lost, which is why the agent can prune aggressively without
fear.

## Operations

| Op | Arguments | Effect |
|---|---|---|
| `search` | `pattern` (regex), `role`, `limit` | Find nodes by pattern; returns **snippets**, not whole bodies. When `limit` cuts the listing, the result says how many were withheld |
| `stats` | `top` | Sizes and the biggest nodes — where the window is going |
| `delete` | `ids`, `summary` | Hide nodes from the view; a `summary` leaves a one-line note in their place |
| `delete_by_query` | `pattern`, `role`, `all` | Hide every node matching a pattern. Matches **all** visible nodes (never a truncated first-N), and requires `all: true` when the pattern matches everything visible |
| `replace` | `id`, `content` | Rewrite one node's text |
| `restore` | `ids` | Un-hide nodes |

Multiple ops batch into one call:

```jsonc
{ "ops": [
    { "op": "search", "pattern": "error", "role": "tool" },
    { "op": "delete", "ids": [12, 19], "summary": "ran build; fixed 2 errors" }
  ],
  "reason": "the output I need is below" }
```

## Why search, not read

`search` exists because the natural failure mode of a context-editing tool is
reading the whole window to decide what to cut — which is the cost it was meant
to remove. Search returns snippets; the model queries rather than re-reads.

`stats` answers the other half: *where did it go?* A single runaway `exec` or a
file dump dominates the window, and it is worth knowing before hiding anything.

## Why there is no automatic compaction

The harness never summarizes behind the agent's back. A background summary pass
destroys the distinction between the file that mattered and the three that did
not, spends an LLM call nobody asked for, and hides things the agent was still
using. The interesting case is *before* the window is full: the agent has just
read four files to answer one question, and three of them are dead weight.

So the agent does it, continuously. The harness keeps only two rails, both
configurable: past `compactWarnAt` (default 0.8) the runtime header says how
full the window is and tells the agent to start compacting deliberately; past
`compactCtxOnlyAt` (default 0.9) every tool except `ctx` is disabled, because
the one useful action left is making the window smaller. Compaction itself is
still just `delete`/`replace` ops — nothing is destroyed, and `/undo` walks it
back.

## Paired invariants

`ctx` edits obey the same pairing rule as everything else: an assistant
`tool_call` and its `tool_result` travel together. Rendering repairs pairs on
projection, so hiding one member of a pair cannot produce an orphaned
`tool_result` — the condition a provider hard-400s on.

Markers are the anchor. Hiding, reordering or compacting never renumbers them;
only `/prune compact` renumbers `[N]` 1..n, and it says so.

## Related

- `/ops` — show the context surgery performed so far.
- `/undo` — revert the last op.
- `/view` — preview visible nodes with role and preview text.
- `/prune` — reclaim the disk that hidden context still occupies.
- `contextMarkers = false` hides `[N]` in the transcript (display only — the
  markers the agent uses are unaffected).
