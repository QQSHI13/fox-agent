import { allMessages, allOps, estTokens, type MessageRow, type ReplaceOp, type DeleteOp } from "../store/db.ts";
import type { ChatMessage } from "../provider/openai.ts";

export interface ViewNode {
  msg: MessageRow;
  content: string; // view-level (post replace)
  deleted: boolean;
  summary?: string;
}

// Replay view ops over the immutable log -> the visible node list.
export function projectView(sessionId: string): ViewNode[] {
  const msgs = allMessages(sessionId);
  const nodes: ViewNode[] = msgs.map((msg) => ({ msg, content: msg.content, deleted: false }));
  const bySeq = new Map<number, ViewNode>(nodes.map((n) => [n.msg.seq, n]));

  for (const op of allOps(sessionId)) {
    if (op.kind === "replace") {
      const { id, content } = op as ReplaceOp;
      const n = bySeq.get(id);
      if (n) n.content = content;
    } else {
      const { ids, summary } = op as DeleteOp;
      let first = true;
      for (const id of ids) {
        const n = bySeq.get(id);
        if (!n) continue;
        n.deleted = true;
        if (summary && first) {
          n.summary = summary;
          first = false;
        }
      }
    }
  }
  return nodes;
}

function marker(seq: number): string {
  return `[m${seq}]`;
}

export function renderContext(
  sessionId: string,
  systemPrompt: string,
): ChatMessage[] {
  const out: ChatMessage[] = [{ role: "system", content: systemPrompt }];

  for (const n of projectView(sessionId)) {
    const m = n.msg;
    if (n.deleted && !n.summary) continue;

    // summaries surface as tiny standalone notes
    if (m.role === "user") {
      const text = `${marker(m.seq)} ${n.content}`;
      out.push({ role: "user", content: text });
    } else if (m.role === "assistant") {
      const entry: ChatMessage = { role: "assistant", content: n.content ? `${marker(m.seq)} ${n.content}` : "" };
      if (m.tool_calls) {
        entry.tool_calls = JSON.parse(m.tool_calls);
        if (!entry.content) entry.content = "";
      }
      out.push(entry);
    } else if (m.role === "tool") {
      out.push({ role: "tool", tool_call_id: m.tool_call_id!, content: `${marker(m.seq)} ${n.content}` });
    }
    if (n.deleted && n.summary) {
      out.push({ role: "user", content: `(ctx note: earlier [m${m.seq}] was summarized away) ${n.summary}` });
    }
  }
  return out;
}

export function viewTokenEstimate(nodes: ViewNode[]): number {
  return nodes.filter((n) => !n.deleted).reduce((a, n) => a + estTokens(n.content), 0);
}
