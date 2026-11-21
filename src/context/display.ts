import {
  allOps,
  messageIndexRows,
  messageIndexRowsAfter,
  opsAfter,
  type DeleteOp,
  type MessageIndexRow,
  type ReplaceOp,
  type RestoreOp,
  type Role,
  type ViewOp,
} from "../store/db.ts";

/**
 * A message as the transcript displays it, carrying no body.
 *
 * Every field is presentation metadata: the view `projectView` would produce,
 * minus `content`. Callers that need the text (opening a collapsed row, a
 * reveal of the stored original) fetch that one message on demand; the settled
 * history never has to be hydrated to be laid out.
 */
export interface DisplayNode {
  seq: number;
  role: Role;
  tool_call_id: string | null;
  /** Parsed `tool_calls` ids — display never needs the names or arguments. */
  callIds: string[];
  /** Stored content length in characters (SQLite LENGTH), not post-replace. */
  contentLen: number;
  failed: boolean;
  deleted: boolean;
  /** set by a delete op, cleared by restore — the sticky half of `deleted` */
  hidden?: boolean;
  orphan?: boolean;
  summary?: string;
  /** set by a harness-derived replace op; absent for a ctx-authored edit */
  replaceVersion?: number;
}

/**
 * Only the `id` of each tool call, and only from a well-formed array.
 *
 * `projectView` parses the full `{ id, name, arguments }` because the request
 * needs all three. A display node needs the ids solely to answer "is this tool
 * result orphaned", so the parse is deliberately narrower: anything that is not
 * a JSON array of objects with a string `id` contributes nothing, which is the
 * same answer `parseToolCalls` reaches for a malformed row (it returns []).
 */
function parseCallIds(raw: string | null): string[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const ids: string[] = [];
  for (const c of parsed) {
    if (c && typeof c === "object" && typeof (c as { id?: unknown }).id === "string") {
      ids.push((c as { id: string }).id);
    }
  }
  return ids;
}

function nodeFromRow(m: MessageIndexRow): DisplayNode {
  return {
    seq: m.seq,
    role: m.role,
    tool_call_id: m.tool_call_id,
    callIds: m.role === "assistant" ? parseCallIds(m.tool_calls) : [],
    contentLen: m.content_len,
    failed: m.has_error !== 0,
    deleted: false,
  };
}

