import { allMessages, messagesAfter, allOps, opsAfter, type DeleteOp, type MessageRow, type ReplaceOp, type RestoreOp, type ViewOp } from "../store/db.ts";

export interface ParsedCall {
  id: string;
  name: string;
  arguments: string;
}

/**
 * Parsed `msg.tool_calls`, memoized on the immutable row. The render path used
 * to JSON.parse every assistant node's call list on every step of every turn —
 * the single most repeated parse in the loop. Message rows never change once
 * written, so the raw string is the cache key's version stamp.
 */
const callCache = new Map<string, { raw: string; parsed: ParsedCall[] }>();

/**
 * Drop memoized parses belonging to one projection.
 *
 * `callCache` is keyed by message id with no size bound, so a process that has
 * visited many sessions accumulates an entry for every assistant node it ever
 * rendered, long after the session is closed. Tying it to the projection's
 * lifetime is the natural bound: the ids are exactly the ones that projection
 * owned, and a re-read after eviction simply re-parses.
 */
function dropCallCacheFor(c: ViewCache): void {
  for (const n of c.nodes) if (n.msg.tool_calls) callCache.delete(n.msg.id);
}
export function parseToolCalls(msg: MessageRow): ParsedCall[] {
  if (!msg.tool_calls) return [];
  const hit = callCache.get(msg.id);
  if (hit && hit.raw === msg.tool_calls) return hit.parsed;
  let parsed: ParsedCall[] = [];
  try {
    parsed = JSON.parse(msg.tool_calls) as ParsedCall[];
  } catch {}
  callCache.set(msg.id, { raw: msg.tool_calls, parsed });
  return parsed;
}

export interface ViewNode {
  msg: MessageRow;
  content: string; // view-level (post replace)
  deleted: boolean;
  /** set by a delete op, cleared by restore — the sticky half of `deleted` */
  hidden?: boolean;
  summary?: string;
  orphan?: boolean; // hidden because its parent assistant is hidden
  /**
   * Set by a replace op the harness derived (presentation truncation), holding
   * the policy version that produced `content`. Absent for a `ctx`-authored
   * replace (a deliberate edit) and for an untouched node.
   *
   * The distinction matters to every consumer: a host may show the STORED
   * original behind an explicit reveal when this is set, and a replay can
   * re-derive the text when the policy changes — neither is safe on an
   * agent-authored edit, which must never be second-guessed.
   */
  replaceVersion?: number;
}

function applyOp(c: ViewCache, op: ViewOp): void {
  if (op.kind === "replace") {
    const { id, content, version } = op as ReplaceOp;
    const n = c.bySeq.get(id);
    if (n) {
      n.content = content;
      n.replaceVersion = version;
    }
  } else if (op.kind === "restore") {
    const { ids } = op as RestoreOp;
    for (const id of ids) {
      const n = c.bySeq.get(id);
      // no orphan check needed here: restoring a parent re-adds its calls to
      // the visible set and rechecks every dependent tool node below
      if (n) {
        n.hidden = false;
        n.summary = undefined;
        n.deleted = !!n.orphan;
        const calls = c.callsOf.get(n.msg.seq);
        if (calls) {
          for (const cid of calls) c.visibleCalls.add(cid);
          recheckTools(c, calls);
        }
      }
    }
  } else {
    const { ids, summary } = op as DeleteOp;
    let first = true;
    for (const id of ids) {
      const n = c.bySeq.get(id);
      if (!n || n.hidden) continue;
      n.hidden = true;
      n.deleted = true;
      if (summary && first) {
        n.summary = summary;
        first = false;
      }
      // an op-hidden assistant's calls are gone from the request — its tool
      // results just became orphans, and only those need rechecking
      const calls = c.callsOf.get(n.msg.seq);
      if (calls) {
        for (const cid of calls) c.visibleCalls.delete(cid);
        recheckTools(c, calls);
      }
    }
  }
}

