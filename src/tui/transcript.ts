// Virtual transcript: the settled history a layout frame reads.
//
// The display projection (context/display.ts) knows every settled node as
// metadata — role, visibility, tool-call parentage, content length — and no
// body. This source answers layout's four per-frame questions (length, itemAt,
// countAt, renderAt) by materializing ONE node's items on demand, through the
// same view model the live view uses. Nothing hydrates the history up front.
//
// Live rows are NOT part of this source. The app composes them with
// `overlaySources`, which also drops an overlay item whose key the settled base
// has learned, so a reconciled live stand-in disappears instead of rendering
// twice.
import type { DisplayNode } from "../context/display.ts";
import type { MessageRow } from "../store/db.ts";
import { callMaps, nodeToItems, type CallMaps, type Item } from "../view/model.ts";
import { arrayTranscriptSource, type Row, type TranscriptSource } from "./layout.ts";

export interface VirtualTranscriptDeps {
  key(seq: number, slot: 0 | 1 | 2): number;
  expanded(seq: number): boolean;
  keptChars: number;
  summarize(name: string, args: string): string;
  row(seq: number): MessageRow | null;
  buildRows(item: Item, width: number): { rows: Row[]; span: [number, number]; visible: Row[] };
  countRows(item: Item, width: number): number;
}

type SlotKind = "user" | "think" | "assistant" | "toolhead" | "toolbody";

/** The item kind each slot materializes as. The assistant slot is a `md` item. */
const SLOT_ITEM_KIND: Record<SlotKind, Item["kind"]> = {
  user: "user",
  think: "think",
  assistant: "md",
  toolhead: "toolhead",
  toolbody: "toolbody",
};

interface Slot {
  key: number;
  seq: number;
  slot: 0 | 1 | 2;
  role: DisplayNode["role"];
  kind: SlotKind;
  /** metadata signature: a change drops this slot's materialized item */
  sig: string;
  expandable: boolean;
  /** a tool head rather than its body / a single-slot node */
  head: boolean;
  /** body/think expansion override; undefined falls back to deps.expanded */
  override: boolean | undefined;
  /** head expansion override; heads were only ever toggled explicitly */
  headOverride: boolean | undefined;
}

const EMPTY_CALLS: CallMaps = { label: new Map(), raw: new Map(), name: new Map() };
const MISSING: Item = { k: -1, kind: "info", text: "" };

function missingItem(slot: Slot): Item {
  if (slot.head) return { k: slot.key, kind: "toolhead", seq: slot.seq, text: "» tool" };
  if (slot.slot === 2) return { k: slot.key, kind: "toolbody", seq: slot.seq, markerCont: true, ref: slot.seq, toolResult: true, text: "" };
  const kind: Item["kind"] = slot.role === "user" ? "user" : slot.role === "think" ? "think" : "md";
  return { k: slot.key, kind, seq: slot.seq, text: "" };
}

/**
 * A `TranscriptSource` over the session's display projection.
 *
 * Slot order is the transcript order: one slot for user/think/assistant rows,
 * two for a tool result (head then body). Keys come from `deps.key`, which the
 * app derives from the storage seq, so they stay stable across refreshes and
 * every consumer's line cache stays warm.
 */
export class VirtualTranscript implements TranscriptSource<Item> {
  private slots: Slot[] = [];
  private index = new Map<number, number>();
  private materialized = new Map<number, Item>();
  /**
   * The count signature each materialized item was built under. A count miss
   * compares it before counting: an item built under an older kept-char cap or
   * expansion state must not seed a count filed under the new signature.
   */
  private materializedSig = new Map<number, string>();
  /** per width, per slot key: an exact row count valid while the signature holds */
  private countCache = new Map<number, Map<number, { signature: string; rows: number }>>();
  private bySeq = new Map<number, DisplayNode>();
  private parentCall = new Map<string, number>();
  /** the last projection array; a different identity means a new/evicted cache */
  private lastNodes: DisplayNode[] | null = null;
  /** settled keys whose materialized item/signature this refresh invalidated */
  private invalidatedKeys: number[] = [];

