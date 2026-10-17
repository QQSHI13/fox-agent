// fox-agent TUI v5 — custom ANSI renderer (no framework). Immediate-mode paint,
// row-diffed flushing, explicit frame scheduling: keystrokes, stream deltas
// and the spinner tick all just mark dirty; the frame loop owns the tty.
import { openTerm, type Term } from "./term.ts";
import { clipRead, clipWrite, osc52Encode } from "./clipboard.ts";
export { osc52Encode };
import { appendFileSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { Screen, Plane, type Style } from "./screen.ts";
import { computeFrame, dockRows, itemEdgeSpan, scrollbarScrollTop, viewportHeight, chipGutter, contentOrigin, contentOriginForChip, contentWidth, type Frame, type FrameInput, type Row } from "./layout.ts";
import { activePlugins } from "../plugins/load.ts";
import type { TuiRegionPlane } from "../plugins/types.ts";
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
import { renderMarkdown } from "./markdown.ts";
import { codeContRow, codeGutterRow, wrapCodeAware } from "./markdown.ts";
import { createPlainRows, createStreamRows } from "./rows.ts";
import { wrapSegs, type Seg } from "./wrap.ts";
import { charWidth } from "./screen.ts";
import { Picker, type PickerAction, type PickerRow } from "./picker.ts";
import { sessionRows, setPickerWheelStep } from "./pickerui.ts";
import { runTurn, VERSION } from "../loop/agent.ts";
import { steer, peekSteer, withdrawSteer } from "../loop/steer.ts";
import { projectView } from "../context/view.ts";
import { sessionContextTokens } from "../context/budget.ts";
import { lookupModel } from "../providers/models.ts";
import { bundledDisabled } from "../plugins/bundled.ts";
import { costSegment } from "../plugins/cost.ts";
import { listSessions } from "../store/db.ts";
import { allMessages, allMessagesLite, appendOps, createSession, forkSession, getMessage, getSession, kvGet, kvSet, pinSession, unpinSession } from "../store/db.ts";
import { acquireLock, releaseLock } from "../store/lock.ts";
import {
  runSlashCommand,
  COMMANDS,
  matchCommands,
  helpText,
  providerDisplayName,
  sessionList,
  relTime,
  shortResumeArg,
  type CommandSpec,
  type HarnessState,
  type PickerRequest,
  type PromptRequest,
} from "../commands.ts";
import { isCustomOption, resolveField, visibleOptions, type UiBridge, type UiStep } from "../core/ui.ts";
import { createWizard, type PromptState, type Wizard } from "./wizard.ts";
import { childEnv } from "../core/childenv.ts";
import { shellPath } from "../core/shell.ts";
import { killTree } from "../tools/exec.ts";
import { debugLog, debugLogPath } from "../core/debuglog.ts";
import { droppedPath, expandMentions } from "../core/mentions.ts";
import { isWindowsTerminal, isWSL } from "../core/wsl.ts";
import { liveTheme, setTheme, theme, themeName, type Theme } from "./themes.ts";
import { diffSegs, jsonSegs, statusSegs, pathSegs, wordDiff, ansiSegs, highlightVersion, setHighlightDone } from "./highlight.ts";

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
  /** a real tool result body — collapses to an arrow line; plain info lines in the
   *  toolbody style (welcome, hints) don't */
  toolResult?: boolean;
  /** full untruncated tool input — the head line is clickable to reveal it */
  detail?: string;
  /** part of the startup block — rebuilt live when config changes, and dropped
   *  (with the block's lifetime) by the next refresh() */
  welcome?: boolean;
  /** tool result whose body is markdown (todo task lists) — expanded
   *  rendering goes through the markdown parser instead of plain lines */
  mdBody?: boolean;
  /** raw tool-call arguments; argsJson (the pretty-print) is deferred to first
   *  render/expand — pretty-printing every call in history at load was 416ms
   *  on a 4k-message session for data only an expanded head ever shows */
  argsRaw?: string;
  /** storage seq rendered as the leading [N] gutter marker. Settled items get
   *  it from loadItems; a live item gets it as soon as the turn assigns one
   *  (the user message's seq, a tool_end's seq) so the marker appears in-flight
   *  instead of only after refresh() rebuilds from history. */
  seq?: number;
  /** the second row of a multi-row logical unit (a tool's body behind its head):
   *  indents under the unit's marker instead of repeating the chip, so a tool
   *  pair shows ONE [N], not two. */
  markerCont?: boolean;
}

/**
 * TUI display caps — configurable via tuiCollapsedChars / tuiKeptChars. Set by
 * startTui from the loaded config; module-level because the render helpers that
 * read them predate the config plumbing.
 */
let COLLAPSED_TOOL_CHARS = 240;
let KEPT_TOOL_CHARS = 4_000;
export function setTuiCaps(collapsed: number, kept: number): void {
  COLLAPSED_TOOL_CHARS = collapsed;
  KEPT_TOOL_CHARS = kept;
}

/**
 * Cap a tool result's kept text at the TAIL, not the head. The most recent
 * output is what the model needs, so for an over-long result we keep the end
 * and note the dropped head — same direction the live streaming body already
 * keeps (`slice(-KEPT_TOOL_CHARS)`), so a body the user watched stream does not
 * snap to a disjoint prefix the moment it settles. Exported for testing.
 */
export function keepTail(text: string, cap: number): string {
  return text.length > cap ? `… (${text.length - cap} chars dropped)\n${text.slice(-cap)}` : text;
}

/**
 * Scrollbar on/off (config `tuiScrollbar`, default on). When off there is no
 * reserved column: buildRows wraps at full width and the mouse scrub is dead.
 */
let SCROLLBAR = true;
/** FOX_AGENT_FRAMEPROFILE=<file>: per-frame phase timings land there (perf work). */
const PROF = process.env.FOX_AGENT_FRAMEPROFILE ?? "";
let profMark = 0;
function profLine(line: string): void {
  try {
    appendFileSync(PROF, `${line}\n`);
  } catch {}
}

/** transcript rows moved per wheel notch / drag-edge tick (config `tuiScrollStep`). */
let SCROLL_STEP = 1;
let clearKeyRef: () => void = () => {}; // set in startTui: forces full repaint
/**
 * Re-arms the frame loop — set from inside startTui, exactly like clearKeyRef.
 * The loop's period is config `tuiFrameMs`, so a live change has to rebuild the
 * timer rather than wait for the next launch.
 */
let frameArmRef: ((ms: number) => void) | null = null;

/**
 * Transcript rows per wheel notch / drag-past-edge tick (config `tuiScrollStep`,
 * default 1). Clamped 1..40 the same way the config loader clamps it, because
 * this is reachable without going through the loader.
 */
export function setTuiScrollStep(n: number): void {
  SCROLL_STEP = Math.max(1, Math.min(40, Math.floor(n)));
  setPickerWheelStep(n); // pickers (/settings, /model, /sessions) scroll the same amount
}

/**
 * Verbose diagnostics (config `debug`, live via `/debug on|off`). The log is
 * always written for errors; this only widens what gets logged — slow frames —
 * and `/debug tail` reads the file back, so the flag needs no restart.
 */
let DEBUG_VERBOSE = false;
export function setDebug(on: boolean): void {
  DEBUG_VERBOSE = on;
}
export function debugVerbose(): boolean {
  return DEBUG_VERBOSE;
}

export function setTuiScrollbar(on: boolean): void {
  if (SCROLLBAR === on) return;
  SCROLLBAR = on;
  // the track column (or its absence) must repaint immediately: wrap width
  // changes too, so every cached row is stale
  clearKeyRef();
}

/**
 * Frame interval (config `tuiFrameMs`, default 16).
 *
 * The loop coalesces dirty work once per tick, so this trades wakeups against
 * repaint latency and nothing else. Clamped 8..250 the same way config loading
 * clamps it, because this is reachable without going through the loader.
 */
export function setTuiFrameMs(ms: number): void {
  frameArmRef?.(Math.max(8, Math.min(250, Math.floor(ms))));
}

// Live palette: resolves against the active theme on every access, so a
// `/theme` switch repaints on the next frame without a restart.
const C = liveTheme<keyof Theme>();
const SPIN = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
/**
 * Spinner frame set for the current theme. Braille dots by default; a theme's
 * `spinner` slot swaps in a custom glyph run (ASCII `-\|/`, etc.). Resolved per
 * access so a `/theme` switch takes effect on the next tick without a restart.
 */
function spinFrames(): string[] {
  // read the array from the theme directly — the liveTheme proxy types every
  // field as string, so C.spinner would come back string-typed
  const t = theme();
  return t.spinner && t.spinner.length ? t.spinner : SPIN;
}
/**
 * In-flight tool pairs (head + body) for the current turn, mutated by tool_start /
 * tool_output / tool_end and re-stamped by the spinner tick. Module-scoped (not
 * turn-scoped) so the frame loop's tickSpinner can animate the running heads.
 */
const liveTools = new Map<string, { head: Item; body: Item; text: string }>();
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



// Minted keys start above the seq-derived range: log items take their key
// from their storage seq (seq*4+slot), so keys are STABLE across refresh()
// and the line cache never goes stale. Minted keys (welcome, ephemeral,
// streaming) live in their own high range — sessions would need 268M messages
// before the ranges could touch.
const SEQ_KEY_SPACE = 0x40000000;
let keySeq = SEQ_KEY_SPACE;
const nk = () => ++keySeq;
const seqKey = (seq: number, slot: number) => seq * 4 + slot;

/**
 * Diff-and-touch, as a pure helper so it is unit-testable without reaching into
 * startTui's closure. Given the previous and current item list, return the keys
 * whose render signature CHANGED (and so must be re-rendered). A prior node is
 * append-only — its stored content never changes — so an unchanged node keeps
 * its cached rows; only a node whose kind/text/expand/policy moved is touched.
 * This replaces the old blanket "touch every item on refresh", which made each
 * rebuild O(history) re-wrap instead of O(nodes that changed).
 *
 * `sig` maps an item to a render signature; `sigs` is the caller-held map of
 * key -> signature, mutated in place so it stays in sync across rebuilds.
 */
export function diffTouchKeys<T>(prev: T[], curr: T[], key: (t: T) => number, sig: (t: T) => string, sigs: Map<number, string>): number[] {
  const changed: number[] = [];
  const prevKeys = new Set(prev.map(key));
  const seen = new Set<number>();
  for (const it of curr) {
    const k = key(it);
    seen.add(k);
    if (sigs.get(k) !== sig(it)) {
      changed.push(k);
      sigs.set(k, sig(it));
    }
  }
  // nodes that vanished (ctx hid them, session trimmed): drop their sigs so a
  // later same-key node is not mistaken for the old one
  for (const k of prevKeys) if (!seen.has(k)) sigs.delete(k);
  return changed;
}

/**
 * One-line "what actually ran" for a tool head: the meaningful field when the
 * args have an obvious one (cmd, path, pattern, url), else compacted JSON.
 */
export function argsSummary(args: string): string {
  const t = (args ?? "").trim();
  if (!t || t === "{}") return "";
  try {
    const a = JSON.parse(t);
    const v = a?.cmd ?? a?.path ?? a?.pattern ?? a?.file ?? a?.url ?? a?.command ?? a?.job ?? null;
    if (typeof v === "string" && v.trim()) return ` ${v.replace(/\s+/g, " ").slice(0, 200)}`;
  } catch {}
  return ` ${t.replace(/\s+/g, " ").slice(0, 200)}`;
}

/**
 * The full "what actually ran", whitespace-flattened and capped but NOT
 * truncated to the head-line width — the tool head is expandable, and the
 * expanded view may use the whole screen width.
 *
 * A single-field args object (cmd/path/pattern) is shown whole; a call that
 * also carries content (write's new text, edit's old/new strings, task's
 * prompt) gets those fields appended — the expanded view is the only place
 * the call's actual payload is visible, so showing only the path there would
 * leave the content permanently invisible.
 */
export function argsFull(args: string): string {
  const t = (args ?? "").trim();
  if (!t || t === "{}") return "";
  try {
    const a = JSON.parse(t);
    const v = a?.cmd ?? a?.path ?? a?.pattern ?? a?.file ?? a?.url ?? a?.command ?? a?.job ?? null;
    if (typeof v !== "string" || !v.trim()) return t.replace(/\s+/g, " ").slice(0, 4_000);
    const extra: string[] = [];
    for (const k of ["old_string", "new_string", "content", "text", "prompt", "task", "description", "ids", "ops"]) {
      const x = a?.[k];
      if (typeof x === "string" && x.trim()) extra.push(`${k}: ${x.replace(/\s+/g, " ").slice(0, 2_000)}`);
      else if (x !== undefined) extra.push(`${k}: ${JSON.stringify(x).replace(/\s+/g, " ").slice(0, 2_000)}`);
    }
    return [v.replace(/\s+/g, " ").slice(0, 4_000), ...extra].join("\n  ");
  } catch {}
  return t.replace(/\s+/g, " ").slice(0, 4_000);
}

/**
 * The tool call's arguments as pretty-printed JSON — what the expandable head
 * reveals on click. This is the model's actual call verbatim (2-space
 * indented, key order preserved), not a reconstruction: auditing "what did it
 * send" wants ground truth. Unparseable args degrade to the raw string.
 */
export function argsJson(args: string): string {
  const t = (args ?? "").trim();
  if (!t || t === "{}") return "{}";
  try {
    return JSON.stringify(JSON.parse(t), null, 2).slice(0, 8_000);
  } catch {}
  return t.slice(0, 8_000);
}

