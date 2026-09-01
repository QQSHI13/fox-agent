// fox-agent TUI v5 — custom ANSI renderer (no framework). Immediate-mode paint,
// row-diffed flushing, explicit frame scheduling: keystrokes, stream deltas
// and the spinner tick all just mark dirty; the frame loop owns the tty.
import { openTerm, type Term } from "./term.ts";
import { appendFileSync } from "node:fs";
import { Screen } from "./screen.ts";
import { createDecoder, type Key } from "./keys.ts";
import { graphemeBack, graphemeForward, type Ch } from "./edit.ts";
import {
  extractSelection,
  gestureFor,
  rowCells,
  selRangeForRow,
  wordRangeAt,
  type Anchor,
  type PressState,
} from "./select.ts";
import { renderMarkdown, type MdState } from "./markdown.ts";
import { wrapSegs, segWidth, type Seg } from "./wrap.ts";
import { charWidth } from "./screen.ts";
import { Picker, type PickerRow } from "./picker.ts";
import { sessionRows } from "./pickerui.ts";
import { runTurn, VERSION } from "../loop/agent.ts";
import { projectView } from "../context/view.ts";
import { lookupModel } from "../providers/models.ts";
import { getSession, lastPromptTokens as storedPromptTokens, pinSession, unpinSession } from "../store/db.ts";
import {
  runSlashCommand,
  COMMANDS,
  matchCommands,
  helpText,
  sessionList,
  relTime,
  type CommandSpec,
  type HarnessState,
  type PickerRequest,
  type PromptRequest,
} from "../commands.ts";
import { resolveField, type UiBridge, type UiStep } from "../core/ui.ts";
import { childEnv } from "../core/childenv.ts";
import { killTree } from "../tools/exec.ts";
import { debugLog, debugLogPath } from "../core/debuglog.ts";

type ItemKind = "user" | "toolhead" | "toolbody" | "info" | "error" | "md" | "think";
interface Item {
  k: number;
  kind: ItemKind;
  text: string;
  /** storage seq for items loaded from the log — survives refresh() */
  ref?: number;
  /** expandable: thinking + long tool output */
  expanded?: boolean;
  /** transient (/help): removed on the next keypress or click */
  ephemeral?: boolean;
}

const COLLAPSED_TOOL_CHARS = 240;
const KEPT_TOOL_CHARS = 4_000;

const C = {
  fg: "#c0caf5",
  user: "#7aa2f7",
  tool: "#e0af68",
  info: "#89ddff",
  hint: "#565f89",
  error: "#f7768e",
  chrome: "#565f89",
  hintSel: "#c0caf5",
  accent: "#bb9af7",
  ok: "#9ece6a",
  barBg: "#16161e",
  inputBg: "#1f2335",
  selBg: "#364a82", // selection highlight; readable behind every fg above
};
const SPIN = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
/** Startup taglines; one is picked at random per launch. */
const BANNERS = [
  "agent-controlled context",
  "context is a file — edit it",
  "every keystroke accounted for",
  "full machine control, no permission theater",
  "small harness, sharp teeth",
  "the context window is yours to prune",
  "real protocols, real processes",
  "delegate deep, prune deep",
  "your terminal, your tokens",
  "a pty is a tool, not a jail",
  "undo is a first-class op",
  "the agent reads its own context budget",
  "plugins over patches",
  "one binary, no runtime tax",
  "selection, sessions, and sqlite",
  "scriptable to the bone",
];
const HINT_WINDOW = 5;
/** rows the session overlay may occupy, excluding its title and footer */
const OVERLAY_MAX_ROWS = 14;



let keySeq = 0;
const nk = () => ++keySeq;

async function clipRead(): Promise<string> {
  const cmds = [
    // Windows from WSL: force UTF-8 on the pipe. Without it powershell writes
    // in the console OEM codepage (GBK on a zh-CN machine), and decoding those
    // bytes as UTF-8 mangles every non-ASCII character on the way into fox-agent.
    ["powershell.exe", "-NoProfile", "-Command", "[Console]::OutputEncoding=[Text.Encoding]::UTF8; Get-Clipboard -Raw"],
    ["wl-paste", "--no-newline"],
    ["xclip", "-selection", "clipboard", "-o"],
  ];
  for (const argv of cmds) {
    try {
      const p = Bun.spawn(argv, { stdin: "ignore", stdout: "pipe", stderr: "ignore" });
      const timer = setTimeout(() => {
        try {
          p.kill();
        } catch {}
      }, 1500);
      const out = await new Response(p.stdout).text();
      clearTimeout(timer);
      if ((await p.exited) === 0 && out) return out.replace(/\r/g, "");
    } catch {}
  }
  return "";
}

/**
 * Copy to the system clipboard, reporting whether anything actually took it.
 *
 * Mirrors `clipRead`'s probe-in-order approach, but the exit code is the only
 * signal available: `powershell.exe` and `wl-copy` both say nothing on success. A
 * command that is missing throws from `Bun.spawn`; one that is present but
 * broken (X11 tools with no DISPLAY) exits non-zero — both fall through to the
 * next candidate, and OSC 52 is the last resort because it is the only one that
 * works over SSH with no local helper installed at all. Many terminals ignore
 * OSC 52 by default, which is why it is last rather than first: when a real
 * helper exists we want its definite success over a write into the void.
 */
async function clipWrite(text: string, term: Term): Promise<boolean> {
  // clip.exe is deliberately absent: it decodes stdin in the console OEM
  // codepage (GBK on a zh-CN machine), so UTF-8 bytes arrived as mojibake —
  // "•" became "鈥?" (measured). The Windows path goes through powershell with
  // the text base64-encoded instead: pure ASCII on the wire, immune to
  // codepages, decoded as UTF-8 on the Windows side.
  const cmds: { argv: string[]; b64?: boolean }[] = [
    {
      argv: [
        "powershell.exe",
        "-NoProfile",
        "-Command",
        "Set-Clipboard -Value ([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String([Console]::In.ReadToEnd())))",
      ],
      b64: true,
    },
    { argv: ["wl-copy"] },
    { argv: ["xclip", "-selection", "clipboard", "-i"] },
    { argv: ["pbcopy"] },
  ];
  for (const { argv, b64 } of cmds) {
    try {
      const p = Bun.spawn(argv, { stdin: "pipe", stdout: "ignore", stderr: "ignore" });
      const timer = setTimeout(() => {
        try {
          p.kill();
        } catch {}
      }, 1500);
      p.stdin.write(b64 ? Buffer.from(text, "utf8").toString("base64") : text);
      await p.stdin.end();
      const code = await p.exited;
      clearTimeout(timer);
      if (code === 0) return true;
    } catch {}
  }
  // OSC 52: hand the bytes to the terminal itself. Capped because the sequence
  // travels in-band and a multi-megabyte selection would stall the render loop
  // mid-frame; a truncated copy beats a frozen UI. The cut is on code points —
  // slicing a UTF-16 string at 100k can split a surrogate pair, and the lone
  // half encodes as U+FFFD, corrupting the last character of the copy.
  try {
    const b64 = Buffer.from([...text].slice(0, 100_000).join(""), "utf8").toString("base64");
    term.write(`\x1b]52;c;${b64}\x07`);
    term.flush();
    return true;
  } catch {}
  return false;
}

