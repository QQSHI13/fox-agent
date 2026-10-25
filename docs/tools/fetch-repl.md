# `fetch` and `repl`

## `fetch`

Fetches a URL and returns its content as text. HTML is stripped to readable text;
JSON comes back raw. Image, audio and video URLs attach as **media** when the
current model accepts that kind, and say so plainly when it does not.

Bounds, all of them enforced rather than advertised:

- ~20 KB of text, 10 MB of media. Anything larger is refused **mid-stream**, so a
  chunked body cannot OOM the process before the cap check.
- Up to 5 redirects, and **every hop is re-checked** against the private-address
  rules below — a redirect is the obvious way to reach a blocked host.

### The local network is refused

`fetch` cannot reach:

- loopback (`127.0.0.0/8`, `::1`, `0.0.0.0/8`),
- private ranges (`10/8`, `172.16/12`, `192.168/16`, IPv6 ULA),
- link-local and cloud metadata (`169.254.169.254`),
- and their IPv4-in-IPv6 forms (`::ffff:127.0.0.1` and friends).

That is because this tool takes a URL *from the model*, and the machine under it
has a metadata endpoint, a router admin page, and whatever you are running on
localhost. `FOX_AGENT_ALLOW_PRIVATE_FETCH=1` re-enables them deliberately.

Names are resolved before the request, and every address a name answers with is
judged by the same rules — a public-looking host that points at `127.0.0.1` or
the metadata range is refused too. (Best-effort: the gate is a lookup, not IP
pinning, so a resolver that changes its answer between the check and the
connection is out of scope.)

`fetch` is a bundled plugin (`bundled:fetch`), so it can be switched off entirely.

## `repl`

An in-process JavaScript environment — no shell, no subprocess, so it works in the
compiled binary with no `bun` on `PATH`.

The environment is deliberately full, because `exec` already runs anything: a
hobbled `repl` would add friction, not safety.

- `process`, timers, `fetch`, `Buffer`, `console` are the **real** host bindings.
- `await import("node:fs")` works — dynamic import resolves through the real
  module loader.
- `return` (or a trailing expression) becomes the result; `console.log` lines are
  captured alongside it.

### State persists

Variables live in the session's scratchpad: assign once, reuse for twenty turns.

```js
rows = JSON.parse(await (await fetch(url)).text())   // → number of rows
rows.filter(r => r.ok).length                        // later call: still there
```

`reset: true` drops the scratchpad. It is released on `onSessionEnd` too — the
plugin ties the state to the session's lifetime.

### Reaching your own tools

```js
await tools.call("exec", { cmd: "git log --oneline -5" })
tools.list()
tools.search("glob")
```

Direct tool calls bypass the turn loop's `beforeTool`/`afterTool` hooks — worth
knowing if you are debugging a hook that seems not to fire.

### Background jobs

`background: true` runs the eval detached and returns a job id immediately.

```jsonc
{ "code": "...", "background": true, "label": "long build" }   // → job id
{ "job": "j1" }                                                // poll: new output + status
{ "job": "j1", "signal": "kill" }                              // stop it
```

Poll instead of re-running. You are notified when a job finishes; the job is
reaped after a grace window.

A hanging foreground eval is killed at `timeout_ms` (default 30 000). You set
that budget yourself: there is no upper bound (anything positive is honoured),
and `timeout_ms: 0` disables the timeout entirely so an eval runs until it
finishes. Negative values are rejected. Nesting
`repl` inside `repl` is capped at 3 deep — unbounded nesting is a hang with extra
steps.
