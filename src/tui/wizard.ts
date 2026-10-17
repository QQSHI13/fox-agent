/**
 * The question wizard — the multi-step prompt flow (/model, /login, and any
 * plugin tool that asks via the UiBridge). Extracted from app.ts into a module
 * so the pure state machine is testable and the host file shrinks.
 *
 * The wizard is modal like the picker, but a select step's options are
 * clickable and the answer field reuses the host's input buffer. That means it
 * borrows `buf`/`cur` while open and restores them on close — the half-typed
 * command survives a wizard. Those buffer/layout helpers are INJECTED (see
 * WizardDeps) rather than closed over, so this module stays decoupled from the
 * host's full state.
 *
 * The one hard-won contract: `promptRows()` is derived ONCE and read by BOTH the
 * painter and the click hit-test. Long option labels wrap; paint and hit-test
 * used to count rows independently, and any drift made clicks land on the wrong
 * option. One source for both, exactly like layout.ts's countItem/renderItem.
 */
import type { UiStep } from "../core/ui.ts";
import { resolveField, visibleOptions, isCustomOption } from "../core/ui.ts";
import type { Key } from "./keys.ts";

/** One painted wizard row. `opt` is the option it belongs to, or a sentinel:
 *  -1 header/placeholder, -2 "… N more above", -3 "… N more below". */
export interface PromptRow {
  text: string;
  opt: number;
  sel: boolean;
}

/** The wizard's live state — set while a prompt is open, null otherwise. */
export interface PromptState {
  title: string;
  steps: UiStep[];
  idx: number;
  answers: Record<string, string>;
  sel: number;
  filter: string;
  entering: boolean; // the custom "other…" answer box is open
  snap: { idx: number; opts: { value: string; label: string }[] } | null;
  savedBuf: unknown[]; // host input buffer, restored on close
  savedCur: number;
  done: (answers: Record<string, string> | null) => void;
}

/** What the wizard needs from its host. The buffer is shared: the answer field
 *  IS the host's input buffer, so the wizard reads/writes it through these. */
export interface WizardDeps {
  /** host input char buffer + cursor; the wizard borrows these while open */
  getBuf(): { buf: { c: string; lit?: boolean }[]; cur: number; inputRev: number };
  setBuf(buf: { c: string; lit?: boolean }[], cur: number): void;
  /** set the buffer to a string (answer prefill / clear) */
  chsSet(text: string): void;
  /** the buffer rendered as plain text (the committed answer) */
  display(): string;
  insertText(text: string, lit?: boolean): void;
  /** screen width, for wrapping the option list */
  width(): number;
  /** the row the floating dock starts at (the menu paints above it) */
  dockTop(): number;
  /** rows per wheel notch (tuiScrollStep) */
  scrollStep(): number;
  wrapText(s: string, cols: number): string[];
  flash(msg: string): void;
  markDirty(): void;
  /** run the finished prompt's handler */
  run(answers: Record<string, string>): void;
  reportError(summary: string, detail?: unknown): void;
}

/** The wizard's public handle — what the host drives and reads. */
export interface Wizard {
  /** Open a command-driven prompt (a PromptRequest from a slash command). */
  start(req: { title: string; steps: UiStep[]; run: (a: Record<string, string>, s: unknown) => unknown }): void;
  /** Ask a question (the UiBridge path); resolves to the answers map. */
  ask(title: string, steps: UiStep[]): Promise<Record<string, string> | undefined>;
  /** True while a prompt is open (the host routes keys/clicks here first). */
  active(): boolean;
  state(): PromptState | null;
  /** Keys the wizard owns; false lets them fall through to normal input. */
  key(k: Key): boolean;
  click(x: number, y: number): void;
  /** The wizard's rows, derived once for BOTH paint and hit-test. */
  rows(): { rows: PromptRow[]; menuTop: number; start: number; end: number };
}

