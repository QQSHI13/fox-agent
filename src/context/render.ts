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

  /**
   * Compaction summaries waiting to be emitted.
   *
   * Two things make this a queue rather than a direct push.
   *
   * First, the role. A summary used to be rendered as `role: "user"`, which
   * makes the harness speak in the user's voice: the model cannot tell that
   * note apart from something the person actually typed, and the summary text
   * is model output, so anything imperative inside it arrives with the
   * authority of a user instruction. The summary is the model's own recap of
   * its own conversation, so the assistant channel is where it belongs.
   *
   * Second, the placement. `assistant` is the one role that cannot go anywhere:
   * a tool result has to follow the assistant turn that called it with nothing
   * in between, so a summary landing between an assistant's tool_calls and a
   * surviving result would be a malformed request rather than a cosmetic
   * problem. Holding summaries across `tool` messages keeps that pairing
   * intact; `role: "user"` never hit this because a user message between the
   * two is (wrongly) tolerated by both providers.
   */
  const pending: string[] = [];
  const flush = () => {
    if (!pending.length) return;
    out.push({ role: "assistant", content: pending.join("\n") });
    pending.length = 0;
  };

  for (const n of view) {
    const m = n.msg;

    // deleted node -> nothing but an optional tiny note
    if (n.deleted) {
      if (n.summary) pending.push(`(ctx: ${marker(m.seq)} summarized away) ${n.summary}`);
      continue;
    }

    if (m.role === "think") continue;
    if (m.role === "system") continue; // harness notes are storage-only
    if (m.role === "user") {
      flush();
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
      flush();
      const entry: ChatMessage = { role: "assistant", content: text };
      if (calls) entry.tool_calls = calls;
      out.push(entry);
    } else if (m.role === "tool") {
      // deliberately no flush: see `pending`
      const entry: ChatMessage = { role: "tool", tool_call_id: m.tool_call_id!, content: `${marker(m.seq)} ${n.content}` };
      if (m.media) {
        try {
          entry.media = JSON.parse(m.media);
        } catch {} // a corrupt media blob degrades to the text note, never a failed turn
      }
      out.push(entry);
    }
  }
  flush();
  return out;
}

/** Estimated tokens of what would actually be sent (markers included). */
export function viewTokenEstimate(nodes: ViewNode[]): number {
  let total = 0;
  for (const n of nodes) {
    if (n.deleted) continue;
    total += estimateTokens(n.content) + estimateTokens(marker(n.msg.seq)) + 4;
    // flat per-attachment estimate, matching what turn.ts bills at append time
    if (n.msg.media) total += 1500;
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
