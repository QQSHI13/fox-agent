/**
 * activity — a live tool-activity and context panel.
 *
 * ## What it draws
 *
 * A right-anchored box above the input dock: a context-window bar, the most
 * recent tool calls with duration and outcome, and a tally. Hidden until asked
 * for — **ctrl+g** toggles it.
 *
 * ## Why this is the demo
 *
 * A region on its own is just a canvas. What makes a panel worth having is a
 * FEED, and the interesting thing here is that the feed is a hook: `afterTool`
 * writes a signal, and the region paints that signal. Nothing polls, nothing
 * calls `markDirty`, and no code path in the harness knows the panel exists.
 *
 *     afterTool hook  ──writes──▶  events signal
 *     beforeContext   ──writes──▶  budget signal      (read inside paint
 *     keybinding      ──writes──▶  visible signal      = subscribe)
 *                                        │
 *                                        ▼
 *                               the region's effect re-runs
 *                                        │
 *                                        ▼
 *                           one composite, one flush, next frame
 *
 * ## The four things that used to be wrong here
 *
 * This file was written against an earlier, thinner region API, and every bug
 * it had was the API's fault rather than the plugin's. Each is now a named field
 * on `TuiRegionPlane`, and the comment there explains why it exists:
 *
 * 1. **Hardcoded colours** → `p.theme`. A panel painted in literal hex looks
 *    foreign the moment the user runs `/theme`.
 * 2. **One column off, sitting on the scrollbar** → `p.contentW`. The transcript
 *    drops to `w - 2` when the scrollbar appears, so anchoring to `w` puts the
 *    panel on top of it.
 * 3. **Overlapping the input box** → `p.dockTop`. The dock grows as the input
 *    wraps; `h - 1 - boxH` is only correct while the input is one line.
 * 4. **Always "no tool calls yet"** → `p.sessionId` plus `foxHost`. The panel
 *    used to start blank on every launch, including a resumed session with a
 *    hundred calls behind it. It now seeds from the stored transcript.
 *
 * ## Honest limitations, all of them visible in the code
 *
 * - **Live durations are approximate.** Hooks get no call id, so `beforeTool`
 *   and `afterTool` pair on `name + args`. Two identical calls in parallel would
 *   pair wrongly. Seeded history has no timing at all and shows `—`.
 * - **Seeded failures are inferred.** `sessions.messages()` returns role and
 *   content but not the stored `error` column, so a historical failure is
 *   detected by the `error:` prefix tools put on `fail()` output. A tool that
 *   fails without that prefix reads as a success in the seeded view.
 * - **History is re-read once per session**, not watched. A second window
 *   writing to the same session will not update this panel; only this process's
 *   own tool calls append live.
 * - **The plugin SDK exports only `signal`** — no `computed`, no `effect`. The
 *   derived numbers below are recomputed inside `paint`, which is fine at this
 *   size and would not be at ten times the volume.
 */

import type { FoxPlugin, TuiRegionPlane } from "../../src/plugins/types.ts";
import { regionSignal } from "fox-agent/sdk";

/** How many tool calls to remember. Older ones fall off the front. */
const MAX_EVENTS = 200;
/** How many to draw. The panel also caps by available height. */
const MAX_SHOWN = 8;

interface ToolEvent {
  name: string;
  ok: boolean;
  /** undefined = seeded from history, which stores no timing */
  ms?: number;
}

interface BudgetInfo {
  ratio: number;
  reported: number;
  limit: number;
  stage: string;
}

// Module-scope signals, created ONCE. A signal created inside `paint` would be a
// fresh one every frame: it would reset to its initial value and subscribe to
// nothing, which is the single most common way a region ends up permanently
// blank.
const events = regionSignal<ToolEvent[]>([]);
const budget = regionSignal<BudgetInfo | null>(null);
const visible = regionSignal(false);

/**
 * In-flight calls, keyed by `name + args` — the only correlation the hook
 * surface offers. Bounded so a tool that never returns cannot grow it forever.
 */
