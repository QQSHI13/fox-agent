# `question`: asking the user mid-run

The model asks one or more structured questions and **waits** for the answers.
Use it where a decision is the user's to make and guessing risks wasted work:
which of two approaches to take, a missing required value, confirm-before-
destructive.

```jsonc
{ "title": "Auth approach",
  "questions": [
    { "key": "approach", "label": "Session storage?", "type": "select",
      "options": [
        { "value": "sqlite", "label": "Keep SQLite" },
        { "value": "files",  "label": "Move to files" }
      ],
      "initial": "sqlite" },
    { "key": "ttl", "label": "Session TTL", "type": "text", "initial": "7d" }
  ] }
```

Answers come back as a map keyed by each question's `key`.

## Why selects, not free text

The whole reason to ask is that the decision is discrete. A `select` with
explicit options is answered in one keypress and cannot be misread; a free-text
line invites a paragraph where a choice was wanted. Reach for `text` only when the
answer genuinely is a value (a path, a TTL, a token).

## Headless hosts fail fast

On a host that cannot take over the keyboard — `-p`, ACP, tests — the tool fails
with a clear message telling the model to decide on its own. It does **not**
block on an answer that can never arrive. That is the correct default there, and
the failure is explicit rather than a hang.

The same UI bridge serves plugin tools: `ctx.ui` is a `UiBridge` with `select`,
`input` and `wizard`, present only on interactive hosts. A plugin should check
for it and treat an `undefined` answer as "the user cancelled".

## Prompting well

- One decision per question. Six questions is the cap, not a target.
- Put the recommendation first and set `initial` to it: most answers are "yes,
  the one you suggested".
- `secret: true` masks typed characters — use it for anything key-shaped.
- `allowEmpty: false` makes an empty answer stay on the question, for values that
  cannot be blank.
