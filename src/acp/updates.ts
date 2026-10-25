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
import type { SessionUpdate, StopReason, ToolKind, PlanEntry, PlanEntryStatus } from "@agentclientprotocol/sdk/unstable";
import type { AgentEvent } from "../core/events.ts";
import { assertNever } from "../core/events.ts";
import type { TodoItem } from "../tools/todo.ts";

/**
 * fox-agent tool -> ACP ToolKind. Clients pick icons and UI affordances from this, so
 * a wrong kind is a visibly wrong icon, not a protocol error.
 *
 * `ctx` is `think`: it rewrites the agent's own context, touching no file
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
  ctx: "think",
  repl: "execute",
  todo: "other",
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
 *
 * `notices` is whether the client advertised `ClientSessionCapabilities.notices`.
 * The spec forbids sending a `notice` to a client that did not, so a warning on
 * such a connection is dropped rather than being smuggled in as agent text.
 */
export interface MapOptions {
  contextWindow: number;
  notices?: boolean;
}

/**
 * fox-agent todo -> ACP PlanEntry.
 *
 * `priority` is not something fox-agent tracks, and ACP requires the field, so
 * every entry is `medium`: a uniform value says "no opinion", where defaulting
 * to `high` would make every plan look urgent.
 *
 * The status vocabularies line up exactly (pending / in_progress / completed),
 * so this is a straight pass-through rather than a mapping table.
 */
export function planUpdate(todos: TodoItem[]): SessionUpdate {
  return {
    sessionUpdate: "plan",
    entries: todos.map((t) => ({
      content: t.content,
      priority: "medium",
      status: (t.status === "done" ? "completed" : t.status === "in_progress" ? "in_progress" : "pending") as PlanEntryStatus,
    })),
  };
}

/**
 * A harness warning as an ACP `notice`.
 *
 * These were previously dropped: a warn event had no SessionUpdate that fit and
 * inventing a text chunk would have put "429, backing off 2s" into the
 * assistant's message. ACP 1.x added `notice` for exactly this — a non-message
 * line the client renders as chrome — so the warnings now arrive without
 * impersonating the model. Severity is `warning`, the only honest choice: these
 * are degradations (a plugin failed, a tool was cap-truncated), not failures.
 */
export function noticeUpdate(message: string): SessionUpdate {
  return { sessionUpdate: "notice", severity: "warning", title: message };
}

/**
 * The session's mode changed (or its initial value), so a client re-renders its
 * picker. Only the id travels; the available list came with `session/new`.
 */
export function modeUpdate(currentModeId: string): SessionUpdate {
  return { sessionUpdate: "current_mode_update", currentModeId };
}

/**
 * The second update a finished `todo` call produces, or null.
 *
 * Separate from `toSessionUpdate` because it is a SECOND update for one event:
 * the tool result still goes out as `tool_call_update`, and the checklist rides
 * as `plan`. Making one event return two updates would mean every caller
 * flattening an array it usually does not need.
 *
 * Only a successful `todo` produces it: the tool's whole purpose is to replace
 * the checklist, so a failed call left the previous plan standing.
 */
export function planForToolEnd(ev: AgentEvent, todos: TodoItem[] | null | undefined): SessionUpdate | null {
  if (ev.type !== "tool_end" || ev.name !== "todo" || !ev.ok || !todos?.length) return null;
  return planUpdate(todos);
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
    case "tool_output":
      // live exec output is a TUI affordance; ACP clients get the final result
      return null;
    case "usage":
      return {
        sessionUpdate: "usage_update",
        used: ev.prompt_tokens + ev.completion_tokens,
        size: opts.contextWindow,
      };
    case "steered":
      // A message that joined the turn mid-flight — a background job finishing,
      // or a follow-up the agent picked up. It is a real USER message, and ACP
      // has a vocabulary for exactly that, so the editor can render it. (The
      // prompt's own `user` event is still skipped below: the client sent it.)
      return { sessionUpdate: "user_message_chunk", content: { type: "text", text: ev.text } };
    case "warn":
      // ACP has a vocabulary for harness chatter that is not the model speaking,
      // but only a client that advertised `notices` may receive it
      return opts.notices ? noticeUpdate(ev.message) : null;
    case "step":
    case "retry":
    case "user": // the client sent the prompt; echoing its seq back adds nothing
    case "assistant": // UI-only marker correction; ACP clients render from their own session load
    case "done":
      return null;
    case "child_tool":
      // A delegated agent's tool calls belong to the *child's* ACP session, which
      // the client can list and load in its own right. Re-emitting them here
      // would mint tool_call ids in the parent session that never complete, and
      // attribute the child's work to the parent's transcript.
      return null;
    default:
      return assertNever(ev);
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
    // event args are capped at EVENT_ARGS_CAP (turn.ts), so JSON parsing
    // genuinely fails for giant calls — hand the client the fragment rather
    // than dropping the field
    return s;
  }
}
