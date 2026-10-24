# Sessions

A session is one conversation with one model. Each is a **single SQLite
database**, so it can be copied, deleted or corrupted without touching any other.

```
$FOX_AGENT_HOME (default ~/.local/share/fox-agent)
  index.db              session list (id, cwd, model, title, timestamps)
  sessions/<id>.db      messages + view ops + refs + usage + kv for one session
  locks/<id>.json       open-session markers (read-only mode for a second opener)
  pty/                  tmux pipe-pane output logs
  docs/                 agent docs materialized from the binary
```

`index.db` holds only the session list and is rebuildable from `sessions/`. That
is why losing it is an inconvenience rather than a loss.

## Event-sourced, not rewritten

Inside a session database:

- an **append-only message log**,
- a **view-ops log** (what `ctx` hid, rewrote or restored),
- **refs** (reverts, forks).

Nothing is ever rewritten. `/undo` is a query over view ops, `/fork` is a copy,
and compaction only *hides* messages — their text stays in the log, which is what
makes `/undo` able to walk it back.

## Finding and resuming

```bash
fox ls               # list sessions, colorized on a TTY
fox -c               # resume latest (interactive picker in a terminal)
fox -c 3             # by 'fox ls' index
fox -c mtzc7lak9     # by id
```

### How `fox -c <n>` resolves

A bare number is an index into the same list `fox ls` prints: most recently
worked-in first, across **all** directories, exactly as shown. `fox -c 3` and the
row numbered 3 in `fox ls` go through one shared resolver (`resolveSessionArg`),
so a listing and the resume it feeds can never disagree. Anything that is not a
number is treated as a session id first.

Two things to know:

- **The index is not stable.** It is a position in a recency-sorted list, so
  working in another session (or deleting one) shifts the numbers. For scripting,
  prefer the id.
- **The interactive picker differs by scope.** `fox -c` with no argument (and
  `/sessions` in the TUI) lists *this directory's* sessions by default; press `a`
  there to widen to all directories. `fox ls` and `fox -c <n>` are always
  all-directories. So "session 3" in the picker can be a different session than
  `fox -c 3` until you press `a`.

Inside the TUI: `/sessions` (or bare `fox -c`) opens the picker — `↑↓` move,
`enter` open, `^f` fork, `^x` delete (then `y`), `^n` new, `^a` all-dirs, type to
filter.

## Forking

`/fork [N|id]` forks this session at row N, or another session by id. It is
literally a file copy, so the fork and its source cannot affect each other
afterward.

## Context surgery

Every message carries a stable `[N]` marker.

- `/ops` — what surgery has been done.
- `/undo` — revert the last op.
- `/view` — preview the visible nodes with role and preview text.
- `ctx` — the tool the agent uses to do it. See [ctx](../tools/ctx.md).

## Compaction and pruning

There is no automatic compaction. The agent compacts its own view with `ctx`,
and it only **hides** messages, keeping their text in the log so `/undo` works.
Two configurable rails keep that honest: `compactWarnAt` (default 0.8 of the
window) puts a warning in the runtime header, and `compactCtxOnlyAt`
(default 0.9) disables every tool except `ctx` until the window comes down.

`/prune` reclaims the disk that leaves behind:

```
/prune              # report what it would delete, change nothing
/prune yes          # delete those bodies for good, then VACUUM
/prune compact yes  # also splice summaries back as real rows and renumber [N] 1..n
```

A bare `/prune` in the TUI asks with a menu instead of the two-step. It never
changes what the model sees: each compacted span keeps its first row as an empty
stub, because that is the row the summary line is rendered against.

## Deleting

`/delete <id|n> yes` removes a session's database and its index row together.

It refuses the session you are currently in — its database handle is open and the
turn loop is appending to it, so unlinking the file underneath would leave
fox-agent writing into a vanished inode with nothing to show for it. `/new` first,
then delete. Unlike `/prune`, `/undo` cannot walk this back.

Bare `/delete` in the TUI opens the session picker, which has its own
delete-with-confirm key.

## Moving a session between machines

```
/export [file]     # -> fox-session-<id>.zip
/import <file>     # installs it under its own id; replaces an existing one
/share [file]      # -> fox-session-<id>.html, fully offline, one file
```

`/share` inlines styles and images and masks credential-shaped text, so it is the
one to use for showing someone a transcript. Both commands write into cwd when no
path is given.

## Privacy

Session data is local and unencrypted: one SQLite file per session containing
full transcripts and tool output, plus raw shell logs under `pty/`. Nothing is
sent anywhere except to your provider.