const started = new Map<string, number>();
const MAX_INFLIGHT = 64;

/** Which session the current `events` belong to, so a switch re-seeds. */
let seededFor: string | null = null;

/**
 * Palette used when the host does not hand one over.
 *
 * A plugin is a file on disk and the host is a compiled binary, so the two
 * version independently: load this plugin into a binary built before
 * `TuiRegionPlane.theme` existed and `p.theme` is `undefined`. These are the
 * default theme's colours, so the panel still looks native on such a host
 * instead of throwing and drawing nothing.
 */
const FALLBACK_THEME = {
  fg: "#c0caf5",
  hint: "#828ac0",
  accent: "#bb9af7",
  ok: "#9ece6a",
  error: "#f7768e",
  tool: "#e0af68",
  inputBg: "#1f2335",
} as const;

const sig = (name: string, args: unknown): string => `${name}:${JSON.stringify(args ?? null)}`;

/** `1_050_000` → `1.1M`, so a wide window fits in a narrow column. */
function tok(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
  return String(n);
}

function bar(ratio: number, width: number): string {
  const filled = Math.max(0, Math.min(width, Math.round(ratio * width)));
  return "█".repeat(filled) + "░".repeat(width - filled);
}

function dur(ms: number | undefined): string {
  if (ms === undefined) return "—";
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms)}ms`;
}

/**
 * Rebuild the panel's list from the stored transcript.
 *
 * Pairs each `tool_calls` entry on an assistant row with the `tool` row that
 * answers it, by `tool_call_id` — the same join the TUI's own renderer does.
 * Only the tail matters, so this stops once it has enough.
 */
function seedFromHistory(sessionId: string): ToolEvent[] {
  const host = (globalThis as { foxHost?: { sessions: { messages(id: string): { role: string; content: string; tool_calls?: string | null; tool_call_id?: string | null }[] } } }).foxHost;
  if (!host) return []; // headless / no host API: nothing to seed from
  let rows;
  try {
    rows = host.sessions.messages(sessionId);
  } catch {
    return [];
  }

  // id -> name, from the assistant rows that requested the calls
  const names = new Map<string, string>();
  for (const r of rows) {
    if (r.role !== "assistant" || !r.tool_calls) continue;
    try {
      const calls = JSON.parse(r.tool_calls) as { id?: unknown; name?: unknown }[];
      if (!Array.isArray(calls)) continue;
      for (const c of calls) if (typeof c?.id === "string" && typeof c?.name === "string") names.set(c.id, c.name);
    } catch {
      // a corrupt row loses its labels, not the panel
    }
  }

  const out: ToolEvent[] = [];
  for (const r of rows) {
    if (r.role !== "tool" || !r.tool_call_id) continue;
    const name = names.get(r.tool_call_id);
    if (!name) continue;
    // The stored `error` column is not in this projection, so a failure is
    // recognised by the prefix `fail()` puts on tool output. Documented above.
    out.push({ name, ok: !/^error[:\s]/i.test(r.content) });
  }
  return out.length > MAX_EVENTS ? out.slice(out.length - MAX_EVENTS) : out;
}

const plugin: FoxPlugin = {
  name: "activity",

  hooks: {
    // `beforeContext` is where the window size is published, so it is the
    // cheapest honest source for the bar — no extra token estimation here.
    beforeContext(c) {
      const prev = budget.peek();
      const next = c.budget;
      // identity changes every step; compare the rounded ratio and stay quiet
      // when the number did not actually move
      if (prev && Math.round(prev.ratio * 100) === Math.round(next.ratio * 100) && prev.stage === next.stage) return;
      budget({ ratio: next.ratio, reported: next.reported, limit: next.limit, stage: next.stage });
    },

    beforeTool(c) {
      if (started.size >= MAX_INFLIGHT) started.clear(); // a wedged call must not leak
      started.set(sig(c.name, c.args), Date.now());
    },

    afterTool(c) {
      const key = sig(c.name, c.args);
      const t0 = started.get(key);
      started.delete(key);
      const ev: ToolEvent = { name: c.name, ok: c.ok, ms: t0 ? Date.now() - t0 : 0 };
      // a NEW array, never a mutate: the write is what notifies, and identity is
      // what a signal compares by default
      const next = [...events.peek(), ev];
      events(next.length > MAX_EVENTS ? next.slice(next.length - MAX_EVENTS) : next);
    },
  },

  keybindings: [
    {
      key: "ctrl+g",
      description: "toggle the activity panel",
      run(ctx) {
        const on = !visible.peek();
        visible(on);
        ctx.notify(on ? "activity panel on" : "activity panel off");
      },
    },
  ],

  regions: {
    activity: {
      // z >= 50 is the documented band for plugin regions: above every built-in
      // plane (transcript 0 … status 40), so the panel is never covered.
      z: 50,
      // Full-screen with a huge bound; the plane's clip is clamped to the live
      // screen, so this stays correct at any size and `paint` anchors itself
      // against the live geometry instead of a registration-time rect.
      rect: [0, 0, 10_000, 10_000],
      paint(p: TuiRegionPlane) {
        if (!visible()) return; // plane is cleared for us: drawing nothing = transparent

        // Seed once per session, so a resumed conversation opens with its
        // history instead of "no tool calls yet". Guarded so it runs on the
        // first paint of each session and never again.
        if (p.sessionId && p.sessionId !== seededFor) {
          seededFor = p.sessionId;
          started.clear();
          events(seedFromHistory(p.sessionId));
        }

        // Every one of these reads subscribes the region: a resize, a theme
        // switch, the scrollbar appearing, or the dock growing all repaint it.
        // Older hosts: a plugin loaded from disk can run against a binary built
        // before these fields existed, and the failure is an unhelpful
        // "undefined is not an object". Fall back to what such a host does have
        // rather than throwing — a panel that is slightly misplaced beats a
        // panel that cannot paint at all.
        const screenW = p.w;
        const contentW = p.contentW ?? screenW;
        const dockTop = p.dockTop ?? p.h - 2;
        const t = p.theme ?? FALLBACK_THEME;

        // Right edge flush against the transcript's content width. `contentW` is
        // already `w - 2` while the scrollbar strip shows, so +1 lands the panel
        // exactly beside it rather than one column short.
        const right = Math.min(screenW, contentW + 1);
        const boxW = Math.min(46, Math.max(26, right - 4));
        // Bottom sits one row above the dock, which is what makes the panel get
        // pushed up when the input wraps instead of sliding under it.
        const bottom = dockTop - 1;
        const maxH = bottom - 1;
        // Too little room to be legible: stay out of the way entirely. 5 is the
        // floor a complete panel needs (see minRows below); anything less and it
        // would cover transcript without being readable.
        if (maxH < 5 || boxW < 26) return;

        // Height follows CONTENT, not a fixed 14. A panel padded out with ten
        // blank rows reads as broken, and it covers transcript for no reason.
        //
        // `showFigures` is decided ONCE, from the space available, and then used
        // by both the height calculation and the draw below. Deriving it from
        // boxH in the draw path (the obvious way) is circular — boxH depends on
        // whether the figures row exists — and the two conditions drifting apart
        // is exactly what shifts every row below by one.
        const b0 = budget();
        const list0 = events();
        const showFigures = b0 !== null && maxH >= 10;
        const barRows = b0 ? (showFigures ? 2 : 1) : 1; // the bar, plus its figures row
        const chromeRows = 1 + barRows + 1 + 1; // header + bar block + separator + tally
        const wantList = Math.max(1, Math.min(MAX_SHOWN, list0.length));
        // The smallest panel that still says something: every chrome row plus one
        // list row. It is 5, not 6 — and the old `boxH < 6` guard therefore
        // rejected a FRESH session, where there is no budget reading yet (one
        // bar row instead of two) and no tool call yet (one list row). The panel
        // drew nothing at all until a turn had run, which reads as "ctrl+g does
        // nothing". Derived from the parts so adding a chrome row cannot silently
        // reintroduce the same off-by-one.
        const minRows = chromeRows + 1;
        const boxH = Math.min(maxH, chromeRows + wantList);
        if (boxH < minRows) return;

        const x0 = right - boxW;
        // `boxH` is a COUNT, and the box spans y0..bottom inclusive, so y0 is
        // `bottom - boxH + 1`. Using `bottom - boxH` gave one row more than the
        // count asked for, which showed up as a stray blank line above the tally.
        const y0 = bottom - boxH + 1;
        const inner = boxW - 2; // one column of padding each side
        const bg = t.panelBg ?? t.inputBg;

        const row = (y: number) => p.fillRow(y, x0, right, { bg });
        const at = (x: number, y: number, s: string, style: { fg?: string; bold?: boolean }) =>
          p.text(x, y, s, { bg, fg: style.fg ?? t.fg, bold: style.bold });

        for (let y = y0; y <= bottom; y++) row(y);

        // ---- header ----
        at(x0 + 1, y0, "activity", { fg: t.accent, bold: true });
        at(right - 1 - "ctrl+g".length, y0, "ctrl+g", { fg: t.hint });

        // ---- context bar ----
        const b = budget();
        let line = 1;
        if (b) {
          const pct = Math.round(b.ratio * 100);
          const bw = Math.max(6, inner - 14);
          const colour = b.stage === "ctxOnly" ? t.error : b.stage === "warn" ? t.tool : t.ok;
          at(x0 + 1, y0 + line, "ctx", { fg: t.hint });
          at(x0 + 5, y0 + line, bar(b.ratio, bw), { fg: colour });
          at(x0 + 6 + bw, y0 + line, `${String(pct).padStart(3)}%`, { fg: colour });
          line++;
          if (showFigures) {
            at(x0 + 5, y0 + line, `${tok(b.reported)} / ${tok(b.limit)}${b.stage !== "none" ? `  ${b.stage}` : ""}`, { fg: t.hint });
            line++;
          }
        } else {
          at(x0 + 1, y0 + line, "ctx — no reading yet", { fg: t.hint });
          line++;
        }

        // ---- separator ----
        at(x0 + 1, y0 + line, "─".repeat(inner), { fg: t.hint });
        line++;

        // ---- recent tools, newest last ----
        const list = events();
        const room = boxH - line; // rows left for the list, above the tally
        if (!list.length) {
          at(x0 + 1, y0 + line, "no tool calls yet", { fg: t.hint });
        } else {
          const shown = list.slice(Math.max(0, list.length - Math.min(room, MAX_SHOWN)));
          for (let i = 0; i < shown.length && i < room; i++) {
            const ev = shown[i];
            const y = y0 + line + i;
            at(x0 + 1, y, ev.ok ? "✓" : "✗", { fg: ev.ok ? t.ok : t.error });
            // truncated rather than wrapped: one tool per row keeps the column
            // readable, and a long MCP name must not push the timing off the edge
            const nameW = Math.max(8, inner - 12);
            const name = ev.name.length > nameW ? `${ev.name.slice(0, nameW - 1)}…` : ev.name;
            at(x0 + 3, y, name, { fg: ev.ok ? t.fg : t.error });
            const d = dur(ev.ms);
            at(right - 1 - d.length, y, d, { fg: t.hint });
          }
        }

        // ---- tally ----
        const failed = list.filter((e) => !e.ok).length;
        const tally = `${list.length} call${list.length === 1 ? "" : "s"}${failed ? ` · ${failed} failed` : ""}`;
        at(x0 + 1, bottom, tally, { fg: failed ? t.error : t.hint });
      },
    },
  },
};

export default plugin;

/** Named exports are how a plugin documents itself; `FoxPlugin` has no description field. */
export const description = "live tool-activity + context panel (ctrl+g)";