export async function startTui(state: HarnessState, applyConfig?: () => { warnings: string[] }) {
  const term: Term = openTerm();
  const screen = new Screen(term);
  // ---- planes: one per screen region, composited into the grid each paint ----
  // z is the stack order; a region stamps complete content into its plane and
  // composite() folds them in bottom-up. Regions no longer clear each other's
  // output — the old prev-extent wipe choreography (and its stale-paint bugs:
  // queue drain leaving black bands, multi-line submit blanks, modal-close
  // re-derives) is deleted with it.
  const P = {
    transcript: screen.createPlane("transcript", 0),
    dock: screen.createPlane("dock", 10),
    floats: screen.createPlane("floats", 20),
    overlay: screen.createPlane("overlay", 30),
    status: screen.createPlane("status", 40),
  };
  // plugin regions: resolved per statsRev (same live-swap cadence as
  // statusBarSlots — /reload bumps it), each in a plane clipped to the rect
  // the region declares, so a plugin physically cannot paint outside its
  // region. Dropped regions just stop being created; their plane is removed
  // and the screen underneath shows through at the next composite.
  type PluginRegion = { key: string; z: number; rect: [number, number, number, number]; paint: (p: TuiRegionPlane) => boolean | void; plane: Plane; owner: string };
  let pluginRegionsRev = -1;
  let pluginRegions: PluginRegion[] = [];
  const regionWarned = new Set<string>();
  function resolvePluginRegions(): PluginRegion[] {
    if (pluginRegionsRev === statsRev) return pluginRegions;
    pluginRegionsRev = statsRev;
    pluginRegions = [];
    for (const p of activePlugins()) {
      for (const [name, r] of Object.entries(p.regions ?? {})) {
        const key = `${p.name}/${name}`;
        const plane = screen.createPlane(`plugin:${key}`, r.z);
        plane.clip = r.rect;
        pluginRegions.push({ key, z: r.z, rect: r.rect, paint: r.paint, plane, owner: p.name });
      }
    }
    // drop planes whose region vanished this reload
    const live = new Set(pluginRegions.map((r) => `plugin:${r.key}`));
    for (const name of screen.planeNames()) if (name.startsWith("plugin:") && !live.has(name)) screen.dropPlane(name);
    return pluginRegions;
  }
  function paintPluginRegions(): void {
    for (const r of resolvePluginRegions()) {
      r.plane.clearRows(0, H);
      let ok = false;
      try {
        ok = r.paint({
          text: (x: number, y: number, str: string, style: Style) => void r.plane.text(x, y, str, screen.sgr(style)),
          fillRow: (y: number, x0: number, x1: number, style: Style) => r.plane.fillRow(y, x0, x1, screen.sgr(style)),
          restyle: (y: number, x0: number, x1: number, bg: string) => r.plane.restyle(y, x0, x1, bg),
          w: W,
          h: H,
        } satisfies TuiRegionPlane) !== false;
      } catch (e) {
        if (!regionWarned.has(r.key)) {
          regionWarned.add(r.key);
          push("error", `region '${r.key}' (${r.owner}) threw: ${(e as Error)?.message ?? e}`, { ephemeral: true });
        }
      }
      if (!ok) r.plane.clearRows(0, H); // hid this frame: nothing composites
    }
  }
  let W = 0;
  let H = 0;

  // ---- state ----
  let items: Item[] = [];
  let streamText: string | null = null;
  /**
   * The seq the in-flight streaming tail WILL get once its assistant node is
   * appended — predicted as last-persisted-seq + 1 (appendMessage assigns
   * MAX(seq)+1). Lets the streaming tail show its [N] marker live, matching the
   * settled item it becomes. -1 = not streaming / no prediction.
   */
  let streamSeq = -1;
  /**
   * Whether the current step's assistant marker has been spent.
   *
   * A reply is flushed into a SEPARATE md item at every tool boundary, so one
   * step can produce several fragments. The store holds ONE assistant node per
   * step, so the live view must too: the first fragment wears the chip, later
   * fragments of the same step are continuations (no chip). Without this every
   * fragment wore the same [N] — the 'repeated marker' report — and the chips
   * collapsed to one only when refresh() rebuilt from the store at end of turn.
   */
  let stepMarkerUsed = false;
  let buf: Ch[] = []; // input buffer; lit chars are literal newlines
  let cur = 0; // cursor index into buf
  let busy = false;
  let frameIdx = 0;
  let startedAt = 0;
  let flashMsg = "";
  let flashUntil = 0;
  /** last-seen running tool name for the busy label ("thinking — exec") */
  let busyMsg: string | null = null;
  let hintSel = 0;
  let stick = true;
  let scrollTop = 0;
  let ac: AbortController | null = null;
  // exit is cooperative: gracefulExit resolves run()'s promise so startTui
  // returns normally and the caller can clean up tools
  let exiting = false;
  let exitCode = 0;
  /** the read-only viewer's live-status poll (created in run(), cleared here) */
  let mirrorTimer: ReturnType<typeof setInterval> | null = null;
  let finish: (() => void) | null = null;
  const queued: { raw: string; lit: boolean }[] = [];
  /**
   * The think item the current reasoning stream is writing into, or null.
   *
   * Reasoning deltas have no step id, so without this they merged into
   * whatever think item happened to be last — including one from before a
   * tool ran, or a collapsed one replayed from a previous turn. The seal
   * breaks exactly where a step breaks: any tool event or steered line clears
   * it, so thinking between tool calls always starts its own visible block.
   */
  let liveThink: Item | null = null;
  const expandedRefs = new Set<number>(); // think nodes expanded across refreshes
  /**
   * Persistent expand mode from ctrl+t: true = "unfold all" (new thinking and
   * tool results arrive expanded), false = "fold all" (they arrive collapsed),
   * null = untouched defaults. Without this, ctrl+t only mutated the items
   * that existed at press time — fold-all, then every new tool body expanded
   * itself again and unfold-all left new thinking collapsed, so the toggle
   * appeared to keep losing.
   */
  let expandMode: boolean | null = null;
  // provider-reported usage for the CURRENT turn's last step (real numbers,
  // not estimates) — the only token figure the status bar is willing to show
  let lastPromptTokens = 0;
  /**
   * Session-cumulative cache hit for the status bar, held in memory so a frame
   * costs no query. Seeded from the sessions *index* row (a primary-key lookup
   * — it never opens the session file) the first time a status is stamped for
   * this session; invalidated rather than incremented when a call lands, so the
   * next stamp reads the total `recordUsage` has already written instead of
   * guessing whether it has.
   */
  let hitTotals: { id: string; prompt: number; cached: number } | null = null;
  function cacheHit(): { prompt: number; cached: number } {
    if (!state.sessionId) return { prompt: 0, cached: 0 };
    if (!hitTotals || hitTotals.id !== state.sessionId) {
      const row = getSession(state.sessionId);
      hitTotals = { id: state.sessionId, prompt: row?.prompt_tokens ?? 0, cached: row?.cached_tokens ?? 0 };
    }
    return hitTotals;
  }
  /** a read-only viewer's mirror of the owner's live status (see the poll in
   *  run()); local `busy` stays false so the viewer can still type/queue */
  let remoteBusy = false;
  /** what the status bar + spinner + title treat as "a turn is running" — the
   *  owner's own turn locally, or the mirrored owner turn in a viewer */
  const displayBusy = () => busy || remoteBusy;

  const revs = new Map<number, number>();
  const touch = (k: number) => revs.set(k, (revs.get(k) ?? 0) + 1);
  /**
   * Render-signature of a settled item, keyed by its stable `k`. Used by
   * refresh() to touch ONLY the nodes that actually changed, so a rebuild does
   * not re-render the whole history. Prior nodes are append-only — their stored
   * content never changes — so a cached row stays valid until its text, kind, or
   * expand/policy inputs move. Without this, refresh() touched every item and
   * the stable-key cache was defeated (O(history) re-wrap each rebuild).
   */
  const itemSigs = new Map<number, string>();
  const itemSig = (it: Item): string => `${it.kind}|${it.text}|${it.expanded ? 1 : 0}|${it.mdBody ? 1 : 0}|${it.detail ?? ""}`;
  let dirty = true;
  /** spinner tick landed: only the status region needs re-deriving */
  let statusOnly = false;
  /**
   * Short-interval paint scheduler: the event-driven half of the frame loop.
   * markDirty used to only raise a flag and wait for the 33ms interval, so a
   * scroll burst's last ticks (a direction change worst of all) idled up to
   * 57ms before showing. Now dirty work lands within ~8ms of the event, and
   * the schedule itself is the burst coalescer — N ticks inside the window
   * still produce one paint at the final offset. The setInterval remains for
   * spinner pacing and as a missed-event safety net.
   */
  let paintTimer: ReturnType<typeof setTimeout> | null = null;
  // set from startTui once frameTick exists (same pattern as clearKeyRef)
  let tickRef: (() => void) | null = null;
  const schedulePaint = (ms = 8) => {
    if (paintTimer) return;
    paintTimer = setTimeout(() => {
      paintTimer = null;
      // a frame scheduled before exit must not paint after the alt screen is
      // torn down — that write lands on the primary screen and leaves the
      // status bar behind (the "quit but the bottom bar is still there" bug)
      if (exiting) return;
      tickRef?.();
    }, ms);
    paintTimer.unref?.();
  };
  const markDirty = () => {
    dirty = true;
    schedulePaint();
  };
  // a Shiki block finished tokenizing off-thread: cached-flat rows must repaint
  // in their grammar colors, so re-run the frame on the version bump
  setHighlightDone(() => markDirty());

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
  /** last pointer position seen (any button/wheel event) — keyboard page keys,
   *  which carry no position of their own, route by where the pointer sits */
  let lastMouse = { x: 0, y: 0 };
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
  let sessAllDirs = false; // session overlay scope: this directory vs everywhere

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
  /**
   * The question wizard's live state is owned by ./wizard.ts; app.ts hosts the
   * module (injects the closures it needs over this scope) and reads the state
   * back through getPrompt(). While a wizard is active the input dock is its
   * answer field — the step label replaces the `❯` prefix, selects draw their
   * option list where the command hints would float, and `secret` steps paint
   * bullets. One hosting implementation for both consumers: slash commands
   * (a PromptRequest, see commands.ts) and plugin tools (the UiBridge, see
   * core/ui.ts).
   */
  const wizard: Wizard = createWizard({
    getBuf: () => ({ buf, cur, inputRev }),
    setBuf: (b, c) => {
      buf = b as Ch[];
      cur = c;
      inputRev++;
    },
    chsSet: (...a) => chsSet(...a),
    display: (...a) => display(...a),
    insertText: (...a) => insertText(...a),
    width: () => W,
    dockTop: () => dockFloats().top,
    scrollStep: () => SCROLL_STEP,
    wrapText: (...a) => wrapText(...a),
    flash: (...a) => flash(...a),
    markDirty: (...a) => markDirty(...a),
    run: (answers) => runPromptHandler(answers),
    reportError: (...a) => reportError(...a),
  });
  /** The command's run handler, captured when startPrompt opens the wizard. */
  let promptHandler: ((a: Record<string, string>) => unknown) | null = null;
  function runPromptHandler(answers: Record<string, string>): unknown {
    const h = promptHandler;
    promptHandler = null;
    return h ? h(answers) : undefined;
  }
  const hasSel = () => selA !== null && selB !== null && !(selA.row === selB.row && selA.col === selB.col);
  function clearSel() {
    if (selA || selB) {
      selA = null;
      selB = null;
      markDirty();
    }
  }

  // ---- item mutations ----
  function push(kind: ItemKind, text: string, opts?: { ref?: number; seq?: number; expanded?: boolean; ephemeral?: boolean; toolResult?: boolean; detail?: string; welcome?: boolean; mdBody?: boolean; markerCont?: boolean }) {
    const it: Item = { k: nk(), kind, text, ref: opts?.ref, seq: opts?.seq, expanded: opts?.expanded, ephemeral: opts?.ephemeral, toolResult: opts?.toolResult, detail: opts?.detail, welcome: opts?.welcome, mdBody: opts?.mdBody, markerCont: opts?.markerCont };
    items.push(it);
    touch(it.k);
    markDirty();
    return it;
  }
  /**
   * The current step's assistant marker, spent on its first fragment.
   *
   * A step's reply is flushed into a SEPARATE md item at every tool boundary,
   * but the store holds ONE assistant node per step — so only the first
   * fragment wears the [N] chip and the rest are continuations (no chip).
   * Reset per step by the user/assistant events (see stepMarkerUsed).
   */
  function flushStepMarker(): { seq?: number; markerCont?: boolean } {
    if (stepMarkerUsed) return { markerCont: true };
    stepMarkerUsed = true;
    return streamSeq > 0 ? { seq: streamSeq } : {};
  }
  function appendToLastThink(delta: string) {
    // Sealed by tool boundaries: thinking belongs to the step that produced
    // it, so a new stream never merges into a think item from before a tool
    // ran (or from a previous turn's replayed transcript). liveThink is that
    // seal — set on creation, cleared by any tool/steer event (see runAgent).
    if (liveThink) {
      liveThink.text += delta;
      touch(liveThink.k);
    } else {
      liveThink = push("think", delta, { expanded: expandMode ?? false });
      // a new think block will persist BEFORE the streaming text (turn.ts appends
      // reasoning first), so the reply's seq is one higher than predicted — bump it
      if (streamSeq > 0) streamSeq++;
    }
    markDirty();
  }

  function refresh() {
    const prev = items;
    // Preserve the items loadItems() cannot reproduce, in their positions: the
    // welcome block (prepended) and the live tail (in-flight think block,
    // running tool head+body pairs, subagent progress lines, ephemeral notices).
    // A rebuild must NOT drop these — they are the overlay the user is watching
    // (ESC mid-turn, a ctx op mid-turn). Only stored messages (which carry a
    // storage `seq`) are rebuilt from the store; the rest keep their minted
    // keys, cache entries, and slots.
    // A settled tool BODY carries `ref` (its head's seq), not `seq` — so `ref`
    // items are stored too, NOT live. Excluding them keeps each tool's head and
    // body together (the toolbody-split fix).
    const head = prev.filter((i) => i.welcome);
    const liveTail = prev.filter((i) => i.seq === undefined && i.ref === undefined && !i.welcome);
    items = [...head, ...loadItems(), ...liveTail]; // loadItems restores expandedRefs
    // log items keep stable seq-derived keys, so their cache entries stay
    // warm across rebuilds (the whole point); minted-key items (welcome,
    // ephemeral, streaming) die here — sweep their entries once per rebuild
    // rather than paying an eviction scan on every cache insert every frame
    if (lineCache.size > items.length) {
      const live = new Set(items.map((i) => i.k));
      for (const k of lineCache.keys()) if (!live.has(k)) lineCache.delete(k);
    }
    // Diff-and-touch: bump the revision ONLY of nodes whose render signature
    // changed, so a rebuild re-renders just the tail that moved — not the whole
    // history. Prior nodes are append-only (stored content never changes), so
    // an unchanged node keeps its cached rows; the previous blanket
    // `for (it of items) touch(it.k)` invalidated everything and made refresh()
    // O(history) re-wrap each time. The pure helper is unit-testable (see
    // test/difftouch.test.ts).
    for (const k of diffTouchKeys(prev, items, (i) => i.k, itemSig, itemSigs)) touch(k);
    // the rebuild drops the startup block with everything else — its lifetime
    // ends here, so a later refreshWelcome() must not resurrect it
    welcomed = false;
    statsRev++;
    markDirty();
  }

  /**
   * Force a re-render of the items a context op touched. A ctx delete/replace
   * changes what a node shows (hidden, or new content), so its cached rows are
   * stale even though the underlying message row is append-only — the VIEW
   * changed. Callers that know a set of seqs changed (ctx ops, compaction)
   * touchSeq() then refresh(), so only those nodes re-render, not the history.
   */
  function touchSeq(seq: number): void {
    // a seq maps to up to 4 slots (seq*4+slot); a tool node has a head (1) and
    // body (2). Touch every slot the seq could own so the pair re-renders.
    for (let slot = 0; slot < 4; slot++) {
      const k = seqKey(seq, slot);
      if (itemSigs.has(k)) {
        touch(k);
        itemSigs.delete(k); // force the sig to mismatch on next refresh -> re-render
      }
    }
  }

  function loadItems(): Item[] {
    const out: Item[] = [];
    if (!state.sessionId) return out; // pending session: nothing stored yet
    // The FULL message log, not the projected view. The view (compaction,
    // ctx surgery) is what the MODEL sees — the transcript is the session's
    // history, and hiding or truncating earlier stuff just because the model
    // no longer carries it made the top of the transcript drift to whatever
    // happened to survive first. Storage is append-only; display it all.
    // Lite columns: the transcript never displays media/tokens/error, and
    // dragging stored base64 blobs through the projection showed up as a
    // large slice of resume time on media-heavy sessions.
    const msgs = allMessagesLite(state.sessionId);
    const callLabel = new Map<string, string>();
    const callRaw = new Map<string, string>();
    const callName = new Map<string, string>();
    for (const m of msgs) {
      if (m.role === "assistant" && m.tool_calls) {
        try {
          for (const c of JSON.parse(m.tool_calls) as { id: string; name: string; arguments: string }[]) {
            callLabel.set(c.id, `${c.name}${argsSummary(c.arguments ?? "")}`);
            // the expanded view shows the FULL JSON call, pretty-printed —
            // not a reconstructed summary. What the model actually sent is
            // the ground truth, and it is what you want when auditing.
            // argsJson runs lazily (fillDetail) — only a head someone actually
            // expands (or that must be width-tested) ever pays for it.
            callRaw.set(c.id, c.arguments ?? "");
            callName.set(c.id, c.name);
          }
        } catch {}
      }
    }
    for (const m of msgs) {
      // the [N] marker is no longer baked into the text — it rides `it.seq` and
      // renders as a leading gutter chip (see itemRows/withMarker), so it can be
      // colored, aligned, and clicked. Text here is the bare content.
      if (m.role === "user") out.push({ k: seqKey(m.seq, 0), kind: "user", seq: m.seq, text: `❯ ${m.content}` });
      else if (m.role === "tool") {
        // todo bodies are markdown task lists — rendered as md, always
        // visible (a task list hidden behind a click is useless). ctx bodies
        // stay expanded too: the tool edits the agent's own context, and its
        // per-op report (hidden/replaced/restored) is the audit trail for what
        // the model just did to its view — burying it behind a fold hides the
        // one record of a lossy operation.
        const name = callName.get(m.tool_call_id ?? "");
        const isTodo = name === "todo";
        const isCtx = name === "ctx";
        const pinned = isTodo || isCtx;
        out.push({ k: seqKey(m.seq, 1), kind: "toolhead", seq: m.seq, text: `» ${callLabel.get(m.tool_call_id ?? "") ?? "tool"}`, argsRaw: callRaw.get(m.tool_call_id ?? "") });
        // raw text — collapsed/expanded rendering lives in itemRows
        out.push({
          k: seqKey(m.seq, 2),
          kind: "toolbody",
          seq: m.seq,
          markerCont: true, // indents under the head's [N]; a tool pair shows ONE chip
          text: keepTail(m.content, KEPT_TOOL_CHARS * 4),
          ref: m.seq,
          toolResult: true,
          mdBody: isTodo || undefined,
          // collapsed by default, but an explicit expand survives refresh()
          expanded: pinned || expandedRefs.has(m.seq),
        });
      } else if (m.role === "think")
        out.push({ k: seqKey(m.seq, 0), kind: "think", seq: m.seq, text: m.content, ref: m.seq, expanded: expandedRefs.has(m.seq) });
      else out.push({ k: seqKey(m.seq, 0), kind: "md", seq: m.seq, text: m.content || "" });
    }
    return out;
  }

  // ---- dispatch ----
  async function runShell(cmd: string) {
    setBusy(true);
    push("toolhead", `$ ${cmd}`);
    try {
      // detached + group kill, same as the exec tool: proc.kill(9) leaves
      // grandchildren (pipelines, background jobs) running
      const proc = Bun.spawn([shellPath(), "-c", cmd], {
        cwd: state.cwd,
        stdout: "pipe",
        stderr: "pipe",
        stdin: "ignore",
        detached: true,
        env: childEnv(),
      });
      const kill: { cancel: (() => void) | null } = { cancel: null };
      const timer = setTimeout(() => {
        kill.cancel = killTree(proc.pid);
      }, 120_000);
      const [out, err] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
      clearTimeout(timer);
      const code = await proc.exited;
      kill.cancel?.();
      const merged = (out + (err ? (out ? "\n[stderr]\n" : "") + err : "")).trimEnd() || "(no output)";
      push("info", `${merged}\nexit ${code}`);
    } catch (e) {
      push("error", `shell error: ${(e as Error).message}`);
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
    // short command output floats above the dock and dies on the next key —
    // it never pushes the transcript up (/todo, /usage, switch confirmations)
    if (res.output) setCmdOut(res.output);
    // prompt-template commands (/init) ARE a turn: sent literally (never
    // re-interpreted as !shell or /slash), queued when a turn is running —
    // the same lane a user's typed message takes mid-turn
    if (res.submit) {
      if (busy) {
        queued.push({ raw: res.submit, lit: true });
        markDirty();
      } else {
        void runAgent(res.submit);
      }
      return; // a submitting command has no other effect to apply
    }
    if (res.newSessionId) switchSession(res.newSessionId);
    if (res.welcome) {
      // /new is a fresh `fox` launch: reload config (model/theme/caps) and
      // re-point the new session at the configured model before the banner prints
      applyRuntimeConfig();
      welcomeBlock();
    }
    const doReload = () => {
      // plugins re-import on the next turn's buildRegistry — /reload exists so
      // editing a plugin file takes effect without restarting fox-agent
      void import("../plugins/load.ts").then((m) => m.reloadPlugins()).catch(() => {});
      applyRuntimeConfig();
      // the "reloaded" state is transient and self-describing — float it in the
      // command-output plane like /todo so it dies on the next keypress and
      // never enters the transcript
      setCmdOut(`reloaded config + plugins — model ${state.provider.model} · theme ${themeName()}`);
    };
    // a result carrying both runs the work first and reloads after: /plugins
    // on/off writes the config file in its task, and reloading before that
    // write lands would re-read the stale file. (Only /plugins pairs them.)
    if (res.task) {
      const task = res.task;
      const reload = res.reload;
      void (async () => {
        try {
          setCmdOut(await task());
        } catch (e) {
          push("error", `error: ${(e as Error).message ?? e}`);
        }
        if (reload) doReload();
      })();
    } else if (res.reload) doReload();
    if (res.picker) openPicker(res.picker);
    // a wizard's run may itself answer with another wizard — chain it
    if (res.prompt) startPrompt(res.prompt);
    // a command may have changed provider/model (/login, /model) — the status
    // bar caches per statsRev, and an idle session never re-polls on its own.
    // Same for the startup block: it is pushed once and would otherwise freeze
    // the pre-command provider, key state and model on screen.
    statsRev++;
    // a command that rewrote the stored log (/prune compact) must be followed
    // by a replay, or the screen keeps showing seqs/rows that no longer exist
    if (res.storeChanged) refresh();
    refreshWelcome();
    markDirty();
    if (res.exit) gracefulExit(0);
  }

  type CommandResultLike = ReturnType<typeof runSlashCommand>;

  function runSlash(t: string) {
    if (t === "/help" || t === "/?") return setCmdOut(helpText());
    applyResult(runSlashCommand(t, state));
  }

  // ---- prompt wizard hosting (slash commands + plugin UiBridge) ----
  // The interaction logic lives in ./wizard.ts; these just delegate.
  /** The wizard's live state, read by paint/dock/key routing. Delegates to the module. */
  const getPrompt = (): PromptState | null => wizard.state();
  /** Visible option count for the active select step (floats signature). */
  const wizardOptionsCount = (): number => wizard.rows().rows.filter((r) => r.opt >= 0).length;
  function startPrompt(req: PromptRequest) {
    // Capture the command's run handler; the wizard calls it via deps.run on finish.
    promptHandler = (answers) => {
      try {
        applyResult(req.run(answers, state));
      } catch (e) {
        reportError(`prompt run failed: ${(e as Error).message ?? e}`, e);
      }
    };
    wizard.start({ title: req.title, steps: req.steps, run: (a) => a });
  }

  /** The UiBridge handed to every turn, so plugin tools can ask questions. */
  const uiBridge: UiBridge = {
    select: (title, options, opts) =>
      wizard
        .ask(title, [
          {
            key: "v",
            label: title,
            kind: "select",
            options: options.map((o) => ({ value: o.value, label: o.label ?? o.value })),
            initial: opts?.initial,
          },
        ])
        .then((a) => a?.v),
    input: (title, opts) =>
      wizard
        .ask(title, [
          {
            key: "v",
            label: title,
            kind: "text",
            initial: opts?.initial,
            hint: opts?.hint,
            secret: opts?.secret,
            allowEmpty: opts?.allowEmpty,
          },
        ])
        .then((a) => a?.v),
    wizard: (title, steps) => wizard.ask(title, steps),
  };

  /**
   * (Re)load config and apply everything it controls — caps, theme, warnings.
   * Boot, /new and /reload all run this; a fresh `fox` launch and a /new
   * mid-session see the same world.
   */
  function applyRuntimeConfig() {
    if (!applyConfig) return;
    try {
      const r = applyConfig();
      setTuiCaps(state.config?.tuiCollapsedChars ?? 240, state.config?.tuiKeptChars ?? 4_000);
      setTuiScrollbar(state.config?.tuiScrollbar ?? true);
      setTuiScrollStep(state.config?.tuiScrollStep ?? 2);
      setDebug(!!state.config?.debug);
      const wantTheme = state.config?.theme ?? "default";
      // plugin themes register on first buildRegistry, so an unknown name here
      // may just be a plugin theme that has not loaded yet — fall back silently
      if (wantTheme !== themeName()) setTheme(wantTheme);
      for (const w of r.warnings) push("info", `! ${w}`);
    } catch (e) {
      // a broken config was always a one-line exit; keep it that way
      term.end();
      console.error(`fox-agent: ${(e as Error)?.message ?? e}`);
      process.exit(1);
    }
  }

  /**
   * The startup/welcome block. Pushed AFTER refresh() — replay replaces the
   * item list, so anything pushed before it never existed (the banner vanished
   * that way once). Runs at boot and on /new.
   */
  let welcomed = false;
  let banner: string | null = null;
  function welcomeBlock() {
    welcomed = true;
    refreshWelcome();
  }

  /**
   * Rebuild the startup block in place against the LIVE provider and config.
   * The block is pushed once and then frozen, so a /login that lands a key or
   * a /model switch left its own contradiction on screen ("no API key" above
   * a working session). Rebuilding on every command result keeps it honest
   * for exactly its lifetime: refresh() ends that lifetime by dropping the
   * items and disarming this (see welcomed), and the tagline is picked once
   * so the banner does not re-roll under you.
   */
  function refreshWelcome() {
    if (!welcomed) return;
    const rest = items.filter((it) => !it.welcome);
    if (!banner) banner = BANNERS[Math.floor(Math.random() * BANNERS.length)];
    const head: Item[] = [];
    const w = (kind: ItemKind, text: string) => {
      const it: Item = { k: nk(), kind, text, welcome: true };
      touch(it.k);
      head.push(it);
    };
    w("info", `fox-agent v${VERSION} — ${banner}`);
    // one item per BLOCK, not per line: itemRows wraps `\n`s as real new lines
    // (not markdown paragraphs), and buildRows only blanks BETWEEN items — so
    // the startup block paints without the blank line between every row
    const info = lookupModel(state.provider.model);
    w(
      "toolbody",
      [
        `working directory: ${state.cwd}`,
        state.sessionId
          ? `session ${state.sessionId} · ${state.cwd}`
          : "session new — created on first message",
        ...(state.provider.apiKey
          ? []
          : ["no API key configured — /login opens the setup wizard (saved to ~/.config/fox-agent/config.toml)"]),
        `model ${state.provider.model} (${Math.round(info.contextWindow / 1000)}k ctx) · ${providerDisplayName(state)}` +
          (state.provider.baseUrl && !/api\.openai\.com/.test(state.provider.baseUrl) ? ` · ${state.provider.baseUrl}` : ""),
        "enter send · \\ newline · ! shell · / commands · esc interrupt · ctrl+t expand all · drag/dbl-click select",
        "/login setup · /model switch · /sessions resume · /usage tokens · /prune context · /upgrade update · /help all",
      ].join("\n"),
    );
    items = [...head, ...rest];
    statsRev++;
    markDirty();
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
  /**
   * Take the session lock, or degrade to a read-only viewer when another live
   * process (tui/acp/a2a) already holds it — see src/store/lock.ts. Called after
   * `refresh()`, so the note lands on top of the replayed transcript.
   */
  function attachLock(id: string) {
    const holder = acquireLock(id, "tui");
    state.readOnly = !!holder;
    if (holder) {
      statsRev++;
      // the state it describes is transient (the other holder may close at any
      // moment) — float it in the command-output plane like /todo so one
      // keypress dismisses it and it never enters the transcript
      setCmdOut(`session ${id} is open in ${holder.kind} (pid ${holder.pid}) — read-only view: drafting works, /todo /sessions /usage /help work, but nothing sends or writes`);
    }
  }

  function switchSession(id: string) {
    if (id === state.sessionId) return;
    if (busy) {
      // a running turn still writes to the old session's store handle and its
      // events are mid-flight — unpinning/releasing here would orphan it
      flash("busy — esc interrupts first");
      return;
    }
    if (state.sessionId) {
      // the old session's resources belong to it — onSessionEnd lets every plugin
      // release what it holds (the bundled pty plugin kills its tmux session here),
      // and exec jobs die with the session that started them
      void import("../plugins/load.ts").then((m) => m.fireSessionEnd(state.sessionId, "switch")).catch(() => {});
      void import("../tools/exec.ts").then((m) => m.killExecJobs(state.sessionId)).catch(() => {});
      void import("../tools/task.ts").then((m) => m.killTasks(state.sessionId)).catch(() => {});
      unpinSession(state.sessionId);
      releaseLock(state.sessionId);
    }
    state.pendingSession = false;
    state.readOnly = false;
    state.sessionId = id;
    pinSession(id);
    expandedRefs.clear(); // refs are per-session seqs; carrying them over expands unrelated nodes
    expandMode = null; // likewise the ctrl+t fold direction — the new session starts on defaults
    // per-session token state, same reasoning: statusText() prefers the live
    // figure over the persisted one, so a stale one would override the new
    // session's stored last report until its first call lands
    lastPromptTokens = 0;
    hitTotals = null;
    refresh();
    attachLock(id);
  }

  /** Build and show the session overlay. */
  function openPicker(req: PickerRequest) {
    if (req.kind !== "sessions") return;
    sessAllDirs = false;
    overlay = new Picker(currentSessionRows(), {
      title: "sessions — most recently used first",
      // a read-only viewer may create and fork: both write to a NEW session,
      // never the one locked by the owner — after the switch this TUI owns the
      // target and sheds read-only (switchSession -> attachLock). Delete stays
      // owner-only: removing the session another process is live in is its call.
      allowNew: true,
      allowDelete: !state.readOnly,
      allowFork: true,
      allowAll: true,
    });
    markDirty();
  }

  /**
   * Withdraw the most recent waiting message back into the editor — no
   * selector. Queued next-turn messages first (the back off the queue), then
   * parked steers (ctrl+s), which withdrawSteer pulls out of the turn loop
   * before their step boundary arrives. Withdrawing only reverts to undefined
   * when there is nothing left, or the steer already drained into the turn.
   */
  function withdrawLast() {
    const last = queued.pop();
    if (last) {
      chsSet(last.raw);
      markDirty();
      return flash("withdrawn — enter resends, esc drops");
    }
    if (state.sessionId) {
      const s = withdrawSteer(state.sessionId);
      if (s !== undefined) {
        chsSet(s);
        markDirty();
        return flash("steering withdrawn — enter resends, esc drops");
      }
    }
    return flash("queue is empty");
  }

  function currentSessionRows(): PickerRow[] {
    const scope = sessAllDirs ? {} : { cwd: process.cwd() };
    return sessionRows(
      sessionList({ currentId: state.sessionId, limit: state.config?.sessionListLimit, ...scope }),
      relTime,
      sessAllDirs,
    );
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
    let action: PickerAction | null = null;
    if (k.type === "named" && (k.name === "wheelup" || k.name === "wheeldown")) {
      // tuiScrollStep rows per notch, same repeat as the standalone picker;
      // an action (delete confirm etc.) ends the repeat early
      for (let i = 0; i < SCROLL_STEP && !action; i++) {
        action = overlay.key({ name: k.name === "wheelup" ? "up" : "down" });
      }
    } else if (k.type === "char") action = overlay.key({ ch: k.ch });
    else action = overlay.key({ name: k.name, ctrl: k.ctrl });
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
      case "all":
        sessAllDirs = !sessAllDirs;
        overlay.opts.title = sessAllDirs ? "sessions — all directories" : "sessions — most recently used first";
        overlay.setRows(currentSessionRows());
        break;
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
    push("error", `error: ${short} · log: ${debugLogPath()}`);
  }

  async function runAgent(raw: string) {
    // the pending session becomes real exactly here — first message, not before
    if (!state.sessionId) {
      const s = createSession(state.cwd, state.provider.model);
      state.sessionId = s.id;
      state.pendingSession = false;
      pinSession(s.id);
      push("toolbody", `session ${s.id} · ${state.cwd}`);
    }
    setBusy(true);
    const userItem = push("user", `❯ ${raw}`);
    ac = new AbortController();
    let md = "";
    liveTools.clear();
    // id → one-line label ("exec echo hi"), so in-flight and settled heads both
    // say what actually ran, not just the tool's name
    const callLabels = new Map<string, string>();
    // id → full arguments, so the in-flight head's expandable input shows the
    // same content as the settled one (tool_start carries the full args now)
    const callArgs = new Map<string, string>();
    // a new turn seals the previous stream: its first reasoning delta must not
    // merge into a replayed think item from history (see liveThink)
    liveThink = null;
    // session label → its one live progress line (child_tool dedupe)
    const childItems = new Map<string, { item: Item; count: number; last: string }>();
    try {
      for await (const ev of runTurn(state.sessionId, state.provider, raw, ac.signal, state.config, uiBridge)) {
        if (ev.type === "user") {
          // the turn persisted the user message — stamp its seq on the in-flight
          // line so the [N] marker appears now, not after the turn settles
          userItem.seq = ev.seq;
          // the reply streaming in now will be the NEXT persisted seq — predict it
          // so the streaming tail shows its marker live too (refined when the
          // assistant node actually lands, in case thinking took a slot first)
          streamSeq = ev.seq + 1;
          stepMarkerUsed = false; // a new turn's first assistant fragment wears the chip
          touch(userItem.k);
          markDirty();
        } else if (ev.type === "assistant") {
          // the assistant node landed with its REAL seq — correct the streaming
          // tail's prediction (which guessed ev.seq+1 and drifted when a think
          // block or an earlier step took a slot). From here the marker and its
          // click width are exact, not estimated.
          // It also opens the NEXT step: the reply after a tool call is a new
          // assistant node, so the marker budget resets here.
          if (streamSeq !== ev.seq) {
            streamSeq = ev.seq;
            markDirty();
          }
          stepMarkerUsed = false;
        } else if (ev.type === "reasoning") {
          appendToLastThink(ev.delta);
          publishLive(); // think deltas markDirty anyway; piggyback the status
        } else if (ev.type === "text") {
          md += ev.delta;
          if (streamText !== md) {
            streamText = md;
            publishLive(); // viewers mirror the streaming text
            markDirty();
          }
        } else if (ev.type === "usage") {
          lastPromptTokens = ev.prompt_tokens; // provider-reported context size
          hitTotals = null; // recordUsage already stored this call's totals
          statsRev++;
        } else if (ev.type === "tool_start") {
          callLabels.set(ev.id, `${ev.name}${argsSummary(ev.args)}`);
          callArgs.set(ev.id, ev.args);
          liveThink = null; // a tool boundary seals the thinking block before it
          // running header (suggested: `▶ fox — <session> — <tool>`)
          busyMsg = ev.name;
          // Create the head HERE, on tool_start, not on first output: a tool
          // that takes a while and streams nothing (a long build, a test run)
          // would otherwise show nothing at all and the agent looked hung. The
          // head is a NORMAL one — same `» name` label as a settled tool, no
          // "running" suffix and no re-stamping: the status bar's spinner is
          // where progress is shown. The body is OPEN, so the output streams in
          // live as tool_output deltas land — a tool that is clearly working,
          // not a head that appears and then sits silent until it finishes.
          if (!liveTools.has(ev.id)) {
            liveTools.set(ev.id, {
              head: push("toolhead", `» ${callLabels.get(ev.id) ?? ev.name}`, {
                detail: argsJson(callArgs.get(ev.id) ?? ""),
                expanded: expandMode === true || undefined,
              }),
              body: push("toolbody", "", { toolResult: true, expanded: expandMode !== false }),
              text: "",
            });
          }
          publishLive(true); // tool flips are sparse enough to write unthrottled
          term.setTitle(`▶ fox — ${state.sessionId || "new"} — ${ev.name}`);
        } else if (ev.type === "tool_output") {
          // Live output of an in-flight call (exec streaming). Shown as a pair
          // of items the deltas mutate; tool_end swaps them for the final result.
          // The pair renders through the same itemRows path as settled items —
          // same head label + expandable input, same body — so streaming and
          // settled show the same content.
          liveThink = null;
          if (md) {
            push("md", md, flushStepMarker());
            md = "";
            streamText = null;
          }
          let live = liveTools.get(ev.id);
          if (!live) {
            // the in-flight head looks like a SETTLED tool head — same `» name`
            // label, no "running" suffix. Progress reads from the status bar's
            // spinner, so the transcript stays uniform instead of growing a
            // second, differently-shaped row per in-flight call.
            live = {
              head: push("toolhead", `» ${callLabels.get(ev.id) ?? "exec"}`, {
                detail: argsJson(callArgs.get(ev.id) ?? ""),
                expanded: expandMode === true || undefined,
              }),
              // folded by default while in flight: a running tool's output is
              // noise until it settles, and the expanded tail would otherwise
              // shove the rest of the transcript off-screen every frame
              body: push("toolbody", "", { toolResult: true, expanded: false }),
              text: "",
            };
            liveTools.set(ev.id, live);
          }
          live.text = (live.text + ev.delta).slice(-KEPT_TOOL_CHARS);
          live.body.text = live.text;
          touch(live.body.k);
          markDirty();
        } else if (ev.type === "tool_end") {
          liveThink = null;
          // swap the live pair for the settled result, keeping whatever the
          // user unfolded mid-stream open — output you were watching must not
          // snap shut the moment the tool finishes
          const live = liveTools.get(ev.id);
          let headOpen = false;
          let bodyOpen = false;
          if (live) {
            headOpen = !!live.head.expanded;
            bodyOpen = !!live.body.expanded;
            items = items.filter((i) => i !== live.head && i !== live.body);
            liveTools.delete(ev.id);
          }
          if (md) {
            push("md", md, flushStepMarker());
            md = "";
            streamText = null;
          }
          // raw text, newlines intact: collapsed rendering shows an arrow line,
          // the expanded view gets the real lines (see itemRows). The [N] marker
          // rides `seq` (rendered as the column-0 gutter chip), NOT baked into
          // text like the old prefix.
          const detail = argsJson(ev.args);
          push("toolhead", `» ${callLabels.get(ev.id) ?? `${ev.name}${argsSummary(ev.args)}`}${ev.ok ? "" : " — failed"}`, { seq: ev.seq, detail, expanded: headOpen || expandMode === true || undefined });
          const bodyOpenFinal = expandedRefs.has(ev.seq) || bodyOpen || expandMode === true;
          if (bodyOpenFinal) expandedRefs.add(ev.seq);
          // todo bodies are markdown task lists — always visible, rendered
          // as md (see itemRows mdBody); a task list hidden behind a click is
          // useless and collapsed markdown punctuation looks like garbage
          if (ev.name === "todo") {
            push("toolbody", keepTail(ev.output, KEPT_TOOL_CHARS * 4), { ref: ev.seq, expanded: true, toolResult: true, mdBody: true });
          } else {
            push("toolbody", keepTail(ev.output, KEPT_TOOL_CHARS * 4), { ref: ev.seq, expanded: bodyOpenFinal, toolResult: true });
          }
          statsRev++;
        } else if (ev.type === "child_tool") {
          // A subagent's progress: ONE line per delegated session, updated in
          // place with a running count — a 40-call subagent used to print 40
          // identical "session · exec" lines down the transcript. The key drops
          // any "(retry N)" suffix so a retried delegation keeps its one line.
          // A tool boundary like any other: it seals the thinking block.
          liveThink = null;
          if (md) {
            push("md", md, flushStepMarker());
            md = "";
            streamText = null;
          }
          const ckey = ev.session.replace(/ \(retry \d+\)$/, "");
          let child = childItems.get(ckey);
          if (!child) {
            child = { item: push("toolbody", ""), count: 0, last: "" };
            childItems.set(ckey, child);
          }
          if (ev.done) child.count++;
          child.last = ev.name;
          child.item.text = `  ${ev.session} · ${ev.name}${ev.done ? "" : " (running)"}${ev.ok ? "" : " — failed"}${child.count > 1 ? ` · ${child.count} calls` : ""}`;
          touch(child.item.k);
          markDirty();
        } else if (ev.type === "steered") {
          liveThink = null;
          if (md) {
            push("md", md, flushStepMarker());
            md = "";
            streamText = null;
          }
          push("user", `❯ ${ev.text}`);
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
      if (md) push("md", md, flushStepMarker());
      streamText = null;
      streamSeq = -1; // the turn's stream is over; the settled item carries the real seq
      liveThink = null; // refresh() rebuilds items; no reference may survive it
      // Settle any still-running live tool as interrupted: on abort its result
      // is never persisted (no tool_end), so the pair would otherwise keep its
      // "running" look forever with an empty body. Mark the head so a partially
      // completed tool reads as interrupted, not hung.
      if (ac?.signal.aborted) {
        for (const [, live] of liveTools) {
          live.head.text = `${live.head.text} — interrupted`;
          touch(live.head.k);
        }
      }
      liveTools.clear();
      setBusy(false);
      ac = null;
      // end-of-turn notification (OSC 9): a turn that ran long enough to walk
      // away from deserves a toast when it lands; errors always announce —
      // even a fast failure is exactly what the user is waiting on. Terminals
      // without OSC 9 drop the sequence silently.
      const ran = Date.now() - startedAt;
      const errored = items[items.length - 1]?.kind === "error";
      if (errored || ran >= 10_000) {
        const secs = Math.round(ran / 1000);
        term.notify(errored ? `fox-agent — turn failed (${secs}s)` : `fox-agent — turn done (${secs}s)`);
        term.flush();
      }
      // title back to the idle header (suggested format: `fox — <session>`)
      term.setTitle(`fox — ${state.sessionId || "new"}`);
      // reconcile the live user marker with stored seq
      refresh();
      drainQueue();
    }
  }

  function drainQueue() {
    if (!queued.length) return;
    const next = queued.shift()!;
    markDirty(); // the queue box just shrank — that transition repaints NOW,
    // not whenever the dispatched turn first happens to dirty something
    void dispatch(next.raw, next.lit);
  }

  async function dispatch(raw: string, lit = false) {
    // emptiness is judged on the RAW buffer, not the trim: a message of pure
    // whitespace is still a message the user chose to send
    if (!raw) return;
    const t = raw.trim();
    // "!" / "/" only dispatch when they are the FIRST character of the raw
    // buffer: "  !ls hello" is a message that happens to start with spaces
    // (leading whitespace is significant content), not a shell command. The
    // old code trimmed first, so an indented line silently executed.
    if (!lit && raw.startsWith("!")) return void runShell(t.slice(1).trim());
    if (!lit && raw.startsWith("/")) return runSlash(t);
    // @path mentions inline the file's text so the model reads it directly
    await runAgent(expandMentions(raw, state.cwd).text);
  }

  const display = () => buf.map((c) => c.c).join("");
  const firstCharLit = () => buf.find((c) => c.c.trim().length > 0)?.lit ?? false;

  function chsSet(text: string) {
    // iterate code points, not UTF-16 units: `split("")` would tear an emoji
    // into surrogate halves, and every later width/delete calculation inherits
    // the damage
    inSelAnchor = null;
    buf = [...text].map((x) => ({ c: x, lit: false }));
    cur = buf.length;
    inputRev++;
    markDirty();
  }

  function submit() {
    const raw = display();
    // raw length, not trim: pure whitespace is sendable on purpose
    if (!raw) return;
    const lit = firstCharLit();
    const t0 = raw.trim();
    // Read-only viewer: slash commands flow through (runSlashCommand keeps the
    // allowlist), everything else stays in the editor as a draft.
    if (state.readOnly && (lit || !t0.startsWith("/"))) {
      return flash("read-only — this session is open elsewhere; drafting is fine, sending is not");
    }
    inSelAnchor = null;
    buf = [];
    cur = 0; // a stale index past the new (empty) buffer crashes graphemeBack on the next backspace
    inputRev++; // the layout cache is keyed on this — without it a multi-line message leaves a multi-line input box
    markDirty();
    const t = t0;

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
      // slash commands don't need the agent idle — /todo, /sessions, the prompt
      // wizards all work mid-turn. Only agent-bound text (and !shell, which
      // shares the busy guard) waits in line.
      if (!lit && t.startsWith("/")) return void runSlash(t);
      queued.push({ raw, lit });
      markDirty();
      return;
    }
    void dispatch(raw, lit);
  }

  /** set by run() once the quarantine is installed; gracefulExit replays it */
  let restoreOutputRef: (() => void) | null = null;

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
    // Start the tool teardown NOW, so the slow closers (MCP children, the
    // polite LSP exit window, plugin session-end hooks) overlap the terminal
    // teardown + resume hint below instead of stacking after them — that
    // serial stretch read as a hang after exit. The await in cli.ts's finally
    // joins this same in-flight pass (shutdownTools is idempotent during it).
    try {
      void import("../tools/index.ts").then((m) => m.beginShutdown(state.sessionId));
    } catch {}
    try {
      if (state.sessionId) unpinSession(state.sessionId);
    } catch {}
    try {
      if (state.sessionId) releaseLock(state.sessionId);
    } catch {}
    try {
      // clear any OSC 9;4 progress the terminal still shows (quit mid-turn)
      term.progress(0);
    } catch {}
    try {
      // cancel a frame scheduled before exit: the tick gate stops a fresh
      // paint, but clearing here also releases the timer during the teardown
      // window so nothing paints between term.end() and process exit
      if (paintTimer) {
        clearTimeout(paintTimer);
        paintTimer = null;
      }
    } catch {}
    try {
      term.end();
    } catch {}
    try {
      if (mirrorTimer) clearInterval(mirrorTimer); // viewer's live-status poll
    } catch {}
    try {
      restoreOutputRef?.(); // replay anything captured while the grid was up
    } catch {}
    // leave a resume hint on the shell — the session is one id away. the
    // numeric index is what `fox -c N` resolves against (same list length,
    // or the printed number would resume a different session)
    try {
      if (state.sessionId && !process.env.FOX_AGENT_NO_RESUME_HINT) {
        // The short form is a DETERMINISTIC id prefix (unique across the
        // session set, resolved by the same search-term path /sessions uses),
        // not a list index — `fox -c 2` breaks the moment any session in the
        // list is touched, a prefix survives that. Full id stays as the
        // forever-valid fallback.
        const short = shortResumeArg(state.sessionId, state.config?.sessionListLimit ?? 50);
        console.error(`\x1b[90mto resume: fox -c ${short}\x1b[0m (or fox -c ${state.sessionId})`);
      }
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
    if (v) {
      startedAt = Date.now();
      busyMsg = null;
      // OSC 9;4 indeterminate: the tab/taskbar shows activity from turn start
      // until end, even when the TUI is in the background
      term.progress(3);
      // running header until the first tool_start overrides it (then endTurn
      // restores the idle title)
      term.setTitle(`▶ fox — ${state.sessionId || "new"}`);
    } else {
      term.progress(0);
    }
    // read-only viewers poll this — publish what the status bar shows
    publishLive();
    markDirty();
  }

  // ---- live status channel (owner publishes, read-only viewers poll) ----
  /**
   * What the owner TUI currently shows in its status bar, written to the
   * session kv so a read-only viewer (second terminal) can mirror it: same
   * spinner, same "thinking — exec" label, same streaming text. A fired-and-
   * forgotten write — a viewer that misses one poll just shows one stale
   * frame until the next.
   */
  interface LiveStatus {
    busy: boolean;
    busyMsg: string | null;
    streaming: string | null;
    startedAt: number;
    at: number;
  }
  let lastPublishAt = 0;
  function publishLive(force = false) {
    if (!state.sessionId) return;
    const now = Date.now();
    if (!force && now - lastPublishAt < 250) return; // throttle stream writes
    lastPublishAt = now;
    try {
      kvSet(state.sessionId, "live", {
        busy,
        busyMsg,
        streaming: streamText,
        startedAt,
        at: now,
      } satisfies LiveStatus);
    } catch {}
  }

  // ---- input helpers (cursor-aware) ----
  function insertText(text: string, lit = false) {
    deleteInSel(); // pasting over a selection replaces it
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
    // toolhead too: the "▸ input — click or ctrl+t" affordance is painted only
    // when argsFull produced a detail, and without this branch clicking it did
    // nothing — the reported "tool call content doesn't display" bug
    if (it.kind !== "think" && it.kind !== "toolbody" && it.kind !== "toolhead") return;
    if (!it.expanded) fillDetail(it); // first expand pays the pretty-print, not the load
    it.expanded = !it.expanded;
    if (it.ref != null) {
      if (it.expanded) expandedRefs.add(it.ref);
      else expandedRefs.delete(it.ref);
    }
    touch(it.k);
    markDirty();
  }

  /**
   * True when a toolhead's full input is already visible on the head line —
   * single-line detail that fits the screen width. There is nothing left to
   * reveal, so the affordance text is noise and a click must not fold/unfold.
   * Head renders as "▸ " + text + " · " + detail from column 1.
   *
   * Called per collapsed head per frame, so it must not trigger the lazy
   * pretty-print: real args ALWAYS pretty-print multi-line (the brace lines
   * alone), so a deferred head with any content never fits — only the
   * degenerate "{}"/one-liner cases fill and take the width test.
   */
  function toolInputFits(it: Item): boolean {
    if (it.kind !== "toolhead") return false;
    if (!it.detail) {
      const raw = (it.argsRaw ?? "").trim();
      if (raw && raw !== "{}") return false;
      fillDetail(it); // degenerate args: cheap, and it.detail is now real
    }
    if (!it.detail || it.detail.includes("\n")) return false;
    return 2 + Bun.stringWidth(it.text) + 3 + it.detail.length <= W;
  }

  /** Deferred argsJson: fill once, on first expand/degenerate width-test. */
  function fillDetail(it: Item): void {
    if (it.detail || it.argsRaw === undefined) return;
    it.detail = argsJson(it.argsRaw);
  }

  // ---- keyboard ----
  /** Floating command output (/help, /todo, /usage…): painted above the dock
   *  like the slash hints, never pushed into the transcript. Dismissed by any
   *  keypress or click. Slash hints outrank it while a "/" command is typed. */
  let cmdOut: string[] | null = null;
  function setCmdOut(text: string) {
    cmdOut = text.split("\n");
    markDirty();
  }
  function onKey(k: Key) {
    // any real input dismisses transient help/command output first — a glance,
    // not something to scroll past forever
    // popups shed on any key — except escape, which owns dismissal itself so
    // one press can't both close a popup and fall through to aborting the turn
    if (cmdOut && !(k.type === "named" && k.name === "escape")) {
      cmdOut = null;
      markDirty();
    }
    if (items.some((i) => i.ephemeral)) {
      items = items.filter((i) => !i.ephemeral);
      clampScroll();
      markDirty();
    }
    // the modal gets first refusal on every key (see overlayKey)
    if (overlayKey(k)) return;
    // an open question wizard owns the input dock next (see promptKey)
    if (wizard.key(k)) return;
    if (k.type === "paste") {
      // a drag-and-drop arrives as pasted path text — quote/file:// forms both.
      // When every token names a real file, insert mentions, not raw text.
      const toks = k.text.trim().split(/\s+/).filter(Boolean);
      const paths = toks.map((t) => droppedPath(t, state.cwd));
      if (toks.length && paths.every(Boolean)) return insertText(paths.map((p) => `@${p}`).join(" ") + " ");
      return insertText(k.text, true);
    }
    if (k.type === "mouse") return onMouse(k.action, k.x, k.y);
    if (k.type === "char") {
      deleteInSel(); // typing over a selection replaces it, as in any editor
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
      const up = name === "wheelup";
      // route by position: over the dock the wheel walks the input caret, and
      // the dock's caret-follow carries the visible window with it; anywhere
      // else it scrolls the transcript. (A modal consumed the wheel already —
      // overlayKey/promptKey run before this.)
      const wy = k.y ?? lastMouse.y;
      lastMouse = { x: k.x ?? lastMouse.x, y: wy };
      if (wy >= dockTopY()) {
        moveCaretVertical(up ? -1 : 1, false);
        return;
      }
      const dir = up ? -SCROLL_STEP : SCROLL_STEP; // tuiScrollStep rows per wheel tick
      if (stick && dir < 0) stick = false;
      scrollTop += dir;
      clampScroll();
      // re-stick at the bottom is paint()'s job now (scrollTop >= max)
      // The 8ms paint schedule coalesces a burst at its FINAL offset while
      // keeping every tick's visible latency under one schedule window —
      // including a mid-burst direction change, which used to idle behind
      // the 33ms interval.
      markDirty();
      return;
    }
    if (name === "c" && ctrl) {
      // A live input selection copies its text, as it does everywhere else —
      // through the same copyText path as the transcript, so both report the
      // same confirmation. The selection is dropped: what was copied is staged
      // nowhere, and a stale highlight would lie about that.
      const ir = inSelRange();
      if (ir) {
        const text = buf.slice(ir[0], ir[1]).map((c) => c.c).join("");
        inSelAnchor = null;
        markDirty();
        void copyText(text);
        return;
      }
      // A live selection makes ctrl+c mean copy, as it does everywhere else.
      // It is consumed here rather than falling through, so the same keystroke
      // cannot both copy and abort the turn.
      if (hasSel()) {
        void copySelection();
        clearSel();
        return;
      }
      // Text in the box wins over abort: ctrl+c first clears the draft (the
      // universal "get my line back" gesture), and only an EMPTY box means
      // "stop the turn". Previously a busy turn ate the keystroke and a typed
      // draft could not be cleared without also killing the agent.
      if (buf.length) {
        buf = [];
        cur = 0;
        inputRev++;
        flash("cleared");
        return;
      }
      if (busy) {
        ac?.abort();
        return;
      }
      // `return` matters: without it this fell through to the ctrl+d branch
      // below, so one keystroke ran gracefulExit twice. It is idempotent today,
      // which is the only reason that was invisible.
      gracefulExit(0);
      return;
    }
    if (name === "d" && ctrl) return gracefulExit(0);
    if (name === "s" && ctrl) {
      // Steer: agent-bound text joins the RUNNING turn at the next step
      // boundary instead of waiting behind it. Slash and !shell keep their
      // usual meaning; with an empty box the oldest queued message goes.
      if (busy && state.sessionId && !state.readOnly) {
        const raw = display();
        const lit = firstCharLit();
        const t = raw.trim();
        if (raw && (lit || !(t.startsWith("/") || t.startsWith("!")))) {
          buf = [];
          cur = 0;
          inputRev++;
          steer(state.sessionId, raw);
          return flash("steering — delivered after the current tool");
        }
        if (!raw && queued.length) {
          const [m] = queued.splice(0, 1);
          steer(state.sessionId, m.raw);
          markDirty();
          return flash("steering queued message — delivered after the current tool");
        }
      }
      return submit();
    }
    if (name === "up" && ctrl) {
      withdrawLast(); // pop the back of the queue into the editor — no selector
      return;
    }
    if (name === "t" && ctrl) {
      // unfold/fold everything expandable — thinking blocks, tool outputs, long tool heads
      const expandable = (it: Item) =>
        it.kind === "think" || it.kind === "toolbody" || (it.kind === "toolhead" && (!!it.detail || it.argsRaw !== undefined));
      const anyFolded = items.some((it) => expandable(it) && !isExpanded(it));
      // remember the direction: every expandable item born from now on
      // (a streaming tool body, the next think block, a replayed transcript)
      // must arrive in the mode the user chose, or the toggle keeps losing
      expandMode = anyFolded;
      for (const it of items) {
        if (!expandable(it)) continue;
        const want = anyFolded;
        if (isExpanded(it) !== want) {
          if (!want) fillDetail(it); // about to expand: defer-pay here too
          toggleExpand(it);
        }
      }
      flash(anyFolded ? "all unfolded" : "all folded");
      return;
    }
    if (name === "v" && ctrl) {
      void clipRead(term).then((p) => {
        if (!p) return;
        insertText(p, true);
      });
      return;
    }
    if (name === "escape") {
      // escape sheds one thing at a time: a command-output popup, input
      // selection, transcript selection, then the turn — and then NOTHING.
      // A popup on screen is what the user is most plausibly dismissing, and
      // it must cost the escape alone, not also the running turn (overlay and
      // question wizards already refused above). The old final branch cleared
      // the draft, so a stray esc (or the esc an SS3/alt chord degraded from)
      // wiped a typed message the user wanted back; the draft is recoverable
      // only by retyping, so escape never touches it.
      if (cmdOut) {
        cmdOut = null;
        markDirty();
        return;
      }
      if (inSelRange()) {
        inSelAnchor = null;
        markDirty();
        return;
      }
      if (hasSel()) {
        clearSel();
        return;
      }
      if (busy) ac?.abort();
      return;
    }
    // Page/home/end keys are transcript-first: they scroll (pgup/pgdn by a
    // viewport page, home to the oldest row, end re-sticks to the live bottom).
    // They used to route by where the MOUSE last sat — a pointer that happened
    // to rest over the dock silently turned them into input-caret keys, which
    // is the "pgup/pgdn/home/end don't scroll" report. Ctrl+pgup/pgdn and
    // ctrl+home/end still move the input caret (a deliberate chord, not an
    // accident of pointer position); the wheel already routes by real position.
    if (name === "pageup" || name === "pagedown") {
      if (ctrl) {
        const dir = name === "pageup" ? -1 : 1;
        const n = Math.max(1, dockGeom().shownCount);
        for (let i = 0; i < n; i++) moveCaretVertical(dir, false);
        return;
      }
      if (name === "pageup") {
        stick = false;
        scrollTop -= Math.floor(viewportH() * 0.8);
        clampScroll();
        paintNow();
        return;
      }
      scrollTop += Math.floor(viewportH() * 0.8);
      clampScroll();
      // re-stick at the bottom is paint()'s job now (scrollTop >= max)
      paintNow();
      return;
    }
    if (name === "home") {
      if (ctrl) {
        cur = 0;
        inSelAnchor = null;
        markDirty();
        return;
      }
      stick = false;
      scrollTop = 0;
      paintNow();
      return;
    }
    if (name === "end") {
      if (ctrl) {
        cur = buf.length;
        inSelAnchor = null;
        markDirty();
        return;
      }
      stick = true;
      paintNow();
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
      if (!deleteInSel() && cur > 0) {
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
      if (!deleteInSel() && cur < buf.length) {
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
      if (k.shift) {
        // extend the selection; the caret is the moving end
        if (inSelAnchor === null) inSelAnchor = cur;
        cur = ctrl || k.meta ? wordBoundary(dir) : Math.max(0, Math.min(buf.length, cur + dir));
      } else {
        const r = inSelRange();
        inSelAnchor = null;
        if (r) cur = dir < 0 ? r[0] : r[1]; // a plain arrow collapses to an edge
        // ctrl/alt+arrow = word-wise motion (the decoder reports CSI modifiers)
        else if (ctrl || k.meta) cur = wordBoundary(dir);
        else cur = Math.max(0, Math.min(buf.length, cur + dir));
      }
      markDirty();
      return;
    }
    if (name === "up" || name === "down") {
      // With the command roster showing, arrows walk the list (a bare command
      // word has no multi-line caret to move anyway); elsewhere they move the
      // caret through the wrapped input.
      const n = hintMatches().length;
      if (n > 1) {
        hintSel = Math.max(0, Math.min(n - 1, hintSel + (name === "up" ? -1 : 1)));
        markDirty();
        return;
      }
      moveCaretVertical(name === "up" ? -1 : 1, !!k.shift);
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
    if (getPrompt()) return [];
    const d = display();
    if (firstCharLit() || !d.startsWith("/")) return [];
    // an argument being typed still shows its command, so the usage hint stays
    // visible — but only while the argument is unambiguous (one match)
    return matchCommands(d);
  }

  // ---- mouse ----
  /** the transcript row under screen row y, or null if y is not the transcript */
  function transcriptRow(y: number): number | null {
    // the PAINTED frame, not a rebuild: mid-stream a fresh layout can shift
    // rows (scrollbar flip, queue rows), and a row off is click drift
    const fr = painted;
    if (!fr) return null;
    if (y < 0 || y >= fr.vh) return null;
    const row = y + fr.scrollTop;
    return row >= 0 && row < fr.total ? row : null;
  }

  /**
   * The cell column a click at screen x lands on WITHIN a transcript row's
   * CONTENT.
   *
   * That is not always column 1: a row carrying a [N] marker chip starts its
   * content at `MARKER_W(seq) + 1` (the chip PLUS its gap column). The old
   * mapping subtracted a flat 1, so on a marked row every click resolved
   * chipWidth columns too far right — the selection began mid-content and the
   * copied text was displaced with it, getting worse the larger the seq got
   * ([9] is 3 cells, [100] is 5). Reads the PAINTED frame for the row's owner,
   * like every other hit-test, so it cannot disagree with the pixels.
   */
  function transcriptCol(x: number, row: number): number {
    const fr = painted;
    // The window slice is addressed the same way paint() and the click hit-test
    // address it: rows[0] is ABSOLUTE row (scrollTop - winOffset), so the
    // viewport index is `row - winBase`. Reading `row - scrollTop` (which is
    // just y) skipped winOffset and looked up the WRONG row's owner — the
    // chip width then came from a different item, or from none, and the whole
    // selection shifted.
    const winBase = fr ? fr.scrollTop - fr.winOffset : 0;
    const winIdx = row - winBase;
    // The seq whose chip this ROW carries, or undefined. Only the item's first
    // row has one, and a markerCont item (a tool body) has none at all — a tool
    // pair shows ONE chip on its head. Deciding per ITEM made the body's
    // selection subtract a gutter it never painted.
    let seq: number | undefined;
    if (fr && winIdx >= 0 && winIdx < fr.owner.length) {
      const it = items.find((i) => i.k === fr.owner[winIdx]);
      const isFirstRow = winIdx === 0 || fr.owner[winIdx - 1] !== fr.owner[winIdx];
      if (it && isFirstRow) seq = rowSeq(it);
    }
    return Math.max(0, x - contentOrigin(seq));
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
  /**
   * Paint + flush synchronously, outside the frame interval.
   *
   * Pointer interactions (drag-select, scrollbar scrub, wheel) and scroll
   * keys paint immediately: coalescing them through the 33ms poll made a
   * fast drag rubber-band and a scroll feel like it moved "one tick late" —
   * motion events arrive every few ms and the poller folded them into one
   * frame a full interval after the pointer had already moved on. Input
   * events are the one place latency beats batching; the coalescer remains
   * for stream/spinner work.
   */
  let paintScheduled = false;
  /**
   * The name is historical: every caller used to paint synchronously, so a
   * burst of queued pointer/scroll events serialized one full (stale) paint
   * per event — each blocking the thread while the backlog grew, nothing
   * ever overriding the frame in flight. All events now land on the
   * coalescing schedule instead: each just raises the flag, and the single
   * pending paint renders the LATEST state. Latest-wins overrides backlog.
   */
  function paintNow() {
    markDirty();
  }

  function onMouse(action: "down" | "drag" | "up", x: number, y: number) {
    lastMouse = { x, y };
    const g = gestureFor(action, press, x, y);
    // every mouse path below ends in syncPaint(); pointer feedback paints
    // NOW (see paintNow) instead of waiting for the frame interval
    const syncPaint = () => paintNow();
    if (action === "down") {
      // Scrollbar strip at the right edge: press jumps, drag scrubs. Dead when
      // tuiScrollbar is off — no strip is painted, so no dead click zone either.
      const fr = painted;
      if (SCROLLBAR && fr?.sbShowing && x >= W - 1 && y < fr.vh) {
        press = { x, y, moved: false, scrollbar: true };
        stick = false;
        scrollTop = scrollbarScrollTop(fr.total, fr.vh, y);
        clampScroll();
        syncPaint();
        return;
      }
      // Press inside the input dock: position the caret there; a following drag
      // extends an input selection instead of a transcript one. One selection
      // at a time, region-scoped: the dock owns the press, so any transcript
      // selection dies here.
      const ii = inputIndexAt(x, y);
      if (ii !== null) {
        clearSel();
        cur = ii;
        inSelAnchor = ii;
        press = { x, y, moved: false, input: true };
        syncPaint();
        return;
      }
      const row = transcriptRow(y);
      press = { x, y, moved: false };
      // Any press drops the previous selection — BOTH kinds, region-scoped:
      // the transcript owns the press, so a lingering input anchor dies too,
      // or the dock would keep its highlight while the transcript selects.
      clearSel();
      inSelAnchor = null;
      if (row !== null) {
        selA = { row, col: transcriptCol(x, row) };
        selB = selA;
      }
      return;
    }
    if (action === "drag") {
      if (press?.scrollbar) {
        const fr = painted;
        if (fr) {
          stick = false;
          scrollTop = scrollbarScrollTop(fr.total, fr.vh, y);
          clampScroll();
        }
        press.moved = true;
        syncPaint();
        return;
      }
      if (press?.input) {
        const ii = inputIndexAt(x, y);
        if (ii !== null && ii !== cur) {
          cur = ii; // anchor stays where the press landed
          press.moved = true;
          syncPaint();
        }
        return;
      }
      if (g.kind !== "extend") return;
      // A motion frame does not by itself mean the pointer moved: terminals
      // (notably Windows Terminal) send btn-32 frames for zero-distance holds,
      // which would mark every press "moved" and turn its release into a copy
      // — clicks would never toggle. Only a real position change counts.
      if (x !== press!.x || y !== press!.y) {
        press!.moved = true;
        press!.x = x;
        press!.y = y;
      } else return;
      if (!selA) return;
      // Dragging past an edge scrolls, so a selection can outrun the screen.
      if (y < 0 || y >= viewportH()) {
        stick = false;
        scrollTop += y < 0 ? -SCROLL_STEP : SCROLL_STEP;
        clampScroll();
      }
      const row = transcriptRow(Math.max(0, Math.min(viewportH() - 1, y)));
      if (row === null) return;
      selB = { row, col: transcriptCol(x, row) };
        syncPaint();
      return;
    }
    const wasInput = press?.input;
    const wasScrollbar = press?.scrollbar;
    press = null;
    if (wasScrollbar) return; // a scrub is not a click
    // An input-dock gesture: a drag leaves its selection AND copies it (same
    // contract as a transcript drag); a tap just moved the caret, so drop the
    // zero-width anchor.
    if (wasInput) {
      if (inSelAnchor === cur) inSelAnchor = null; // a tap, not a drag
      else if (inSelAnchor !== null) {
        const it = inputText();
        const [a, b] = [Math.min(inSelAnchor, cur), Math.max(inSelAnchor, cur)];
        void copyText(it.slice(a, b));
      }
      syncPaint();
      return;
    }
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
      const fr = painted;
      if (!fr) return;
      const winBase2 = fr.scrollTop - fr.winOffset;
      const winIdx = row - winBase2;
      if (winIdx < 0 || winIdx >= fr.rows.length) return;
      const cells = rowCells(fr.rows[winIdx].segs);
      if (phase === 0) {
        const w = wordRangeAt(cells, transcriptCol(x, row));
        if (!w) return;
        selA = { row, col: w.from };
        selB = { row, col: w.to };
      } else {
        const width = cells.start.length;
        if (!width) return;
        selA = { row, col: 0 };
        selB = { row, col: width - 1 };
      }
      syncPaint();
      return;
    }
    onClick(x, y);
  }

  async function copySelection() {
    if (!selA || !selB) return;
    const fr = painted;
    if (!fr) return;
    // selection rows are ABSOLUTE; the window base shifts the built slice
    const winBase = fr.scrollTop - fr.winOffset;
    const selA2 = { row: selA!.row - winBase, col: selA!.col };
    const selB2 = { row: selB!.row - winBase, col: selB!.col };
    const text = extractSelection(fr.rows.map((r) => r.segs), selA2, selB2);
    if (!text) return;
    await copyText(text);
  }

  /**
   * The one copy path for transcript and input alike: same clipboard probes,
   * same status-bar confirmation on success or failure. Two callers used to
   * report two different messages ("copied N chars…" vs bare "copied") through
   * two different code paths.
   */
  async function copyText(text: string) {
    if (!text) return;
    const okd = await clipWrite(text, term);
    const lines = text.split("\n").length;
    flash(okd ? `copied ${text.length} chars${lines > 1 ? ` (${lines} lines)` : ""}` : "copy failed — no clipboard tool");
  }

  /**
   * The per-message ops wizard, opened by clicking a transcript [N] marker.
   * fork cuts the session at this marker (reuses /fork), copy puts the message
   * body on the clipboard, revert hides this message and everything after it
   * from the context window via a ctx delete op — reversible with /undo, seqs
   * preserved (the user's choice over a destructive truncate).
   */
  async function markerOps(seq: number) {
    if (!state.sessionId) return;
    const msg = getMessage(state.sessionId, seq);
    if (!msg) {
      flash(`no message [${seq}]`);
      return;
    }
    const body = (msg.content ?? "").replace(/\s+/g, " ").slice(0, 60);
    const answer = await wizard.ask(`[${seq}] ${msg.role} — ${body || "(no text)"}`, [
      {
        key: "op",
        label: "operation",
        kind: "select",
        options: [
          { value: "fork", label: "fork — cut the session here (new session from [N])" },
          { value: "copy", label: "copy — message body to clipboard" },
          { value: "revert", label: "revert — hide [N] and everything after from context" },
        ],
      },
    ]);
    const op = answer?.op;
    if (!op) return;
    if (op === "fork") {
      // /fork N keeps messages through [N] (forkSession deletes seq > cap), so
      // cutting "from [N]" passes the marker's own seq — the fork opens at [N]
      const fork = forkSession(state.sessionId, seq);
      flash(fork ? `forked -> ${fork.id}` : "fork failed");
    } else if (op === "copy") {
      await copyText(msg.content ?? "");
    } else if (op === "revert") {
      // hide this message + all later ones: a single delete op over the seq
      // range. The view projection (not the transcript) drops them, so the
      // model stops seeing them; /undo restores. Storage stays append-only.
      const msgs = allMessagesLite(state.sessionId);
      const ids = msgs.filter((m) => m.seq >= seq).map((m) => m.seq);
      if (!ids.length) {
        flash("nothing to revert");
        return;
      }
      appendOps(state.sessionId, [{ kind: "delete", ids }]);
      // the projection cache must not survive the surgery
      void import("../context/view.ts").then((m) => m.dropViewCache(state.sessionId!)).catch(() => {});
      // force the hidden nodes to re-render (they now show as dimmed/summarized)
      for (const id of ids) touchSeq(id);
      refresh();
      flash(`reverted — hid [${seq}]..[${ids[ids.length - 1]}] from context (/undo restores)`);
    }
  }


  /** Everything waiting to send, oldest first, as dock rows.
   *
   * Queued next-turn messages, then steers parked for the running turn's next
   * step boundary. Both stay painted above the input until they are actually
   * sent: a queued row vanishes when drainQueue dispatches it, a steering row
   * when the turn's drainSteer consumes it — the same moment its `steered`
   * event lands in the transcript. One helper for paint() and onClick() so the
   * hit-test can never disagree with the pixels about how many rows these are.
   */
  function pendingLines(): string[] {
    const lines = queued.map((q, i) => `queued ${i + 1}/${queued.length}: ${oneLine(q.raw)}`);
    const steers = state.sessionId ? peekSteer(state.sessionId) : [];
    steers.forEach((s, i) => lines.push(`steering ${i + 1}/${steers.length}: ${oneLine(s)}`));
    return lines;
  }

  function oneLine(s: string): string {
    return s.replace(/\s+/g, " ").trim() || "(whitespace)";
  }

  /**
   * Text of the code-fence block containing the clicked window row, or null
   * when that row is not fence content. Walks OUTWARD from the click across
   * the contiguous gutter/continuation run — a fence split across streamed
   * assistant chunks spans items, so the walk is per-item (lazy itemRows,
   * cached for the walk), not per-window: the block may extend past the
   * visible slice. Conventions (gutter seg shape, tints) live in
   * markdown.ts's classifiers; this side only walks.
   */
  function codeBlockAround(winIdx: number): string | null {
    const fr = painted;
    if (!fr) return null;
    const k0 = fr.owner[winIdx];
    const i0 = items.findIndex((it) => it.k === k0);
    if (i0 < 0) return null;
    let first = winIdx;
    while (first > 0 && fr.owner[first - 1] === k0) first--;
    const w = fr.contentWidth;
    const r0 = winIdx - first; // click row within its item's rendered rows
    const isCode = (segs: Row["segs"]): boolean => {
      try {
        return codeGutterRow(segs) || codeContRow(segs);
      } catch {
        return false;
      }
    };
    const cache = new Map<number, Row[]>();
    const rowsOf = (i: number): Row[] => {
      let rows = cache.get(i);
      if (!rows) {
        rows = itemRows(items[i], w).rows;
        cache.set(i, rows);
      }
      return rows;
    };
    if (!isCode(rowsOf(i0)[r0]?.segs ?? [])) return null;
    const picked = new Set<string>();
    // upward
    let i = i0;
    let r = r0;
    for (;;) {
      const rows = rowsOf(i);
      while (r >= 0 && isCode(rows[r].segs)) {
        picked.add(`${i}:${r}`);
        r--;
      }
      if (r >= 0 || i === 0) break;
      const prev = rowsOf(i - 1);
      r = prev.length - 1;
      if (r < 0 || !isCode(prev[r].segs)) break;
      i--;
    }
    // downward
    i = i0;
    r = r0;
    for (;;) {
      const rows = rowsOf(i);
      while (r < rows.length && isCode(rows[r].segs)) {
        picked.add(`${i}:${r}`);
        r++;
      }
      if (r < rows.length || i === items.length - 1) break;
      const next = rowsOf(i + 1);
      r = 0;
      if (!isCode(next[0]?.segs ?? [])) break;
      i++;
    }
    const keys = [...picked].map((k) => k.split(":").map(Number) as [number, number]);
    keys.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const lines = keys.map(([ci, cr]) => {
      let t = rowsOf(ci)[cr].segs.map((sg) => sg.t).join("");
      if (t.startsWith("\u2502")) t = t.slice(1).replace(/^ /, ""); // gutter bar + padding
      return t;
    });
    return lines.join("\n");
  }

  function onClick(x: number, y: number) {
    const vh = viewportH();
    const { inputTop } = dockGeom();
    // floating command output dies on click, same as a keypress — and the
    // click is consumed by the dismissal, never also toggling whatever
    // transcript row the overlay was painted over
    const dismissedCmd = !!cmdOut;
    if (cmdOut) {
      cmdOut = null;
      markDirty();
    }

    // queued/steering rows are painted over the transcript but belong to the
    // dock — same geometry paint() uses (see dockFloats), or clicks reach
    // through to the transcript item underneath and flip it. Consumed, not
    // acted on: withdrawing an arbitrary row would be a new behavior, the
    // toggle is a bug.
    const { queueH: qRows } = dockFloats();
    if (qRows && y >= inputTop - qRows && y < inputTop) return;

    // hint popup rows float above the input box (and any pending rows) — same
    // row budget paint() uses, or the hit-test disagrees with the pixels
    const hints = hintText(Math.max(1, inputTop - qRows - 1));
    if (hints.active && hints.rows.length) {
      const hTop = inputTop - qRows - hints.rows.length;
      if (y >= hTop && y < inputTop) {
        const idx = (hints.start ?? 0) + (y - hTop);
        const target = hints.matches?.[idx];
        if (target) {
          // an argument already being typed makes this row informational: its
          // syntax line must not rewrite the input and eat the argument
          // (submit() avoids the same rewrite for the same reason)
          if (!display().includes(" ")) {
            chsSet(target.usage ? `${target.name} ` : target.name);
            hintSel = 0;
          }
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
      const idx = indexAtWidth(line, targetW);
      cur = Math.min(g.layout.lineStarts[vr.logical] + idx, buf.length);
      inputRev++; // caret moved -> layout/caret recompute is a no-op but keep rev honest
      markDirty();
      return;
    }

    // transcript: map row -> owning item. Unreachable behind a dismissed
    // overlay (see above): without the guard the same click both cleared the
    // float and flipped something it never touched.
    if (dismissedCmd) return;
    const fr = painted;
    if (!fr) return;
    const row = y + fr.scrollTop;
    if (y >= vh || row < 0 || row >= fr.total) return;
    const winBase = fr.scrollTop - fr.winOffset;
    const winIdx = row - winBase;
    if (winIdx < 0 || winIdx >= fr.owner.length) return;
    const it = items.find((i) => i.k === fr.owner[winIdx]);
    // a streaming tail row owns no item yet (owner -1) but carries a predicted
    // streamSeq — its [N] marker is still clickable, opening the same ops wizard
    // (the wizard's ops read the settled node once the turn lands it)
    if (!it) {
      if (fr.owner[winIdx] === -1 && streamSeq > 0 && x < MARKER_W(streamSeq)) {
        void markerOps(streamSeq);
      }
      return;
    }
    // a click on the leading [N] marker chip opens the per-message ops wizard
    // (fork / copy / revert). The hit must be the item's FIRST row AND inside
    // the exact `[N]` span. A tool body (markerCont) paints no chip, so it has
    // no hit region at all — that is the 'the line after the marker is also
    // clickable' report: the body was tested against its shared seq.
    const isFirstRowOfItem = winIdx === 0 || fr.owner[winIdx - 1] !== fr.owner[winIdx];
    if (isFirstRowOfItem && it.seq !== undefined && !it.markerCont && x >= 0 && x < MARKER_W(it.seq)) {
      void markerOps(it.seq);
      return;
    }
    // single click on a code-fence row copies the whole block — the gesture
    // users reach for on a command they want to run. Double/triple clicks
    // took the word/line gestures earlier; clicks on non-code rows still
    // toggle the item below.
    const blockText = codeBlockAround(winIdx);
    if (blockText !== null) {
      void copyText(blockText);
      return;
    }
    // a toolhead whose input already fits has nothing to reveal: a click is
    // ignored rather than folding a line that is identical expanded
    if (it.kind === "toolhead" && !it.expanded && toolInputFits(it)) return;
    toggleExpand(it);
  }

  function isExpanded(it: Item): boolean {
    return !!it.expanded;
  }

  // ---- painting ----
  interface Row {
    segs: Seg[];
    /** background fill style for the whole row (0 = default) — tool rows use
     *  the theme's toolBg so calls read as one block in the transcript */
    bg?: number;
  }
  // span is the item's non-blank edge span, computed once at fill — countRows
  // asks for it for EVERY item on EVERY frame (twice with the scrollbar), and
  // rescanning the row arrays there was the O(nodes) render cost on long sessions
  // per (item, width): computeFrame counts at W and counts AGAIN at W-2 when
  // the scrollbar shows, so one width per item thrashed the cache — every
  // frame re-rendered ALL items at W (evicting W-2), then all at W-2
  // (evicting W): 60ms+ of pure re-render per scroll tick on a long session.
  // Nested by width keeps both warm; the prune sweep walks the outer (item)
  // keys and stays correct, and the clear()s are whole-map as before.
  const lineCache = new Map<number, Map<number, { rev: number; rows: Row[]; hl: number; span: [number, number] }>>();

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

  /**
   * Word-level diff of a paired -/+ line pair. The `+` line shows additions
   * tinted; the `-` line deletions. Lines with no shared words (a full rewrite)
   * degrade to whole-line coloring via the caller's diffSegs check.
   */
  function wordDiffSegs(line: string, other: string): Seg[] | null {
    const isAdd = line.startsWith("+");
    const marker = line[0];
    const body = line.slice(1);
    const otherBody = other.slice(1);
    const d = wordDiff(otherBody, body);
    const segs = isAdd ? d.add : d.del;
    // tinted segs present, and the change is not the entire line: a full-line
    // change reads better as the plain red/green of diffSegs
    const tinted = segs.filter((s) => s.fg);
    const tintedChars = tinted.reduce((n, s) => n + s.t.length, 0);
    if (!tinted.length || tintedChars >= body.length * 0.8) return null;
    const out: Seg[] = [{ t: marker }];
    out.push(...segs);
    return out;
  }

  /** a line that opens or continues a JSON value — strings, braces, or keys */
  function looksLikeJson(line: string): boolean {
    const t = line.trim();
    return /^[{\[}"]/.test(t) || /^"[^"]*"\s*:/.test(t) || /^\d+[},{]/.test(t);
  }

  /**
   * Tag an item's rows with the leading [N] gutter marker. The marker is a
   * fixed-width chip `[N] ` stamped by the paint loop in COLUMN 0 — outside the
   * content margin — so it hugs the very-left edge. The first row carries the
   * chip; continuation rows carry `true` (same-width indent) so wrapped text
   * stays aligned under the content, not under the marker.
   *
   * The chip's width is still reserved here: callers shrink the wrap width by
   * MARKER_W so content never collides with the gutter column.
   */
  const MARKER_W = (seq: number) => `[${seq}]`.length;
  /**
   * The seq whose CHIP this item paints, or undefined if it paints none.
   *
   * A tool body carries the head's seq (they are one message) but sets
   * `markerCont`, so it never draws a chip and must reserve NO gutter. Keying
   * geometry off `it.seq` treated the body as marked: its wrap reserved a
   * gutter it does not have and its selection landed a chip-width right of the
   * text. One predicate, so paint, wrap and hit-test agree.
   */
  const rowSeq = (it: Item): number | undefined => (it.seq !== undefined && !it.markerCont ? it.seq : undefined);
  function withMarker(rows: Row[], seq: number, continuation = false): Row[] {
    // the chip label is EXACTLY `[N]` — the background spans the brackets and
    // digits, never a trailing space. The gap after it is uncolored (added by
    // the paint loop), so no stray bg cell follows the marker.
    const label = `[${seq}]`;
    const chip = { label, bg: C.markerBg ?? C.accent, fg: C.barBg, w: label.length };
    // continuation rows align to the usual left margin — the marker only occupies
    // a small part of line 1, wrapped lines do NOT indent under it
    const cont = { indent: 0 };
    // a continuation (a tool's body behind its head) never repeats the marker
    if (continuation) return rows.map((r) => ({ ...r, marker: cont }));
    return rows.map((r, i) => ({ ...r, marker: i === 0 ? chip : cont }));
  }

  function itemRows(it: Item, w: number): { rows: Row[]; span: [number, number] } {
    const perWidth = lineCache.get(it.k);
    const cached = perWidth?.get(w);
    if (cached && cached.rev === revs.get(it.k) && cached.hl === highlightVersion()) {
      // LRU touch: delete+set refreshes Map iteration order so the eviction
      // scan below (oldest-first) drops the width not used the longest
      perWidth!.delete(w);
      perWidth!.set(w, cached);
      return cached;
    }
    // The marker rides a fixed left gutter; content wraps inside the remainder.
    // wrap width and paint offset must reserve the SAME gutter — both read
    // contentWidth/contentOrigin from layout.ts, so they cannot disagree (this
    // is the off-by-one that made a selected marked row look displaced).
    //
    // A tool BODY is markerCont: it shares the head's seq but never paints a
    // chip, so it must reserve NO gutter. Keying the geometry off `it.seq` gave
    // the body a gutter it does not have, and its selection landed a chip-width
    // right of the text.
    const cw = contentWidth(w, rowSeq(it));
    let rows: Row[];
    if (it.kind === "md") {
      // no trailing blank: spacing between items is buildRows' job
      rows = [];
      for (const mline of renderMarkdown(it.text, undefined, cw)) rows.push(...wrapCodeAware(mline, cw).map((segs) => ({ segs })));
    } else if (it.ephemeral) {
      // Ephemeral notice: a boxed, uniformly-colored block that dies on the
      // next keypress/click. The box keeps it physically separate from the
      // transcript it floats over (it used to render as a bare info line,
      // blending into neighboring md rows); one style id for every line keeps
      // it uniform instead of inheriting whatever colors it wrapped.
      const inner = Math.max(20, w - 4);
      // SOLID box: every row sets row.bg so the transcript region fillRows the
      // full width BEFORE stamping (segs-level bg only covers the glyph cells;
      // the margins around the box stayed default)
      const boxFill = (segs: Seg[]): { segs: Seg[]; bg: number } => ({ segs, bg: S.barBgRow });
      rows = [boxFill([{ t: `╭${"─".repeat(inner)}╮`, fg: C.info, bg: C.barBg }])];
      const lines = it.text.split("\n");
      for (const l of lines) {
        const clipped = clipW(l, inner);
        const pad = " ".repeat(Math.max(0, inner - Bun.stringWidth(clipped)));
        rows.push(boxFill([{ t: `│ ${clipped}${pad} │`, fg: C.info, bg: C.barBg }]));
      }
      rows.push(boxFill([{ t: `╰${"─".repeat(inner)}╯`, fg: C.info, bg: C.barBg }]));
    } else if (it.kind === "think") {
      if (it.expanded) {
        const body = thinkRows(it, cw);
        rows = [{ segs: [{ t: "▾ thinking", fg: C.think }] }, ...body];
        if (!rows[rows.length - 1].segs.length) rows.pop(); // empty body: wrap emits one [[]] caret row
      } else {
        // collapsed count rides the kernel's bookkeeping when the kernel is
        // warm (mid-stream); cold, one split pays for it — same as before
        const e = thinkKernels.get(it.k);
        const words = e && e.fed === it.text.length ? e.words : it.text.trim() ? it.text.trim().split(/\s+/).length : 0;
        rows = [{ segs: [{ t: `▸ thinking (${words} words)`, fg: C.think }] }];
      }
    } else if (it.kind === "toolhead" && (it.detail || it.argsRaw !== undefined)) {
      // a tool call whose input overflowed the head line: collapsed shows the
      // one-liner with a leading arrow (like thinking/output) plus a hint, so
      // the affordance is visible without reading to the end of the line;
      // expanded wraps the FULL input across the whole screen width instead of
      // stopping at 60 chars
      if (it.expanded) {
        fillDetail(it);
        rows = wrapSegs([{ t: `▾ ${it.text}`, fg: C.tool }], cw).map((segs) => ({ segs }));
        rows.push(...wrapSegs([{ t: `  ${it.detail ?? ""}`, fg: C.chrome }], cw).map((segs) => ({ segs })));
      } else {
        rows = [
          {
            segs: [
              { t: "▸ ", fg: C.chrome },
              { t: it.text, fg: C.tool },
              // a one-line input that already fits collapses to the same
              // pixels expanded — folding it would be a no-op surprise
              ...(toolInputFits(it) ? [] : [{ t: " · input", fg: C.chrome }]),
            ],
          },
        ];
      }
    } else if (it.kind === "toolbody") {
      if (!it.toolResult) {
        // info lines that borrow the muted style (welcome, hints) — no arrow, no ↳
        rows = wrapSegs([{ t: it.text, ...itemStyle(it.kind) }], cw).map((segs) => ({ segs }));
      } else if (it.expanded) {
        // full output: real lines, no ⏎ one-lining, no ↳ prefix. Rich mode
        // paints unified-diff/git markers in their own colors.
        rows = [];
        if (it.mdBody) {
          // markdown body (todo task lists): through the md parser so
          // task-list syntax renders as status marks, not punctuation
          for (const mline of renderMarkdown(it.text, undefined, cw)) rows.push(...wrapCodeAware(mline, cw).map((segs) => ({ segs })));
        } else {
          const lines = it.text.split("\n");
          // Pair each -/+ run so rich mode can word-diff INSIDE changed lines:
          // pairOf[i] is the index of the line this one is paired with.
          const pairOf = new Map<number, number>();
          for (let li = 0; li + 1 < lines.length; li++) {
            if (/^-/.test(lines[li]) && /^\+/.test(lines[li + 1]) && !/^---/.test(lines[li]) && !/^\+\+\+/.test(lines[li + 1])) {
              pairOf.set(li, li + 1);
              pairOf.set(li + 1, li);
              li++;
            }
          }
          for (let li = 0; li < lines.length; li++) {
            let colored: Seg[] | null = null;
            {
              const line = lines[li];
              const paired = pairOf.has(li) ? wordDiffSegs(line, lines[pairOf.get(li)!]) : null;
              // word-diff (partial change) beats whole-line diff coloring;
              // then ANSI passthrough, then the structural tints
              colored = paired ?? ansiSegs(line);
              const plain = colored.length === 1 && !colored[0].fg && !colored[0].bold && !colored[0].italic && !colored[0].strike;
              if (plain) {
                colored =
                  diffSegs(line) ??
                  statusSegs(line) ??
                  pathSegs(line) ??
                  (looksLikeJson(line) ? jsonSegs(line) : null);
              }
            }
            const segs = colored ? [{ t: "  ", fg: C.chrome }, ...colored] : [{ t: `  ${lines[li]}`, ...itemStyle(it.kind) }];
            rows.push(...wrapSegs(segs, w).map((segs) => ({ segs })));
          }
        }
      } else {
        // collapsed: one arrow line, like thinking — no partial preview
        const chars = it.text.length;
        const lines = it.text.split("\n").length;
        rows = [
          {
            segs: [
              { t: `  ▸ output (${lines > 1 ? `${lines} lines` : `${chars} chars`})`, fg: C.chrome },
            ],
          },
        ];
      }
    } else {
      rows = wrapSegs([{ t: it.text, ...itemStyle(it.kind) }], cw).map((segs) => ({ segs }));
    }
    if (rowSeq(it) !== undefined) rows = withMarker(rows, rowSeq(it)!, it.markerCont);
    const entry = { rev: revs.get(it.k) ?? 0, rows, hl: highlightVersion(), span: itemEdgeSpan(rows) };
    let pw = lineCache.get(it.k);
    if (!pw) {
      pw = new Map();
      lineCache.set(it.k, pw);
    }
    pw.set(w, entry);
    // Cap widths per item: every terminal resize (and the scrollbar's W/W-2
    // dual pass) used to add a FULL set of wrapped rows per width and keep it
    // forever — on a long session that was hundreds of MB of stale Row/Seg
    // objects. Two warm (current + scrollbar partner), everything else evicted
    // oldest-first; re-wrap on a re-widened window costs one pass, same as a
    // cache-cold frame.
    while (pw.size > 2) {
      const oldest = pw.keys().next().value;
      if (oldest === undefined) break;
      pw.delete(oldest);
    }
    return entry;
  }


  // ---- input layout: soft-wrap + flex box + caret mapping ----
  const INPUT_MAX_ROWS = 8;

  interface VisualRow {
    text: string;
    logical: number; // logical line index
    startCol: number; // display column where this visual row begins
    rowW: number; // this row's own display width (≤ maxCols; word-wrap leaves it short)
    index: number;
  }
  interface InputLayout {
    rows: VisualRow[];
    logical: string[];
    lineStarts: number[]; // buf index where each logical line starts
    maxCols: number;
  }

  // Word-aware wrap, matching the transcript's wrapSegs: break at spaces so a
  // word never splits mid-glyph; a single oversized word still fills then
  // continues (hard char-split). The old version cut at exactly maxCols, which
  // broke words in the middle — this breaks at the space before maxCols.
  //
  // Leading spaces are KEPT, unconditionally. wrapSegs suppresses them (spaces
  // at the very start of a transcript line are layout noise), and this used to
  // copy that rule — which silently dropped the indentation a user had typed:
  // "  hello" painted as "hello" while the caret, computed from the real buffer,
  // sat 2 columns past the end of the text. With 4 spaces it was 4 off, and it
  // hit every indented block — the exact input (pasted code, YAML, a markdown
  // list) where leading whitespace is the content. An editor must round-trip
  // what it is given; the suppression is for rendering, not for editing.
  function wrapByWidth(s: string, maxCols: number): string[] {
    if (s.length === 0) return [""];
    const out: string[] = [];
    let line = "";
    for (const word of s.split(/( +)/)) {
      if (!word) continue;
      if (/^ +$/.test(word)) {
        const room = maxCols - currentWidth();
        const sp = Math.min(word.length, Math.max(0, room));
        if (sp > 0) add(" ".repeat(sp));
        continue;
      }
      let w = word;
      for (;;) {
        if (currentWidth() + widthOf(w) <= maxCols) {
          add(w);
          break;
        }
        if (line.length === 0) {
          // lone oversized word: fill the line, hard-split the rest
          let take = "";
          let tw = 0;
          for (const ch of w) {
            const cw = charWidth(ch.codePointAt(0)!);
            if (tw + cw > maxCols) break;
            take += ch;
            tw += cw;
          }
          if (!take) break;
          add(take);
          flush();
          w = w.slice(take.length);
          if (!w) break;
          continue;
        }
        flush();
      }
    }
    flush();
    return out.length ? out : [""];
    // -- tiny helpers over the in-progress line --
    function currentWidth(): number {
      let n = 0;
      for (const ch of line) n += charWidth(ch.codePointAt(0)!);
      return n;
    }
    function widthOf(t: string): number {
      let n = 0;
      for (const ch of t) n += charWidth(ch.codePointAt(0)!);
      return n;
    }
    function add(t: string): void {
      line += t;
    }
    function flush(): void {
      out.push(line);
      line = "";
    }
  }

  let inputRev = 0; // bumped on every buffer mutation
  /**
   * What the input dock paints. Identical to the buffer except on a secret
   * prompt step (an api key), where every non-newline code point is a bullet —
   * one bullet per code point keeps the caret math honest (see caretPos).
   */
  function inputText(): string {
    const d = display();
    const st = getPrompt()?.steps[getPrompt()!.idx];
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
      // Word-aware wrap breaks at spaces, so a visual row is NOT maxCols wide.
      // startCol is the display column where the row begins (cumulative width of
      // prior parts + skipped break spaces); rowW is this row's own width, so the
      // caret/selection math no longer assumes every row spans the full maxCols.
      const parts = wrapByWidth(logical[li], maxCols);
      let colAt = 0;
      for (let pi = 0; pi < parts.length; pi++) {
        const partW = parts[pi].length ? [...parts[pi]].reduce((a, ch) => a + charWidth(ch.codePointAt(0)!), 0) : 0;
        rows.push({ text: parts[pi], logical: li, startCol: colAt, rowW: partW, index: rows.length });
        colAt += partW;
        // the break space between wrapped parts is consumed, not painted
        if (pi + 1 < parts.length && logical[li].length > colAt && logical[li][colAt] === " ") colAt += 1;
      }
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
    // A row spans [startCol, startCol + rowW) — word-wrap leaves rowW < maxCols,
    // so matching against maxCols would let a short row swallow the next row's
    // columns. Rows are contiguous (next.startCol = this.startCol + rowW + 1 for
    // the consumed break space), so the last row on the line absorbs the EOL.
    let visRow = layout.rows.findIndex((r) => r.logical === li && colW >= r.startCol && colW < r.startCol + Math.max(r.rowW, 1));
    // No match means colW landed exactly on a row's end width — which is the
    // NORMAL state for the caret at the end of a line (it sits just past the
    // last char, before the newline), and equally the last row of a wrapped
    // line. It must stay on THIS line's final row. The old fallback took
    // `rows.length - 1`, the last row of the whole layout, so end-of-line put
    // the caret on a different line entirely in any multi-line input ("first\n
    // second" — end of "first" jumped down onto "second"). Comment claimed
    // "the last row on the line"; the code never scoped it to the line.
    if (visRow < 0) {
      for (let i = layout.rows.length - 1; i >= 0; i--) {
        if (layout.rows[i].logical === li) {
          visRow = i;
          break;
        }
      }
    }
    if (visRow < 0) visRow = layout.rows.length - 1; // past EOL lands on last row
    return { visRow, colW: colW - layout.rows[Math.max(0, visRow)].startCol };
  }

  // ---- input selection + vertical motion ----

  /** The anchored end of an input selection; the caret is the moving end. */
  let inSelAnchor: number | null = null;
  const inSelRange = (): [number, number] | null =>
    inSelAnchor !== null && inSelAnchor !== cur ? [Math.min(inSelAnchor, cur), Math.max(inSelAnchor, cur)] : null;

  /** Delete the input selection if there is one; true when it did. */
  function deleteInSel(): boolean {
    const r = inSelRange();
    if (!r) return false;
    buf.splice(r[0], r[1] - r[0]);
    cur = r[0];
    inSelAnchor = null;
    inputRev++;
    markDirty();
    return true;
  }

  /** buffer-index range one visual row covers (the newline excluded) */
  function rowBufRange(layout: InputLayout, v: number): [number, number] {
    const row = layout.rows[v];
    const chars = [...inputText()];
    let i = layout.lineStarts[row.logical];
    let w = 0;
    while (i < chars.length && chars[i] !== "\n" && w < row.startCol) {
      w += charWidth(chars[i].codePointAt(0)!);
      i++;
    }
    const start = i;
    // the row spans its own width (rowW), not maxCols — word-wrap leaves it
    // short, and walking maxCols would run into the next row's text
    let w2 = 0;
    while (i < chars.length && chars[i] !== "\n" && w2 < row.rowW) {
      w2 += charWidth(chars[i].codePointAt(0)!);
      i++;
    }
    return [start, i];
  }

  /** (x, y) in the input dock -> buffer index; null when y is above the dock. */
  function inputIndexAt(x: number, y: number): number | null {
    const { layout, firstShown, inputTop, shownCount } = dockGeom();
    if (y < inputTop || y >= inputTop + shownCount) return null;
    const v = Math.min(firstShown + (y - inputTop), layout.rows.length - 1);
    const [s, e] = rowBufRange(layout, v);
    const targetW = Math.max(0, x - 3); // 1 margin + 2 for the "❯ " prefix
    return s + indexAtWidth(inputText().slice(s, e), targetW);
  }

  /** up/down inside a multi-line input, keeping the display column. */
  function moveCaretVertical(dir: -1 | 1, extend: boolean) {
    if (extend && inSelAnchor === null) inSelAnchor = cur;
    if (!extend) inSelAnchor = null;
    const layout = inputLayout();
    const pos = caretPos(layout);
    const tv = pos.visRow + dir;
    if (tv < 0) cur = 0;
    else if (tv >= layout.rows.length) cur = buf.length;
    else {
      const [s, e] = rowBufRange(layout, tv);
      cur = s + indexAtWidth(inputText().slice(s, e), pos.colW);
    }
    markDirty();
  }

  function clampScroll() {
    scrollTop = Math.max(0, Math.min(scrollTop, Math.max(0, totalRows() - viewportH())));
  }

  /**
   * Incremental stream rendering — delegated to the rows kernel
   * (src/tui/rows.ts), golden-pinned byte-identical to the previous
   * streamCache implementation. The kernel splits settled (rendered once)
   * from tail (re-rendered per feed) and reuses wrapped lines except the
   * final visual line, so a long response costs O(delta + one line) per
   * delta instead of O(everything so far) — measured ~2.7x on a 100KB
   * no-newline stream, and the gap grows with response length.
   */
  // one kernel per width: computeFrame assembles at W and again at W-2 when
  // the scrollbar shows, so alternating widths would thrash a single kernel
  // into a full rebuild every frame
  const streamKernels = new Map<number, { len: number; k: import("./rows.ts").StreamRows }>();

  /**
   * Incremental kernels for EXPANDED think bodies, keyed by item key: a
   * streaming think delta used to `touch` the item and re-wrap its WHOLE
   * text on the next frame (O(size) per delta — the last think chunk cost
   * as much as the whole transcript). The kernel feeds only the delta;
   * shrink or width change resets it. `words` rides along so the collapsed
   * header's count is incremental too — no full-text split per frame.
   */
  const thinkKernels = new Map<number, { w: number; fed: number; k: import("./rows.ts").PlainRows; words: number; endsSpace: boolean }>();

  function thinkRows(it: Item, w: number): Row[] {
    let e = thinkKernels.get(it.k);
    if (!e || e.w !== w || e.fed > it.text.length) {
      e = { w, fed: 0, k: createPlainRows(w, { fg: C.think }), words: 0, endsSpace: true };
      thinkKernels.set(it.k, e);
      if (thinkKernels.size > 8) {
        // items are re-minted on refresh(); drop kernels nothing points at
        const live = new Set(items.map((i) => i.k));
        for (const key of thinkKernels.keys()) if (!live.has(key)) thinkKernels.delete(key);
      }
    }
    if (it.text.length > e.fed) {
      const delta = it.text.slice(e.fed);
      // incremental word count: a word is a maximal non-space run
      let words = e.words;
      let inWord = !e.endsSpace;
      for (const ch of delta) {
        const sp = /\s/.test(ch);
        if (!sp && !inWord) words++;
        inWord = !sp;
      }
      e.words = words;
      e.endsSpace = /\s/.test(delta[delta.length - 1] ?? " ");
      e.k.feed(delta);
      e.fed = it.text.length;
    }
    return e.k.rows as Row[];
  }

  function streamRows(text: string, w: number): Row[] {
    // when the tail carries a [N] marker it must wrap inside the gutter, so the
    // chip can ride column 0 without the content overflowing the full width.
    // Same reservation as itemRows: the chip PLUS its one gap column.
    const innerW = contentWidth(w, streamSeq > 0 ? streamSeq : undefined);
    let entry = streamKernels.get(innerW);
    // a SHRINK or mid-prefix change means a rewind — the kernel's accumulated
    // state is invalid, start fresh
    if (!entry || entry.len > text.length || (entry.len > 0 && !text.startsWith(text.slice(0, entry.len)))) {
      entry = { len: 0, k: createStreamRows(innerW) };
      streamKernels.set(innerW, entry);
      if (streamKernels.size > 4) streamKernels.clear(); // widths are W and W-2; bound anyway
    }
    if (text.length > entry.len) {
      entry.k.feed(text.slice(entry.len));
      entry.len = text.length;
    }
    const rows = entry.k.rows as Row[];
    // the streaming tail predicts its eventual seq (see streamSeq) so its [N]
    // marker renders live like every settled item, not just after the turn ends
    return streamSeq > 0 ? withMarker(rows, streamSeq) : rows;
  }

  /** total transcript rows: the painted frame's count, or a one-off compute
   *  when no frame is up yet (scroll keys can fire before the first paint) */
  function totalRows(): number {
    if (painted) return painted.total;
    return computeFrame(frameInput()).total;
  }

  /**
   * The wrap width this frame's rows are built at, and whether the scrollbar
   * strip is reserved, decided from THIS frame's data.
   *
   * The old code keyed the decision off the previous frame's sbShowing, so
   * content sitting at the overflow boundary flipped the flag (and the wrap
   * width) every frame while streaming — the "scrollbar flickers and jumps"
   * bug. Two passes fix it: build at full width; only if that overflows do we
   * rebuild one column short and show the strip. The extra pass runs once on
   * the flip frame, not per frame.
   */
  // ---- frame: compute via layout.ts, keep as THE geometry of record ----
  /**
   * The frame ON SCREEN. paint() computes a fresh one each pass and stamps the
   * grid from it; every hit-test (click, scrub, select) reads THIS object —
   * never rebuilds. One source of truth, so a click can't drift off the pixels
   * the way separate recomputation allowed.
   */
  let painted: Frame | null = null;

  function frameInput(): FrameInput {
    const layout = inputLayout();
    const caret = caretPos(layout);
    return {
      W,
      H,
      scrollTop,
      stick,
      scrollbar: SCROLLBAR,
      items,
      streamText,
      renderItem: (it, w) => {
        // edge-stripped, the very same span `countItem` reports — layout's
        // spacing contract is "count and paint agree", and they cannot drift
        // apart while both read this one span
        const cached = itemRows(it, w);
        const [a, b] = cached.span;
        const tool = it.kind === "toolhead" || it.toolResult;
        const out: Row[] = [];
        const src = cached.rows;
        for (let i = a; i < b; i++) out.push({ ...src[i], bg: tool ? S.toolBgRow : src[i].bg });
        return out;
      },
      countItem: (it, w) => {
        const cached = itemRows(it, w);
        const [a, b] = cached.span;
        return b - a;
      },
      renderStream: (text, w) => streamRows(text, w),
      countStream: (text, w) => streamRows(text, w).length,
      inputRows: layout.rows.length,
      caretRow: caret.visRow,
      INPUT_MAX_ROWS,
      pendingCount: pendingLines().length,
    };
  }

  /** Scroll-key arithmetic before a frame exists; matches computeFrame's vh. */
  function viewportH(): number {
    return viewportHeight(frameInput());
  }

  /**
   * Slash-command hints. `maxRows` is the vertical space actually available
   * above the dock — the window into the match list is sized by the hardware,
   * not by a fixed preset.
   */
  function hintText(maxRows = H - 3): {
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
    const win = Math.max(1, maxRows);
    const sel = Math.max(0, Math.min(matches.length - 1, hintSel));
    const start = Math.max(0, Math.min(sel - win + 1, matches.length - win));
    return {
      rows: matches.slice(start, start + win).map((c, i) => ({
        text: `${(c.usage ? `${c.name} ${c.usage}` : c.name).padEnd(20)} ${c.desc}`,
        sel: start + i === sel,
      })),
      active: true,
      matches,
      start,
    };
  }

  /** Status bar info segments, least-important first (drop order). */
  function statusText(): string[] {
    try {
      // Context size is the provider's last report plus a chars/4 estimate of
      // the visible messages appended since (sessionContextTokens) — some
      // endpoints report only uncached input, so the raw report alone reads
      // far below what is actually on the wire. The in-turn live figure
      // (lastPromptTokens) is replaced by that combined view.
      const reported = state.sessionId ? sessionContextTokens(state.sessionId) : lastPromptTokens;
      const info = lookupModel(state.provider.model);
      const k = (n: number) => `${Math.round(n / 1000)}k`;
      const ctx = reported
        ? `ctx ${Math.min(100, Math.round((reported / info.contextWindow) * 100))}% (${k(reported)}/${k(info.contextWindow)})`
        : "ctx —";
      const home = process.env.HOME ?? "";
      const cwdShort = home && state.cwd.startsWith(home) ? "~" + state.cwd.slice(home.length) : state.cwd;
      // session-cumulative prefix-cache hit rate, not the last call's — one
      // number answering "is caching actually working on this session". Shown
      // as soon as anything has been billed, including 0%: "no hits yet" and
      // "no telemetry" must not look alike, and there is no "no telemetry"
      // case here — an un-caching provider simply reports zero.
      const hit = cacheHit();
      const cache = hit.prompt > 0 ? ` · cache ${Math.round((hit.cached / hit.prompt) * 100)}%` : "";
      return [cwdShort, providerDisplayName(state), state.provider.model, `${ctx}${cache}`];
    } catch {
      return [state.cwd];
    }
  }

  // stats involve a full log replay — cache per revision, never per frame
  let statsRev = 0;
  let statsCacheRev = -1;
  let statsCacheSegs: string[] = [];
  function cachedStats(): string[] {
    // re-poll on an explicit revision bump, or on a timer only while a turn is
    // running (an idle session's log can't change under us)
    const stale = busy && Date.now() - lastStatsAt > 2_000;
    if (statsCacheRev !== statsRev || stale) {
      statsCacheSegs = statusText();
      statsCacheRev = statsRev;
      lastStatsAt = Date.now();
    }
    return statsCacheSegs;
  }
  let lastStatsAt = 0;

  /** config `statusBar` parsed once per revision — /settings bumps statsRev */
  let statusBarCacheRev = -1;
  let statusBarCacheSlots: string[] = [];
  function statusBarSlots(): string[] {
    if (statusBarCacheRev !== statsRev) {
      statusBarCacheSlots = (state.config?.statusBar ?? "cwd provider model ctx").trim().split(/\s+/);
      statusBarCacheRev = statsRev;
    }
    return statusBarCacheSlots;
  }

  /** plugin `statusSegments` lookup; a throwing segment is dropped, warned once per name */
  const segWarned = new Set<string>();
  function pluginSegment(name: string): string | null {
    for (const p of activePlugins()) {
      const fn = p.statusSegments?.[name];
      if (!fn) continue;
      try {
        return fn();
      } catch (e) {
        if (!segWarned.has(name)) {
          segWarned.add(name);
          push("error", `statusSegment '${name}' (${p.name}) threw: ${(e as Error)?.message ?? e}`, { ephemeral: true });
        }
        return null;
      }
    }
    return null; // unknown slot: silently ignored, per the config doc
  }

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
    toolBgRow: 0,
    panelBgRow: 0,
    hintOnBase: 0,
    think: 0,
    sbThumb: 0,
    sbTrack: 0,
    overlayRow: 0,
    overlaySel: 0,
    prompt: 0,
    cmd: 0,
    shell: 0,
    spin: 0,
    running: 0,
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
    S.spin = screen.sgr({ fg: C.spinnerFg ?? C.accent });
    S.running = screen.sgr({ fg: C.runningFg ?? C.tool });
    S.chromeOnBar = screen.sgr({ fg: C.chrome, bg: C.barBg });
    S.inputFg = screen.sgr({ fg: C.fg, bg: C.inputBg });
    S.hintDim = screen.sgr({ fg: C.hint, bg: C.barBg });
    S.hintSel = screen.sgr({ fg: C.hintSel, bg: C.barBg });
    S.inputBgRow = screen.sgr({ fg: C.fg, bg: C.inputBg });
    S.barBgRow = screen.sgr({ fg: C.fg, bg: C.barBg });
    S.toolBgRow = screen.sgr({ fg: C.fg, bg: C.toolBg });
    S.panelBgRow = screen.sgr({ fg: C.fg, bg: C.panelBg ?? C.inputBg }); // floating cmd-output panels
    S.hintOnBase = screen.sgr({ fg: C.hint }); // floats over the transcript's own background
    S.think = screen.sgr({ fg: C.think }); // thinking blocks: distinct from tool/toolbody
    S.sbThumb = screen.sgr({ bg: C.hint }); // theme's muted tone: visible on both bar and transcript
    // the gutter line the thumb rides — its own slot (see Theme.sbTrack):
    // barBg is near-black and vanished against the default background on
    // plain-text rows, showing only over toolBg/think fills
    S.sbTrack = screen.sgr({ bg: C.sbTrack ?? C.inputBg });
    S.overlayRow = screen.sgr({ fg: C.fg, bg: C.inputBg });
    S.overlaySel = screen.sgr({ fg: C.hintSel, bg: C.selBg });
    S.prompt = screen.sgr({ fg: C.prompt ?? C.accent }); // input-dock ❯ / › prefix
    S.cmd = screen.sgr({ fg: C.cmd ?? C.info, bg: C.inputBg }); // leading / of a slash command
    S.shell = screen.sgr({ fg: C.shell ?? C.ok, bg: C.inputBg }); // leading ! of a shell escape
  }

  /** shared dock geometry for paint + click mapping */
  let nextCaret: { x: number; y: number } | null = null;
  function dockGeom() {
    const layout = inputLayout();
    const caret = caretPos(layout);
    // dock geometry from the PAINTED frame when one is up (hit-tests must not
    // disagree with the pixels); before the first paint, compute directly
    const fr = painted;
    if (fr) return { layout, caret, shownCount: fr.shownCount, firstShown: fr.firstShown, inputTop: fr.inputTop };
    const totalVis = layout.rows.length;
    const shownCount = dockRows(H, totalVis, INPUT_MAX_ROWS); // matches computeFrame
    let firstShown = 0;
    if (totalVis > shownCount) {
      firstShown = Math.max(0, Math.min(caret.visRow - (shownCount - 1), totalVis - shownCount));
      if (caret.visRow < firstShown) firstShown = caret.visRow;
    }
    return { layout, caret, shownCount, firstShown, inputTop: H - 1 - shownCount };
  }

  /**
   * Rows above the input dock claimed by floating layers, and the first row
   * above them. paint() and every hit-test MUST derive these here — every
   * past mismatch painted one thing and clicked another (wizard menu over
   * queued rows, clicks falling through floats onto transcript items).
   */
  function dockFloats(): { queueH: number; cmdH: number; top: number } {
    const { inputTop } = dockGeom();
    // painted frame's stack height when one is up (hit-tests match pixels)
    const queueH = painted ? painted.queueH : queueStackH();
    const cAvail = cmdOut?.length ? Math.max(1, inputTop - queueH - 1) : 0;
    const cmdH = cmdOut?.length ? Math.min(cmdOut.length, cAvail) + (cmdOut.length > cAvail ? 1 : 0) : 0;
    return { queueH, cmdH, top: inputTop - queueH - cmdH };
  }

  /**
   * First screen row belonging to the dock: the queued/steering rows stacked
   * above the input box plus the box itself. Same row budget paint() and
   * onClick() use, so scroll routing agrees with the pixels about where the
   * dock starts — the flex height and queue length fall out of dockGeom, no
   * special case needed for either.
   */
  function dockTopY(): number {
    const { inputTop } = dockGeom();
    return inputTop - (painted ? painted.queueH : queueStackH());
  }

  /** Height of the queued/steering stack, exactly as viewportH reserves it. */
  function queueStackH(): number {
    const pend = pendingLines();
    if (!pend.length) return 0;
    const { inputTop } = dockGeom();
    const shown = pend.slice(0, Math.max(1, inputTop - 1)).length;
    return shown + (pend.length > shown ? 1 : 0);
  }

  /** queued+steering stack height as the FRAME computed it (paint consumes
   *  this; re-deriving differs when dockGeom's inputTop moved mid-turn) */
  function queueRowsInFrame(fr: Frame): number {
    return fr.queueH;
  }

  // ---- region architecture ----
  // The old paint() re-derived the ENTIRE grid whenever anything was dirty —
  // including 7x/sec for the spinner, so a one-glyph rotation cost a full
  // frame. The screen's row-hash diff made the OUTPUT cheap; the DERIVATION
  // was full-price. Regions fix the derivation: each region re-stamps only
  // when its own inputs changed (tracked by a cheap signature), and the
  // spinner tick re-derives the status bar alone.

  // setTuiScrollbar (config apply, called from outside startTui's closure)
  // uses this to force a full repaint on live switches
  clearKeyRef = () => {
    lastClearKey = "";
    dirty = true;
  };

  /** Frame signature: everything computeFrame + the transcript depend on. */
  let lastFrameSig = "";
  /** Status signature: spinner idx, busy label, flash, stats, elapsed second. */
  let lastStatusSig = "";
  /** Dock signature: buffer rev, prompt step, selection, caret. */
  let lastDockSig = "";
  /** Floats signature: queue depth, cmdOut, hints, prompt. */
  let lastFloatsSig = "";
  /** Full-invalidate key: dims + theme (screen.resize/initStyles territory). */
  let lastClearKey = "";
  /** Does the transcript need re-derivation? Cheap incremental check. */
  function transcriptSig(): string {
    // items rev sum changes on any touch(); streamText identity per stream;
    // selection via anchors; scroll offsets are the frame's own inputs.
    let revSum = 0;
    for (const it of items) revSum += revs.get(it.k) ?? 0;
    // pendingCount drives viewportHeight (queue rows reserve transcript rows),
    // so it belongs in the frame signature — a queue change shifts every
    // transcript row and must re-derive the region
    // selection: FULL anchors, not a boolean — a boolean makes drag-extension
    // invisible (hasSel stays true while the drag grows; frameChanged never
    // fires; the highlight freezes at where it first appeared)
    // inputRev + dock caret: the input layout (wrapped row count) is a
    // computeFrame INPUT — it sets shownCount/inputTop, i.e. where the
    // transcript ends and the dock begins. Without it the box never flexed:
    // typing past a line re-wrapped the buffer but the frame kept the old
    // dock height, and paintDock stamped into the stale geometry.
    const layout = inputLayout();
    const caret = caretPos(layout);
    return `${W}x${H}|${revSum}|${items.length}|${scrollTop}|${stick}|${streamText?.length ?? -1}|${streamText?.slice(-24) ?? ""}|${SCROLLBAR}|${hasSel() ? `${selA!.row},${selA!.col},${selB!.row},${selB!.col}` : "-"}|${themeName()}|${state.readOnly}|${pendingLines().length}|${inputRev}|${layout.rows.length}|${caret.visRow}|${highlightVersion()}`;
  }

  function statusSig(): string {
    const flash = Date.now() < flashUntil ? flashMsg : "";
    // elapsed() rounds to seconds — the sig flips once per second, so the
    // clock text updates without a full frame
    return `${frameIdx}|${flash}|${displayBusy()}|${busyMsg ?? ""}|${streamText !== null}|${elapsed()}|${cachedStats()}|${state.readOnly}`;
  }

  function dockSig(): string {
    const st0 = getPrompt()?.steps[getPrompt()!.idx];
    // cur rides the sig: input drag-selection moves cur without bumping
    // inputRev, and the highlight range is (inSelAnchor, cur)
    return `${inputRev}|${cur}|${getPrompt() ? `${getPrompt()!.idx}|${st0?.kind}|${getPrompt()!.filter}` : "-"}|${inSelAnchor ?? "-"}|${nextCaret ? "c" : "-"}`;
  }

  function floatsSig(): string {
    const pend = pendingLines();
    return `${pend.length}|${pend[0] ?? ""}|${cmdOut?.length ?? 0}|${cmdOut?.[0] ?? ""}|${getPrompt() ? `${getPrompt()!.idx}|${getPrompt()!.sel}|${getPrompt()!.filter}|${wizardOptionsCount()}` : "-"}|${hintMatches().length}|${hintSel}|${W}|${inputRev}`;
  }

  function overlaySig(): string {
    return overlay ? `${overlay.filter()}|${overlay.selectedIndex()}|${overlay.pendingConfirm()?.id ?? ""}` : "-";
  }

  let lastOverlaySig = "";

  function paint() {
    const st = (seg: Seg, fallback: number): number => {
      if (!seg.fg && !seg.bg && !seg.bold && !seg.italic && !seg.strike && !seg.href) return fallback;
      return screen.sgr(seg);
    };
    void st;

    // full invalidate on dims/theme change: screen.resize already zeroed the
    // grid; forceRepaintAll makes flush re-emit every row
    const clearKey = `${W}x${H}|${themeName()}`;
    const fullInvalidate = clearKey !== lastClearKey;
    if (fullInvalidate) {
      screen.clear();
      screen.forceRepaintAll();
      lastClearKey = clearKey;
      lastFrameSig = "";
      lastDockSig = "";
      lastFloatsSig = "";
      lastStatusSig = "";
      lastOverlaySig = "";
    }

    // ---- frame + transcript region ----
    const pT = PROF ? performance.now() : 0;
    const fs = transcriptSig();
    const frameChanged = fs !== lastFrameSig || !painted;
    const pS = PROF ? performance.now() : 0;
    if (frameChanged) {
      const fr = computeFrame(frameInput());
      scrollTop = fr.scrollTop; // computeFrame owns the clamp/stick rule
      stick = fr.stick;
      painted = fr; // THE geometry of record until the next frame
      lastFrameSig = fs;

      // transcript — the plane is restamped in full; there is no "old range"
      // to clear, because everything it contained is about to be overwritten
      // (and a cell the new frame does NOT write is transparent, revealing
      // the grid's last composite — which is exactly what stale-ghosting
      // used to require clearRows choreography to avoid)
      P.transcript.clearRows(0, H);

      // fr.rows is the WINDOW built around scrollTop (total is the real
      // length): rows[0] is absolute row fr.scrollTop - fr.winOffset, and the
      // viewport starts winOffset rows INTO the slice — rows before it are
      // scroll-up margin, never on screen
      const winBase = fr.scrollTop - fr.winOffset;
      let y = 0;
      for (let i = fr.winOffset; i < fr.rowCount && y < fr.vh; i++, y++) {
        const row = fr.rows[i];
        const absolute = winBase + i;
        // tool rows fill the background first, so the text paints over it
        // instead of floating in default. NEVER the last column — that cell
        // belongs to the scrollbar strip (the strip's track/thumb must show
        // through even on tool rows)
        if (row.bg) P.transcript.fillRow(y, 0, SCROLLBAR ? W - 1 : W, row.bg);
        // the [N] marker chip hugs column 0 — OUTSIDE the content margin — so
        // it sits at the very-left edge. A marked item's first row stamps the
        // chip; its continuation rows carry the same-width indent so wrapped
        // text stays aligned under the content, not the marker.
        const mk = row.marker;
        // a chip row reserves its `[N]` width + one gap; a continuation row
        // (indent 0) has no marker, so its content starts at the usual margin
        const chipW = mk && "w" in mk ? mk.w : 0;
        if (mk && "label" in mk) {
          // bg spans EXACTLY `[N]` — the gap after it stays uncolored so no
          // stray background cell trails the marker
          P.transcript.text(0, y, mk.label, screen.sgr({ fg: mk.fg, bg: mk.bg, bold: true }));
          // text() keeps a filled cell's bg when painting over it, so the gap
          // column would inherit the row fill — stamp it default to be sure
          P.transcript.text(chipW, y, " ", S.base);
        }
        // content sits one uncolored space past the chip on line 1, and at the
        // usual x=1 margin on every wrapped line — the marker only borrows line 1
        const x0 = contentOriginForChip(chipW);
        let x = x0;
        for (const seg of row.segs) {
          x = P.transcript.text(x, y, seg.t, st(seg, S.base));
        }
        // Selection is a re-style over the cells already painted, not a second
        // text pass: one char per cell, so re-stamping the range with a
        // highlight background cannot disturb wide chars or wrapping. The range
        // is relative to the CONTENT (row.segs), which starts at x0 — restyle at
        // x0 + offset, not 1 + offset, or the highlight lands a marker-width off.
        // restyle() takes an EXCLUSIVE end but selRangeForRow returns an inclusive
        // `to`, so +1 or the last selected cell (e.g. a trailing '.') stays unlit.
        //
        // The selection covers CONTENT ONLY, never the chip: the marker is not
        // part of the message text (rowCells is built from row.segs, which
        // excludes it) and it is not in the copied output either. Highlighting
        // it would make the screen claim the selection covers a glyph the
        // clipboard never got. The chip keeps markerBg and the gap column keeps
        // its own cell, so a selected marked row reads as chip + gap + lit text.
        if (hasSel()) {
          const range = selRangeForRow(absolute, selA!, selB!, rowCells(row.segs));
          if (range) P.transcript.restyle(y, x0 + range.from, x0 + range.to + 1, C.selBg);
        }
      }

      // scrollbar — dedicated track column only when content overflows:
      // painting the track unconditionally put a dead gutter down the welcome
      // screen and any short session with nothing to scroll
      if (SCROLLBAR && fr.sbShowing) {
        for (let sy = 0; sy < fr.vh; sy++)
          P.transcript.fillRow(sy, W - 1, W, sy >= fr.sb.ty && sy < fr.sb.ty + fr.sb.th ? S.sbThumb : S.sbTrack);
      }
      if (PROF) profLine(`  derive=${(performance.now() - pS).toFixed(1)} sig=${(pS - pT).toFixed(1)}`);
    }

    // ---- dock region ----
    const ds = dockSig();
    if (ds !== lastDockSig || frameChanged) {
      lastDockSig = ds;
      paintDock();
    }

    // ---- floats region (wizard / queue / cmdOut / hints) ----
    const fsig = floatsSig();
    if (fsig !== lastFloatsSig || frameChanged) {
      // the floats plane restamps from empty: opening/closing a popup cannot
      // corrupt the band underneath, so no transcript re-derive is scheduled
      lastFloatsSig = fsig;
      paintFloats();
    }

    // ---- overlay (modal) ----
    const os = overlaySig();
    if (overlay && (os !== lastOverlaySig || frameChanged)) {
      lastOverlaySig = os;
      paintOverlay(painted?.inputTop ?? H - 2);
    } else if (!overlay && lastOverlaySig !== "-") {
      // modal closed: its plane simply goes empty at the next composite —
      // transcript/floats/dock were never overwritten, so no wipe or
      // re-derive of anything is needed
      P.overlay.clearRows(0, H);
      lastOverlaySig = "-";
    }

    // ---- status region (ALWAYS checked: spinner ticks land here alone) ----
    const ss = statusSig();
    if (ss !== lastStatusSig || fullInvalidate) {
      lastStatusSig = ss;
      paintStatus();
    }

    // ---- plugin regions (each decides its own repaint cost; cheap when idle) ----
    paintPluginRegions();
  }

  function paintDock() {
    const fr = painted;
    if (!fr) return;
    const { layout, caret } = dockGeom();
    const { shownCount, firstShown, inputTop } = fr;
    let pendingCaret: { x: number; y: number } | null = null;

    // plane restamps fully: shrinking from 4 wrapped rows to 1 cannot leave
    // old text behind, because last frame's cells lived in the plane, not in
    // the grid — no prev-extent wipe, no scrollbar-column footnote
    P.dock.clearRows(0, H);

    // input box background
    for (let i = 0; i < shownCount; i++) P.dock.fillRow(inputTop + i, 0, W, S.inputBgRow);

    const d = display();
    void d;
    // any real char — even whitespace — is content; the placeholder only fills
    // a truly empty box, or it paints over leading indentation the user typed
    const empty = !buf.length;
    const st0 = getPrompt()?.steps[getPrompt()!.idx];
    // with the custom box open the dock shows what is being typed, not the
    // filter — the two would otherwise fight over the same line
    const gp = getPrompt(); const selectFilter = gp && st0?.kind === "select" && !gp.entering ? gp.filter : "";
    const pfx = getPrompt() ? "› " : "❯ ";
    // unescaped leading / (slash command) or ! (shell escape) gets its own
    // marker color; the rest of the line stays inputFg. Escaped (\/) stays
    // plain. Detection mirrors dispatch(): first non-whitespace char + !lit.
    const leadCh = buf.find((c) => c.c.trim().length > 0);
    const dockMode =
      !getPrompt() && leadCh && !leadCh.lit && leadCh.c === "/" ? "cmd" : !getPrompt() && leadCh && !leadCh.lit && leadCh.c === "!" ? "shell" : "plain";
    // the arrow itself carries the mode color (cmd=info, shell=ok, else accent);
    // the / or ! stays plain — coloring the arrow reads cleaner than tinting a
    // bare punctuation char and matches how prompts signal "you are in X mode".
    const pfxArrow = getPrompt() ? "›" : "❯";
    const pfxStyle = dockMode === "cmd" ? S.cmd : dockMode === "shell" ? S.shell : S.prompt;
    const drawPrefix = (y: number, style = pfxStyle) => {
      P.dock.text(1, y, pfxArrow, style);
      P.dock.text(1 + charWidth(pfxArrow.codePointAt(0)!), y, " ", S.prompt);
    };
    if (selectFilter) {
      // a select step's keystrokes go to the filter — show them in the dock,
      // not just in the floating header, or typing feels dead
      // The prefix owns columns 1-2 (see drawPrefix), so the text starts at
      // column 3 like every other dock branch. It used to paint at column 1
      // and THEN draw the prefix over it, so the first characters sat under
      // the arrow and the caret (already computed at 3) was two columns right
      // of the visible text — 'the cursor is in the wrong place and I cannot
      // see what I typed'.
      drawPrefix(inputTop);
      P.dock.text(3, inputTop, selectFilter, S.inputFg);
      pendingCaret = { x: 3 + [...selectFilter].reduce((w, ch) => w + charWidth(ch.codePointAt(0)!), 0), y: inputTop };
    } else if (empty) {
      const placeholder = getPrompt()
        ? getPrompt()!.entering
          ? "(type an answer not in the list · enter submits · esc back to the list)"
          : st0!.kind === "select"
            ? "(type to filter · ↑↓ choose · enter confirms · esc cancels)"
            : `(${resolveField(st0!.hint, getPrompt()!.answers) ?? "type your answer"} · enter submits · esc cancels)`
        : "(type here — / commands · \\ escapes · ! shell · wheel/pgup scroll · click expands · drag/dbl-click selects)";
      drawPrefix(inputTop, getPrompt() ? S.prompt : S.dim);
      P.dock.text(3, inputTop, placeholder, S.dim);
      pendingCaret = { x: 3, y: inputTop };
    } else {
      const totalVis = layout.rows.length;
      for (let v = firstShown; v < Math.min(totalVis, firstShown + shownCount); v++) {
        const vr = layout.rows[v];
        const yy = inputTop + (v - firstShown);
        const isFirstVisual = vr.index === 0 && vr.startCol === 0;
        const prefix = isFirstVisual ? pfx : "  ";
        if (isFirstVisual) drawPrefix(yy);
        else P.dock.text(1, yy, prefix, S.prompt);
        // the leading / or ! stays plain; the arrow above carries the mode color
        P.dock.text(3, yy, vr.text, S.inputFg);
      }
      // input selection: same restyle-over-cells trick as the transcript
      const ir = inSelRange();
      if (ir) {
        const it = inputText();
        for (let v = firstShown; v < Math.min(totalVis, firstShown + shownCount); v++) {
          const [rs, re] = rowBufRange(layout, v);
          const a = Math.max(rs, ir[0]);
          const b = Math.min(re, ir[1]);
          if (a >= b) continue;
          const wa = widthOf(it, a) - widthOf(it, rs);
          // wb is the END COLUMN (width up to b relative to row start), not
          // the selection's own width — `widthOf(b) - widthOf(a)` inverted
          // the range whenever a > rs, so rightward drags restyled ZERO cells
          // (no highlight at all) and leftward drags drew a short wrong strip
          // (back-fill of unselected cells). State was always correct — only
          // the highlight coordinates were.
          const wb = widthOf(it, b) - widthOf(it, rs);
          P.dock.restyle(inputTop + (v - firstShown), 3 + wa, 3 + wb, C.selBg);
        }
      }
      const cy = inputTop + Math.max(0, Math.min(shownCount - 1, caret.visRow - firstShown));
      pendingCaret = { x: 3 + caret.colW, y: cy };
    }
    nextCaret = pendingCaret;
  }

  /** Row ranges floats actually painted last frame — ONLY these may be
   *  cleaned on re-derive (queue rows are transparent over the transcript;
   *  clearing the whole band would wipe transcript content under it). */
  function paintFloats() {
    const fr = painted;
    if (!fr) return;
    const { inputTop } = fr;
    // the plane replaces the floatPainted bookkeeping: restamping from an
    // empty buffer is the complete picture — a float that vanished is just
    // absent, and the transcript underneath was never touched
    P.floats.clearRows(0, H);

    // the question wizard floats where the command hints would (it supersedes
    // them — the dock is an answer field while a prompt is open)
    if (getPrompt()) {
      // one geometry for paint and clicks (see promptRows) — long labels wrap
      // rather than truncate, and a continuation line selects the same option
      const { rows, menuTop } = wizard.rows();
      const hTop = menuTop - rows.length;
      for (let i = 0; i < rows.length; i++) {
        P.floats.fillRow(hTop + i, 0, W, S.barBgRow);
        P.floats.text(1, hTop + i, clipW(rows[i].text, W - 2), rows[i].sel ? S.hintSel : S.hintDim);
      }
    }

    // queued + steering messages stack directly above the input box
    let queueRowsH = 0;
    const pend = pendingLines();
    if (pend.length) {
      queueRowsH = fr.queueH;
      const shown = pend.slice(0, queueRowsH);
      const qTop = inputTop - queueRowsH;
      const extra = pend.length > shown.length ? 1 : 0;
      for (let i = 0; i < shown.length; i++) {
        P.floats.text(1, qTop + i, clipW(shown[i], W - 2), S.hintOnBase);
      }
      if (extra) {
        P.floats.text(1, qTop + shown.length, clipW(`… ${pend.length - shown.length} more — ctrl+up withdraws last`, W - 2), S.hintOnBase);
      }
    }

    // floating command output
    let cmdRowsH = 0;
    if (cmdOut?.length) {
      const avail = Math.max(1, inputTop - queueRowsH - 1);
      // Rendered through the SAME markdown path the transcript uses (renderMarkdown
      // → wrapCodeAware, copied from itemRows' md branch) so a command that PRINTS
      // a list looks like one: /todo emits `- [x] …` and gets the same task-list
      // glyphs and dimmed-done styling as a list in the transcript. Markdown is
      // NOT made global — a plain notice (/usage, /reload) has no markdown syntax,
      // so it round-trips to the same single plain segment as before.
      const panelBg = C.panelBg ?? C.inputBg;
      const mdRows = renderMarkdown(cmdOut.join("\n")).flatMap((r) => wrapCodeAware(r, W - 2));
      const shown = mdRows.slice(0, avail);
      cmdRowsH = shown.length + (mdRows.length > avail ? 1 : 0);
      const cTop = inputTop - queueRowsH - cmdRowsH;
      for (let i = 0; i < shown.length; i++) {
        // themed panel fill first: the box used to sit on the terminal's own
        // background (plain black), unrelated to the theme
        P.floats.fillRow(cTop + i, 0, W, S.panelBgRow);
        // one style per segment, so task-list glyphs and dimmed done items keep
        // their colors against the panel background instead of flattening to it
        let x = 1;
        for (const seg of shown[i]) {
          const st = screen.sgr({
            fg: seg.fg ?? C.fg,
            bg: panelBg,
            ...(seg.bold ? { bold: true } : {}),
            ...(seg.italic ? { italic: true } : {}),
            ...(seg.strike ? { strike: true } : {}),
          });
          x = P.floats.text(x, cTop + i, seg.t, st);
        }
      }
      if (mdRows.length > avail) {
        P.floats.fillRow(cTop + shown.length, 0, W, S.panelBgRow);
        P.floats.text(1, cTop + shown.length, clipW(`… ${mdRows.length - avail} more lines`, W - 2), S.panelBgRow);
      }
    }

    const hints = hintText(Math.min(5, Math.max(1, inputTop - queueRowsH - cmdRowsH - 1)));
    if (hints.active && hints.rows.length) {
      const hTop = inputTop - queueRowsH - cmdRowsH - hints.rows.length;
      for (let i = 0; i < hints.rows.length; i++) {
        P.floats.fillRow(hTop + i, 0, W, S.barBgRow);
        P.floats.text(1, hTop + i, hints.rows[i].text, hints.rows[i].sel ? S.hintSel : S.hintDim);
      }
    }

  }

  function paintStatus() {
    const barY = H - 1;
    P.status.clearRows(0, H);
    P.status.fillRow(barY, 0, W, S.barBgRow);
    let lx = 1;
    if (Date.now() < flashUntil && flashMsg) {
      lx = P.status.text(lx, barY, `${flashMsg}`, displayBusy() ? S.accent : S.ok);
    } else if (displayBusy()) {
      const frames = spinFrames();
      lx = P.status.text(lx, barY, clipW(`${frames[frameIdx % frames.length]} ${streamText !== null ? "responding" : "thinking"}${busyMsg ? ` — ${busyMsg}` : ""} ${elapsed()}`, W - 2), S.spin);
    } else {
      lx = P.status.text(lx, barY, `ready`, S.ok);
    }
    // right side: config `statusBar` names segments left-to-right (built-ins
    // cwd provider model ctx readOnly, plus plugin `statusSegments`); a null
    // or throwing plugin slot drops out of this repaint. A narrow window then
    // DROPS whole segments from the LEFT (cwd first) only as many as needed —
    // dropping everything because one segment overflows, or clipping
    // mid-text ("ctx 9…"), both read as corruption.
    const avail = W - lx - 2;
    const ro = state.readOnly ? "read-only" : null;
    const stats = cachedStats(); // [cwd, provider, model, ctx+cache] least-first
    const segs: string[] = [];
    for (const name of statusBarSlots()) {
      if (name === "cwd") segs.push(stats[0]);
      else if (name === "provider") segs.push(stats[1]);
      else if (name === "model") segs.push(stats[2]);
      else if (name === "ctx") segs.push(stats[3]);
      else if (name === "cost") {
        // bundled:cost's tally — hidden when the plugin is disabled or there
        // is nothing to show yet (no model, no rate, or zero spend)
        if (!bundledDisabled("bundled:cost", state.config?.disabledPlugins ?? [])) {
          const c = costSegment(state.sessionId);
          if (c) segs.push(c);
        }
      } else if (name === "readOnly") {
        if (ro) segs.push(ro);
      } else {
        const seg = pluginSegment(name);
        if (seg !== null && seg !== undefined) segs.push(seg);
      }
    }
    let from = 0;
    let right = "";
    for (;;) {
      right = segs.slice(from).join(" · ");
      if (Bun.stringWidth(right) <= avail || from >= segs.length) break;
      from++;
    }
    if (right && from < segs.length) P.status.text(W - 1 - Bun.stringWidth(right), barY, right, S.chromeOnBar);
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
    const bodyH = Math.max(1, inputTop - 3); // every row the hardware leaves free
    const top = Math.max(0, inputTop - bodyH - 2);
    const win = p.window(bodyH);
    const q = p.filter();
    P.overlay.clearRows(0, H);
    P.overlay.fillRow(top, 0, W, S.barBgRow);
    P.overlay.text(1, top, clipW(`sessions ${q ? `· filter: ${q}` : "· type to filter"}`, W - 2), S.accent);
    for (let i = 0; i < bodyH; i++) {
      const y = top + 1 + i;
      const r = win.rows[i];
      const on = i === win.selRow;
      P.overlay.fillRow(y, 0, W, on ? S.overlaySel : S.overlayRow);
      if (!r) {
        if (i === 0 && !win.rows.length) P.overlay.text(1, y, q ? `no match for "${q}"` : "(no sessions)", S.dim);
        continue;
      }
      const mark = r.current ? "*" : on ? "›" : " ";
      P.overlay.text(1, y, clipW(`${mark} ${r.cells.join("  ")}`, W - 2), on ? S.overlaySel : S.overlayRow);
    }
    const y = top + 1 + bodyH;
    P.overlay.fillRow(y, 0, W, S.barBgRow);
    P.overlay.text(1, y, clipW(p.footer(), W - 2), p.pendingConfirm() ? S.err : S.hintDim);
  }

  /** Truncate to `cols` display columns (wide chars count as two). */
  /** Greedy word-wrap of a plain string to `cols` display columns. */
  function wrapText(s: string, cols: number): string[] {
    const words = s.split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let cur = "";
    for (const w of words) {
      const next = cur ? cur + " " + w : w;
      if (Bun.stringWidth(next) <= cols) cur = next;
      else {
        if (cur) lines.push(cur);
        // a single word longer than the column: hard-split it so nothing is lost
        if (Bun.stringWidth(w) > cols) {
          let chunk = "";
          for (const ch of w) {
            if (Bun.stringWidth(chunk + ch) > cols) {
              lines.push(chunk);
              chunk = ch;
            } else chunk += ch;
          }
          cur = chunk;
        } else cur = w;
      }
    }
    if (cur) lines.push(cur);
    return lines.length ? lines : [""];
  }

  function clipW(s: string, cols: number): string {
    if (Bun.stringWidth(s) <= cols) return s;
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

  /** Buffer index of the first char whose cell would start past `targetW` display columns. */
  function indexAtWidth(s: string, targetW: number): number {
    let w = 0;
    let i = 0;
    for (const ch of s) {
      const cw = charWidth(ch.codePointAt(0)!);
      if (w + cw > targetW) break;
      w += cw;
      i++;
    }
    return i;
  }

  /** Display width of the first `upto` buffer indices of `s` (inverse of indexAtWidth). */
  function widthOf(s: string, upto: number): number {
    let w = 0;
    let i = 0;
    for (const ch of s) {
      if (i >= upto) break;
      w += charWidth(ch.codePointAt(0)!);
      i++;
    }
    return w;
  }

  // ---- loop ----
  let resizing = false;
  let paintedTheme = ""; // themeName() the current styles were built from
  function doResize(w: number, h: number) {
    if (w < 5 || h < 3) return;
    if (w === W && h === H) return;
    W = Math.max(20, w);
    H = Math.max(8, h);
    screen.resize(W, H);
    initStyles();
    paintedTheme = themeName();
    lineCache.clear();
    layoutCache = null; // the input wrap is width-keyed — a stale wrap kept
    // the dock at the old width's row breaks until the next edit
    streamKernels.clear(); // stream rows are width-keyed too
    dirty = true;
  }

  /** A /theme switch must rebuild every cached style id, not just the next row. */
  function rethemeIfNeeded() {
    if (themeName() === paintedTheme) return;
    initStyles();
    paintedTheme = themeName();
    lineCache.clear();
    streamKernels.clear(); // cached stream rows carry old-theme seg colors
    thinkKernels.clear(); // so do think kernels: C.think is baked into their segs at creation
    dirty = true;
  }

  let lastSpinAt = 0;
  function tickSpinner() {
    rethemeIfNeeded();
    if (!displayBusy()) return; // a viewer's spinner mirrors the owner's turn
    const now = Date.now();
    if (now - lastSpinAt < 140) return;
    lastSpinAt = now;
    // Resolve the frame set here too: it is theme-driven (spinFrames), so the
    // tick must ask the theme for the count, not reuse a paint-scope local.
    // Reading a name only paintStatus() declared threw ReferenceError the first
    // time a turn went busy — the crash that emptied the screen.
    frameIdx = (frameIdx + 1) % spinFrames().length;
    // spinner-only update: the status region re-derives on the next paint()
    // (its signature includes frameIdx) and nothing else does — one row
    // re-stamped, the row-hash diff turns it into ~20 bytes of output.
    // NO global dirty: a mid-reasoning turn now costs nothing per tick.
    statusOnly = true;
  }

  async function run() {
    try {
      term.begin();
      term.onResize(doResize);
      doResize(term.size().width, term.size().height);
      // OSC 7 cwd + initial title: the session directory never drifts (exec's
      // contract), so both are set-once here; the title is refreshed at turn
      // start/end boundaries instead.
      term.setCwd(state.cwd);
      term.setTitle(`fox — ${state.sessionId || "new"}`);

      // Stray-output quarantine. Plugins, MCP children and library code that
      // write to stdout/stderr directly would shred the grid mid-frame. While
      // the TUI owns the terminal those writes go to the debug log and a buffer,
      // replayed to stderr after exit — "the output you see after you exit the
      // TUI". The TUI's own painting goes through Bun.stdout.writer() (term.ts),
      // which none of this touches.
      const stray: string[] = [];
      const origOut = process.stdout.write.bind(process.stdout);
      const origErr = process.stderr.write.bind(process.stderr);
      const origConsole = { log: console.log, info: console.info, warn: console.warn, error: console.error };
      const capStray = (chunk: unknown) => {
        const s = String(chunk);
        stray.push(s.endsWith("\n") ? s : s + "\n");
        debugLog("stray output", s.trimEnd());
      };
      const swallow = (chunk: unknown, ...rest: unknown[]) => {
        capStray(chunk);
        (rest.find((x) => typeof x === "function") as (() => void) | undefined)?.();
        return true;
      };
      (process.stdout as { write: unknown }).write = swallow;
      (process.stderr as { write: unknown }).write = swallow;
      console.log = console.info = (...a: unknown[]) => capStray(a.map(String).join(" "));
      console.warn = console.error = (...a: unknown[]) => capStray(a.map(String).join(" "));
      const restoreOutput = () => {
        (process.stdout as { write: unknown }).write = origOut;
        (process.stderr as { write: unknown }).write = origErr;
        Object.assign(console, origConsole);
        if (stray.length) {
          origErr(`\n--- output captured while the TUI was up ---\n${stray.join("")}--- end captured output ---\n`);
        }
      };
      restoreOutputRef = restoreOutput;

      // Last-resort net: a floating promise that rejects must never leave the
      // spinner running forever with no way to submit. console.error would
      // corrupt the grid, so surface it as a transcript item instead.
      process.on("unhandledRejection", (reason) => {
        reportError("internal error", reason);
        // only stand the spinner down when no turn is actually running — the
        // rejection may have come from an unrelated floating promise, and
        // resetting a live turn's busy flag here would let a queued message
        // dispatch into it
        if (!busy) {
          setBusy(false);
          drainQueue();
        } else debugLog("unhandledRejection during running turn", String(reason));
      });

      if (state.sessionId) getSession(state.sessionId);
      // the TUI can open a picker, and holds the one session whose handle must
      // survive the picker reading every other session's usage
      state.interactive = true;
      if (state.sessionId) pinSession(state.sessionId);

      const dec = createDecoder(onKey);
      term.onKey((data) => dec.feed(data));

      // First frame BEFORE anything expensive: transcript replay and
      // config/plugin loading happen once the window is already up.
      paint();
      screen.composite();
      screen.flush();
      term.flush();
      // show the input caret from the very first frame, not only after the
      // first keypress — the frame loop's moved-check starts from null and
      // would otherwise leave the cursor hidden until something dirties it
      const caret0 = nextCaret ?? { x: 3, y: H - 2 };
      term.setCursor(caret0.x, caret0.y);
      term.flush();
      dirty = false;
      refresh();
      applyRuntimeConfig();
      // The startup block comes AFTER refresh() (see welcomeBlock's comment),
      // and only for a genuinely fresh launch — a resumed session has its
      // transcript on screen; a banner on top of it is noise.
      if (state.pendingSession) welcomeBlock();
      // Second opener of the same session becomes the read-only viewer.
      if (state.sessionId && !state.pendingSession) attachLock(state.sessionId);

      // ---- read-only viewer: mirror the owner's live status ----
      /**
       * A viewer has no run() driving local state, so the status bar would
       * read "ready" while the owner is mid-turn and streaming text would
       * never appear until the turn settled. Poll the session kv the owner
       * publishes to ("live") plus the message log tail, and feed the SAME
       * local variables paint() and the status bar already render — the
       * viewer's frame loop needs no special casing beyond this poll. The
       * input dock stays fully usable (drafting works); only sending is
       * blocked, which submit() already enforces.
       */
      let lastSeq = -1;
      let lastLiveAt = 0;
      const pinnedMirrorId = state.sessionId;
      if (state.readOnly && state.sessionId) {
        const mirror = () => {
          try {
            // the viewer may /new or /fork its way out of read-only mode
            // (both write a NEW session this process then owns) — the mirror
            // only makes sense while this process is still a viewer here
            if (!state.readOnly || state.sessionId !== pinnedMirrorId) {
              if (mirrorTimer) clearInterval(mirrorTimer);
              mirrorTimer = null;
              return;
            }
            const live = kvGet<LiveStatus>(state.sessionId!, "live");
            if (live && live.at !== lastLiveAt) {
              lastLiveAt = live.at;
              remoteBusy = live.busy;
              busyMsg = live.busyMsg;
              const st = live.streaming;
              if (st !== streamText) {
                streamText = st;
                streamKernels.clear(); // a new stream: all width kernels rebuild
              }
              startedAt = live.startedAt;
              markDirty();
            }
            // new transcript rows (tool results, settled messages) — refresh()
            // rebuilds items from the log and re-seals nothing (viewers never
            // own liveThink, it is null here)
            const nodes = projectView(state.sessionId!);
            let seq = lastSeq;
            for (const n of nodes) if (!n.deleted) seq = Math.max(seq, n.msg.seq);
            if (lastSeq >= 0 && seq > lastSeq) refresh();
            lastSeq = seq;
          } catch {}
        };
        mirror(); // seed lastSeq before the first frame, so history is not "new"
        mirrorTimer = setInterval(mirror, 500);
        mirrorTimer.unref?.();
      }

      let lastCaretKey: string | null = null;
      // Frame interval honors tuiFrameMs (config, default 16). The loop is a
      // coalescer, not a pacer: dirty work runs at most once per interval,
      // and a spinner-only tick re-derives the status region alone.
      const frameTick = () => {
        tickSpinner();
        if (!dirty && !statusOnly) return;
        const spinOnly = statusOnly && !dirty;
        statusOnly = false;
        dirty = false;
        const t0 = DEBUG_VERBOSE ? performance.now() : 0;
        if (PROF) profMark = performance.now();
        try {
          if (spinOnly) {
            // spinner path: status region only — no computeFrame, no
            // transcript/dock derivation, then the usual row-hash flush.
            // The caret repositions too: the status write strands the
            // hardware cursor at the row end, and the input caret would
            // visibly jump there until the next full frame.
            const p0 = PROF ? performance.now() : 0;
            paintStatus();
            const p1 = PROF ? performance.now() : 0;
            screen.composite();
            const p2 = PROF ? performance.now() : 0;
            screen.flush();
            const caret = nextCaret ?? { x: 3, y: H - 2 };
            term.setCursor(caret.x, caret.y);
            term.flush();
            if (PROF) profLine(`spin paint=${(p1 - p0).toFixed(1)} comp=${(p2 - p1).toFixed(1)} flush=${(performance.now() - p2).toFixed(1)}`);
            return;
          }
          // Cursor churn flickers: only hide/reposition it when the caret actually
          // moved (typing, scrolling the dock). While streaming, the caret sits
          // still and the grid diff paints underneath it without a single
          // hide/show round-trip. paint() runs BEFORE the caret is read: nextCaret
          // is computed inside paint, so reading it first would place the cursor
          // one frame (one keystroke) behind the text.
          const q0 = PROF ? performance.now() : 0;
          paint();
          const q1 = PROF ? performance.now() : 0;
          const caret = nextCaret ?? { x: 3, y: H - 2 };
          const caretKey = `${caret.x},${caret.y}`;
          const moved = caretKey !== lastCaretKey;
          if (moved) term.hideCursor(); // see the old comment: visible cursor mid-repaint ghosts on Windows Terminal
          screen.composite();
          const q2 = PROF ? performance.now() : 0;
          screen.flush();
          if (PROF) profLine(`full paint=${(q1 - q0).toFixed(1)} comp=${(q2 - q1).toFixed(1)} flush=${(performance.now() - q2).toFixed(1)} items=${items.length} ${W}x${H}`);
          const q3 = PROF ? performance.now() : 0;
          if (process.env.FOX_AGENT_TRACE && screen.lastDirty()) {
            try {
              appendFileSync(process.env.FOX_AGENT_TRACE + ".grid", `⟦frame⟧\n${screen.dumpGrid()}\n`);
            } catch {}
          }
          term.flush();
          // The grid diff leaves the hardware cursor at the end of whatever row
          // it last wrote — a status-bar tick or transcript scroll would strand
          // it there, visibly jumping the input caret. Reposition every frame;
          // hide only when it actually moved (hide/show churn flickers).
          term.setCursor(caret.x, caret.y);
          term.flush();
          if (moved) lastCaretKey = caretKey;
          if (DEBUG_VERBOSE) {
            const ms = performance.now() - t0;
            if (ms > 16) debugLog(`slow frame ${ms.toFixed(0)}ms`, `items=${items.length} spinOnly=${spinOnly}`);
          }
          if (PROF && performance.now() - profMark > 20) profLine(`SLOWFRAME total=${(performance.now() - profMark).toFixed(1)}ms`);
        } catch (e) {
          // painting over the grid with a stack trace is how raw errors leak.
          // This used to gracefulExit(1): one bad row (a resume replaying an
          // item the current renderer chokes on) took the whole session down —
          // the "black screen on resume" and "randomly exits" reports were the
          // same bug. Recover instead: drop every render cache (the bad row is
          // almost certainly cached), log, tell the user once, and keep the
          // session alive — the next tick re-renders from scratch.
          debugLog("tui frame error", e);
          lineCache.clear();
          streamKernels.clear();
          thinkKernels.clear();
          frameErrors++;
          if (frameErrors <= 1 && !exitCode) {
            try {
              push("error", `render error (recovered) — log: ${debugLogPath()}`);
            } catch {}
          }
          dirty = true; // next tick repaints everything from clean caches
        }
      };
      let frameErrors = 0; // a second consecutive render error stays log-only
      let frameTimer: ReturnType<typeof setInterval> | null = null;
      const armFrameTimer = (ms: number) => {
        if (frameTimer) clearInterval(frameTimer);
        frameTimer = setInterval(frameTick, Math.max(8, Math.min(250, Math.floor(ms))));
      };
      tickRef = frameTick;
      frameArmRef = armFrameTimer;
      armFrameTimer(state.config?.tuiFrameMs ?? 16);

      try {
        await new Promise<void>((resolve) => {
          finish = resolve;
          if (exiting) resolve(); // exited during startup
        });
      } finally {
        if (frameTimer) clearInterval(frameTimer);
        frameArmRef = null;
      }
      if (exitCode) process.exitCode = exitCode;
    } catch (e) {
      debugLog("tui fatal", e);
      try {
        restoreOutputRef?.();
      } catch {}
      console.error("[fox-agent] fatal:", (e as Error)?.message ?? e);
      try {
        term.end();
      } catch {}
      process.exitCode = 1;
    }
  }

  await run();
}
