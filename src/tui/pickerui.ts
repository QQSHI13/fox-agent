/**
 * Run a `Picker` as a standalone full-screen chooser.
 *
 * `fox -c` needs the picker *before* the harness exists — there is no session to
 * bind a TUI to yet, and the whole point is to choose one. So this owns a
 * terminal for the duration of the choice and hands it back, rather than living
 * inside `app.ts`'s frame loop. Both callers share the same `Picker` state
 * machine and the same painting, so the two lists look and behave identically.
 *
 * Not merged into `app.ts`: doing so would mean starting a TUI bound to a
 * session in order to pick which session to bind to.
 */
import { openTerm, type Term } from "./term.ts";
import { Screen, charWidth } from "./screen.ts";
import { createDecoder } from "./keys.ts";
import { Picker, type PickerAction, type PickerRow } from "./picker.ts";

const C = {
  fg: "#c0caf5",
  dim: "#565f89",
  sel: "#c0caf5",
  selBg: "#364a82",
  accent: "#bb9af7",
  warn: "#f7768e",
  barBg: "#16161e",
};

export interface PickerHandlers {
  /** delete the row and return the new row set, or null to leave it unchanged */
  onDelete?(id: string): PickerRow[] | null;
}

/**
 * Show the picker until it produces a terminal action. `delete` is handled
 * in-place via `handlers.onDelete` and does not end the picker — a user
 * cleaning up several sessions should not have to reopen the list each time.
 */
export async function runPicker(
  rows: PickerRow[],
  opts: { title: string; allowNew?: boolean; allowDelete?: boolean; allowFork?: boolean; headers?: string[] },
  handlers: PickerHandlers = {},
): Promise<PickerAction> {
  const term: Term = openTerm();
  const screen = new Screen(term);
  const picker = new Picker(rows, opts);
  let W = 0;
  let H = 0;
  let dirty = true;

  const S = { base: 0, dim: 0, sel: 0, accent: 0, warn: 0, bar: 0 };
  function styles() {
    S.base = screen.sgr({ fg: C.fg });
    S.dim = screen.sgr({ fg: C.dim });
    S.sel = screen.sgr({ fg: C.sel, bg: C.selBg });
    S.accent = screen.sgr({ fg: C.accent });
    S.warn = screen.sgr({ fg: C.warn });
    S.bar = screen.sgr({ fg: C.dim, bg: C.barBg });
  }

  function resize(w: number, h: number) {
    if (w < 5 || h < 3) return;
    W = Math.max(20, w);
    H = Math.max(6, h);
    screen.resize(W, H);
    styles();
    dirty = true;
  }

  /** Clip to the terminal width by display columns, not by char count. */
  function clip(s: string, cols: number): string {
    let out = "";
    let w = 0;
    for (const ch of s) {
      const cw = charWidth(ch.codePointAt(0)!);
      if (w + cw > cols) break;
      out += ch;
      w += cw;
    }
    return out;
  }

  function paint() {
    screen.clear();
    const listTop = 2;
    const listH = Math.max(1, H - listTop - 2);
    const q = picker.filter();
    screen.text(1, 0, clip(opts.title, W - 2), S.accent);
    screen.text(1, 1, clip(q ? `filter: ${q}` : (opts.headers?.join("  ") ?? "type to filter"), W - 2), S.dim);

    const win = picker.window(listH);
    if (!win.rows.length) {
      screen.text(1, listTop, clip(q ? `no match for "${q}"` : "(nothing here)", W - 2), S.dim);
    }
    for (let i = 0; i < win.rows.length; i++) {
      const r = win.rows[i];
      const y = listTop + i;
      const on = i === win.selRow;
      if (on) screen.fillRow(y, 0, W, S.sel);
      const mark = r.current ? "*" : on ? "›" : " ";
      screen.text(1, y, clip(`${mark} ${r.cells.join("  ")}`, W - 2), on ? S.sel : S.base);
    }

    const confirm = picker.pendingConfirm();
    screen.fillRow(H - 1, 0, W, S.bar);
    screen.text(1, H - 1, clip(picker.footer(), W - 2), confirm ? S.warn : S.bar);
  }

  let done: ((a: PickerAction) => void) | null = null;
  const decoder = createDecoder((k) => {
    if (k.type === "paste") {
      // a pasted id is a filter, not a burst of verb keys
      for (const ch of k.text.replace(/\s+/g, "")) picker.key({ ch });
      dirty = true;
      return;
    }
    if (k.type === "mouse") return;
    const action =
      k.type === "char" ? picker.key({ ch: k.ch }) : picker.key({ name: k.name, ctrl: k.ctrl });
    dirty = true;
    if (!action) return;
    if (action.kind === "delete") {
      const next = handlers.onDelete?.(action.id);
      if (next) picker.setRows(next);
      return;
    }
    done?.(action);
  });

  term.begin();
  term.onResize(resize);
  resize(term.size().width, term.size().height);
  term.onKey((data) => decoder.feed(data));

  const timer = setInterval(() => {
    if (!dirty) return;
    dirty = false;
    try {
      term.hideCursor();
      paint();
      screen.flush();
      term.flush();
    } catch {
      // a paint failure must not strand the picker with no way out
      done?.({ kind: "cancel" });
    }
  }, 33);

  try {
    return await new Promise<PickerAction>((resolve) => {
      done = (a) => {
        done = null;
        resolve(a);
      };
    });
  } finally {
    clearInterval(timer);
    // hands the terminal back: raw mode restored, stdin released (see term.end)
    term.end();
  }
}

/** Rows for a session list, shared by the TUI overlay and `fox -c`. */
export function sessionRows(
  items: {
    id: string;
    index: number;
    label: string;
    title?: string | null;
    model: string;
    tokens: number;
    updatedAt: number;
    current: boolean;
  }[],
  rel: (ts: number) => string,
): PickerRow[] {
  return items.map((it) => ({
    id: it.id,
    current: it.current,
    cells: [
      String(it.index).padStart(2),
      it.id,
      `${rel(it.updatedAt).padStart(3)} ago`,
      `${String(it.tokens).padStart(7)} tok`,
      it.model.padEnd(18),
      it.label,
    ],
    search: `${it.id} ${it.label} ${it.model}`,
    // What the delete confirm says out loud. The id, plus the title when there
    // is one — quoting `label` instead would put a bare cwd in quotes for an
    // untitled session, which reads like the directory is what gets deleted.
    label: it.title ? `${it.id} "${it.title.slice(0, 40)}"` : it.id,
  }));
}
