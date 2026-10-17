/**
 * AgentEvent is the single event vocabulary of a turn. The TUI, plain mode
 * and --json mode all consume this stream; nothing reads the DB to render
 * live progress.
 */
export type AgentEvent =
  | { type: "reasoning"; delta: string }
  | { type: "text"; delta: string }
  /** emitted before the call runs, so consumers can show it in flight; the
   *  message seq doesn't exist yet, so calls are identified by `id` */
  | { type: "tool_start"; id: string; name: string; args: string }
  | { type: "tool_end"; id: string; seq: number; name: string; args: string; output: string; ok: boolean }
  /** `prompt_tokens` is the billed total input (cached part included);
   *  `cached_tokens` is how much of it was read from the provider's prefix
   *  cache rather than re-sent — the hit-rate numerator. Optional so a plugin
   *  or mock `ChatFn` that reports no cache detail still emits a valid event;
   *  every consumer reads `?? 0`. */
  | { type: "usage"; prompt_tokens: number; completion_tokens: number; cached_tokens?: number }
  | { type: "step"; n: number }
  | { type: "retry"; attempt: number; delay_ms: number; error: string }
  | { type: "compacted"; removed: number[]; tokens_before: number; tokens_after: number }
  /** a delegated agent's tool activity, forwarded live from its ACP session so
   *  the parent's UI shows work in progress instead of a silent wait */
  | { type: "child_tool"; session: string; name: string; done: boolean; ok: boolean }
  /** live output of a running tool (exec), paired to its call by `id`; UI-only —
   *  the model still receives just the final tool result */
  | { type: "tool_output"; id: string; delta: string }
  | { type: "warn"; message: string }
  /** the turn's user message was persisted with this seq — emitted once, right
   *  after append, so a live UI can stamp the [N] marker on the in-flight user
   *  line instead of waiting for the turn to settle and refresh from history */
  | { type: "user"; seq: number; text: string }
  /** the step's assistant node was persisted with this seq — emitted right after
   *  append so a live UI can correct its predicted streaming marker (the reply's
   *  seq was a guess until now; thinking blocks and tool calls shifted it) */
  | { type: "assistant"; seq: number }
  /** user text injected mid-turn (ctrl+s), delivered at a step boundary */
  | { type: "steered"; text: string }
  | { type: "done"; reason: string };

/**
 * Exhaustiveness guard for the AgentEvent union. Drop a `default: return
 * assertNever(ev)` at the end of a switch over `ev.type`: when every known
 * event type has a case, the default's value is `never` and it compiles away.
 * Add a new event type and the default receives a real value where `never` was
 * expected — a compile error in exactly the consumer that forgot to handle it,
 * turning "silently dropped event" into "won't build".
 */
export function assertNever(x: never): never {
  throw new Error(`unhandled AgentEvent type: ${(x as { type?: string }).type ?? "unknown"}`);
}
