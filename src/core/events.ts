/**
 * AgentEvent is the single event vocabulary of a turn. The TUI, plain mode
 * and --json mode all consume this stream; nothing reads the DB to render
 * live progress.
 */
export type AgentEvent =
  | { type: "reasoning"; delta: string }
  | { type: "text"; delta: string }
  | { type: "tool_start"; seq: number; name: string; args: string }
  | { type: "tool_end"; seq: number; name: string; output: string; ok: boolean }
  | { type: "usage"; prompt_tokens: number; completion_tokens: number }
  | { type: "step"; n: number }
  | { type: "retry"; attempt: number; delay_ms: number; error: string }
  | { type: "compacted"; removed: number[]; tokens_before: number; tokens_after: number }
  | { type: "warn"; message: string }
  | { type: "done"; reason: string };
