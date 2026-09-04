import type { MediaPart, ProviderConfig, ToolDef } from "../providers/types.ts";
import type { AgentEvent } from "../core/events.ts";
import type { ExternalAgentConfig, LspConfig } from "../core/config.ts";
import type { UiBridge } from "../core/ui.ts";

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
  readFiles: Set<string>;
  signal?: AbortSignal;
  /** provider config for tools that need to know the active model */
  providerCfg?: ProviderConfig;
  /** external agents `task` may delegate to (ACP command or A2A url), from `[agents.*]` */
  agents?: Record<string, ExternalAgentConfig>;
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
  /** id of the tool call being executed — pairs `tool_output` deltas with the in-flight call */
  callId?: string;
  /**
   * Ask the user questions mid-run — select menus, text input, wizards (see
   * core/ui.ts). Present only when the host is interactive (today: the TUI);
   * a tool on a headless host must not block waiting for an answer that can
   * never come, so check for its presence first.
   */
  ui?: UiBridge;
  get pty(): PtyState | undefined;
  set pty(v: PtyState | undefined);
}

export interface ToolResult {
  ok: boolean;
  output: string;
  /** binary attachments (e.g. an image `read` returns for a vision-capable model) */
  media?: MediaPart[];
}

export interface Tool {
  def: ToolDef;
  run(args: any, ctx: ToolContext): Promise<ToolResult | string>;
}

export const ok = (output: string): ToolResult => ({ ok: true, output });
export const fail = (output: string): ToolResult => ({ ok: false, output });
