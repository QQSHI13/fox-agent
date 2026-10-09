import type { ChatMessage } from "../providers/types.ts";
import { estimateTokens } from "../providers/models.ts";
import { projectView, parseToolCalls, viewStamp, type ViewNode } from "./view.ts";

function marker(seq: number): string {
  return `[${seq}]`;
}

/**
 * Marker echo stripper. Weak models see `[N]` on every message and start
 * "predicting" one at the top of their own reply; stored verbatim, the next
 * render shows `[13] [12] …` and the echo compounds. Applied at store time
 * only (turn.ts) — rendering stays verbatim, so the transcript is the truth
 * and a pre-fix poisoned session is the agent's to ctx_edit away.
 */
export function stripEchoedMarkers(text: string): string {
  // accepts BOTH dialects: sessions poisoned before the [mN] -> [N] rename
  // still strip, and new [N] echoes strip identically
  return text.replace(/^\s*(?:\[m?\d+\][ \t]*)+/, "");
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
  /** whether [N] prefixes were rendered — part of the memo key, /reload can flip it */
  markers: boolean;
  /** the message to emit, or undefined when the node renders to nothing */
  msg?: ChatMessage;
  /** deleted-with-summary note, queued into the pending summaries */
  note?: string;
}
const renderedNodes = new Map<string, RenderedNode>();
const RENDER_CACHE_MAX = 50_000;

/**
 * Assembled-history cache: the walk below is O(view) even with every node a
 * memo hit (10k Map lookups + array pushes per step on a long session), and
 * within a turn the view differs from the previous step only by the tail.
 * The whole visible view is a pure function of (projectView result, markers),
 * and the view itself is a pure function of its watermark (see viewStamp),
 * so an unchanged stamp lets the prefix — everything before `trailing` — be
 * returned as-is. `dropRenderCache` runs on /reload and session delete, where
 * markers can flip or node ids could collide.
 */
let historyCache: { key: string; out: ChatMessage[] } | null = null;
export function dropRenderCache(): void {
  historyCache = null;
}

function renderNode(n: ViewNode, callsKey: string, visibleToolIds: Set<string>, markers: boolean): RenderedNode {
  const m = n.msg;
  const tag = markers ? `${marker(m.seq)} ` : "";
  const base = { content: n.content, deleted: n.deleted, summary: n.summary, callsKey, markers };

  if (n.deleted) {
    return { ...base, note: n.summary ? `(ctx: ${markers ? `${marker(m.seq)} ` : ""}summarized away) ${n.summary}` : undefined };
  }
  if (m.role === "user") {
    return { ...base, msg: { role: "user", content: `${tag}${n.content}` } };
  }
  if (m.role === "assistant") {
    let calls: { id: string; name: string; arguments: string }[] | undefined;
    if (m.tool_calls) {
      // keep only calls whose tool result is still visible (API requires 1:1 pairing)
      const kept = parseToolCalls(m).filter((c) => visibleToolIds.has(c.id));
      if (kept.length) calls = kept;
    }
    // stored content renders verbatim (markers were already stripped at store
    // time); a session poisoned before that fix is the agent's to ctx_edit away
    const text = n.content ? `${tag}${n.content}` : "";
    if (!text && !calls) return base; // renders to nothing
    const msg: ChatMessage = { role: "assistant", content: text };
    if (calls) msg.tool_calls = calls;
    return { ...base, msg };
  }
  if (m.role === "tool") {
    const msg: ChatMessage = { role: "tool", tool_call_id: m.tool_call_id!, content: `${tag}${n.content}` };
    if (m.media) {
      try {
        msg.media = JSON.parse(m.media);
      } catch {} // a corrupt media blob degrades to the text note, never a failed turn
    }
    return { ...base, msg };
  }
  return base; // think + system: storage-only
}

/**
 * Build the request messages: system prompt, then history, then optionally an
 * ephemeral tail.
 *
 * `trailing` is the per-step slot (see loop/prompt.ts buildRuntimeHeader). It
 * is appended AFTER `flush()` and is never persisted, so the prefix
 * [system … history] stays byte-identical from step to step and only the tail
 * pays for changing bytes. It must therefore always be the LAST message — a
 * volatile block sitting anywhere earlier changes the sequence from that point
 * on and re-bills every message behind it, which is exactly what the live
 * figure inside the system prompt did to every step.
 */
export function renderContext(
  sessionId: string,
  systemPrompt: string,
  opts: { markers?: boolean; trailing?: string } = {},
): ChatMessage[] {
  const markers = opts.markers ?? true;
  // assembled-history hit: same session, same watermark, same markers — the
  // walk below would rebuild byte-identical messages. The outer array is
  // always fresh so a caller mutating it can't corrupt the cache; only the
  // per-node construction is skipped, which is the O(view) part.
  const hKey = `${sessionId}:${viewStamp(sessionId)}:${markers ? 1 : 0}`;
  const cached = historyCache?.key === hKey ? historyCache.out : null;
  if (cached) {
    const out: ChatMessage[] = [{ role: "system", content: systemPrompt }, ...cached];
    if (opts.trailing) out.push({ role: "user", content: opts.trailing });
    return out;
  }
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
    if (!r || r.content !== n.content || r.deleted !== n.deleted || r.summary !== n.summary || r.callsKey !== callsKey || r.markers !== markers) {
      r = renderNode(n, callsKey, visibleToolIds, markers);
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
  // cache the prefix (everything before trailing) under the watermark — the
  // next call with an unchanged stamp reuses it wholesale (see historyCache)
  const prefix = out.slice(1);
  historyCache = { key: hKey, out: prefix };
  // Ephemeral and last: rebuilt every step, never written to storage. Only the
  // bytes after this point may vary, and there are none — so the whole prefix
  // [system … history] above keeps its provider cache breakpoint intact.
  if (opts.trailing) out.push({ role: "user", content: opts.trailing });
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
