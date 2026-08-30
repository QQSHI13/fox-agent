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
}

function applyOp(bySeq: Map<number, ViewNode>, op: ViewOp): void {
  if (op.kind === "replace") {
    const { id, content } = op as ReplaceOp;
    const n = bySeq.get(id);
    if (n) n.content = content;
  } else if (op.kind === "restore") {
    const { ids } = op as RestoreOp;
    for (const id of ids) {
      const n = bySeq.get(id);
      // no orphan check needed: repairOrphans runs after the op batch, so it
      // re-hides anything a restore un-hid that shouldn't be visible
      if (n) {
        n.hidden = false;
        n.summary = undefined;
      }
    }
  } else {
    const { ids, summary } = op as DeleteOp;
    let first = true;
    for (const id of ids) {
      const n = bySeq.get(id);
      if (!n || n.hidden) continue;
      n.hidden = true;
      if (summary && first) {
        n.summary = summary;
        first = false;
      }
    }
  }
}

/**
 * Recompute `deleted` for every node: op-hidden (`hidden`) OR orphaned.
 *
 * Orphan-hiding is derived state, not sticky — a restore op that makes a
 * parent assistant visible again must un-hide its tool results, which is only
 * possible because the op-driven half lives in its own field.
 */
function repairOrphans(nodes: ViewNode[]) {
  const visibleCallIds = new Set<string>();
  for (const n of nodes) {
    if (n.hidden || n.msg.role !== "assistant" || !n.msg.tool_calls) continue;
    for (const c of parseToolCalls(n.msg)) visibleCallIds.add(c.id);
  }
  for (const n of nodes) {
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
}
const views = new Map<string, ViewCache>();

/** Test hook: drop cached projections (a fresh FOX_AGENT_HOME reuses no ids, but be explicit). */
export function dropViewCache(sessionId?: string): void {
  if (sessionId) views.delete(sessionId);
  else views.clear();
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
  if (!c) {
    c = { lastMsgSeq: 0, lastOpSeq: 0, nodes: [], bySeq: new Map() };
    views.set(sessionId, c);
  }

  // first touch of a session reads everything; later touches read only the tail
  const newMsgs = c.lastMsgSeq === 0 ? allMessages(sessionId) : messagesAfter(sessionId, c.lastMsgSeq);
  for (const m of newMsgs) {
    const n: ViewNode = { msg: m, content: m.content, deleted: false };
    c.nodes.push(n);
    c.bySeq.set(m.seq, n);
    if (m.seq > c.lastMsgSeq) c.lastMsgSeq = m.seq;
  }

  const newOps = c.lastOpSeq === 0 ? allOps(sessionId) : opsAfter(sessionId, c.lastOpSeq);
  for (const row of newOps) {
    applyOp(c.bySeq, JSON.parse(row.payload) as ViewOp);
    if (row.seq > c.lastOpSeq) c.lastOpSeq = row.seq;
  }

  repairOrphans(c.nodes);
  return c.nodes;
}

export function visibleNodes(nodes: ViewNode[]): ViewNode[] {
  return nodes.filter((n) => !n.deleted);
}
