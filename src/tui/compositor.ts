/**
 * Push-based compositor — extends the proven Screen grid/planes/flush with a
 * geometry coordinator and an async-push scheduling surface.
 *
 * The frame loop never calls panel code. Each region's expensive derive runs in
 * an async task (scheduled on change) that stamps its plane when ready; the
 * frame loop only composite()+flush()es whatever the planes last held. A slow
 * region therefore confines its cost to itself — the spinner and every other
 * region keep painting from their last-pushed state while the slow one catches
 * up. That is the fix for "one slow plane freezes the whole screen".
 *
 * Geometry (who gets how many rows, where each region sits) is a shared,
 * cooperative record — one layout coordinator owns the split as pure integer
 * math (never a panel draw). When the dock's row count moves, the coordinator
 * recomputes the derived fields (inputTop, vh, queueH) and notifies the
 * regions that depend on them so they re-push at their new geometry. The
 * transcript and floats read their sizes from here; hit-tests read the
 * last-pushed Frame for row content and this record for layout.
 */
import { Screen, type Style } from "./screen.ts";
import type { Term } from "./term.ts";

/** Shared geometry record. Cooperative: the dock writes inputRows/shownCount/
 * inputTop, the transcript writes vh/scrollTop, the floats write queueH; the
 * coordinator derives the rest and notifies listeners on change. */
export interface Geometry {
  W: number;
  H: number;
  /** dock-owned */
  inputRows: number;
  shownCount: number;
  inputTop: number;
  firstShown: number;
  /** transcript-owned */
  vh: number;
  total: number;
  scrollTop: number;
  stick: boolean;
  /** floats-owned */
  queueH: number;
}

export type GeometryListener = (changed: Partial<Geometry>) => void;

export class PushCompositor extends Screen {
  geom: Geometry = {
    W: 0, H: 0,
    inputRows: 1, shownCount: 1, inputTop: 0, firstShown: 0,
    vh: 0, total: 0, scrollTop: 0, stick: true,
    queueH: 0,
  };
  private listeners: { fields: (keyof Geometry)[]; fn: GeometryListener }[] = [];

  constructor(term: Term) {
    super(term);
  }

  /** Watch specific geometry fields; fired (synchronously) when any moves. */
  onGeometry(fields: (keyof Geometry)[], fn: GeometryListener): void {
    this.listeners.push({ fields, fn });
  }

  /** Merge a geometry patch and notify listeners whose watched fields changed. */
  pushGeometry(patch: Partial<Geometry>): void {
    const changed: Partial<Geometry> = {};
    for (const k of Object.keys(patch) as (keyof Geometry)[]) {
      if (this.geom[k] !== patch[k]) {
        (changed as Record<string, unknown>)[k] = patch[k] as unknown;
        (this.geom as unknown as Record<string, unknown>)[k] = patch[k] as unknown;
      }
    }
    if (Object.keys(changed).length) {
      for (const l of this.listeners) {
        if (l.fields.some((f) => f in changed)) {
          try {
            l.fn(changed);
          } catch {
            /* a listener that throws must not starve the others */
          }
        }
      }
    }
  }
}
