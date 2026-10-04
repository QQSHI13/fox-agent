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
  /** user text injected mid-turn (ctrl+s), delivered at a step boundary */
  | { type: "steered"; text: string }
  | { type: "done"; reason: string };