  constructor(
    private readonly deps: VirtualTranscriptDeps,
    private readonly nodes: () => DisplayNode[],
  ) {
    this.refresh();
  }

  get length(): number {
    return this.slots.length;
  }

  /** Rebuild the slot table from the projection, preserving unchanged slots. */
  refresh(): void {
    const raw = this.nodes();
    // projectDisplay returns its cached array for a session. A different array
    // identity means a different session (or an evicted cache): seq-derived keys
    // could otherwise collide and keep another session's materialized content.
    const reset = raw !== this.lastNodes;
    this.lastNodes = raw;
    this.invalidatedKeys = [];
    const prevByKey = new Map<number, Slot>();
    if (!reset) for (const s of this.slots) prevByKey.set(s.key, s);
    else {
      // A new projection (session switch / evicted cache) can collide on
      // seq-derived keys. Invalidate every cached key so the host's row memo
      // cannot answer with the previous projection's rows.
      for (const k of this.materialized.keys()) this.invalidatedKeys.push(k);
      this.materialized.clear();
      this.materializedSig.clear();
      this.countCache.clear();
    }

    this.bySeq.clear();
    this.parentCall.clear();
    for (const n of raw) {
      if (n.deleted) continue;
      this.bySeq.set(n.seq, n);
      if (n.role === "assistant") for (const id of n.callIds) this.parentCall.set(id, n.seq);
    }

    const next: Slot[] = [];
    for (const n of raw) {
      if (n.deleted) continue;
      const base = `${n.role}|${n.contentLen}|${n.replaceVersion ?? ""}|${n.tool_call_id ?? ""}`;
      if (n.role === "tool") {
        const hasCall = !!n.tool_call_id && this.parentCall.has(n.tool_call_id);
        next.push(this.slot(n, 1, "toolhead", `${base}|${hasCall ? 1 : 0}`, hasCall, true, prevByKey));
        next.push(this.slot(n, 2, "toolbody", base, true, false, prevByKey));
      } else {
        const kind: SlotKind = n.role === "user" ? "user" : n.role === "think" ? "think" : "assistant";
        next.push(this.slot(n, 0, kind, base, kind === "think", false, prevByKey));
      }
    }

    const live = new Set(next.map((s) => s.key));
    for (const k of this.materialized.keys()) {
      if (live.has(k)) continue;
      this.materialized.delete(k);
      this.materializedSig.delete(k);
    }
    for (const pw of this.countCache.values()) for (const k of pw.keys()) if (!live.has(k)) pw.delete(k);
    for (const s of next) {
      const p = prevByKey.get(s.key);
      // A brand-new slot has no cached rows to invalidate. Only a slot that
      // EXISTED and whose metadata moved needs the host's row memo dropped.
      if (!p) continue;
      if (p.sig !== s.sig) {
        this.materialized.delete(s.key);
        this.materializedSig.delete(s.key);
        this.forgetCount(s.key);
        this.invalidatedKeys.push(s.key);
      }
    }
    this.slots = next;
    this.index = new Map(next.map((s, i) => [s.key, i]));
  }

  /**
   * Keys whose settled slot changed since the last refresh.
   *
   * The host's row memo is keyed by per-item revision, not by this source's
   * metadata signature, so `refresh()` must hand it the keys it invalidated.
   * Draining keeps the report exactly-once.
   */
  takeInvalidatedKeys(): number[] {
    const keys = this.invalidatedKeys;
    this.invalidatedKeys = [];
    return keys;
  }

  private slot(
    n: DisplayNode,
    slot: 0 | 1 | 2,
    kind: SlotKind,
    sig: string,
    expandable: boolean,
    head: boolean,
    prev: Map<number, Slot>,
  ): Slot {
    const key = this.deps.key(n.seq, slot);
    const p = prev.get(key);
    return { key, seq: n.seq, slot, role: n.role, kind, sig, expandable, head, override: p?.override, headOverride: p?.headOverride };
  }