/** Recompute orphan/deleted for the tool nodes of exactly these call ids. */
function recheckTools(c: ViewCache, callIds: string[]): void {
  for (const cid of callIds) {
    const t = c.toolByCall.get(cid);
    if (!t || t.hidden) continue;
    t.orphan = !c.visibleCalls.has(cid) || undefined;
    t.deleted = !!t.orphan;
  }
}

/**
 * Recompute `deleted` for every node: op-hidden (`hidden`) OR orphaned.
 *
 * Orphan-hiding is derived state, not sticky — a restore op that makes a
 * parent assistant visible again must un-hide its tool results, which is only
 * possible because the op-driven half lives in its own field.
 */
function repairOrphans(c: ViewCache, nodes: ViewNode[]) {
  const visibleCallIds = c.visibleCalls;
  for (const n of nodes) {
    if (n.hidden || n.msg.role !== "assistant" || !n.msg.tool_calls) continue;
    for (const call of parseToolCalls(n.msg)) {
      visibleCallIds.add(call.id);
      const existing = c.callsOf.get(n.msg.seq);
      if (!existing) c.callsOf.set(n.msg.seq, [call.id]);
      else if (!existing.includes(call.id)) existing.push(call.id);
    }
  }
  for (const n of nodes) {
    if (n.msg.role === "tool" && n.msg.tool_call_id) c.toolByCall.set(n.msg.tool_call_id, n);
    const orphan = n.msg.role === "tool" && !!n.msg.tool_call_id && !visibleCallIds.has(n.msg.tool_call_id);
    n.orphan = orphan || undefined;
    n.deleted = !!n.hidden || orphan;
  }
}

/**
 * Per-session projection cache.
 *
 * Both logs are append-only — message rows are immutable once written (a
 * "replace" is an op, not an UPDATE) and ops never rewrite — so a projection
 * is the previous projection plus whatever appeared since. Replaying from zero
 * on every render meant every turn step re-read and re-parsed the whole
 * session (SQLite rows, JSON per op, JSON per assistant tool_calls) to arrive
 * at a view that differs from the last one by a handful of nodes.
 *
 * A forked session gets a fresh id and therefore a fresh cache entry; a deleted
 * session's entry simply goes stale (ids are random, so no resurrection can
 * collide with it). One caveat by design: another process appending to the same
 * session would be picked up only for rows with higher seqs — which is exactly
 * the append-only contract, so it is correct.
 */
interface ViewCache {
  lastMsgSeq: number;
  lastOpSeq: number;
  nodes: ViewNode[];
  bySeq: Map<number, ViewNode>;
  /** tool_call ids currently visible (their assistant is not op-hidden) */
  visibleCalls: Set<string>;
  /** tool_call_id -> tool node, for orphan rechecks when a parent flips */
  toolByCall: Map<string, ViewNode>;
  /** assistant seq -> its tool_call ids (empty arrays omitted) */
  callsOf: Map<number, string[]>;
}
const views = new Map<string, ViewCache>();

/**
 * How many sessions keep a resident projection.
 *
 * Each entry holds every message body of that session plus four index maps, so
 * an unvisited-since-forever map is a leak that scales with how many sessions
 * the process has ever touched. Eviction is CORRECTNESS-SAFE by construction:
 * a missing entry makes `projectView` rebuild from SQLite (see the
 * `lastMsgSeq === 0` branch), so the cost of a miss is a re-read, never a wrong
 * view. The cap matches `MAX_OPEN_SESSIONS` in store/db.ts — the same number of
 * sessions that may hold an open database handle.
 */
const MAX_VIEWS = 8;

/**
 * Sessions that must not be evicted.
 *
 * Deliberately EMPTY and unused by the harness: recency alone already protects
 * the active session, because the turn loop and the TUI projection touch it
 * continuously, so it is never the coldest entry. A pins set would add a
 * failure mode with no upside here — a pin that is never released (an early
 * return, a thrown turn) makes that session resident forever, which is exactly
 * the leak the LRU exists to prevent.
 */

