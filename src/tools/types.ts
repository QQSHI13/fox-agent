import type { ProviderConfig, ToolDef } from "../providers/types.ts";

export interface PtyState {
  session: string; // tmux session name
  logPath: string; // raw output stream (pipe-pane)
  cursor: number; // byte offset already returned to the model
}

export interface ToolContext {
  sessionId: string;
  cwd: string;
  /** seq of the user message that started the current turn; nodes >= this are in-flight */
  turnStartSeq: number;
  readFiles: Set<string>;
  signal?: AbortSignal;
  /** provider config + registry factory — enables the task/subagent tool */
  providerCfg?: ProviderConfig;
  registryFactory?: (exclude?: Set<string>) => Promise<Map<string, Tool>>;
  get pty(): PtyState | undefined;
  set pty(v: PtyState | undefined);
}

export interface ToolResult {
  ok: boolean;
  output: string;
}

export interface Tool {
  def: ToolDef;
  run(args: any, ctx: ToolContext): Promise<ToolResult | string>;
}

export const ok = (output: string): ToolResult => ({ ok: true, output });
export const fail = (output: string): ToolResult => ({ ok: false, output });