  private effective(slot: Slot): boolean {
    if (slot.head) return slot.headOverride ?? false;
    return slot.override ?? this.deps.expanded(slot.seq);
  }

  /**
   * Every input that can change this slot's row count: the metadata signature
   * (role, content length, replacement version, tool-call join), the seq, the
   * slot kind, the effective expansion, and the kept-char cap. Highlight and
   * theme are deliberately absent — they recolour and never re-wrap.
   */
  private countSignature(slot: Slot): string {
    return `${slot.sig}|${slot.seq}|${slot.kind}|${this.effective(slot) ? 1 : 0}|${this.deps.keptChars}`;
  }

  private forgetCount(key: number): void {
    for (const pw of this.countCache.values()) pw.delete(key);
  }

  private materialize(slot: Slot): Item {
    const node = this.bySeq.get(slot.seq);
    const row = this.deps.row(slot.seq);
    if (!node || !row) return missingItem(slot);
    const opts = {
      key: this.deps.key,
      expanded: () => this.effective(slot),
      keptChars: this.deps.keptChars,
    };
    if (node.role === "tool" && node.tool_call_id) {
      const parentSeq = this.parentCall.get(node.tool_call_id);
      const parent = parentSeq === undefined ? null : this.deps.row(parentSeq);
      const cm = parent ? callMaps([parent], this.deps.summarize) : EMPTY_CALLS;
      const items = nodeToItems(row, cm, opts, undefined, node.replaceVersion !== undefined);
      const it = items[slot.head ? 0 : 1];
      if (!it) return missingItem(slot);
      if (slot.head) it.expanded = this.effective(slot) || undefined;
      return it;
    }
    return nodeToItems(row, EMPTY_CALLS, opts, undefined, node.replaceVersion !== undefined)[0] ?? missingItem(slot);
  }

  itemAt(index: number): Item {
    const slot = this.slots[index];
    if (!slot) return MISSING;
    let it = this.materialized.get(slot.key);
    if (!it) {
      it = this.materialize(slot);
      this.materialized.set(slot.key, it);
      this.materializedSig.set(slot.key, this.countSignature(slot));
    }
    return it;
  }

  /** Metadata-only: the item kind this slot renders as, without materializing. */
  kindAt(index: number): string {
    const slot = this.slots[index];
    return slot ? SLOT_ITEM_KIND[slot.kind] : MISSING.kind;
  }

  renderAt(index: number, width: number): Row[] {
    return this.deps.buildRows(this.itemAt(index), width).visible;
  }

  rowsAt(index: number, width: number): Row[] {
    return this.deps.buildRows(this.itemAt(index), width).rows;
  }

  countAt(index: number, width: number): number {
    const slot = this.slots[index];
    if (!slot) return this.deps.countRows(MISSING, width);
    // Bound width entries to the widths in play (the frame's W and the
    // scrollbar's W-2), the same rule layout uses: five or more widths means a
    // resize, and the oldest width can never come back.
    if (this.countCache.size > 4 && !this.countCache.has(width)) this.countCache.clear();
    const signature = this.countSignature(slot);
    const hit = this.countCache.get(width)?.get(slot.key);
    // A hit neither calls deps.countRows nor materializes: the signature names
    // every input that could have moved the count.
    if (hit && hit.signature === signature) return hit.rows;
    // The cached item may predate this signature (a kept-char cap or expansion
    // change). Drop it so the recount is built from current state; otherwise a
    // later forgetItem would rebuild rows that disagree with the stored count.
    const wasCurrent = this.materializedSig.get(slot.key) === signature;
    if (!wasCurrent) {
      this.materialized.delete(slot.key);
      this.materializedSig.delete(slot.key);
    }
    const rows = this.deps.countRows(this.itemAt(index), width);
    // A cold count only needed the item transiently. Keep the exact row count,
    // but do not retain every settled body after the count pass; paint will
    // materialize its visible window again.
    if (!wasCurrent) {
      this.materialized.delete(slot.key);
      this.materializedSig.delete(slot.key);
    }
    let pw = this.countCache.get(width);
    if (!pw) {
      pw = new Map();
      this.countCache.set(width, pw);
    }
    pw.set(slot.key, { signature, rows });
    return rows;
  }

