# `lsp`: language-server navigation

`lsp` asks a real language server where a symbol is **defined** versus merely
mentioned, and every place it is actually used. That is a sharper question than
`grep` can answer: `grep` finds text, a language server finds meaning.

```jsonc
{ "query": "references", "file": "src/loop/turn.ts", "line": 120, "character": 18 }
```

| Query | What it answers | Extra args |
|---|---|---|
| `definition` | Where the symbol is defined | `line`, `character` |
| `implementation` | Concrete implementations of an interface/abstract member | `line`, `character` |
| `references` | Every real call site (`includeDeclaration` includes the decl) | `line`, `character` |
| `hover` | Type and doc comment at a position | `line`, `character` |
| `symbols` | File outline | — |
| `workspace` | Project-wide symbol search | `name` |

Positions are **1-based** line/character, matching `read` and `grep` output, so no
offsets to convert.

## When it is worth the cold start

The first query on a project may take seconds (server cold start); later ones are
fast because the server is kept warm, one per project root. Use `lsp` when:

- `grep` returns a hundred mentions and you need the one that *binds*,
- you are renaming or refactoring and need every call site,
- you want the type at a position without reading the surrounding fifty lines.

Use `grep` when the symbol name is unique enough that text search is the answer.

## Servers

Built in: `typescript-language-server` (ts/tsx/js/jsx/mjs/cjs),
`pyright-langserver` (py/pyi), `rust-analyzer` (rs). Add others:

```toml
[lsp.gopls]
command = "gopls"
extensions = [".go"]
rootMarkers = ["go.mod"]
```

The same pool serves post-edit [diagnostics](files.md#post-edit-diagnostics), so a
server you add here improves both.

`lsp` is the `bundled:lsp` plugin — `disabledPlugins = ["lsp"]` removes the tool.
Setting `diagnostics = false` turns off the diagnostics half only; the pool is
still there for explicit queries.

## Failure is silent by design

No server installed, a server that won't start, one that hangs: the query fails
with an explanation, and nothing else breaks. The pool never blocks an edit.
