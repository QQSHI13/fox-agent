import type { ChatMessage } from "../providers/types.ts";
import { estimateTokens } from "../providers/models.ts";
import { projectView, type ViewNode } from "./view.ts";

function marker(seq: number): string {
  return `[m${seq}]`;
}

export function renderContext(sessionId: string, systemPrompt: string): ChatMessage[] {
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

    if (m.role === "think") continue;
    if (m.role === "system") continue; // harness notes are storage-only
    if (m.role === "user") {
      out.push({ role: "user", content: `${marker(m.seq)} ${n.content}` });
    } else if (m.role === "assistant") {
      let calls: { id: string; name: string; arguments: string }[] | undefined;
      if (m.tool_calls) {
        // keep only calls whose tool result is still visible (API requires 1:1 pairing)
        const all = JSON.parse(m.tool_calls) as { id: string; name: string; arguments: string }[];
        const kept = all.filter((c) => visibleToolIds.has(c.id));
        if (kept.length) calls = kept;
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

/** Estimated tokens of what would actually be sent (markers included). */
export function viewTokenEstimate(nodes: ViewNode[]): number {
  let total = 0;
  for (const n of nodes) {
    if (n.deleted) continue;
    total += estimateTokens(n.content) + estimateTokens(marker(n.msg.seq)) + 4;
    if (n.msg.role === "assistant" && n.msg.tool_calls) {
      try {
        for (const c of JSON.parse(n.msg.tool_calls) as { arguments: string }[]) total += estimateTokens(c.arguments);
      } catch {}
    }
  }
  return total;
}

export function sessionViewEstimate(sessionId: string): number {
  return viewTokenEstimate(projectView(sessionId));
}