  indexOfKey(key: number): number {
    return this.index.get(key) ?? -1;
  }

  itemByKey(key: number): Item | undefined {
    const i = this.index.get(key);
    return i === undefined ? undefined : this.itemAt(i);
  }

  hasKey(key: number): boolean {
    return this.index.has(key);
  }

  /** Drop one seq's materialized items and signatures; the next refresh rebuilds. */
  touchSeq(seq: number): void {
    for (const s of this.slots) {
      if (s.seq !== seq) continue;
      this.materialized.delete(s.key);
      this.materializedSig.delete(s.key);
      this.forgetCount(s.key);
      s.sig = "";
    }
  }

  anyFolded(): boolean {
    return this.slots.some((s) => s.expandable && !this.effective(s));
  }

  /** Fold/unfold every expandable settled slot without materializing it. */
  setAllExpanded(expanded: boolean): number {
    let changed = 0;
    for (const s of this.slots) {
      if (!s.expandable) continue;
      // Slots already in the requested state keep their materialized item: a
      // backfilled, manually expanded body must survive when another slot is
      // what ctrl+t actually changes.
      if (this.effective(s) === expanded) continue;
      if (s.head) s.headOverride = expanded;
      else s.override = expanded;
      changed++;
      this.materialized.delete(s.key);
      this.materializedSig.delete(s.key);
      this.forgetCount(s.key);
    }
    return changed;
  }

  forgetItem(key: number): void {
    this.materialized.delete(key);
    this.materializedSig.delete(key);
  }

  /**
   * Mirror an explicit item toggle into this settled slot's expansion state.
   *
   * A click mutates the materialized item and the host's `expandedRefs`; without
   * this, a ctrl+t override from an earlier pass would be the state a later
   * `touchSeq` re-materializes from, resurrecting the old fold direction. The
   * host calls this only for keys the settled source owns.
   */
  syncExpandedItem(key: number, expanded: boolean): void {
    const i = this.index.get(key);
    if (i === undefined) return;
    const slot = this.slots[i];
    if (slot.head) slot.headOverride = expanded;
    else slot.override = expanded;
    // Keep a live materialized item: toggleExpand() may have just backfilled
    // its text from the stored row (past the kept-char cap), and dropping it
    // here would make the next itemAt() rebuild from nodeToItems() and
    // re-truncate. The host's touch(it.k) already drops cached rows.
    const it = this.materialized.get(key);
    if (it) {
      it.expanded = expanded;
      this.materializedSig.set(key, this.countSignature(slot));
    }
    this.forgetCount(key);
  }
}

/** The array-backed source under the transcript's interface name. */
export function arrayItemSource(
  items: readonly Item[],
  renderItem: (item: Item, width: number) => Row[],
  countItem: (item: Item, width: number) => number,
): TranscriptSource<Item> {
  return arrayTranscriptSource(items, renderItem, countItem);
}

interface Located {
  source: TranscriptSource<Item>;
  index: number;
}

function locate(sources: readonly TranscriptSource<Item>[], index: number): Located | null {
  let offset = 0;
  for (const source of sources) {
    const n = source.length;
    if (index < offset + n) return { source, index: index - offset };
    offset += n;
  }
  return null;
}

