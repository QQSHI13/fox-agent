# exec and pty: opposite cwd rules

These two tools differ deliberately, and both behaviours are load-bearing.

## `exec` never drifts

Every call re-resolves from the session's directory. A `cd` in one command cannot
change where the next one runs, because each call is a fresh process starting
from the same place.

- `workdir` is **per-call** and never sticky.
- Prefer `workdir` over `cd x && cmd` when you can; both work, but `workdir`
  keeps the command readable.
- `timeout_ms` kills the **process group** (TERM, then KILL after 1.5s), so a
  wedged `make` cannot leave grandchildren running. You set the budget: default
  120000, no upper bound, and `0` disables the timeout entirely. A value past
  ~24 days is honoured rather than overflowing the timer.
- Output is merged (stdout + stderr) with an exit code, tail-capped by
  `toolOutputCap`. `full: true` lifts the cap for that call — the hard memory
  guards still apply.

## `pty` starts there and may drift

The tmux-backed shell opens in the session directory and then keeps whatever
directory, environment and running processes it has been given. That persistence
is the point: `cd build && make`, a dev server, a REPL.

- `keys` is sent **literally** — every character exactly as given. `"\n"` presses
  enter; `"^c"` alone is ctrl+c; omitted, it just drains new output.
- `quiet_ms` returns once output has been silent that long (default 400, max
  5000). Poll rather than re-running.
- Use it for anything long-running: servers, watch modes, REPLs.

Two failure modes it reports rather than hides:

- If the tmux session disappeared (server killed, reboot), the next call **says
  so explicitly** instead of handing back a pristine shell that looks unchanged.
- If the session directory is gone by the time the shell starts, tmux silently
  opens in `$HOME`. fox-agent reports where it actually landed rather than
  claiming the directory it asked for.

`pty` is a bundled plugin (`bundled:pty`) because its lifetime is tied to the
session through an `onSessionEnd` hook — the tmux session is released there, not
from a special case in the harness. `disabledPlugins = ["pty"]` removes the tool
and the hook together.

## Which one

| You want | Tool |
|---|---|
| A one-shot command, or a script's output | `exec` |
| Building, testing, git, package managers | `exec` |
| A server you will query later | `pty` |
| A REPL you will keep typing into | `pty` |
| A `cd` that persists across calls | `pty` |
| JavaScript with persistent variables, no shell | `repl` |

## Environment

Both inherit the **full** environment — no credential stripping, deliberately.
See [Security](../architecture/index.md#security-model) for why.
