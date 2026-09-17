# Harness fix list

Scratch tracker for the TUI/harness issue batch (user-reported, 2026-09-16).
Delete this file when the batch is done. Convention: `- [ ]` open,
`- [~]` in progress, `- [x]` done (verified: `bun run typecheck` + `bun test`).

## Scroll / viewbox

- [x] 1. Viewbox is capped — transcript only scrolls back so far.
  Must scroll infinitely (full session history, no row cap). No terminal
  limit; this is our own TUI so scrollback is ours to keep.
  FIXED: `loadItems()` no longer drops all but the last 300 nodes
  (`src/tui/app.ts` — `nodes.slice(-300)` → all nodes). Per-item output
  caps (`tuiKeptChars`) stay: they bound memory per tool result, not history
  depth; the row cache already evicts dead keys.

## History scope

- [x] 2a. ANSWER: `acpHistory` is a config key (`src/core/config.ts:170`)
  controlling how much stored transcript `session/load` replays to an ACP
  client (Zed/acpx): `"full"` (default — everything visible), `"last"`
  (final user message + everything after), or N (trailing N nodes).
  Implemented by `selectHistory` (`src/acp/server.ts:83`); replay shows
  what the model sees (compacted/deleted spans stay hidden). Now also
  documented in the README's ACP section.
- [x] 2b. Agent-toggleable full output: `exec` grew a `full: true` call
  option (`src/tools/exec.ts`) lifting the per-result `toolOutputCap`
  cut for that call — foreground and job polls. Hard memory guards
  (5MB fg / 1MB poll tail-read) stay and say so when they bite.

## Copy / clipboard

- [x] 3a+3c. FIXED: one `copyText()` helper (`src/tui/app.ts`) for
  transcript and input alike — same clipboard probes, same
  `copied N chars (M lines)` / `copy failed — no clipboard tool` message.
  The input-box ctrl+c path no longer has its own clipWrite + bare "copied".
- [~] 3b. Delay before "copied": the flash fires only after the clipboard
  probe resolves (spawn powershell/wl-copy/xclip/pbcopy in order, else
  OSC 52). Kept honest (no fake pre-confirm); unified path, no extra hops.
  If a delay persists on your box, it is the probe — report which helper
  exists there and we can reorder/skip.
- [x] 3d. FIXED: input-box ctrl+c now clears the input selection
  (`inSelAnchor = null`) right after copying.

## Scroll routing

- [x] 4. FIXED: scrolling routes by position. The decoder now keeps wheel
  coordinates (`src/tui/keys.ts`); wheel over the dock (queued rows +
  flex input box, via shared `dockTopY()` geometry) walks the input caret
  so the box scrolls, anywhere else scrolls the transcript (`src/tui/app.ts`).
  pgup/pgdn/home/end (no position of their own) route by last pointer
  position: dock → caret page/top/bottom, else transcript as before.
  Modals unchanged (picker/wizard consume the wheel first).

## Provider display

- [x] 5a. FIXED: new `providerDisplayName()` (`src/commands.ts`) maps a
  saved preset id to its catalog name ("openrouter" → "OpenRouter");
  profile names show as-is, else the wire format. Used by the /model
  picker current row, bare `/model` output, and the TUI welcome block.
- [x] 5b. RESOLVED per user ("just show the newest provider"): the status
  bar now shows the active provider's display name too
  (`cwd · Provider · model · ctx`), joining the /model picker, bare
  `/model` output, and welcome block — all through `providerDisplayName()`.

## Trust prompt

- [x] 6. Entering the TUI from the trust prompt should take one char, no
  enter key (`src/core/trust.ts`).
  ALREADY DONE — no change needed. `readTrustKey` reads one keypress in
  raw mode (`trust.ts:119`), `classifyTrustKey` maps y/enter/n/c
  (`trust.ts:74`), pinned by `test/trust.test.ts:29`. If it still asked
  for enter, that was the stale 0.3.1 install — now shadowed by the
  `bin/fox` alias.

## /login wizard

- [x] 7. `/login` model-name re-ask. ROOT CAUSE (verified with a driver
  script against the real wizard object): the skip logic itself is correct
  for keyboard use — but `promptKey` swallowed ALL mouse events, so
  clicking a listed model never moved the highlight and enter committed the
  stale row (often `__custom`), landing on the "model id" text step.
  FIXED: select-step options are clickable in `promptKey`/`promptClick`
  (`src/tui/app.ts`) — first click highlights (geometry mirrors paint),
  second click on the same row submits. Benefits /model, /theme,
  /thinking, /upgrade wizards too.