/** One source over several, read left to right. */
export function concatSources(sources: readonly TranscriptSource<Item>[]): TranscriptSource<Item> {
  return {
    get length() {
      let n = 0;
      for (const s of sources) n += s.length;
      return n;
    },
    itemAt(index) {
      const at = locate(sources, index);
      if (!at) throw new RangeError(`transcript index ${index} out of range`);
      return at.source.itemAt(at.index);
    },
    kindAt(index) {
      const at = locate(sources, index);
      if (!at) throw new RangeError(`transcript index ${index} out of range`);
      return at.source.kindAt(at.index);
    },
    renderAt(index, width) {
      const at = locate(sources, index);
      if (!at) throw new RangeError(`transcript index ${index} out of range`);
      return at.source.renderAt(at.index, width);
    },
    rowsAt(index, width) {
      const at = locate(sources, index);
      if (!at) throw new RangeError(`transcript index ${index} out of range`);
      return at.source.rowsAt(at.index, width);
    },
    countAt(index, width) {
      const at = locate(sources, index);
      if (!at) throw new RangeError(`transcript index ${index} out of range`);
      return at.source.countAt(at.index, width);
    },
    indexOfKey(key) {
      let offset = 0;
      for (const s of sources) {
        const i = s.indexOfKey(key);
        if (i >= 0) return offset + i;
        offset += s.length;
      }
      return -1;
    },
    itemByKey(key) {
      for (const s of sources) {
        const it = s.itemByKey(key);
        if (it !== undefined) return it;
      }
      return undefined;
    },
  };
}

/**
 * `base` plus the overlay items it does not already know.
 *
 * Overlay items are transient (a live stream, a reconciled stand-in). Once the
 * settled base has the same key, the overlay copy is stale and must vanish —
 * this is what makes an anchored settled item leave the overlay after refresh.
 */
export function overlaySources(base: TranscriptSource<Item>, overlays: readonly TranscriptSource<Item>[]): TranscriptSource<Item> {
  const overlay = concatSources(overlays);
  let memo: { n: number; m: number; map: number[] } | null = null;
  const visible = (): number[] => {
    const n = overlay.length;
    const m = base.length;
    if (memo && memo.n === n && memo.m === m) return memo.map;
    const map: number[] = [];
    for (let i = 0; i < n; i++) {
      const it = overlay.itemAt(i);
      if (it !== undefined && base.indexOfKey(it.k) < 0) map.push(i);
    }
    memo = { n, m, map };
    return map;
  };
  return {
    get length() {
      return base.length + visible().length;
    },
    itemAt(index) {
      if (index < base.length) return base.itemAt(index);
      const oi = visible()[index - base.length];
      if (oi === undefined) throw new RangeError(`transcript overlay index ${index} out of range`);
      return overlay.itemAt(oi);
    },
    kindAt(index) {
      if (index < base.length) return base.kindAt(index);
      const oi = visible()[index - base.length];
      if (oi === undefined) throw new RangeError(`transcript overlay index ${index} out of range`);
      return overlay.kindAt(oi);
    },
    renderAt(index, width) {
      if (index < base.length) return base.renderAt(index, width);
      const oi = visible()[index - base.length];
      if (oi === undefined) throw new RangeError(`transcript overlay index ${index} out of range`);
      return overlay.renderAt(oi, width);
    },
    rowsAt(index, width) {
      if (index < base.length) return base.rowsAt(index, width);
      const oi = visible()[index - base.length];
      if (oi === undefined) throw new RangeError(`transcript overlay index ${index} out of range`);
      return overlay.rowsAt(oi, width);
    },
    countAt(index, width) {
      if (index < base.length) return base.countAt(index, width);
      const oi = visible()[index - base.length];
      if (oi === undefined) throw new RangeError(`transcript overlay index ${index} out of range`);
      return overlay.countAt(oi, width);
    },
    indexOfKey(key) {
      const baseIndex = base.indexOfKey(key);
      if (baseIndex >= 0) return baseIndex;
      const map = visible();
      for (let j = 0; j < map.length; j++) if (overlay.itemAt(map[j]).k === key) return base.length + j;
      return -1;
    },
    itemByKey(key) {
      const baseItem = base.itemByKey(key);
      if (baseItem !== undefined) return baseItem;
      const map = visible();
      for (const i of map) {
        const it = overlay.itemAt(i);
        if (it.k === key) return it;
      }
      return undefined;
    },
  };
}