function applyOp(c: DisplayCache, op: ViewOp): void {
  if (op.kind === "replace") {
    const { id, version } = op as ReplaceOp;
    const n = c.bySeq.get(id);
    if (n) n.replaceVersion = version;
  } else if (op.kind === "restore") {
    const { ids } = op as RestoreOp;
    for (const id of ids) {
      const n = c.bySeq.get(id);
      if (!n) continue;
      n.hidden = false;
      n.summary = undefined;
      n.deleted = !!n.orphan;
      const calls = c.callsOf.get(n.seq);
      if (calls) {
        for (const cid of calls) c.visibleCalls.add(cid);
        recheckTools(c, calls);
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
      const calls = c.callsOf.get(n.seq);
      if (calls) {
        for (const cid of calls) c.visibleCalls.delete(cid);
        recheckTools(c, calls);
      }
    }
  }
}

/** Recompute orphan/deleted for the tool nodes of exactly these call ids. */
function recheckTools(c: DisplayCache, callIds: string[]): void {
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
 * Identical to the view's pass, over metadata nodes. On a cold build this is
 * what establishes every relationship; on an incremental build it only runs
 * when the message log grew, because ops maintain the affected nodes directly.
 */
function repairOrphans(c: DisplayCache, nodes: DisplayNode[]) {
  const visibleCallIds = c.visibleCalls;
  for (const n of nodes) {
    if (n.hidden || n.role !== "assistant" || !n.callIds.length) continue;
    for (const call of n.callIds) {
      visibleCallIds.add(call);
      const existing = c.callsOf.get(n.seq);
      if (!existing) c.callsOf.set(n.seq, [call]);
      else if (!existing.includes(call)) existing.push(call);
    }
  }
  for (const n of nodes) {
    if (n.role === "tool" && n.tool_call_id) c.toolByCall.set(n.tool_call_id, n);
    const orphan = n.role === "tool" && !!n.tool_call_id && !visibleCallIds.has(n.tool_call_id);
    n.orphan = orphan || undefined;
    n.deleted = !!n.hidden || orphan;
  }
}

interface DisplayCache {
  lastMsgSeq: number;
  lastOpSeq: number;
  nodes: DisplayNode[];
  bySeq: Map<number, DisplayNode>;
  visibleCalls: Set<string>;
  toolByCall: Map<string, DisplayNode>;
  callsOf: Map<number, string[]>;
}
const displays = new Map<string, DisplayCache>();

/**
 * How many sessions keep a resident display projection.
 *
 * A display entry holds no bodies, so its footprint is a fraction of the full
 * view's. The cap still mirrors `MAX_VIEWS` rather than growing unbounded:
 * correctness does not depend on residency (a miss rebuilds from the metadata
 * index), so there is no reason to trade memory for nothing.
 */
const MAX_DISPLAYS = 8;

/** Drop the least-recently-used projections past the cap. */
function evictDisplays(keep: string): void {
  for (const id of [...displays.keys()]) {
    if (displays.size <= MAX_DISPLAYS) return;
    if (id === keep) continue;
    displays.delete(id);
  }
}

/** Test hook: drop cached display projections (a miss is always a safe rebuild). */
export function dropDisplayCache(sessionId?: string): void {
  if (sessionId) displays.delete(sessionId);
  else displays.clear();
}

/**
 * The display projection: the view's visibility state over metadata-only rows.
 *
 * Replay follows `projectView` exactly — append-only message log, then the op
 * log applied incrementally — but every read is a metadata index read, so a
 * cold build never touches a message body. A forked session has a fresh id and
 * a fresh entry; an evicted entry rebuilds identically from SQLite.
 */
export function projectDisplay(sessionId: string): DisplayNode[] {
  let c = displays.get(sessionId);
  if (c) {
    displays.delete(sessionId);
    displays.set(sessionId, c);
  } else {
    c = { lastMsgSeq: 0, lastOpSeq: 0, nodes: [], bySeq: new Map(), visibleCalls: new Set(), toolByCall: new Map(), callsOf: new Map() };
    displays.set(sessionId, c);
    evictDisplays(sessionId);
  }

  const newMsgs = c.lastMsgSeq === 0 ? messageIndexRows(sessionId) : messageIndexRowsAfter(sessionId, c.lastMsgSeq);
  for (const row of newMsgs) {
    const n = nodeFromRow(row);
    c.nodes.push(n);
    c.bySeq.set(n.seq, n);
    if (n.role === "tool" && n.tool_call_id) c.toolByCall.set(n.tool_call_id, n);
    if (n.role === "assistant" && n.callIds.length && !n.hidden) {
      c.callsOf.set(n.seq, [...n.callIds]);
      if (!n.hidden) for (const cid of n.callIds) c.visibleCalls.add(cid);
    }
    if (n.seq > c.lastMsgSeq) c.lastMsgSeq = n.seq;
  }

  const hadNewMsgs = newMsgs.length > 0;
  const newOps = c.lastOpSeq === 0 ? allOps(sessionId) : opsAfter(sessionId, c.lastOpSeq);
  for (const row of newOps) {
    applyOp(c, JSON.parse(row.payload) as ViewOp);
    if (row.seq > c.lastOpSeq) c.lastOpSeq = row.seq;
  }

  if (hadNewMsgs || newOps.length === 0) repairOrphans(c, c.nodes);
  return c.nodes;
}

/**
 * The display's watermark: `<last message seq>:<last op seq>`.
 *
 * Same contract as `viewStamp`: both logs are append-only and every mutation of
 * an old node is an op, so equal stamps mean an identical projection.
 */
export function displayStamp(sessionId: string): string {
  const c = displays.get(sessionId);
  return c ? `${c.lastMsgSeq}:${c.lastOpSeq}` : "0:0";
}
