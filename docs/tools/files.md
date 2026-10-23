# File tools: read, write, edit, glob, grep

## `read`

Returns line-numbered text (`n: line`), which is what makes `edit`'s exact-match
anchors reliable.

- `offset` / `limit` page through a large file.
- Files above `readCap` (default 50 000 chars) are refused with a pointer to
  `offset`/`limit` rather than truncated silently.
- Images, audio and video are attached as **media** when the active model accepts
  that kind — Gemini takes all three, the GPT and Claude families take images.
  Otherwise the tool says so plainly.
- Other binary files are refused (a NUL-byte sniff), not dumped into the
  transcript.

## `write`

Creates parent directories and writes the file. Two things follow from "the edit
already reports what it broke": `write` reports **type errors** in the result
too, on the same path as `edit`.

## `edit`

The patch engine is whitespace-tolerant: an `oldString` that does not match
exactly is matched with whitespace-insensitivity and the replacement preserves
the file's relative indentation. That exists because models reproduce
indentation badly, and a failed edit costs a whole extra step.

Two forms:

```jsonc
{ "path": "src/a.ts", "oldString": "...", "newString": "..." }
{ "path": "src/a.ts", "edits": [ {"oldString": "...", "newString": "..."}, ... ] }
```

`edits` applies in order, in one call — use it for several changes to one file
rather than three round trips. `replaceAll: true` replaces every occurrence.

### Post-edit diagnostics

`edit` and `write` report what the change broke, in the tool result, without the
model asking:

```
edited src/loop/turn.ts (1 replacement)
diagnostics (typescript, 1 error):
  src/loop/turn.ts:214:9 error 2322  Type 'number' is not assignable to type 'string'.
```

Language servers are found on `PATH` and started on demand, one per project root,
then kept warm. Measured on this repo, a cold `typescript-language-server` takes
~4s to first answer and ~1s per edit after that, against 11.5s for a whole
`tsc --noEmit`. Built in: `typescript-language-server` (ts/tsx/js/jsx/mjs/cjs),
`pyright-langserver` (py/pyi), `rust-analyzer` (rs). Add others with `[lsp.*]`.

Only **errors and warnings** are reported, capped at 12 per edit. Hints are
dropped on purpose: "declared but never read" fires legitimately whenever a
helper is written in one edit and called in the next, and reporting it trains the
model to chase noise. Multi-line messages (TS overload dumps, rustc
explanations) collapse to their first line.

Everything here degrades to **silence** rather than to a failed edit — no server
installed, a server that won't start, one that hangs, a project too big to
analyze in time: the edit still succeeded, and is reported as such. When no
language server applies, fox-agent falls back to its own bracket-balance check.
Turn it off with `diagnostics = false` or `FOX_AGENT_DIAGNOSTICS=0`.

Two traps, both of which fail *silently*:

- `typescript-language-server` refuses to start unless `typescript` resolves from
  the project root (`npm i -D typescript`).
- A file outside `tsconfig.json`'s `include` gets zero diagnostics, with no
  complaint.

## `glob`

Find files by wildcard pattern (`src/**/*.ts`). Use `limit` to cap results; the
default 500 is a guard against a pattern that matches a whole tree.

## `grep`

Regex search over file contents, returning `path:line: match`. Uses ripgrep when
it is on `PATH` and falls back to a built-in walker when it is not. `include`
filters by glob, `path` scopes the search.

Prefer `grep` over `exec` with `grep`/`find`: it returns structured matches, has
no quoting hazards, and cannot accidentally run something.