export function createWizard(deps: WizardDeps): Wizard {
  let prompt: PromptState | null = null;
  const askQueue: { title: string; steps: UiStep[]; resolve: (a: Record<string, string> | undefined) => void }[] = [];

  /** The filtered option list of the current select step (all on a text step). */
  function promptOptions(): { value: string; label: string }[] {
    const p = prompt!;
    const st = p.steps[p.idx];
    const all = (p.snap && p.snap.idx === p.idx ? p.snap.opts : resolveField(st.options, p.answers)) ?? [];
    return visibleOptions(all, p.filter, st.kind === "select" && st.custom === true);
  }

  function enterPromptStep() {
    const p = prompt!;
    const st = p.steps[p.idx];
    p.filter = "";
    p.entering = false;
    if (st.kind === "select") {
      const opts = resolveField(st.options, p.answers) ?? [];
      p.snap = { idx: p.idx, opts };
      // a revisited step starts on its previous answer, not the default
      const initial = p.answers[st.key] ?? resolveField(st.initial, p.answers);
      const i = opts.findIndex((o) => o.value === initial);
      // A value with no row of its own is the case the custom box exists for:
      // open it there and then, prefilled, rather than silently highlighting
      // some other model than the one in use. Nothing to prefill means a plain
      // unlisted start, which just lands on the first row.
      const prefill = i < 0 && st.custom === true && initial ? initial : null;
      p.sel = i >= 0 ? i : prefill ? opts.length : 0; // custom rows append last
      p.entering = prefill !== null;
      const b = deps.getBuf();
      deps.setBuf([], 0);
      void b;
      if (prefill !== null) deps.chsSet(prefill);
    } else {
      deps.chsSet(p.answers[st.key] ?? resolveField(st.initial, p.answers) ?? "");
    }
    deps.markDirty();
  }

  function finishPrompt(answers: Record<string, string> | null) {
    const p = prompt!;
    prompt = null;
    // restore the half-typed command the wizard's answer box borrowed the buffer
    // for — never a plain clear, which used to eat the user's draft on every wizard
    deps.setBuf(p.savedBuf as { c: string; lit?: boolean }[], Math.min(p.savedCur, p.savedBuf.length));
    deps.markDirty();
    p.done(answers);
  }

  /** Store the current step's answer. Returns false when a required field is empty. */
  function commitStep(): boolean {
    const p = prompt!;
    const st = p.steps[p.idx];
    if (st.kind === "select" && !p.entering && isCustomOption(promptOptions()[p.sel])) {
      // The row is a request to type, never an answer of its own — reaching it
      // by any commit route (enter, a second click, pagedown, a menu with no
      // other row) has to end in the box, or the sentinel would be recorded as
      // the user's choice. Returning false leaves this step open for it.
      p.entering = true;
      deps.chsSet("");
      return false;
    }
    if (st.kind === "select" && p.entering) {
      const typed = deps.display().trim();
      if (!typed) {
        // nothing typed: back to the option list, never an empty answer
        p.entering = false;
        deps.chsSet("");
        return false;
      }
      // stored exactly as typed — the handler puts it in the right context, so
      // reopening the box later shows the same text that will be committed again
      p.answers[st.key] = typed;
      return true;
    }
    const value = st.kind === "select" ? (promptOptions()[p.sel]?.value ?? "") : deps.display().trim();
    if (st.kind === "text" && !value && st.allowEmpty === false) {
      deps.flash("required — esc cancels");
      return false;
    }
    p.answers[st.key] = value;
    return true;
  }

  /** First index ≥ from whose step is not skipped; steps.length when none. */
  function nextLiveStep(from: number, dir: 1 | -1): number {
    const p = prompt!;
    let i = from;
    while (i >= 0 && i < p.steps.length && p.steps[i].skipIf?.(p.answers)) i += dir;
    return i;
  }

  function promptRows(): { rows: PromptRow[]; menuTop: number; start: number; end: number } {
    const p = prompt!;
    const st = p.steps[p.idx];
    const W = deps.width();
    const hint = resolveField(st.hint, p.answers);
    const stepPos = p.steps.length > 1 ? ` ${p.idx + 1}/${p.steps.length}` : "";
    const header = `${p.title}${stepPos} — ${st.label}${hint ? ` (${hint})` : ""} · esc cancels`;
    const rows: PromptRow[] = deps.wrapText(header, W - 2).map((t) => ({ text: t, opt: -1, sel: false }));
    const menuTop = deps.dockTop();
    let start = 0;
    let end = 0;
    if (st.kind !== "select") return { rows, menuTop, start, end };
    const opts = promptOptions();
    if (p.entering) {
      // the custom answer box is open: the dock is a TEXT field now, so a
      // rendered option list contradicts the placeholder and hides what is
      // being typed. The list comes back on escape.
      rows.push({ text: "  (option list hidden — esc to go back)", opt: -1, sel: false });
      return { rows, menuTop, start, end };
    }
    if (!opts.length) {
      rows.push({ text: "  no matches — backspace to widen", opt: -1, sel: false });
      return { rows, menuTop, start, end };
    }
    // the window shrinks to leave room for the WRAPPED header
    const MAX = Math.max(1, Math.min(5, menuTop - rows.length));
    start = opts.length <= MAX ? 0 : Math.max(0, Math.min(p.sel - Math.floor(MAX / 2), opts.length - MAX));
    end = Math.min(opts.length, start + MAX);
    if (start > 0) rows.push({ text: `  … ${start} more above`, opt: -2, sel: false });
    for (let i = start; i < end; i++) {
      const mark = i === p.sel ? "›" : " ";
      const lead = ` ${mark} `;
      const parts = deps.wrapText(opts[i].label, Math.max(8, W - 2 - lead.length));
      for (let k = 0; k < parts.length; k++) {
        rows.push({
          text: k === 0 ? lead + parts[k] : " ".repeat(lead.length) + parts[k],
          opt: i,
          sel: i === p.sel,
        });
      }
    }
    if (end < opts.length) rows.push({ text: `  … ${opts.length - end} more below`, opt: -3, sel: false });
    // A wrapped label can take several rows, so a nominal 5-option window can
    // still overflow the dock and paint above row 0. Drop trailing options
    // until the whole menu fits — bounded by start + 1 so one option always
    // remains, however long it is.
    while (rows.length > menuTop && end > start + 1) {
      rows.pop();
      end--;
    }
    return { rows, menuTop, start, end };
  }

  function promptClick(x: number, y: number) {
    void x;
    const p = prompt!;
    const opts = promptOptions();
    if (!opts.length) return;
    const { rows, menuTop, start, end } = promptRows();
    const MAX = Math.max(1, end - start);
    const hTop = menuTop - rows.length;
    const idx = y - hTop;
    if (idx < 0 || idx >= rows.length) return; // outside the menu
    const row = rows[idx];
    if (row.opt === -2) {
      p.sel = Math.max(0, p.sel - MAX); // "… above": page the highlight up
      deps.markDirty();
      return;
    }
    if (row.opt === -3) {
      p.sel = Math.min(opts.length - 1, p.sel + MAX); // "… below": page down
      deps.markDirty();
      return;
    }
    if (row.opt < 0) return; // header or placeholder row
    // a wrapped CONTINUATION carries the same option index as its first line,
    // so clicking either selects (or, on the selected one, confirms) the same
    if (row.opt === p.sel) promptSubmit();
    else {
      p.sel = row.opt;
      deps.markDirty();
    }
  }

  function promptSubmit() {
    const p = prompt!;
    // commitStep opens the answer box instead of committing when the "other…"
    // row is selected, so its false here means "not yet", not "refused"
    if (!commitStep()) return;
    const next = nextLiveStep(p.idx + 1, 1);
    if (next < p.steps.length) {
      p.idx = next;
      enterPromptStep();
    } else {
      finishPrompt(p.answers);
    }
  }

  function pumpAskQueue() {
    if (prompt || !askQueue.length) return;
    const { title, steps, resolve } = askQueue.shift()!;
    open(title, steps, (answers) => {
      resolve(answers ?? undefined);
      pumpAskQueue();
    });
  }

  function open(title: string, steps: UiStep[], done: (answers: Record<string, string> | null) => void) {
    const b = deps.getBuf();
    prompt = {
      title,
      steps,
      idx: 0,
      answers: {},
      sel: 0,
      filter: "",
      entering: false,
      snap: null,
      savedBuf: b.buf,
      savedCur: b.cur,
      done,
    };
    prompt.idx = nextLiveStep(0, 1);
    enterPromptStep();
  }

  function key(k: Key): boolean {
    if (!prompt) return false;
    const p = prompt;
    const st = p.steps[p.idx];
    if (k.type === "mouse") {
      // a question is modal, like the picker — but a select step's options are
      // clickable: first click highlights, a second click on the same row
      // submits. With the custom box open there is no list to click: the dock
      // owns the step until escape backs out of it.
      if (p.entering) return true;
      if (k.action === "up" && st.kind === "select") promptClick(k.x, k.y);
      return true;
    }
    if (k.type === "paste") {
      if (st.kind === "text" || p.entering) deps.insertText(k.text);
      else {
        p.filter += k.text;
        p.sel = 0;
        deps.markDirty();
      }
      return true;
    }
    if (k.type === "char") {
      if (st.kind === "text" || p.entering) return false; // ordinary editing falls through
      // a select filters as you type — a 300-model list is not an arrow-key list
      p.filter += k.ch;
      p.sel = 0;
      deps.markDirty();
      return true;
    }
    const { name, ctrl } = k;
    // ctrl+c cancels too (muscle memory), but only esc is advertised
    if (name === "escape" || (name === "c" && ctrl)) {
      if (p.entering) {
        // out of the answer box, not out of the wizard: the option list is
        // still open on the same step with its selection where it was
        p.entering = false;
        deps.chsSet("");
        return true;
      }
      finishPrompt(null);
      return true;
    }
    if (name === "return") {
      promptSubmit();
      return true;
    }
    // pgup/pgdn move between the wizard's steps, keeping entered answers
    if (name === "pageup") {
      const prev = nextLiveStep(p.idx - 1, -1);
      if (prev >= 0) {
        commitStep();
        p.idx = prev;
        enterPromptStep();
      }
      return true;
    }
    if (name === "pagedown") {
      const next = nextLiveStep(p.idx + 1, 1);
      if (next < p.steps.length && commitStep()) {
        p.idx = next;
        enterPromptStep();
      }
      return true;
    }
    // with the custom box open the select no longer routes keys: they fall
    // through as ordinary editing, which is what the box is made of
    if (st.kind === "select" && !p.entering) {
      const n = promptOptions().length;
      const SCROLL_STEP = deps.scrollStep();
      if (name === "up" || name === "down") {
        p.sel = (p.sel + (name === "up" ? -1 : 1) + n) % Math.max(1, n);
        deps.markDirty();
      } else if (name === "wheelup" || name === "wheeldown") {
        // tuiScrollStep rows per notch, like every other scroll surface
        p.sel = Math.max(0, Math.min(Math.max(0, n - 1), p.sel + (name === "wheelup" ? -SCROLL_STEP : SCROLL_STEP)));
        deps.markDirty();
      } else if (name === "backspace") {
        if (p.filter) {
          p.filter = p.filter.slice(0, -1);
          p.sel = 0;
          deps.markDirty();
        }
      }
      return true; // everything else would be typing into a menu
    }
    return false; // text step: normal editing keys fall through
  }

  return {
    start(req) {
      open(req.title, req.steps, (answers) => {
        if (answers === null) return deps.flash("cancelled");
        try {
          deps.run(answers);
        } catch (e) {
          deps.reportError(`prompt run failed: ${(e as Error).message ?? e}`, e);
        }
      });
    },
    ask(title, steps) {
      // One question at a time: a second caller (two tools racing in one step's
      // Promise.all) queues behind the first rather than clobbering its wizard.
      return new Promise((resolve) => {
        askQueue.push({ title, steps, resolve });
        pumpAskQueue();
      });
    },
    active: () => prompt !== null,
    state: () => prompt,
    key,
    click: promptClick,
    rows: promptRows,
  };
}
