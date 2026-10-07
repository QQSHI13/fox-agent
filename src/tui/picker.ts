/**
 * A modal list chooser: the one overlay concept in the TUI.
 *
 * Before this, `app.ts` had no notion of a mode that owns the keyboard — every
 * key went to the input buffer, and the only floating layer was the slash-hint
 * popup, which is passive (it never consumes a key it isn't asked about). An
 * interactive `/sessions` needs the opposite: while it is up, arrows move a
 * selection rather than the caret, and `d` deletes rather than typing a letter.
 *
 * Kept here rather than in `app.ts` for the same reason as `select.ts` and
 * `edit.ts` — the parts that can be *wrong* (which row is selected after a
 * filter narrows the list, what a keypress resolves to, whether a confirm step
 * is pending) are pure state transitions, so they can be tested without a
 * terminal. `app.ts` keeps only the painting and the effects.
 *
 * The same picker serves `fox -c`, which runs it before any session exists and
 * therefore before the harness state does — hence `PickerRow` is plain data with
 * no reference to a session, a store or a config.
 */

export interface PickerRow {
  /** stable identity handed back to the caller when a row is chosen */
  id: string;
  /** columns, painted left to right and joined with two spaces */
  cells: string[];
  /** matched against the filter query, lowercased by the caller if needed */
  search: string;
  /** rendered with a marker and never destructible (the live session) */
  current?: boolean;
  /**
   * An "other…" row: enter does not return it, it opens a free-text box and
   * the value typed there comes back as a `{ kind: "input" }` action carrying
   * this row's id. For a caller offering a list that cannot be complete — a
   * theme name, a provider id — without forcing it to invent a two-step dance.
   */
  input?: boolean;
  /**
   * How to name this row in the delete confirm. Defaults to `id`, never to a
   * cell: the first column is a list position, so the prompt read "delete 2?" —
   * a number that identifies nothing and that a filter edit would renumber.
   */
  label?: string;
}

/** What a keypress resolved to. `null` means "the picker consumed it". */
export type PickerAction =
  | { kind: "choose"; id: string }
  /** an `input` row: `value` is what the user typed, trimmed and non-empty */
  | { kind: "input"; id: string; value: string }
  | { kind: "fork"; id: string }
  | { kind: "delete"; id: string }
  | { kind: "new" }
  | { kind: "all" }
  | { kind: "cancel" };

export interface PickerKey {
  name?: string;
  ch?: string;
  ctrl?: boolean;
}

/**
 * A pending destructive action.
 *
 * Deleting a session is unrecoverable — `/undo` cannot reach it and the file is
 * gone — so `d` arms rather than acts, exactly like `/delete`'s literal `yes`.
 * The armed row is stored by id, not by index: a filter edit between arming and
 * confirming would otherwise move the selection onto a different session and
 * `y` would destroy the wrong one.
 */
export interface PickerConfirm {
  action: "delete";
  id: string;
  label: string;
}

export class Picker {
  private rows: PickerRow[];
  private query = "";
  private sel = 0;
  private confirming: PickerConfirm | null = null;
  /**
   * An `input` row is open: this holds its id and the value typed so far.
   * While set, keystrokes belong to the box rather than to the filter — the
   * one place the two would otherwise fight over every printable character.
   */
  private entering: { id: string; value: string } | null = null;

  constructor(
    rows: PickerRow[],
    readonly opts: { title: string; allowNew?: boolean; allowDelete?: boolean; allowFork?: boolean; allowAll?: boolean } = { title: "" },
  ) {
    this.rows = rows;
  }

  /** Rows passing the current filter, in the original order. */
  visible(): PickerRow[] {
    const q = this.query.trim().toLowerCase();
    if (!q) return this.rows;
    return this.rows.filter((r) => r.search.toLowerCase().includes(q));
  }

  /**
   * Index of the highlighted row, always inside `visible()`.
   *
   * Clamped on read rather than on every mutation: the list shrinks as the user
   * types, and a stored index of 7 with 2 rows left would paint a highlight on
   * nothing and return `undefined` from `selected()` — which is how a picker
   * ends up choosing a row the user never saw.
   */
  selectedIndex(): number {
    const n = this.visible().length;
    if (n === 0) return -1;
    return Math.max(0, Math.min(this.sel, n - 1));
  }

  selected(): PickerRow | undefined {
    const i = this.selectedIndex();
    return i < 0 ? undefined : this.visible()[i];
  }

  filter(): string {
    return this.query;
  }

  pendingConfirm(): PickerConfirm | null {
    return this.confirming;
  }

  /**
   * The open input box's contents, or null when no `input` row is open. An
   * empty string is a real state — an empty box the painter still has to show.
   */
  enteringValue(): string | null {
    return this.entering ? this.entering.value : null;
  }

  /** Replace the rows (after a delete) while keeping the selection sensible. */
  setRows(rows: PickerRow[]): void {
    const keep = this.selected()?.id;
    this.rows = rows;
    this.confirming = null;
    if (keep) {
      const at = this.visible().findIndex((r) => r.id === keep);
      // the kept row is gone (it was the one deleted) — leaving `sel` where it
      // is lands on whatever slid up into that slot, which is what a list should
      // do; only clamp so it stays in range
      if (at >= 0) this.sel = at;
    }
    this.sel = Math.max(0, Math.min(this.sel, Math.max(0, this.visible().length - 1)));
  }

