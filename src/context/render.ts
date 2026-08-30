import type { ChatMessage } from "../providers/types.ts";
import { estimateTokens } from "../providers/models.ts";
import { projectView, parseToolCalls, type ViewNode } from "./view.ts";

function marker(seq: number): string {
  return `[m${seq}]`;
}

/**
 * Per-node render memo.
 *
 * `renderContext` runs on every step of every turn, and within a turn the view
 * differs from the previous step only by the new tail — yet every node was
 * re-formatted (marker concat, tool_call filtering, media JSON.parse) each
 * time. Message rows are immutable and a "replace" is an op that changes
 * `ViewNode.content`, so (content, deleted, summary, kept-call ids) fully
 * determine a node's rendered shape; the entry is rebuilt only when one of
 * those changes. Keyed by message id, which is unique per session, so a stale
 * entry from a deleted session can never collide with a live one.
 */
interface RenderedNode {
  content: string;
  deleted: boolean;
  summary?: string;
  /** kept tool_call ids joined — the only part of an assistant entry that depends on other nodes */
  callsKey: string;
  /** the message to emit, or undefined when the node renders to nothing */
  msg?: ChatMessage;
  /** deleted-with-summary note, queued into the pending summaries */
  note?: string;
}
const renderedNodes = new Map<string, RenderedNode>();
const RENDER_CACHE_MAX = 50_000;

function renderNode(n: ViewNode, callsKey: string, visibleToolIds: Set<string>): RenderedNode {
  const m = n.msg;
  const base = { content: n.content, deleted: n.deleted, summary: n.summary, callsKey };

  if (n.deleted) {
    return { ...base, note: n.summary ? `(ctx: ${marker(m.seq)} summarized away) ${n.summary}` : undefined };
  }
  if (m.role === "user") {
    return { ...base, msg: { role: "user", content: `${marker(m.seq)} ${n.content}` } };
  }
  if (m.role === "assistant") {
    let calls: { id: string; name: string; arguments: string }[] | undefined;
    if (m.tool_calls) {
      // keep only calls whose tool result is still visible (API requires 1:1 pairing)
      const kept = parseToolCalls(m).filter((c) => visibleToolIds.has(c.id));
      if (kept.length) calls = kept;
    }
    const text = n.content ? `${marker(m.seq)} ${n.content}` : "";
    if (!text && !calls) return base; // renders to nothing
    const msg: ChatMessage = { role: "assistant", content: text };
    if (calls) msg.tool_calls = calls;
    return { ...base, msg };
  }
  if (m.role === "tool") {
    const msg: ChatMessage = { role: "tool", tool_call_id: m.tool_call_id!, content: `${marker(m.seq)} ${n.content}` };
    if (m.media) {
      try {
        msg.media = JSON.parse(m.media);
      } catch {} // a corrupt media blob degrades to the text note, never a failed turn
    }
    return { ...base, msg };
  }
  return base; // think + system: storage-only
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
    // the kept-calls key is computed even on a memo hit: it is the one input
    // that can change under an immutable row (an op hid a tool result)
    const callsKey =
      m.role === "assistant" && m.tool_calls && !n.deleted
        ? parseToolCalls(m)
            .filter((c) => visibleToolIds.has(c.id))
            .map((c) => c.id)
            .join(",")
        : "";
    let r = renderedNodes.get(m.id);
    if (!r || r.content !== n.content || r.deleted !== n.deleted || r.summary !== n.summary || r.callsKey !== callsKey) {
      r = renderNode(n, callsKey, visibleToolIds);
      renderedNodes.set(m.id, r);
      // ids are never reused, so this only bounds memory across long sessions
      if (renderedNodes.size > RENDER_CACHE_MAX) renderedNodes.clear();
    }
    if (r.note) {
      pending.push(r.note);
      continue;
    }
    if (!r.msg) continue;
    // deliberately no flush before tool messages: see `pending`
    if (r.msg.role !== "tool") flush();
    out.push(r.msg);
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
      for (const c of parseToolCalls(n.msg)) total += estimateTokens(c.arguments);
    }
  }
  return total;
}

export function sessionViewEstimate(sessionId: string): number {
  return viewTokenEstimate(projectView(sessionId));
}
