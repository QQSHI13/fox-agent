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
  const view = projectView(sessionId);
  const visibleToolIds = new Set(
    view.filter((n) => !n.deleted && n.msg.role === "tool" && n.msg.tool_call_id).map((n) => n.msg.tool_call_id!),
  );

  for (const n of view) {
    const m = n.msg;

    // deleted node -> nothing but an optional tiny note
    if (n.deleted) {
      if (n.summary) out.push({ role: "user", content: `(ctx: [m${m.seq}] summarized away) ${n.summary}` });
      continue;
    }

    if (m.role === "user") {
      out.push({ role: "user", content: `${marker(m.seq)} ${n.content}` });
    } else if (m.role === "assistant") {
      let calls: any[] | undefined;
      if (m.tool_calls) {
        // keep only calls whose tool result is still visible (API requires 1:1 pairing)
        const all = JSON.parse(m.tool_calls) as { id: string; name: string; arguments: string }[];
        const kept = all.filter((c) => visibleToolIds.has(c.id));
        if (kept.length) {
          calls = kept.map((c) => ({ id: c.id, type: "function" as const, function: { name: c.name, arguments: c.arguments } }));
        }
      }
      const text = n.content ? `${marker(m.seq)} ${n.content}` : "";
      if (!text && !calls) continue;
      const entry: ChatMessage = { role: "assistant", content: text };
      if (calls) entry.tool_calls = calls;
      out.push(entry);
    } else if (m.role === "tool") {
      out.push({ role: "tool", tool_call_id: m.tool_call_id!, content: `${marker(m.seq)} ${n.content}` });
    }
  }
  return out;
}

export function viewTokenEstimate(nodes: ViewNode[]): number {
  return nodes.filter((n) => !n.deleted).reduce((a, n) => a + estTokens(n.content), 0);
}