export async function startTui(state: HarnessState, applyConfig?: () => { warnings: string[] }) {
  const term: Term = openTerm();
  const screen = new Screen(term);
  let W = 0;
  let H = 0;

  // ---- state ----
  let items: Item[] = [];
  let streamText: string | null = null;
  let buf: Ch[] = []; // input buffer; lit chars are literal newlines
  let cur = 0; // cursor index into buf
  let busy = false;
  let frameIdx = 0;
  let startedAt = 0;
  let flashMsg = "";
  let flashUntil = 0;
  let hintSel = 0;
  let stick = true;
  let scrollTop = 0;
  let ac: AbortController | null = null;
  // exit is cooperative: gracefulExit resolves run()'s promise so startTui
  // returns normally and the caller can clean up tools
  let exiting = false;
  let exitCode = 0;
  let finish: (() => void) | null = null;
  const queued: { raw: string; lit: boolean }[] = [];
  const expandedRefs = new Set<number>(); // think nodes expanded across refreshes
  // provider-reported usage for the CURRENT turn's last step (real numbers,
  // not estimates) — the only token figure the status bar is willing to show
  let lastPromptTokens = 0;

  const revs = new Map<number, number>();
  const touch = (k: number) => revs.set(k, (revs.get(k) ?? 0) + 1);
  let dirty = true;
  const markDirty = () => {
    dirty = true;
  };

  // ---- mouse / selection state ----
  /**
   * A press is only a click once the button comes back up in the same place.
   *
   * `?1000h` alone reported presses and nothing else, so the thinking box
   * toggled on button-down — it "collapsed on first touch, not loosen touch",
   * and any attempt to drag across it flipped it instead of selecting. Holding
   * the press here and acting on release fixes both halves: the toggle happens
   * on release, and a release somewhere else is a drag, which never toggles.
   */
  let press: PressState | null = null;
  let selA: Anchor | null = null;
  let selB: Anchor | null = null;
  /** multi-click tracking: same spot inside the window extends the streak */
  const clickStreak = { x: -1, y: -1, at: 0, count: 0 };

  /**
   * The session overlay, or null when there is no modal up.
   *
   * This is the TUI's only modal: while it is set, `onKey` hands every keystroke
   * to it before the input buffer sees anything, and `paint` draws it over the
   * transcript. Nothing else in the app has to know it exists — the transcript,
   * the turn loop and a streaming response all keep running underneath, which is
   * deliberate: opening the list mid-turn must not interrupt the turn.
   */
  let overlay: Picker | null = null;

  /**
   * The active question wizard, or null.
   *
   * One hosting implementation for every consumer: slash commands return a
   * `PromptRequest` (see commands.ts) and plugin tools await the `UiBridge`
   * (see core/ui.ts); both land here as title + steps + a `done` callback.
   * While a prompt is set the input dock is the answer field — the step label
   * replaces the `❯` prefix, selects draw their option list where the command
   * hints would float, and `secret` steps paint bullets. The turn loop keeps
   * running underneath: a tool awaiting `ui.select` is just one more pending
   * promise, and escape resolving it with `undefined` is how the user says no.
   */
  let prompt: {
    title: string;
    steps: UiStep[];
    idx: number;
    answers: Record<string, string>;
    sel: number;
    /** typed filter for a select step's option list */
    filter: string;
    done: (answers: Record<string, string> | null) => void;
  } | null = null;
  const hasSel = () => selA !== null && selB !== null && !(selA.row === selB.row && selA.col === selB.col);
  function clearSel() {
    if (selA || selB) {
      selA = null;
      selB = null;
      markDirty();
    }
  }

  // ---- item mutations ----
  function push(kind: ItemKind, text: string, opts?: { ref?: number; expanded?: boolean; ephemeral?: boolean }) {
    const it: Item = { k: nk(), kind, text, ref: opts?.ref, expanded: opts?.expanded, ephemeral: opts?.ephemeral };
    items.push(it);
    touch(it.k);
    markDirty();
  }
  function appendToLastThink(delta: string) {
    const last = items[items.length - 1];
    if (last && last.kind === "think") {
      last.text += delta;
      touch(last.k);
    } else {
      push("think", delta, { expanded: false });
    }
    markDirty();
  }

  function refresh() {
    items = loadItems(); // loadItems already restores expandedRefs
    for (const it of items) touch(it.k);
    statsRev++;
    markDirty();
  }

  function loadItems(): Item[] {
    const out: Item[] = [];
    const nodes = projectView(state.sessionId).filter((n) => !n.deleted);
    const callName = new Map<string, string>();
    for (const n of nodes) {
      if (n.msg.role === "assistant" && n.msg.tool_calls) {
        try {
          for (const c of JSON.parse(n.msg.tool_calls) as { id: string; name: string }[]) callName.set(c.id, c.name);
        } catch {}
      }
    }
    for (const n of nodes.slice(-300)) {
      const m = n.msg;
      if (m.role === "user") out.push({ k: nk(), kind: "user", text: `[m${m.seq}] ❯ ${n.content}` });
      else if (m.role === "tool") {
        const oneLine = n.content.replace(/\s+\n/g, "\n").replace(/\n/g, " ⏎ ").slice(0, KEPT_TOOL_CHARS);
        out.push({ k: nk(), kind: "toolhead", text: `[m${m.seq}] ⚙ ${callName.get(m.tool_call_id ?? "") ?? "tool"}` });
        out.push({
          k: nk(),
          kind: "toolbody",
          text: `  ↳ ${oneLine}`,
          ref: m.seq,
          // collapsed by default, but an explicit expand survives refresh()
          expanded: expandedRefs.has(m.seq),
        });
      } else if (m.role === "think")
        out.push({ k: nk(), kind: "think", text: n.content, ref: m.seq, expanded: expandedRefs.has(m.seq) });
      else out.push({ k: nk(), kind: "md", text: n.content || "" });
    }
    return out;
  }

  // ---- dispatch ----
  async function runShell(cmd: string) {
    setBusy(true);
    push("toolhead", `$ ${cmd}`);
    try {
      // setsid + group kill, same as the exec tool: proc.kill(9) leaves
      // grandchildren (pipelines, background jobs) running
      const useSetsid = !!Bun.which("setsid");
      const proc = Bun.spawn([...(useSetsid ? ["setsid"] : []), "/bin/bash", "-c", cmd], {
        cwd: state.cwd,
        stdout: "pipe",
        stderr: "pipe",
        stdin: "ignore",
        env: childEnv(),
      });
      const kill: { cancel: (() => void) | null } = { cancel: null };
      const timer = setTimeout(() => {
        if (useSetsid) kill.cancel = killTree(proc.pid);
        else proc.kill(9);
      }, 120_000);
      const [out, err] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
      clearTimeout(timer);
      const code = await proc.exited;
      kill.cancel?.();
      const merged = (out + (err ? (out ? "\n[stderr]\n" : "") + err : "")).trimEnd() || "(no output)";
      push("info", `${merged}\nexit ${code}`);
    } catch (e) {
      push("error", `✗ shell error: ${(e as Error).message}`);
    } finally {
      // must be in a finally: a throw before this left busy=true forever, so
      // the spinner span and every later submit queued instead of running
      setBusy(false);
      drainQueue();
    }
  }

  /** Apply a command result's effects — shared by runSlash and wizard `run`s. */
  function applyResult(res: CommandResultLike | null) {
    if (!res) return;
    if (res.output) push("info", res.output);
    if (res.newSessionId) switchSession(res.newSessionId);
    if (res.picker) openPicker(res.picker);
    // a wizard's run may itself answer with another wizard — chain it
    if (res.prompt) startPrompt(res.prompt);
    // a command may have changed provider/model (/login, /model) — the status
    // bar caches per statsRev, and an idle session never re-polls on its own
    statsRev++;
    markDirty();
    if (res.task) {
      const task = res.task;
      void (async () => {
        try {
          push("info", await task());
        } catch (e) {
          push("error", `✗ ${(e as Error).message ?? e}`);
        }
      })();
    }
    if (res.exit) gracefulExit(0);
  }

  type CommandResultLike = ReturnType<typeof runSlashCommand>;

  function runSlash(t: string) {
    if (t === "/help" || t === "/?") return push("info", helpText(), { ephemeral: true });
    applyResult(runSlashCommand(t, state));
  }

  // ---- prompt wizard hosting (slash commands + plugin UiBridge) ----
  function startPrompt(req: PromptRequest) {
    prompt = {
      title: req.title,
      steps: req.steps,
      idx: 0,
      answers: {},
      sel: 0,
      filter: "",
      done: (answers) => {
        if (answers === null) return flash("cancelled");
        try {
          applyResult(req.run(answers, state));
        } catch (e) {
          reportError(`prompt run failed: ${(e as Error).message ?? e}`, e);
        }
      },
    };
    prompt.idx = nextLiveStep(0, 1);
    enterPromptStep();
  }

  /** The UiBridge handed to every turn, so plugin tools can ask questions. */
  const uiBridge: UiBridge = {
    select: (title, options, opts) =>
      askPrompt(title, [
        {
          key: "v",
          label: title,
          kind: "select",
          options: options.map((o) => ({ value: o.value, label: o.label ?? o.value })),
          initial: opts?.initial,
        },
      ]).then((a) => a?.v),
    input: (title, opts) =>
      askPrompt(title, [
        {
          key: "v",
          label: title,
          kind: "text",
          initial: opts?.initial,
          hint: opts?.hint,
          secret: opts?.secret,
          allowEmpty: opts?.allowEmpty,
        },
      ]).then((a) => a?.v),
    wizard: (title, steps) => askPrompt(title, steps),
  };

  function askPrompt(title: string, steps: UiStep[]): Promise<Record<string, string> | undefined> {
    // One question at a time: a second caller (two tools racing in one step's
    // Promise.all) queues behind the first rather than clobbering its wizard.
    return new Promise((resolve) => {
      askQueue.push({ title, steps, resolve });
      pumpAskQueue();
    });
  }
  const askQueue: { title: string; steps: UiStep[]; resolve: (a: Record<string, string> | undefined) => void }[] = [];
  function pumpAskQueue() {
    if (prompt || !askQueue.length) return;
    const { title, steps, resolve } = askQueue.shift()!;
    prompt = {
      title,
      steps,
      idx: 0,
      answers: {},
      sel: 0,
      filter: "",
      done: (answers) => {
        resolve(answers ?? undefined);
        pumpAskQueue();
      },
    };
    prompt.idx = nextLiveStep(0, 1);
    enterPromptStep();
  }

  /** The filtered option list of the current select step (all of them on a text step). */
  function promptOptions(): { value: string; label: string }[] {
    const p = prompt!;
    const st = p.steps[p.idx];
    const all = resolveField(st.options, p.answers) ?? [];
    const f = p.filter.trim().toLowerCase();
    if (!f) return all;
    return all.filter((o) => o.label.toLowerCase().includes(f) || o.value.toLowerCase().includes(f));
  }

  function enterPromptStep() {
    const p = prompt!;
    const st = p.steps[p.idx];
    p.filter = "";
    if (st.kind === "select") {
      const opts = resolveField(st.options, p.answers) ?? [];
      // a revisited step starts on its previous answer, not the default
      const initial = p.answers[st.key] ?? resolveField(st.initial, p.answers);
      const i = opts.findIndex((o) => o.value === initial);
      p.sel = i >= 0 ? i : 0;
      buf = [];
      cur = 0;
      inputRev++;
    } else {
      chsSet(p.answers[st.key] ?? resolveField(st.initial, p.answers) ?? "");
    }
    markDirty();
  }

  function finishPrompt(answers: Record<string, string> | null) {
    const p = prompt!;
    prompt = null;
    buf = [];
    cur = 0;
    inputRev++;
    markDirty();
    p.done(answers);
  }

  /** Store the current step's answer. Returns false when a required field is empty. */
  function commitStep(): boolean {
    const p = prompt!;
    const st = p.steps[p.idx];
    const value = st.kind === "select" ? (promptOptions()[p.sel]?.value ?? "") : display().trim();
    if (st.kind === "text" && !value && st.allowEmpty === false) {
      flash("required — esc cancels");
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

  function promptSubmit() {
    if (!commitStep()) return;
    const p = prompt!;
    const next = nextLiveStep(p.idx + 1, 1);
    if (next < p.steps.length) {
      p.idx = next;
      enterPromptStep();
    } else {
      finishPrompt(p.answers);
    }
  }

  /**
   * Keys a prompt owns outright. Returns false for ordinary editing keys on a
   * text step, letting them fall through to the normal input handling — the
   * answer field is the same buffer, with the same cursor rules.
   */
  function promptKey(k: Key): boolean {
    if (!prompt) return false;
    const p = prompt;
    const st = p.steps[p.idx];
    if (k.type === "mouse") return true; // a question is modal, like the picker
    if (k.type === "paste") {
      if (st.kind === "text") insertText(k.text);
      else {
        p.filter += k.text;
        p.sel = 0;
        markDirty();
      }
      return true;
    }
    if (k.type === "char") {
      if (st.kind === "text") return false; // ordinary editing falls through
      // a select filters as you type — a 300-model list is not an arrow-key list
      p.filter += k.ch;
      p.sel = 0;
      markDirty();
      return true;
    }
    const { name, ctrl } = k;
    // ctrl+c cancels too (muscle memory), but only esc is advertised
    if (name === "escape" || (name === "c" && ctrl)) {
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
    if (st.kind === "select") {
      const n = promptOptions().length;
      if (name === "up" || name === "down") {
        p.sel = (p.sel + (name === "up" ? -1 : 1) + n) % Math.max(1, n);
        markDirty();
      } else if (name === "backspace") {
        if (p.filter) {
          p.filter = p.filter.slice(0, -1);
          p.sel = 0;
          markDirty();
        }
      }
      return true; // everything else would be typing into a menu
    }
    return false; // text step: normal editing keys fall through
  }

  /**
   * Move the harness to another session.
   *
   * The pin is what keeps the store from closing the handle the turn loop is
   * writing to once the picker has opened every other session's database to read
   * its usage — see `pinSession`. Unpinning the old id here rather than in
   * `refresh` keeps the invariant simple: exactly one session is pinned, and it
   * is always the one `state.sessionId` names.
   */
  function switchSession(id: string) {
    if (id === state.sessionId) return;
    unpinSession(state.sessionId);
    state.sessionId = id;
    pinSession(id);
    expandedRefs.clear(); // refs are per-session seqs; carrying them over expands unrelated nodes
    refresh();
  }

  /** Build and show the session overlay. */
  function openPicker(req: PickerRequest) {
    if (req.kind !== "sessions") return;
    overlay = new Picker(currentSessionRows(), {
      title: "sessions — most recently used first",
      allowNew: true,
      allowDelete: true,
      allowFork: true,
    });
    markDirty();
  }

  function currentSessionRows(): PickerRow[] {
    return sessionRows(sessionList({ currentId: state.sessionId }), relTime);
  }

  /**
   * Route a key to the overlay. Returns true when the overlay consumed it, so
   * `onKey` can stop before the input buffer or any of the app's own chords see
   * it — otherwise `d` would delete a session *and* be typed, and `escape` would
   * both close the picker and clear the input.
   */
  function overlayKey(k: Key): boolean {
    if (!overlay) return false;
    if (k.type === "mouse") return true; // the modal owns the screen; clicks do nothing
    if (k.type === "paste") {
      for (const ch of k.text.replace(/\s+/g, "")) overlay.key({ ch });
      markDirty();
      return true;
    }
    const action = k.type === "char" ? overlay.key({ ch: k.ch }) : overlay.key({ name: k.name, ctrl: k.ctrl });
    markDirty();
    if (!action) return true;
    switch (action.kind) {
      case "cancel":
        overlay = null;
        break;
      case "choose":
        overlay = null;
        switchSession(action.id);
        push("info", `switched to ${action.id}`);
        break;
      case "new": {
        overlay = null;
        const res = runSlashCommand("/new", state);
        if (res?.newSessionId) switchSession(res.newSessionId);
        if (res?.output) push("info", res.output);
        break;
      }
      case "fork": {
        overlay = null;
        const res = runSlashCommand(`/fork ${action.id}`, state);
        if (res?.output) push("info", res.output);
        if (res?.newSessionId) switchSession(res.newSessionId);
        break;
      }
      case "delete": {
        // stays open: cleaning up several sessions should not mean reopening the
        // list between each one. The confirm already happened inside the picker.
        const res = runSlashCommand(`/delete ${action.id} yes`, state);
        if (res?.output) flash(res.output);
        overlay.setRows(currentSessionRows());
        break;
      }
    }
    return true;
  }

  /**
   * One clean error line in the transcript; the whole truth in the debug log.
   *
   * Raw provider bodies used to land on the grid verbatim — a 401 from a gateway
   * prints its own multi-line HTML/JSON, which paints over the UI and teaches
   * the user nothing at a glance. The transcript gets the summary; the log gets
   * the stack, the body, and everything else (see src/core/debuglog.ts).
   */
  function reportError(summary: string, detail?: unknown) {
    debugLog(summary, detail);
    const short = summary.replace(/\s+/g, " ").slice(0, 160);
    push("error", `✗ ${short} · log: ${debugLogPath()}`);
  }

  async function runAgent(raw: string) {
    setBusy(true);
    push("user", `❯ ${raw}`);
    ac = new AbortController();
    let md = "";
    try {
      for await (const ev of runTurn(state.sessionId, state.provider, raw, ac.signal, state.config, uiBridge)) {        if (ev.type === "reasoning") {
          appendToLastThink(ev.delta);
        } else if (ev.type === "text") {
          md += ev.delta;
          if (streamText !== md) {
            streamText = md;
            markDirty();
          }
        } else if (ev.type === "usage") {
          lastPromptTokens = ev.prompt_tokens; // provider-reported context size
          statsRev++;
        } else if (ev.type === "tool_end") {
          if (md) {
            push("md", md);
            md = "";
            streamText = null;
          }
          const oneLine = ev.output.replace(/\s+\n/g, "\n").replace(/\n/g, " ⏎ ").slice(0, KEPT_TOOL_CHARS);
          push("toolhead", `[m${ev.seq}] ⚙ ${ev.name}${ev.ok ? "" : " ✗"}`);
          push("toolbody", `  ↳ ${oneLine}`, { ref: ev.seq, expanded: expandedRefs.has(ev.seq) });
          statsRev++;
        } else if (ev.type === "child_tool") {
          // A subagent's own tool calls. Only the completions are shown: a
          // delegated run can be dozens of calls deep, and pairing every start
          // with its end would bury the parent's own transcript.
          if (ev.done) {
            if (md) {
              push("md", md);
              md = "";
              streamText = null;
            }
            push("toolbody", `  ↳ ${ev.session} · ${ev.name}${ev.ok ? "" : " ✗"}`);
          }
        } else if (ev.type === "done") {
          // turn.ts already persisted the full error to the session log; the
          // transcript gets one line, the debug log gets the whole reason
          if (ev.reason.startsWith("error")) reportError(ev.reason.slice(7));
        }
      }
    } catch (e) {
      if (ac?.signal.aborted) push("error", "[interrupted]");
      else reportError(`fox-agent error: ${(e as Error).message ?? e}`, e);
    } finally {
      if (md) push("md", md);
      streamText = null;
      setBusy(false);
      ac = null;
      // reconcile the live user marker with stored seq
      refresh();
      drainQueue();
    }
  }

  function drainQueue() {
    if (!queued.length) return;
    const next = queued.shift()!;
    void dispatch(next.raw, next.lit);
  }

  async function dispatch(raw: string, lit = false) {
    // emptiness is judged on the RAW buffer, not the trim: a message of pure
    // whitespace is still a message the user chose to send
    if (!raw) return;
    const t = raw.trim();
    if (!lit && t.startsWith("!")) return void runShell(t.slice(1).trim());
    if (!lit && t.startsWith("/")) return runSlash(t);
    await runAgent(raw);
  }

  const display = () => buf.map((c) => c.c).join("");
  const firstCharLit = () => buf.find((c) => c.c.trim().length > 0)?.lit ?? false;

  function chsSet(text: string) {
    // iterate code points, not UTF-16 units: `split("")` would tear an emoji
    // into surrogate halves, and every later width/delete calculation inherits
    // the damage
    buf = [...text].map((x) => ({ c: x, lit: false }));
    cur = buf.length;
    inputRev++;
    markDirty();
  }

  function submit() {
    const raw = display();
    const lit = firstCharLit();
    buf = [];
    cur = 0; // a stale index past the new (empty) buffer crashes graphemeBack on the next backspace
    inputRev++; // the layout cache is keyed on this — without it a multi-line message leaves a multi-line input box
    markDirty();
    // raw length, not trim: pure whitespace is sendable on purpose
    if (!raw) return;
    const t = raw.trim();

    // A partial command name resolves to the highlighted hint. Only when there
    // is no argument yet: `/de foo` must not be silently rewritten, since the
    // argument was typed for whatever the user thought they were running.
    if (!lit && t.startsWith("/") && !t.includes(" ")) {
      const matches = matchCommands(t);
      const exact = matches.length === 1 && matches[0].name === t;
      if (!exact && matches.length) {
        const target = matches[Math.min(hintSel, matches.length - 1)];
        hintSel = 0;
        // a command that wants an argument gets completed, not fired — running
        // `/delete` on enter with no id would just print a usage line
        if (target.usage) {
          chsSet(`${target.name} `);
          return;
        }
        return void runSlash(target.name);
      }
    }

    if (busy) {
      queued.push({ raw, lit });
      markDirty();
      return;
    }
    void dispatch(raw, lit);
  }

  /**
   * Tear down the terminal and let startTui() return, so the caller's
   * `finally { shutdownTools() }` actually runs. Calling process.exit() here
   * would skip it and leak tmux/MCP children.
   */
  function gracefulExit(code = 0): void {
    if (exiting) return;
    exiting = true;
    exitCode = code;
    try {
      ac?.abort();
    } catch {}
    try {
      unpinSession(state.sessionId);
    } catch {}
    try {
      term.end();
    } catch {}
    finish?.();
  }

  function flash(msg: string) {
    flashMsg = msg;
    flashUntil = Date.now() + 900;
    markDirty();
    setTimeout(() => {
      if (Date.now() >= flashUntil) markDirty();
    }, 950);
  }

  function setBusy(v: boolean) {
    busy = v;
    if (v) startedAt = Date.now();
    markDirty();
  }

  // ---- input helpers (cursor-aware) ----
  function insertText(text: string, lit = false) {
    const chars: Ch[] = [];
    for (const ch of text) chars.push({ c: ch === "\t" ? " " : ch, lit });
    buf.splice(cur, 0, ...chars);
    cur += chars.length;
    inputRev++;
    markDirty();
  }
  /** next cursor position one word away in `dir` (-1 left, +1 right) */
  function wordBoundary(dir: -1 | 1): number {
    const isWord = (i: number) => /\S/.test(buf[i]?.c ?? " ");
    let i = cur;
    if (dir < 0) {
      while (i > 0 && !isWord(i - 1)) i--;
      while (i > 0 && isWord(i - 1)) i--;
    } else {
      while (i < buf.length && !isWord(i)) i++;
      while (i < buf.length && isWord(i)) i++;
    }
    return i;
  }
  function toggleExpand(it: Item) {
    if (it.kind !== "think" && it.kind !== "toolbody") return;
    it.expanded = !it.expanded;
    if (it.ref != null) {
      if (it.expanded) expandedRefs.add(it.ref);
      else expandedRefs.delete(it.ref);
    }
    touch(it.k);
    markDirty();
  }

  // ---- keyboard ----
  function onKey(k: Key) {
    // any real input dismisses transient help output first — /help is a
    // glance, not something to scroll past forever
    if (items.some((i) => i.ephemeral)) {
      items = items.filter((i) => !i.ephemeral);
      clampScroll();
      markDirty();
    }
    // the modal gets first refusal on every key (see overlayKey)
    if (overlayKey(k)) return;
    // an open question wizard owns the input dock next (see promptKey)
    if (promptKey(k)) return;
    if (k.type === "paste") return insertText(k.text, true);
    if (k.type === "mouse") return onMouse(k.action, k.x, k.y);
    if (k.type === "char") {
      const prev = buf[cur - 1];
      if (prev && prev.c === "\\" && !prev.lit) {
        buf.splice(cur - 1, 1, { c: k.ch, lit: true }); // \x -> literal char
      } else {
        buf.splice(cur, 0, { c: k.ch, lit: false });
        cur++;
      }
      hintSel = 0;
      inputRev++;
      markDirty();
      return;
    }
    const { name, ctrl } = k;

    if (name === "wheelup" || name === "wheeldown") {
      const dir = name === "wheelup" ? -3 : 3;
      if (stick && dir < 0) stick = false;
      scrollTop += dir;
      clampScroll();
      if (dir > 0) {
        const max = Math.max(0, totalRows() - viewportH());
        if (scrollTop >= max) stick = true; // rode to the bottom -> re-stick
      }
      markDirty();
      return;
    }
    if (name === "c" && ctrl) {
      // A live selection makes ctrl+c mean copy, as it does everywhere else.
      // It is consumed here rather than falling through, so the same keystroke
      // cannot both copy and abort the turn.
      if (hasSel()) {
        void copySelection();
        clearSel();
        return;
      }
      if (busy) {
        ac?.abort();
        return;
      }
      if (buf.length) {
        buf = [];
        cur = 0;
        inputRev++;
        flash("cleared");
        return;
      }
      // `return` matters: without it this fell through to the ctrl+d branch
      // below, so one keystroke ran gracefulExit twice. It is idempotent today,
      // which is the only reason that was invisible.
      gracefulExit(0);
      return;
    }
    if (name === "d" && ctrl) return gracefulExit(0);
    if (name === "t" && ctrl) {
      // unfold/fold every thinking block
      const anyFolded = items.some((it) => it.kind === "think" && !isExpanded(it));
      for (const it of items) {
        if (it.kind !== "think") continue;
        const want = anyFolded;
        if (isExpanded(it) !== want) toggleExpand(it);
      }
      flash(anyFolded ? "thinking unfolded" : "thinking folded");
      return;
    }
    if (name === "v" && ctrl) {
      void clipRead().then((p) => {
        if (!p) return;
        insertText(p, true);
      });
      return;
    }
    if (name === "escape") {
      // escape sheds one thing at a time: selection, then the turn, then input
      if (hasSel()) {
        clearSel();
        return;
      }
      if (busy) ac?.abort();
      else {
        buf = [];
        cur = 0;
        inputRev++;
        markDirty();
      }
      return;
    }
    if (name === "pageup") {
      stick = false;
      scrollTop -= Math.floor(viewportH() * 0.8);
      clampScroll();
      markDirty();
      return;
    }
    if (name === "pagedown") {
      scrollTop += Math.floor(viewportH() * 0.8);
      clampScroll();
      const max = Math.max(0, totalRows() - viewportH());
      if (scrollTop >= max) stick = true;
      markDirty();
      return;
    }
    if (name === "home") {
      stick = false;
      scrollTop = 0;
      markDirty();
      return;
    }
    if (name === "end") {
      stick = true;
      markDirty();
      return;
    }
    if (name === "return") {
      const prev = buf[cur - 1];
      if (prev && prev.c === "\\" && !prev.lit) {
        buf.splice(cur - 1, 1, { c: "\n", lit: true });
        inputRev++;
        markDirty();
      } else submit();
      return;
    }
    if (name === "backspace") {
      if (cur > 0) {
        // alt/ctrl+backspace deletes the previous word, as it does in every
        // shell and editor; plain backspace deletes one grapheme, which may be
        // several buffer entries (emoji, combining marks, flags).
        const from = ctrl || k.meta ? wordBoundary(-1) : cur - graphemeBack(buf, cur);
        buf.splice(from, cur - from);
        cur = from;
        inputRev++;
      }
      hintSel = 0;
      markDirty();
      return;
    }
    if (name === "delete") {
      if (cur < buf.length) {
        // forward-delete is the same problem mirrored: remove the whole cluster
        // starting here, not its first code point
        const end = cur + graphemeForward(buf, cur);
        buf.splice(cur, end - cur);
        inputRev++;
      }
      markDirty();
      return;
    }
    if (name === "left" || name === "right") {
      const dir = name === "left" ? -1 : 1;
      // ctrl/alt+arrow = word-wise motion (the decoder reports CSI modifiers)
      if (ctrl || k.meta) cur = wordBoundary(dir);
      else cur = Math.max(0, Math.min(buf.length, cur + dir));
      markDirty();
      return;
    }
    if (name === "tab") {
      const all = hintMatches();
      if (all.length) {
        const target = all[Math.min(hintSel, all.length - 1)];
        // completing to a command that takes an argument leaves a trailing space
        // so the next keystroke starts the argument rather than extending a name
        chsSet(target.usage ? `${target.name} ` : target.name);
        hintSel = 0;
      } else {
        // no completion in play — tab is just whitespace the user wants to send
        insertText("\t");
      }
      return;
    }
    if (name === "up" || name === "down") {
      const n = hintMatches().length;
      if (n > 1) {
        hintSel = Math.max(0, Math.min(n - 1, hintSel + (name === "up" ? -1 : 1)));
        markDirty();
      }
      return;
    }
  }

  /**
   * Commands matching what is typed, or none when the input is not a bare
   * command word. One helper for the popup, tab, up/down and submit — those were
   * four separate `COMMANDS.filter(startsWith)` calls that had to agree on the
   * ordering for `hintSel` to mean anything, and the matcher itself now lives in
   * `commands.ts` so fuzzy matching improved all of them at once.
   */
  function hintMatches(): CommandSpec[] {
    // the input dock is answering a question, not naming a command
    if (prompt) return [];
    const d = display();
    if (firstCharLit() || !d.startsWith("/")) return [];
    // an argument being typed still shows its command, so the usage hint stays
    // visible — but only while the argument is unambiguous (one match)
    return matchCommands(d);
  }

  // ---- mouse ----
  /** the transcript row under screen row y, or null if y is not the transcript */
  function transcriptRow(y: number): number | null {
    if (y < 0 || y >= viewportH()) return null;
    const row = y + scrollTop;
    buildRows();
    return row >= 0 && row < rowBuf.length ? row : null;
  }

  /** the cell column a click at screen x lands on within a transcript row */
  function transcriptCol(x: number): number {
    // the painter starts transcript text at column 1 (see paint())
    return Math.max(0, x - 1);
  }

  /**
   * All three mouse events go through one arbiter.
   *
   * The press/drag/release rules live in `gestureFor` so they can be tested
   * without a terminal; this function is only the effects. Note that `onClick`
   * — and therefore `toggleExpand` — is reachable from exactly one place: a
   * release that `gestureFor` classified as a click. There is no path from a
   * button-down to a toggle any more, which is the reported bug.
   */
  function onMouse(action: "down" | "drag" | "up", x: number, y: number) {
    const g = gestureFor(action, press, x, y);
    if (action === "down") {
      const row = transcriptRow(y);
      press = { x, y, moved: false };
      // Any press drops the previous selection; a new one is staged here but
      // only becomes visible once movement makes this a drag.
      clearSel();
      if (row !== null) {
        selA = { row, col: transcriptCol(x) };
        selB = selA;
      }
      return;
    }
    if (action === "drag") {
      if (g.kind !== "extend") return;
      press!.moved = true;
      if (!selA) return;
      // Dragging past an edge scrolls, so a selection can outrun the screen.
      if (y < 0 || y >= viewportH()) {
        stick = false;
        scrollTop += y < 0 ? -1 : 1;
        clampScroll();
      }
      const row = transcriptRow(Math.max(0, Math.min(viewportH() - 1, y)));
      if (row === null) return;
      selB = { row, col: transcriptCol(x) };
      markDirty();
      return;
    }
    press = null;
    // A drag selects and copies; it must never also toggle what it passed over.
    if (g.kind === "copy") {
      if (hasSel()) void copySelection();
      return;
    }
    if (g.kind !== "click") return;
    // A tap: the selection it staged is a single cell, so drop it and treat
    // this as the click it turned out to be.
    clearSel();
    // Multi-click: double selects the word, triple the line, quad clears,
    // then the cycle repeats. A multi-click never fires onClick — the second
    // click of a double-click must not re-toggle what the first one flipped.
    const now = Date.now();
    const sameSpot = Math.abs(x - clickStreak.x) <= 1 && Math.abs(y - clickStreak.y) <= 1;
    clickStreak.count = sameSpot && now - clickStreak.at < 600 ? clickStreak.count + 1 : 1;
    clickStreak.at = now;
    clickStreak.x = x;
    clickStreak.y = y;
    if (clickStreak.count >= 2) {
      const phase = (clickStreak.count - 2) % 3;
      const row = transcriptRow(y);
      if (phase === 2 || row === null) return; // quad-click: no selection, no toggle
      buildRows();
      const cells = rowCells(rowBuf[row].segs);
      if (phase === 0) {
        const w = wordRangeAt(cells, transcriptCol(x));
        if (!w) return;
        selA = { row, col: w.from };
        selB = { row, col: w.to };
      } else {
        const width = cells.start.length;
        if (!width) return;
        selA = { row, col: 0 };
        selB = { row, col: width - 1 };
      }
      markDirty();
      return;
    }
    onClick(x, y);
  }

  async function copySelection() {
    if (!selA || !selB) return;
    buildRows();
    const text = extractSelection(rowBuf.map((r) => r.segs), selA, selB);
    if (!text) return;
    const okd = await clipWrite(text, term);
    const lines = text.split("\n").length;
    flash(okd ? `copied ${text.length} chars${lines > 1 ? ` (${lines} lines)` : ""}` : "copy failed — no clipboard tool");
  }

  function onClick(x: number, y: number) {
    const vh = viewportH();
    const { inputTop } = dockGeom();

    // hint popup rows float above the input box
    const hints = hintText();
    if (hints.active && hints.rows.length) {
      const hTop = inputTop - hints.rows.length;
      if (y >= hTop && y < inputTop) {
        const idx = (hints.start ?? 0) + (y - hTop);
        const target = hints.matches?.[idx];
        if (target) {
          chsSet(target.usage ? `${target.name} ` : target.name);
          hintSel = 0;
        }
        return;
      }
    }

    // inside the input box: place the cursor
    if (y >= inputTop && y < H - 1) {
      const g = dockGeom();
      const vr = g.layout.rows[g.firstShown + (y - inputTop)];
      if (!vr) return;
      const targetW = Math.max(0, x - 3) + vr.startCol;
      const line = g.layout.logical[vr.logical];
      let w = 0;
      let idx = 0;
      for (const ch of line) {
        const cw = charWidth(ch.codePointAt(0)!);
        if (w + cw > targetW) break;
        w += cw;
        idx++;
      }
      cur = Math.min(g.layout.lineStarts[vr.logical] + idx, buf.length);
      inputRev++; // caret moved -> layout/caret recompute is a no-op but keep rev honest
      markDirty();
      return;
    }

    // transcript: map row -> owning item
    buildRows();
    const row = y + scrollTop;
    if (y >= vh || row < 0 || row >= rowOwner.length) return;
    const it = items.find((i) => i.k === rowOwner[row]);
    if (it) toggleExpand(it);
  }

  function isExpanded(it: Item): boolean {
    return !!it.expanded;
  }

  // ---- painting ----
  interface Row {
    segs: Seg[];
  }
  const lineCache = new Map<number, { rev: number; w: number; rows: Row[]; gap: boolean }>();
  const LINE_CACHE_MAX = 2_000;

  function itemStyle(kind: ItemKind): Partial<Seg> {
    switch (kind) {
      case "user":
        return { fg: C.user };
      case "toolhead":
        return { fg: C.tool };
      case "toolbody":
        return { fg: C.chrome };
      case "error":
        return { fg: C.error };
      case "info":
        return { fg: C.info };
      default:
        return {};
    }
  }

  function itemRows(it: Item, w: number): { rows: Row[]; gap: boolean } {
    const cached = lineCache.get(it.k);
    if (cached && cached.rev === revs.get(it.k) && cached.w === w) return cached;
    let rows: Row[];
    if (it.kind === "md") {
      rows = [];
      for (const mline of renderMarkdown(it.text)) rows.push(...wrapSegs(mline, w).map((segs) => ({ segs })));
      rows.push({ segs: [] });
    } else if (it.kind === "think") {
      const words = it.text.trim().split(/\s+/).length;
      rows = it.expanded
        ? wrapSegs([{ t: `▾ thinking\n${it.text}`, fg: C.chrome }], w).map((segs) => ({ segs }))
        : [{ segs: [{ t: `▸ thinking (${words} words) · click or ctrl+t`, fg: C.chrome }] }];
      rows.push({ segs: [] });
    } else if (it.kind === "toolbody") {
      const body = it.expanded || it.text.length <= COLLAPSED_TOOL_CHARS + 4
        ? it.text
        : `${it.text.slice(0, COLLAPSED_TOOL_CHARS)} … ⋯ more · click`;
      rows = wrapSegs([{ t: body, ...itemStyle(it.kind) }], w).map((segs) => ({ segs }));
    } else {
      rows = wrapSegs([{ t: it.text, ...itemStyle(it.kind) }], w).map((segs) => ({ segs }));
    }
    const entry = { rev: revs.get(it.k) ?? 0, w, rows, gap: it.kind === "md" || it.kind === "think" };
    lineCache.set(it.k, entry);
    // keys are re-minted on every refresh(), so without eviction this grows
    // unbounded across a long session
    if (lineCache.size > LINE_CACHE_MAX) {
      const live = new Set(items.map((i) => i.k));
      for (const k of lineCache.keys()) if (!live.has(k)) lineCache.delete(k);
    }
    return entry;
  }

  function viewportH(): number {
    const n = Math.max(1, Math.min(INPUT_MAX_ROWS, inputLayout().rows.length));
    return Math.max(3, H - n - 2); // input box + status bar
  }

  // ---- input layout: soft-wrap + flex box + caret mapping ----
  const INPUT_MAX_ROWS = 8;

  interface VisualRow {
    text: string;
    logical: number; // logical line index
    startCol: number; // display column where this visual row begins
    index: number;
  }
  interface InputLayout {
    rows: VisualRow[];
    logical: string[];
    lineStarts: number[]; // buf index where each logical line starts
    maxCols: number;
  }

  function wrapByWidth(s: string, maxCols: number): string[] {
    if (s.length === 0) return [""];
    const out: string[] = [];
    let chunk = "";
    let w = 0;
    for (const ch of s) {
      const cw = charWidth(ch.codePointAt(0)!);
      if (w + cw > maxCols && chunk) {
        out.push(chunk);
        chunk = "";
        w = 0;
      }
      chunk += ch;
      w += cw;
    }
    out.push(chunk);
    return out;
  }

  let inputRev = 0; // bumped on every buffer mutation
  /**
   * What the input dock paints. Identical to the buffer except on a secret
   * prompt step (an api key), where every non-newline code point is a bullet —
   * one bullet per code point keeps the caret math honest (see caretPos).
   */
  function inputText(): string {
    const d = display();
    const st = prompt?.steps[prompt.idx];
    if (!st?.secret) return d;
    return [...d].map((c) => (c === "\n" ? c : "•")).join("");
  }
  let layoutCache: { rev: number; layout: InputLayout } | null = null;
  function inputLayout(): InputLayout {
    if (layoutCache && layoutCache.rev === inputRev) return layoutCache.layout;
    const d = inputText();
    const logical = d.split("\n");
    const maxCols = Math.max(8, W - 4);
    const rows: VisualRow[] = [];
    const lineStarts: number[] = [];
    let idx = 0;
    for (let li = 0; li < logical.length; li++) {
      lineStarts.push(idx);
      idx += logical[li].length + 1;
      const parts = wrapByWidth(logical[li], maxCols);
      for (let pi = 0; pi < parts.length; pi++) rows.push({ text: parts[pi], logical: li, startCol: pi * maxCols, index: rows.length });
    }
    const layout = { rows, logical, lineStarts, maxCols };
    layoutCache = { rev: inputRev, layout };
    return layout;
  }

  /** map cursor index -> visual row + display-width column */
  function caretPos(layout: InputLayout): { visRow: number; colW: number } {
    // walk the painted text (inputText), not buf: a secret step's bullets are
    // all width 1, and the wrap this maps into was computed on those bullets
    const chars = [...inputText()];
    let li = 0;
    let colW = 0;
    for (let i = 0; i < cur && i < chars.length; i++) {
      if (chars[i] === "\n") {
        li++;
        colW = 0;
      } else colW += charWidth(chars[i].codePointAt(0)!);
    }
    let visRow = layout.rows.findIndex((r) => r.logical === li && colW >= r.startCol && colW < r.startCol + layout.maxCols);
    if (visRow < 0) visRow = layout.rows.length - 1; // past EOL lands on last row
    return { visRow, colW: colW - layout.rows[Math.max(0, visRow)].startCol };
  }

  function clampScroll() {
    scrollTop = Math.max(0, Math.min(scrollTop, Math.max(0, totalRows() - viewportH())));
  }

  let rowBuf: Row[] = [];
  let rowOwner: number[] = []; // rowBuf index -> item key (for click hit-testing)

  /**
   * Incremental stream rendering.
   *
   * A streaming response re-renders every frame (~30/s) and grows by a few
   * tokens per frame, so re-parsing and re-wrapping the whole partial message
   * each frame was the single hottest path in the draw loop. Streaming is
   * append-only and every rendered line is line-local (the one cross-line
   * construct, code fences, is carried through `MdState`), so the text up to
   * the last newline is immutable: parse and wrap it exactly once into
   * `prefixRows`, and each frame re-render only the unterminated tail.
   */
  interface StreamCache {
    w: number;
    /** text length already rendered into prefixRows */
    cut: number;
    /** fence state at `cut` */
    md: MdState;
    /** the full text this cache validated against */
    text: string;
    prefixRows: Row[];
  }
  let streamCache: StreamCache | null = null;

  function streamRows(text: string, w: number): Row[] {
    let c = streamCache;
    // width changes reflow everything; a prefix mismatch means a new stream
    // (or a rewind) — either way the settled rows are only valid if the text
    // they were rendered from is still there, verbatim
    if (!c || c.w !== w || !text.startsWith(c.text.slice(0, c.cut))) {
      c = streamCache = { w, cut: 0, md: { inFence: false, hadCode: false }, text: "", prefixRows: [] };
    }
    // advance the cut to the last newline, tracking fence state as we go
    let scan = c.cut;
    let newCut = c.cut;
    const md = { ...c.md };
    for (;;) {
      const nl = text.indexOf("\n", scan);
      if (nl < 0) break;
      if (/^```/.test(text.slice(scan, nl))) {
        md.inFence = !md.inFence;
        md.hadCode = false;
      } else if (md.inFence) {
        md.hadCode = true;
      }
      newCut = nl + 1;
      scan = nl + 1;
    }
    if (newCut > c.cut) {
      // minus the trailing newline: with it the segment's split would end on an
      // empty line and emit a row for content that belongs to the tail
      for (const mline of renderMarkdown(text.slice(c.cut, newCut - 1), c.md)) {
        c.prefixRows.push(...wrapSegs(mline, w).map((segs) => ({ segs })));
      }
      c.cut = newCut;
    }
    c.text = text;
    const rows = c.prefixRows.slice();
    for (const mline of renderMarkdown(text.slice(c.cut), { ...c.md })) {
      rows.push(...wrapSegs(mline, w).map((segs) => ({ segs })));
    }
    rows.push({ segs: [] });
    return rows;
  }

  function totalRows(): number {
    buildRows();
    return rowBuf.length;
  }

  function buildRows() {
    const w = W;
    rowBuf = [];
    rowOwner = [];
    for (const it of items) {
      const rows = itemRows(it, w).rows;
      for (const r of rows) {
        rowBuf.push(r);
        rowOwner.push(it.k);
      }
    }
    if (streamText !== null) {
      for (const r of streamRows(streamText, w)) {
        rowBuf.push(r);
        rowOwner.push(-1); // one owner per row, or hit-testing drifts below here
      }
    }
    if (busy && streamText === null) {
      rowBuf.push({ segs: [{ t: "◦ working… (esc interrupts)", fg: C.chrome }] });
      rowOwner.push(-1);
    }
  }

  function hintText(): {
    rows: { text: string; sel: boolean }[];
    active: boolean;
    matches?: CommandSpec[];
    start?: number;
  } {
    const matches = hintMatches();
    if (!matches.length) return { rows: [], active: false };
    const d = display();
    // Once an argument is being typed the roster is not useful any more, but the
    // syntax for the command in hand is: show one line with its usage. The old
    // popup vanished at the first space, which is exactly when a user typing
    // `/delete <id> yes` most needs to be told what comes next.
    if (d.includes(" ")) {
      const c = matches[0];
      if (matches.length > 1 || !c.usage) return { rows: [], active: false };
      return {
        rows: [{ text: `${c.name} ${c.usage}  —  ${c.help ?? c.desc}`, sel: false }],
        active: true,
        matches: [c],
        start: 0,
      };
    }
    const sel = Math.max(0, Math.min(matches.length - 1, hintSel));
    const start = Math.max(0, Math.min(sel - HINT_WINDOW + 1, matches.length - HINT_WINDOW));
    return {
      rows: matches.slice(start, start + HINT_WINDOW).map((c, i) => ({
        text: `${(c.usage ? `${c.name} ${c.usage}` : c.name).padEnd(20)} ${c.desc}`,
        sel: start + i === sel,
      })),
      active: true,
      matches,
      start,
    };
  }

  function statusText(): string {
    try {
      // Context % comes from the provider's own last report (live this turn,
      // else the persisted one) — never a chars/4 estimate. Before the first
      // report there is simply nothing honest to show.
      const reported = lastPromptTokens || storedPromptTokens(state.sessionId);
      const info = lookupModel(state.provider.model);
      const k = (n: number) => `${Math.round(n / 1000)}k`;
      const ctx = reported
        ? `ctx ${Math.min(100, Math.round((reported / info.contextWindow) * 100))}% (${k(reported)}/${k(info.contextWindow)})`
        : "ctx —";
      const home = process.env.HOME ?? "";
      const cwdShort = home && state.cwd.startsWith(home) ? "~" + state.cwd.slice(home.length) : state.cwd;
      const q = queued.length ? ` · ⏸ ${queued.length}` : "";
      return `${cwdShort} · ${state.provider.model} · ${ctx}${q}`;
    } catch {
      return state.cwd;
    }
  }

  // stats involve a full log replay — cache per revision, never per frame
  let statsRev = 0;
  let statsCacheRev = -1;
  let statsCacheStr = "";
  function cachedStats(): string {
    // re-poll on an explicit revision bump, or on a timer only while a turn is
    // running (an idle session's log can't change under us)
    const stale = busy && Date.now() - lastStatsAt > 2_000;
    if (statsCacheRev !== statsRev || stale) {
      statsCacheStr = statusText();
      statsCacheRev = statsRev;
      lastStatsAt = Date.now();
    }
    return statsCacheStr;
  }
  let lastStatsAt = 0;

  function elapsed(): string {
    if (!startedAt) return "";
    const s = Math.floor((Date.now() - startedAt) / 1000);
    return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m${s % 60}s`;
  }

  const S = {
    dim: 0,
    base: 0,
    accent: 0,
    ok: 0,
    err: 0,
    user: 0,
    tool: 0,
    info: 0,
    chromeOnBar: 0,
    inputFg: 0,
    hintDim: 0,
    hintSel: 0,
    inputBgRow: 0,
    barBgRow: 0,
    sbThumb: 0,
    overlayRow: 0,
    overlaySel: 0,
  };
  function initStyles() {
    S.base = screen.sgr({ fg: C.fg });
    S.dim = screen.sgr({ fg: C.chrome });
    S.accent = screen.sgr({ fg: C.accent });
    S.ok = screen.sgr({ fg: C.ok });
    S.err = screen.sgr({ fg: C.error });
    S.user = screen.sgr({ fg: C.user });
    S.tool = screen.sgr({ fg: C.tool });
    S.info = screen.sgr({ fg: C.info });
    S.chromeOnBar = screen.sgr({ fg: C.chrome, bg: C.barBg });
    S.inputFg = screen.sgr({ fg: C.fg, bg: C.inputBg });
    S.hintDim = screen.sgr({ fg: C.hint, bg: C.barBg });
    S.hintSel = screen.sgr({ fg: C.hintSel, bg: C.barBg });
    S.inputBgRow = screen.sgr({ fg: C.fg, bg: C.inputBg });
    S.barBgRow = screen.sgr({ fg: C.fg, bg: C.barBg });
    S.sbThumb = screen.sgr({ bg: "#6e7681" }); // neutral gray, distinct from chrome blue
    S.overlayRow = screen.sgr({ fg: C.fg, bg: C.inputBg });
    S.overlaySel = screen.sgr({ fg: C.hintSel, bg: C.selBg });
  }

  /** shared dock geometry for paint + click mapping */
  let nextCaret: { x: number; y: number } | null = null;
  function dockGeom() {
    const layout = inputLayout();
    const caret = caretPos(layout);
    const totalVis = layout.rows.length;
    const shownCount = Math.max(1, Math.min(INPUT_MAX_ROWS, totalVis));
    let firstShown = 0;
    if (totalVis > shownCount) {
      firstShown = Math.max(0, Math.min(caret.visRow - (shownCount - 1), totalVis - shownCount));
      if (caret.visRow < firstShown) firstShown = caret.visRow;
    }
    return { layout, caret, shownCount, firstShown, inputTop: H - 1 - shownCount };
  }

  function paint() {
    const st = (seg: Seg, fallback: number): number => {
      if (!seg.fg && !seg.bg && !seg.bold && !seg.italic) return fallback;
      return screen.sgr(seg);
    };

    screen.clear();
    buildRows();
    const vh = viewportH();
    if (stick) scrollTop = Math.max(0, rowBuf.length - vh);
    scrollTop = Math.max(0, Math.min(scrollTop, Math.max(0, rowBuf.length - vh)));

    // transcript
    let y = 0;
    for (let i = scrollTop; i < rowBuf.length && y < vh; i++, y++) {
      const row = rowBuf[i];
      let x = 1;
      for (const seg of row.segs) {
        x = screen.text(x, y, seg.t, st(seg, S.base));
      }
      // Selection is a re-style over the cells already painted, not a second
      // text pass: the grid holds one char per cell, so re-stamping the range
      // with a highlight background cannot disturb wide chars or wrapping.
      // hasSel(), not selA&&selB: a staged press anchors a single cell, and
      // painting it flashed a phantom highlight on every click.
      if (hasSel()) {
        const range = selRangeForRow(i, selA!, selB!, rowCells(row.segs));
        if (range) screen.restyle(y, 1 + range.from, 2 + range.to, C.selBg);
      }
    }

    // scrollbar (right edge of transcript area)
    if (rowBuf.length > vh && W >= 12) {
      const th = Math.max(1, Math.floor((vh * vh) / rowBuf.length));
      const maxScroll = rowBuf.length - vh;
      const ty = maxScroll > 0 ? Math.floor((scrollTop / maxScroll) * (vh - th)) : 0;
      for (let i = 0; i < th && ty + i < vh; i++) screen.fillRow(ty + i, W - 2, W - 1, S.sbThumb);
    }

    // bottom dock geometry — input box flexes with wrapped visual rows
    const { layout, caret, shownCount, firstShown, inputTop } = dockGeom();
    const barY = H - 1;
    let pendingCaret: { x: number; y: number } | null = null;

    // input box background
    for (let i = 0; i < shownCount; i++) screen.fillRow(inputTop + i, 0, W, S.inputBgRow);

    const d = display();
    // any real char — even whitespace — is content; the placeholder only fills
    // a truly empty box, or it paints over leading indentation the user typed
    const empty = !buf.length;
    const st0 = prompt?.steps[prompt.idx];
    const selectFilter = prompt && st0?.kind === "select" ? prompt.filter : "";
    const pfx = prompt ? "› " : "❯ ";
    if (selectFilter) {
      // a select step's keystrokes go to the filter — show them in the dock,
      // not just in the floating header, or typing feels dead
      screen.text(1, inputTop, pfx, S.accent);
      screen.text(3, inputTop, selectFilter, S.inputFg);
      pendingCaret = { x: 3 + [...selectFilter].reduce((w, ch) => w + charWidth(ch.codePointAt(0)!), 0), y: inputTop };
    } else if (empty) {
      const placeholder = prompt
        ? st0!.kind === "select"
          ? "(type to filter · ↑↓ choose · enter confirms · esc cancels)"
          : `(${resolveField(st0!.hint, prompt!.answers) ?? "type your answer"} · enter submits · esc cancels)`
        : "(type here — / commands · \\ escapes · ! shell · wheel/pgup scroll · click expands · drag/dbl-click selects)";
      screen.text(1, inputTop, pfx, prompt ? S.accent : S.dim);
      screen.text(3, inputTop, placeholder, S.dim);
      pendingCaret = { x: 3, y: inputTop };
    } else {
      const totalVis = layout.rows.length;
      for (let v = firstShown; v < Math.min(totalVis, firstShown + shownCount); v++) {
        const vr = layout.rows[v];
        const yy = inputTop + (v - firstShown);
        const isFirstVisual = vr.index === 0 && vr.startCol === 0;
        const prefix = isFirstVisual ? pfx : "  ";
        screen.text(1, yy, prefix, S.accent);
        screen.text(3, yy, vr.text, S.inputFg);
      }
      const cy = inputTop + Math.max(0, Math.min(shownCount - 1, caret.visRow - firstShown));
      pendingCaret = { x: 3 + caret.colW, y: cy };
    }
    nextCaret = pendingCaret;

    // the question wizard floats where the command hints would (it supersedes
    // them — the dock is an answer field while a prompt is open)
    if (prompt) {
      const st = prompt.steps[prompt.idx];
      const hint = resolveField(st.hint, prompt.answers);
      const stepPos = prompt.steps.length > 1 ? ` ${prompt.idx + 1}/${prompt.steps.length}` : "";
      const filterNote = st.kind === "select" && prompt.filter ? ` — filter: "${prompt.filter}"` : "";
      const rows: { text: string; sel: boolean }[] = [
        { text: `${prompt.title}${stepPos} — ${st.label}${hint ? ` (${hint})` : ""}${filterNote} · esc cancels`, sel: false },
      ];
      if (st.kind === "select") {
        const opts = promptOptions();
        if (!opts.length) {
          rows.push({ text: "  no matches — backspace to widen", sel: false });
        } else {
          // a models.dev-fed list can run to hundreds of entries — show a window
          // around the selection instead of swallowing the whole scrollback
          const MAX = 12;
          const start = opts.length <= MAX ? 0 : Math.max(0, Math.min(prompt.sel - Math.floor(MAX / 2), opts.length - MAX));
          const end = Math.min(opts.length, start + MAX);
          if (start > 0) rows.push({ text: `  … ${start} more above`, sel: false });
          for (let i = start; i < end; i++) {
            rows.push({ text: `${i === prompt.sel ? "›" : " "} ${opts[i].label}`, sel: i === prompt.sel });
          }
          if (end < opts.length) rows.push({ text: `  … ${opts.length - end} more below`, sel: false });
        }
      }
      const hTop = inputTop - rows.length;
      for (let i = 0; i < rows.length; i++) {
        screen.fillRow(hTop + i, 0, W, S.barBgRow);
        screen.text(1, hTop + i, clipW(rows[i].text, W - 2), rows[i].sel ? S.hintSel : S.hintDim);
      }
    }

    // hints popup floats directly above the input box
    const hints = hintText();
    if (hints.active && hints.rows.length) {
      const hTop = inputTop - hints.rows.length;
      for (let i = 0; i < hints.rows.length; i++) {
        screen.fillRow(hTop + i, 0, W, S.barBgRow);
        screen.text(1, hTop + i, hints.rows[i].text, hints.rows[i].sel ? S.hintSel : S.hintDim);
      }
    }

    // Session overlay, painted last over the transcript so it is unambiguously
    // modal. The input dock stays visible underneath it — the turn running down
    // there is not interrupted by opening the list, and hiding it would suggest
    // otherwise.
    if (overlay) paintOverlay(inputTop);

    // status bar
    screen.fillRow(barY, 0, W, S.barBgRow);
    let lx = 1;
    if (busy) {
      lx = screen.text(lx, barY, `${SPIN[frameIdx]} ${streamText !== null ? "responding" : "thinking"} ${elapsed()}${queued.length ? ` · ⏸ ${queued.length}` : ""}`, S.accent);
    } else if (Date.now() < flashUntil && flashMsg) {
      lx = screen.text(lx, barY, `✓ ${flashMsg}`, S.ok);
    } else {
      lx = screen.text(lx, barY, `✓ ready`, S.ok);
    }
    const stats = cachedStats();
    const statsW = Math.min(segWidth(stats), W - lx - 2);
    if (statsW > 0) {
      let acc = "";
      let wAcc = 0;
      for (const ch of stats) {
        const cw = charWidth(ch.codePointAt(0)!);
        if (wAcc + cw > statsW) break;
        acc += ch;
        wAcc += cw;
      }
      screen.text(W - 1 - wAcc, barY, acc, S.chromeOnBar);
    }
  }

  /**
   * Draw the modal list in the space above the input dock.
   *
   * Every row is a filled background before any text, so nothing of the
   * transcript shows through — a half-transparent modal over a live streaming
   * response is unreadable. Rows are clipped by display *width*, not character
   * count, or a CJK title would push the columns past the right edge and the
   * no-autowrap grid would clip mid-cell.
   */
  function paintOverlay(inputTop: number) {
    const p = overlay!;
    const bodyH = Math.max(1, Math.min(OVERLAY_MAX_ROWS, inputTop - 3));
    const top = Math.max(0, inputTop - bodyH - 2);
    const win = p.window(bodyH);
    const q = p.filter();

    screen.fillRow(top, 0, W, S.barBgRow);
    screen.text(1, top, clipW(`sessions ${q ? `· filter: ${q}` : "· type to filter"}`, W - 2), S.accent);
    for (let i = 0; i < bodyH; i++) {
      const y = top + 1 + i;
      const r = win.rows[i];
      const on = i === win.selRow;
      screen.fillRow(y, 0, W, on ? S.overlaySel : S.overlayRow);
      if (!r) {
        if (i === 0 && !win.rows.length) screen.text(1, y, q ? `no match for "${q}"` : "(no sessions)", S.dim);
        continue;
      }
      const mark = r.current ? "*" : on ? "›" : " ";
      screen.text(1, y, clipW(`${mark} ${r.cells.join("  ")}`, W - 2), on ? S.overlaySel : S.overlayRow);
    }
    const y = top + 1 + bodyH;
    screen.fillRow(y, 0, W, S.barBgRow);
    screen.text(1, y, clipW(p.footer(), W - 2), p.pendingConfirm() ? S.err : S.hintDim);
  }

  /** Truncate to `cols` display columns (wide chars count as two). */
  function clipW(s: string, cols: number): string {
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

  // ---- loop ----
  let resizing = false;
  function doResize(w: number, h: number) {
    if (w < 5 || h < 3) return;
    if (w === W && h === H) return;
    W = Math.max(20, w);
    H = Math.max(8, h);
    screen.resize(W, H);
    initStyles();
    lineCache.clear();
    dirty = true;
  }

  let lastSpinAt = 0;
  function tickSpinner() {
    if (!busy) return;
    const now = Date.now();
    if (now - lastSpinAt < 140) return;
    lastSpinAt = now;
    frameIdx = (frameIdx + 1) % SPIN.length;
    dirty = true;
  }

  async function run() {
    try {
      term.begin();
      term.onResize(doResize);
      doResize(term.size().width, term.size().height);

      // Last-resort net: a floating promise that rejects must never leave the
      // spinner running forever with no way to submit. console.error would
      // corrupt the grid, so surface it as a transcript item instead.
      process.on("unhandledRejection", (reason) => {
        reportError("internal error", reason);
        setBusy(false);
        drainQueue();
      });

      getSession(state.sessionId);
      // the TUI can open a picker, and holds the one session whose handle must
      // survive the picker reading every other session's usage
      state.interactive = true;
      pinSession(state.sessionId);

      const dec = createDecoder(onKey);
      term.onKey((data) => dec.feed(data));

      // First frame BEFORE anything expensive: transcript replay and
      // config/plugin loading happen once the window is already up.
      paint();
      screen.flush();
      term.flush();
      dirty = false;
      refresh();
      if (applyConfig) {
        try {
          const r = applyConfig();
          for (const w of r.warnings) push("info", `⚠ ${w}`);
        } catch (e) {
          // a broken config was always a one-line exit; keep it that way
          term.end();
          console.error(`fox-agent: ${(e as Error)?.message ?? e}`);
          process.exit(1);
        }
      }
      // The startup block comes AFTER refresh() — replay replaces the item
      // list, so anything pushed before it never existed (the banner vanished
      // that way once).
      push("info", `fox-agent v${VERSION} — ${BANNERS[Math.floor(Math.random() * BANNERS.length)]}`);
      push("toolbody", `session ${state.sessionId} · ${state.cwd}`);
      if (!state.provider.apiKey)
        push("error", "no API key configured — /login opens the setup wizard (saved to ~/.config/fox-agent/config.toml)");
      const info = lookupModel(state.provider.model);
      push(
        "toolbody",
        `model ${state.provider.model} (${Math.round(info.contextWindow / 1000)}k ctx) · ${state.provider.provider ?? "openai-compatible"}` +
          `${state.provider.baseUrl && !/api\.openai\.com/.test(state.provider.baseUrl) ? ` · ${state.provider.baseUrl}` : ""}`,
      );
      push("toolbody", "enter send · \\ newline · ! shell · / commands · esc interrupt · ctrl+t thinking · drag/dbl-click select");
      push("toolbody", "/login setup · /model switch · /sessions resume · /usage tokens · /prune context · /upgrade update · /help all");
      statsRev++;
      markDirty();

      const frameTimer = setInterval(() => {
        tickSpinner();
        if (!dirty) return;
        dirty = false;
        try {
          // cursor hidden for the whole repaint burst — if it stays visible it
          // hops through every dirty row and Windows Terminal burns ghost
          // blocks where the row-diff never repaints again
          term.hideCursor();
          paint();
          screen.flush();
          if (process.env.FOX_AGENT_TRACE && screen.lastDirty()) {
            try {
              appendFileSync(process.env.FOX_AGENT_TRACE + ".grid", `⟦frame⟧\n${screen.dumpGrid()}\n`);
            } catch {}
          }
          term.flush();
          // the terminal's own caret is our input caret
          if (nextCaret) term.setCursor(nextCaret.x, nextCaret.y);
          else term.setCursor(3, H - 2);
        } catch (e) {
          // painting over the grid with a stack trace is how raw errors leak;
          // the log gets it, the transcript gets one line, and the UI exits
          debugLog("tui frame error", e);
          try {
            push("error", `✗ internal tui error — log: ${debugLogPath()}`);
          } catch {}
          gracefulExit(1);
        }
      }, 33);

      try {
        await new Promise<void>((resolve) => {
          finish = resolve;
          if (exiting) resolve(); // exited during startup
        });
      } finally {
        clearInterval(frameTimer);
      }
      if (exitCode) process.exitCode = exitCode;
    } catch (e) {
      debugLog("tui fatal", e);
      console.error("[fox-agent] fatal:", (e as Error)?.message ?? e);
      try {
        term.end();
      } catch {}
      process.exitCode = 1;
    }
  }

  await run();
}
