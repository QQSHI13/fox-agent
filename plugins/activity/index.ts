/**
 * activity — a live tool-activity and context plane, and a tour of the plugin
 * surface in one file.
 *
 * ## Why this is the demo
 *
 * A region on its own is just a canvas. What makes a panel worth having is a
 * FEED, and the interesting thing here is that the feed is a hook: `afterTool`
 * pushes into a signal, and the region paints that signal. Nothing polls,
 * nothing calls `markDirty`, and no code path knows the panel exists.
 *
 * The full reactive loop it exercises:
 *
 *     afterTool hook  ──writes──▶  events signal
 *                                       │  (read inside paint = subscribe)
 *     beforeContext   ──writes──▶  budget signal
 *                                       │
 *                                       ▼
 *                              the region's effect re-runs
 *                                       │
 *                                       ▼
 *                          one composite, one flush, next frame
 *
 * ## What it draws
 *
 * A right-anchored panel: a context-window bar, then the most recent tool calls
 * with duration and outcome, then a tally. Hidden until you ask for it.
 *
 * - **ctrl+g** toggles it.
 * - It reads `p.w`/`p.h`, so a resize re-lays it out with no polling.
 * - It paints a complete picture every call (the plane is cleared first), and
 *   fills every row it uses, so the transcript never bleeds through.
 *
 * ## Honest limitations, all of them visible in the code below
 *
 * 1. **Durations are approximate.** Hooks get no call id, so `beforeTool` and
 *    `afterTool` are paired by `name + args`. Two identical calls running in
 *    parallel would pair wrongly and report one duration twice. Fine for a
 *    panel that says "about 2s"; not fine for billing.
 * 2. **History is per-process.** The ring buffer lives in module scope, so a
 *    restart starts empty. Persisting it would be `ctx.kv` — but the KV is
 *    namespaced per TOOL, and a region is not a tool, so there is no namespace
 *    for it yet. That is a real gap, not an oversight.
 * 3. **No computed/effect in the plugin SDK.** Only `signal` is exported, so the
 *    derived numbers below are recomputed inside `paint`. For a panel of this
 *    size that is the right trade; a plugin deriving something expensive would
 *    want `computed`, which is not on the surface yet.
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
  ms: number;
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
 * In-flight calls, keyed by `name + args`.
 *
 * The only correlation the hook surface offers — see limitation 1 above. Bounded
 * so a tool that never returns (a wedged `exec`) cannot grow this map forever.
 */
const started = new Map<string, number>();
const MAX_INFLIGHT = 64;

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

