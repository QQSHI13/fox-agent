import type { ProviderConfig, ToolDef } from "../providers/types.ts";
import type { AgentEvent } from "../core/events.ts";
import type { AcpAgentConfig, LspConfig } from "../core/config.ts";

export interface PtyState {
  session: string; // tmux session name
  logPath: string; // raw output stream (pipe-pane)
  cursor: number; // byte offset already returned to the model
  /** Where the shell really started, as reported by tmux. It may `cd` away later. */
  cwd: string;
  /**
   * Set only while a start-directory mismatch is still unreported: tmux silently
   * falls back to $HOME when it can't use the directory we asked for. Cleared
   * once the model has been told, so the warning doesn't repeat over a `cd` the
   * model made on purpose.
   */
  requestedCwd?: string;
}

export interface ToolContext {
  sessionId: string;
  cwd: string;
  /** seq of the user message that started the current turn; nodes >= this are in-flight */
  turnStartSeq: number;
  readFiles: Set<string>;
  signal?: AbortSignal;
  /** provider config for tools that need to know the active model */
  providerCfg?: ProviderConfig;
  /** external ACP agents `task` may delegate to, from `fox.toml [agents.*]` */
  agents?: Record<string, AcpAgentConfig>;
  /**
   * Post-edit diagnostics. `lsp` overrides the built-in server table by
   * extension; `diagnostics === false` disables the whole path. Both absent
   * means built-ins only, which is the default — so a bare ToolContext (tests,
   * the SDK) gets the same behavior as the TUI.
   */
  lsp?: Record<string, LspConfig>;
  diagnostics?: boolean;
  /**
   * Emit an extra event into the running turn's stream. `task` uses this to
   * forward a delegated agent's progress live; a tool that has nothing to report
   * mid-run simply never calls it. Optional so a bare ToolContext (tests, the
   * SDK) stays valid.
   */
  emit?: (ev: AgentEvent) => void;
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
