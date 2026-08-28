/**
 * AgentEvent -> ACP SessionUpdate.
 *
 * Pure on purpose: no connection, no session, no I/O, so the whole mapping is
 * unit testable without a transport. The server (`./server.ts`) is then just a
 * pump — for each event, map it and notify — which is the only way to keep the
 * protocol skin from growing a second copy of the turn loop's logic.
 *
 * Two events deliberately produce nothing:
 * - `step` / `retry` / `warn` are harness chatter. ACP has no vocabulary for
 *   "I am on step 4" or "429, backing off 2s", and inventing one as a text chunk
 *   would put fox-agent's internals into the *assistant's message* in every client.
 * - `done` is not an update at all; it becomes `PromptResponse.stopReason`,
 *   which is what `stopReasonFor` below is for.
 */
import type { SessionUpdate, StopReason, ToolKind } from "@agentclientprotocol/sdk";
import type { AgentEvent } from "../core/events.ts";

/**
 * fox-agent tool -> ACP ToolKind. Clients pick icons and UI affordances from this, so
 * a wrong kind is a visibly wrong icon, not a protocol error.
 *
 * `ctx_edit` is `think`: it rewrites the agent's own context, touching no file
 * and running no command, which is closer to reasoning than to editing. MCP
 * tools and anything unlisted fall through to `other` — the honest answer for a
 * tool whose semantics fox-agent does not know.
 */
export const TOOL_KIND: Record<string, ToolKind> = {
  read: "read",
  glob: "search",
  grep: "search",
  write: "edit",
  edit: "edit",
  exec: "execute",
  pty: "execute",
  fetch: "fetch",
  ctx_edit: "think",
  todowrite: "other",
  task: "other",
};

export function toolKind(name: string): ToolKind {
  return TOOL_KIND[name] ?? "other";
}

/** First line of the args JSON, short enough for a one-line client header. */
function titleFor(name: string, args: string): string {
  const trimmed = args.trim();
  if (!trimmed || trimmed === "{}") return name;
  return `${name} ${trimmed.slice(0, 120).replace(/\s+/g, " ")}`;
}

/**
 * `size` for `usage_update` is the model's context window, which the mapper
 * cannot know — the caller passes it in. `used` is prompt+completion of the last
 * step, matching what fox-agent's own status bar reports.
 */
export interface MapOptions {
  contextWindow: number;
}

export function toSessionUpdate(ev: AgentEvent, opts: MapOptions): SessionUpdate | null {
  switch (ev.type) {
    case "text":
      return { sessionUpdate: "agent_message_chunk", content: { type: "text", text: ev.delta } };
    case "reasoning":
      return { sessionUpdate: "agent_thought_chunk", content: { type: "text", text: ev.delta } };
    case "tool_start":
      return {
        sessionUpdate: "tool_call",
        toolCallId: ev.id,
        title: titleFor(ev.name, ev.args),
        name: ev.name,
        kind: toolKind(ev.name),
        status: "pending",
        rawInput: safeJson(ev.args),
      };
    case "tool_end":
      return {
        sessionUpdate: "tool_call_update",
        toolCallId: ev.id,
        status: ev.ok ? "completed" : "failed",
        content: [{ type: "content", content: { type: "text", text: ev.output } }],
        rawOutput: ev.output,
      };
    case "usage":
      return {
        sessionUpdate: "usage_update",
        used: ev.prompt_tokens + ev.completion_tokens,
        size: opts.contextWindow,
      };
    case "compacted":
      return {
        sessionUpdate: "compaction_update",
        compactionId: `c-${ev.removed[0] ?? 0}-${ev.removed.length}`,
        status: "completed",
        summary: [
          {
            type: "text",
            text: `compacted ${ev.removed.length} messages: ${ev.tokens_before} -> ${ev.tokens_after} tokens`,
          },
        ],
      };
    case "step":
    case "retry":
    case "warn":
    case "done":
      return null;
    case "child_tool":
      // A delegated agent's tool calls belong to the *child's* ACP session, which
      // the client can list and load in its own right. Re-emitting them here
      // would mint tool_call ids in the parent session that never complete, and
      // attribute the child's work to the parent's transcript.
      return null;
  }
}

/**
 * fox-agent's `done.reason` is a free-form string (`"stop"`, `"aborted"`,
 * `"max_steps"`, `"error: …"`, or whatever the provider's finish_reason was).
 * ACP's StopReason is a closed set, so anything unrecognized becomes `end_turn`:
 * the turn did end, and claiming `refusal` or `max_tokens` on a guess would be a
 * lie a client acts on.
 */
export function stopReasonFor(reason: string): StopReason {
  if (reason === "aborted" || reason === "cancelled") return "cancelled";
  if (reason === "max_steps") return "max_turn_requests";
  if (reason === "length" || reason === "max_tokens") return "max_tokens";
  if (reason === "refusal" || reason === "content_filter") return "refusal";
  return "end_turn";
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    // tool_start carries args truncated to 200 chars, so this is expected for
    // large calls — hand the client the fragment rather than dropping the field
    return s;
  }
}