  /**
   * Feed a key. Returns an action when the picker is done with it, or null when
   * it handled the key itself (moved, filtered, armed a confirm).
   *
   * A confirm prompt swallows everything except y/n, so a stray arrow cannot
   * leave a delete half-armed and fire later.
   */
  key(k: PickerKey): PickerAction | null {
    if (this.confirming) {
      const c = this.confirming;
      if (k.ch === "y" || k.ch === "Y") {
        this.confirming = null;
        return { kind: "delete", id: c.id };
      }
      // anything else cancels the delete rather than the picker: a user who
      // typed `d` by accident should get their list back, not lose their place
      this.confirming = null;
      return null;
    }

    const n = this.visible().length;
    if (this.entering) {
      const box = this.entering;
      switch (k.name) {
        case "escape":
          // back to the list, not out of the picker: the row that opened the
          // box is still selected, so a typo costs one key rather than the
          // whole chooser
          this.entering = null;
          return null;
        case "return": {
          const value = box.value.trim();
          this.entering = null;
          // an empty box is "I changed my mind" — hand the list back instead
          // of returning an answer nobody typed
          return value ? { kind: "input", id: box.id, value } : null;
        }
        case "backspace": {
          const chars = [...box.value]; // code points: a box takes emoji too
          chars.pop();
          box.value = chars.join("");
          return null;
        }
        case "c":
          if (k.ctrl) {
            this.entering = null;
            return { kind: "cancel" };
          }
          return null;
      }
      if (k.ch === undefined) return null; // every other named key belongs to the box
      box.value += k.ch;
      return null;
    }
    switch (k.name) {
      case "escape":
        return { kind: "cancel" };
      case "up":
        this.sel = n ? (this.selectedIndex() - 1 + n) % n : 0;
        return null;
      case "down":
        this.sel = n ? (this.selectedIndex() + 1) % n : 0;
        return null;
      case "pageup":
        this.sel = Math.max(0, this.selectedIndex() - 5);
        return null;
      case "pagedown":
        this.sel = Math.min(Math.max(0, n - 1), this.selectedIndex() + 5);
        return null;
      case "home":
        this.sel = 0;
        return null;
      case "end":
        this.sel = Math.max(0, n - 1);
        return null;
      case "return": {
        const row = this.selected();
        if (!row) return null;
        if (row.input) {
          this.entering = { id: row.id, value: "" };
          return null;
        }
        return { kind: "choose", id: row.id };
      }
      case "backspace":
        this.query = this.query.slice(0, -1);
        return null;
      case "c":
        // ctrl+c out of a picker closes the picker, not fox-agent: the escape hatch
        // has to be the one the user reaches for, and quitting the whole
        // program from a chooser would be a surprising amount of collateral
        if (k.ctrl) return { kind: "cancel" };
        return null;
      case "d":
        if (k.ctrl) return { kind: "cancel" };
        return null;
      case "f":
        // the verbs are Ctrl-prefixed so every plain letter filters (see the
        // char path below); an unclaimed or disallowed chord is dropped
        if (k.ctrl && this.opts.allowFork) {
          const row = this.selected();
          return row ? { kind: "fork", id: row.id } : null;
        }
        return null;
      case "x":
        if (k.ctrl && this.opts.allowDelete) {
          const row = this.selected();
          if (row && !row.current) {
            // never `cells[0]`: that is the list position, so the prompt for an
            // unrecoverable action read "delete  2?" — and a filter edit renumbers it
            this.confirming = { action: "delete", id: row.id, label: row.label ?? row.id };
          }
        }
        return null;
      case "n":
        if (k.ctrl && this.opts.allowNew) return { kind: "new" };
        return null;
      case "a":
        // scope toggle — the caller owns what "all" means (every directory's
        // sessions vs this one's) and answers with a fresh row set
        if (k.ctrl && this.opts.allowAll) return { kind: "all" };
        return null;
    }

    if (k.ch === undefined) return null;

    // Plain printable keys are filter text, always: typing is how the list
    // narrows, so the verbs moved behind Ctrl — ^f fork, ^x delete, ^n new,
    // ^a all dirs (decoded as named keys with ctrl; the switch above never
    // sees a bare letter, chars skip it entirely). "fox" used to fork, "n"
    // started a new session, "a" threw the filter away.
    this.query += k.ch;
    return null;
  }

  /**
   * The window of rows to paint, plus where the highlight sits inside it.
   *
   * Scrolling is computed here rather than stored so it cannot get out of step
   * with a selection that moved for some other reason (a filter edit, a delete).
   */
  window(height: number): { rows: PickerRow[]; offset: number; selRow: number } {
    const vis = this.visible();
    const h = Math.max(1, height);
    const sel = this.selectedIndex();
    let offset = 0;
    if (vis.length > h) {
      offset = Math.max(0, Math.min(sel - Math.floor(h / 2), vis.length - h));
    }
    return { rows: vis.slice(offset, offset + h), offset, selRow: sel - offset };
  }

  /** The one-line footer: either the key legend or the confirm prompt. */
  footer(): string {
    if (this.entering) return "type your answer · enter confirm · esc back to list";
    if (this.confirming) return `delete ${this.confirming.label}? this cannot be undone — y / n`;
    const keys = ["↑↓ move", "enter open"];
    if (this.opts.allowFork) keys.push("^f fork");
    if (this.opts.allowDelete) keys.push("^x delete");
    if (this.opts.allowNew) keys.push("^n new");
    if (this.opts.allowAll) keys.push("^a all dirs");
    keys.push("type to filter", "esc cancel");
    return keys.join(" · ");
  }
}