/** Drop the least-recently-used projections past the cap. */
function evictViews(keep: string): void {
  for (const id of [...views.keys()]) {
    if (views.size <= MAX_VIEWS) return;
    if (id === keep) continue;
    dropViewCache(id);
  }
}

/** Test hook: drop cached projections (a fresh FOX_AGENT_HOME reuses no ids, but be explicit). */
export function dropViewCache(sessionId?: string): void {
  if (sessionId) {
    const c = views.get(sessionId);
    if (c) dropCallCacheFor(c);
    views.delete(sessionId);
  } else {
    for (const c of views.values()) dropCallCacheFor(c);
    views.clear();
  }
}

/**
 * The visible node list: replay the op log over the message log, incrementally.
 *
 * The pairing invariant is enforced on every call (not cached): a tool result
 * may only be visible if the assistant node carrying its tool_call is also
 * visible. `repairOrphans` is one linear pass and cheap next to the SQLite and
 * JSON work the cache eliminates.
 */
export function projectView(sessionId: string): ViewNode[] {
  let c = views.get(sessionId);
  if (c) {
    // refresh recency: delete+set moves the key to the end of iteration order,
    // which is what `evictViews` walks oldest-first
    views.delete(sessionId);
    views.set(sessionId, c);
  } else {
    c = { lastMsgSeq: 0, lastOpSeq: 0, nodes: [], bySeq: new Map(), visibleCalls: new Set(), toolByCall: new Map(), callsOf: new Map() };
    views.set(sessionId, c);
    // a miss past the cap evicts the coldest OTHER session; the entry just
    // created is `keep` so it can never be the one dropped
    evictViews(sessionId);
  }

  // first touch of a session reads everything; later touches read only the tail
  const newMsgs = c.lastMsgSeq === 0 ? allMessages(sessionId) : messagesAfter(sessionId, c.lastMsgSeq);
  for (const m of newMsgs) {
    const n: ViewNode = { msg: m, content: m.content, deleted: false };
    c.nodes.push(n);
    c.bySeq.set(m.seq, n);
    // incremental-orphan indexes (see applyOp): tool nodes keyed by the call
    // they answer, and each assistant's call ids — applyOp flips exactly the
    // affected nodes instead of rescanning the whole session per op batch
    if (m.role === "tool" && m.tool_call_id) c.toolByCall.set(m.tool_call_id, n);
    if (m.role === "assistant" && m.tool_calls && !n.hidden) {
      const calls = parseToolCalls(m).map((x) => x.id);
      if (calls.length) {
        c.callsOf.set(m.seq, calls);
        if (!n.hidden) for (const cid of calls) c.visibleCalls.add(cid);
      }
    }
    if (m.seq > c.lastMsgSeq) c.lastMsgSeq = m.seq;
  }

  const hadNewMsgs = newMsgs.length > 0;
  const newOps = c.lastOpSeq === 0 ? allOps(sessionId) : opsAfter(sessionId, c.lastOpSeq);
  for (const row of newOps) {
    applyOp(c, JSON.parse(row.payload) as ViewOp);
    if (row.seq > c.lastOpSeq) c.lastOpSeq = row.seq;
  }

  // applyOp now maintains orphan state for op-driven changes; the full pass
  // is only needed when the message log itself grew (new nodes never seen by
  // any op) or on the very first build of the session
  if (hadNewMsgs || newOps.length === 0) repairOrphans(c, c.nodes);
  return c.nodes;
}

/**
 * The view's watermark: `<last message seq>:<last op seq>`. Both logs are
 * append-only and every mutation of an old node (a replace, a delete, a
 * restore) is an op, so equal stamps mean a byte-identical visible view.
 * `renderContext` uses this to reuse the whole assembled history array
 * instead of re-walking 10k memo hits on every step of a long session.
 */
export function viewStamp(sessionId: string): string {
  const c = views.get(sessionId);
  return c ? `${c.lastMsgSeq}:${c.lastOpSeq}` : "0:0";
}

export function visibleNodes(nodes: ViewNode[]): ViewNode[] {
  return nodes.filter((n) => !n.deleted);
}
