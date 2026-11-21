/**
 * Input dock: the soft-wrapped editor buffer, its layout, and caret math.
 *
 * Split out of app.ts because it is self-contained logic that can be tested
 * without a terminal: word-aware wrapping, cursor-to-visual-row mapping,
 * buffer-index hit-testing, and vertical caret motion. Everything here is
 * pure over the buffer contents; the only side effects are `markDirty()`
 * calls, passed in as a dependency so the module stays decoupled.
 *
 * The buffer holds one entry per code point (`Ch`), but a user sees
 * graphemes — deletion and motion walk whole clusters via edit.ts.
 */
import { charWidth } from "./screen.ts";
import {
  buildInputLayout,
  caretPos as caretPosForText,
  rowBufRange as rowBufRangeForText,
  wrapText,
  type InputLayout,
} from "./wrap.ts";
import type { Ch } from "./edit.ts";

export type { InputLayout, VisualRow } from "./wrap.ts";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Dependencies the input module needs from the app closure. */
export interface InputDeps {
  /** Current buffer contents as a flat string (for width/wrap math). */
  display(): string;
  /** True when the active prompt step is a secret (bullets, not text). */
  isSecret(): boolean;
  /** Screen width — the dock wraps to `W - 4`. */
  width(): number;
  /** Mark the screen dirty after a mutation. */
  markDirty(): void;
  /** Dock geometry for hit-testing (inputTop, shownCount, firstShown). */
  dockGeom(): {
    layout: InputLayout;
    firstShown: number;
    inputTop: number;
    shownCount: number;
  };
}

