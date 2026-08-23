import { allMessages, allOps, type DeleteOp, type MessageRow, type ReplaceOp, type RestoreOp, type ViewOp } from "../store/db.ts";

export interface ViewNode {
  msg: MessageRow;
  content: string; // view-level (post replace)
  deleted: boolean;
  summary?: string;
  orphan?: boolean; // hidden because its parent assistant is hidden
}

/**
 * Replay the append-only op log over the message log -> visible node list.
 *
 * After replay, the pairing invariant is enforced here (not at render time):
 * a tool result may only be visible if the assistant node carrying its
 * tool_call is also visible. This keeps every projected transcript valid for
 * providers that require 1:1 tool_call/tool pairing.
 */
export function projectView(sessionId: string): ViewNode[] {
  const msgs = allMessages(sessionId);
  const nodes: ViewNode[] = msgs.map((msg) => ({ msg, content: msg.content, deleted: false }));
  const bySeq = new Map<number, ViewNode>(nodes.map((n) => [n.msg.seq, n]));

  for (const row of allOps(sessionId)) {
    const op = JSON.parse(row.payload) as ViewOp;
    if (op.kind === "replace") {
      const { id, content } = op as ReplaceOp;
      const n = bySeq.get(id);
      if (n) n.content = content;
    } else if (op.kind === "restore") {
      const { ids } = op as RestoreOp;
      for (const id of ids) {
        const n = bySeq.get(id);
        // restore only lifts agent-applied hides; orphans stay hidden
        if (n && !n.orphan) {
          n.deleted = false;
          n.summary = undefined;
        }
      }
    } else {
      const { ids, summary } = op as DeleteOp;
      let first = true;
      for (const id of ids) {
        const n = bySeq.get(id);
        if (!n || n.deleted) continue;
        n.deleted = true;
        n.orphan = false;
        if (summary && first) {
          n.summary = summary;
          first = false;
        }
      }
    }
  }

  repairOrphans(nodes);
  return nodes;
}

/** Hide tool results whose owning assistant (or its tool_call) is not visible. */
function repairOrphans(nodes: ViewNode[]) {
  const visibleCallIds = new Set<string>();
  for (const n of nodes) {
    if (n.deleted || n.msg.role !== "assistant" || !n.msg.tool_calls) continue;
    try {
      for (const c of JSON.parse(n.msg.tool_calls) as { id: string }[]) visibleCallIds.add(c.id);
    } catch {}
  }
  for (const n of nodes) {
    if (n.msg.role !== "tool" || !n.msg.tool_call_id) continue;
    if (!visibleCallIds.has(n.msg.tool_call_id)) {
      n.deleted = true;
      n.orphan = true;
    }
  }
}

export function visibleNodes(nodes: ViewNode[]): ViewNode[] {
  return nodes.filter((n) => !n.deleted);
}
