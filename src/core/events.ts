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
  | { type: "tool_end"; id: string; seq: number; name: string; output: string; ok: boolean }
  | { type: "usage"; prompt_tokens: number; completion_tokens: number }
  | { type: "step"; n: number }
  | { type: "retry"; attempt: number; delay_ms: number; error: string }
  | { type: "compacted"; removed: number[]; tokens_before: number; tokens_after: number }
  | { type: "warn"; message: string }
  | { type: "done"; reason: string };