export interface InputModule {
  /** Bump on every buffer mutation; the layout cache keys on this. */
  readonly rev: () => number;
  bumpRev(): void;
  /** Buffer contents, with secret steps masked as bullets. */
  inputText(): string;
  /** Cached soft-wrap layout of the current buffer. */
  inputLayout(): InputLayout;
  /** Map cursor index -> visual row + display-width column. */
  caretPos(layout: InputLayout, cur: number): { visRow: number; colW: number };
  /** Anchored selection range, or null when there is none. */
  inSelRange(anchor: number | null, cur: number): [number, number] | null;
  /** Delete the selection if present; returns true when it did. */
  deleteInSel(buf: Ch[], cur: number, anchor: number | null): { buf: Ch[]; cur: number; anchor: number | null; did: boolean };
  /** Buffer-index range one visual row covers (newline excluded). */
  rowBufRange(layout: InputLayout, v: number): [number, number];
  /** (x, y) in the input dock -> buffer index; null when y is above the dock. */
  inputIndexAt(x: number, y: number, round?: boolean): number | null;
  /** up/down inside a multi-line input, keeping the display column. */
  moveCaretVertical(dir: -1 | 1, extend: boolean, cur: number, anchor: number | null): { cur: number; anchor: number | null };
  /** Drop the cached layout (width changed — a stale wrap must not survive). */
  invalidate(): void;
  /** Pure word-aware wrap, kept for reuse and testing. */
  wrapByWidth(s: string, maxCols: number): string[];
  /** Buffer index of the first char whose cell would start past targetW columns. */
  indexAtWidth(s: string, targetW: number): number;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createInputModule(deps: InputDeps): InputModule {
  let inputRev = 0; // bumped on every buffer mutation
  let layoutCache: { rev: number; layout: InputLayout } | null = null;

  /** Buffer index of the first char whose cell would start past `targetW`
   *  display columns. `round` snaps to the nearest boundary (for selection —
   *  a caret or highlight sits BETWEEN chars, not on one), so a drag only needs
   *  to cross half a cell to move; without it the first drag cell does nothing
   *  and selecting 2 chars takes 3. */
  function indexAtWidth(s: string, targetW: number, round = false): number {
    let w = 0;
    let i = 0;
    for (const ch of s) {
      const cw = charWidth(ch.codePointAt(0)!);
      if (round && w + cw / 2 > targetW) break;
      if (!round && w + cw > targetW) break;
      w += cw;
      i++;
    }
    return i;
  }

  /** What the input dock paints. Identical to the buffer except on a secret
   *  prompt step (an api key), where every non-newline code point is a bullet —
   *  one bullet per code point keeps the caret math honest (see caretPos). */
  function inputText(): string {
    const d = deps.display();
    if (!deps.isSecret()) return d;
    return [...d].map((c) => (c === "\n" ? c : "•")).join("");
  }

  function inputLayout(): InputLayout {
    if (layoutCache && layoutCache.rev === inputRev) return layoutCache.layout;
    // One shared lossless wrap kernel with the tested caret maps. A private
    // copy here once consumed break spaces and let a full-width row report a
    // startCol one past its width, which painted the caret left of the prompt.
    const layout = buildInputLayout(inputText(), Math.max(8, deps.width() - 4));
    layoutCache = { rev: inputRev, layout };
    return layout;
  }

  /** Map cursor index -> visual row + display-width column. */
  function caretPos(layout: InputLayout, cur: number): { visRow: number; colW: number } {
    // walk the painted text (inputText), not buf: a secret step's bullets are
    // all width 1, and the wrap this maps into was computed on those bullets
    return caretPosForText(layout, cur, inputText());
  }

  /** Anchored selection range, or null when there is none. */
  function inSelRange(anchor: number | null, cur: number): [number, number] | null {
    return anchor !== null && anchor !== cur ? [Math.min(anchor, cur), Math.max(anchor, cur)] : null;
  }

  /** Delete the selection if present; returns the new buffer/cursor/anchor. */
  function deleteInSel(buf: Ch[], cur: number, anchor: number | null) {
    const r = inSelRange(anchor, cur);
    if (!r) return { buf, cur, anchor, did: false };
    const nb = buf.slice();
    nb.splice(r[0], r[1] - r[0]);
    inputRev++;
    deps.markDirty();
    return { buf: nb, cur: r[0], anchor: null, did: true };
  }

  /** buffer-index range one visual row covers (the newline excluded) */
  function rowBufRange(layout: InputLayout, v: number): [number, number] {
    return rowBufRangeForText(layout, v, inputText());
  }

  /** (x, y) in the input dock -> buffer index; null when y is above the dock. */
  function inputIndexAt(x: number, y: number, round = false): number | null {
    const { layout, firstShown, inputTop, shownCount } = deps.dockGeom();
    if (y < inputTop || y >= inputTop + shownCount) return null;
    const v = Math.min(firstShown + (y - inputTop), layout.rows.length - 1);
    const [s, e] = rowBufRange(layout, v);
    const targetW = Math.max(0, x - 3); // 1 margin + 2 for the "❯ " prefix
    return s + indexAtWidth(inputText().slice(s, e), targetW, round);
  }

  /** up/down inside a multi-line input, keeping the display column. */
  function moveCaretVertical(dir: -1 | 1, extend: boolean, cur: number, anchor: number | null) {
    let na = anchor;
    if (extend && na === null) na = cur;
    if (!extend) na = null;
    const layout = inputLayout();
    const pos = caretPos(layout, cur);
    const tv = pos.visRow + dir;
    let nc: number;
    if (tv < 0) nc = 0;
    else if (tv >= layout.rows.length) nc = deps.display().length;
    else {
      const [s, e] = rowBufRange(layout, tv);
      nc = s + indexAtWidth(inputText().slice(s, e), pos.colW);
    }
    deps.markDirty();
    return { cur: nc, anchor: na };
  }

  return {
    rev: () => inputRev,
    bumpRev: () => { inputRev++; },
    inputText,
    inputLayout,
    caretPos,
    inSelRange,
    deleteInSel,
    rowBufRange,
    inputIndexAt,
    moveCaretVertical,
    wrapByWidth: (s, maxCols) =>
      wrapText(s, maxCols, { lossless: true, exactWidth: true, keepLeadSpaces: true }),
    indexAtWidth,
    invalidate: () => { layoutCache = null; },
  };
}