function ms(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}s` : `${Math.round(n)}ms`;
}

// The palette is hardcoded because a region's plane receives no theme. Reading
// the theme is not on the plugin surface yet, so a demo that followed the user's
// theme would need an API that does not exist — these are the default theme's
// colours, so it looks native anyway.
const C = {
  bg: "#1f2335",
  fg: "#c0caf5",
  accent: "#7aa2f7",
  ok: "#9ece6a",
  err: "#f7768e",
  dim: "#565f89",
} as const;

const plugin: FoxPlugin = {
  name: "activity",

  hooks: {
    // `beforeContext` is where the window size is published, so it is the
    // cheapest honest source for the bar — no extra token estimation here.
    beforeContext(c) {
      const prev = budget.peek();
      const next = c.budget;
      // identity changes on every step, so this notifies every step; compare the
      // rounded ratio instead and stay quiet when the number did not move
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
      // the comparison a signal makes by default
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
      // Deliberately full-screen with a huge right/bottom bound. The plane's clip
      // is clamped to the live screen, so this stays correct on any terminal
      // size — and `paint` anchors itself against `p.w`/`p.h` instead of a
      // registration-time rect, which is what makes a resize re-lay it out.
      rect: [0, 0, 10_000, 10_000],
      paint(p: TuiRegionPlane) {
        if (!visible()) return; // plane is cleared for us: drawing nothing = fully transparent

        // Both reads subscribe the region to resizes, so the panel re-lays itself
        // out when the terminal moves — no polling, no listener.
        const screenW = p.w;
        const screenH = p.h;

        const boxW = Math.min(46, Math.max(26, screenW - 6));
        // bottom-anchored above the status bar (row h-1), leaving a margin
        const avail = Math.max(0, screenH - 3);
        const boxH = Math.min(14, avail);
        if (boxH < 6 || boxW < 26) return; // too small to be legible: stay out of the way

        const x0 = screenW - boxW - 2;
        const y0 = Math.max(1, screenH - 1 - boxH);
        const inner = boxW - 2; // one column of padding each side

        const row = (y: number) => {
          // fill BEFORE text so the panel is opaque and the transcript cannot
          // bleed through a gap
          p.fillRow(y, x0, x0 + boxW, { bg: C.bg });
        };

        const at = (x: number, y: number, s: string, style: { fg?: string; bold?: boolean }) => {
          p.text(x, y, s, { bg: C.bg, fg: style.fg ?? C.fg, bold: style.bold });
        };

        for (let y = y0; y < y0 + boxH; y++) row(y);

        // ---- header ----
        at(x0 + 1, y0, "activity", { fg: C.accent, bold: true });
        const hint = "ctrl+g";
        at(x0 + boxW - 1 - hint.length, y0, hint, { fg: C.dim });

        // ---- context bar ----
        const b = budget();
        let line = 1;
        if (b) {
          const pct = Math.round(b.ratio * 100);
          const bw = Math.max(6, inner - 14);
          const colour = b.stage === "ctxOnly" ? C.err : b.stage === "warn" ? C.accent : C.ok;
          at(x0 + 1, y0 + line, "ctx", { fg: C.dim });
          at(x0 + 5, y0 + line, bar(b.ratio, bw), { fg: colour });
          at(x0 + 6 + bw, y0 + line, `${String(pct).padStart(3)}%`, { fg: colour });
          line++;
          // the absolute figures only when there is room for them
          if (boxH > 10) {
            at(x0 + 5, y0 + line, `${tok(b.reported)} / ${tok(b.limit)}${b.stage !== "none" ? `  ${b.stage}` : ""}`, { fg: C.dim });
            line++;
          }
        } else {
          at(x0 + 1, y0 + line, "ctx — no reading yet", { fg: C.dim });
          line++;
        }

        // ---- separator ----
        at(x0 + 1, y0 + line, "─".repeat(inner), { fg: C.dim });
        line++;

        // ---- recent tools, newest last ----
        const list = events();
        const room = boxH - line - 2; // -1 summary row, -1 bottom margin
        if (!list.length) {
          at(x0 + 1, y0 + line, "no tool calls yet", { fg: C.dim });
        } else {
          const shown = list.slice(Math.max(0, list.length - Math.min(room, MAX_SHOWN)));
          for (let i = 0; i < shown.length && i < room; i++) {
            const ev = shown[i];
            const y = y0 + line + i;
            at(x0 + 1, y, ev.ok ? "✓" : "✗", { fg: ev.ok ? C.ok : C.err });
            // name truncated rather than wrapped: one tool per row keeps the
            // column readable, and a long MCP name must not push the timing off
            const nameW = Math.max(8, inner - 12);
            const name = ev.name.length > nameW ? `${ev.name.slice(0, nameW - 1)}…` : ev.name;
            at(x0 + 3, y, name, { fg: ev.ok ? C.fg : C.err });
            const t = ms(ev.ms);
            at(x0 + boxW - 1 - t.length, y, t, { fg: C.dim });
          }
        }

        // ---- tally ----
        const failed = list.filter((e) => !e.ok).length;
        const tally = `${list.length} call${list.length === 1 ? "" : "s"}${failed ? ` · ${failed} failed` : ""}`;
        at(x0 + 1, y0 + boxH - 1, tally, { fg: failed ? C.err : C.dim });
      },
    },
  },
};

export default plugin;

/** Named exports are how a plugin documents itself; `FoxPlugin` has no description field. */
export const description = "live tool-activity + context panel (ctrl+g)";
