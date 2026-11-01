/**
 * Tool vocabulary — the shared types that describe "a thing the agent can do."
 *
 * Lives in core (not tools/) because the types are vocabulary, not tool
 * implementations: the MCP pool, plugins, the A2A codec, and the providers all
 * reference `Tool`/`ToolResult`/`ToolContext` without implementing a tool.
 * The screen's `Style` moved to core/style.ts for the same reason. Moving
 * them here breaks the upward imports (tools/ is above core in the layer
 * order) and lets the MCP pool and plugins stop reaching into tools/.
 *
 * The runtime helpers (`validateArgs`, `ok`, `fail`) stay in tools/types.ts —
 * they are tool-logic, not vocabulary, and everything that calls them already
 * imports from tools/.
 */
import type { MediaPart, ProviderConfig, ToolDef } from "../providers/types.ts";
import type { AgentEvent } from "../core/events.ts";
import type { ExternalAgentConfig, LspConfig } from "../core/config.ts";
import type { UiBridge } from "../core/ui.ts";

/** State of a persistent pseudo-terminal the pty tool drives (a tmux session). */
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
   * The live tool registry, set by the turn loop when it executes calls.
   * Lets meta-tools (repl) invoke sibling tools directly. Absent on bare
   * contexts (tests, SDK without a turn) — check for it.
   */
  tools?: Map<string, Tool>;
  /**
   * Ask the user questions mid-run — select menus, text input, wizards (see
   * core/ui.ts). Present only when the host is interactive (today: the TUI);
   * a tool on a headless host must not block waiting for an answer that can
   * never come, so check for its presence first.
   */
  ui?: UiBridge;
  /**
   * Steer a message into the running turn, delivered at the next step boundary.
   * Used by background-capable tools (repl) to notify the agent when a detached
   * job finishes. Optional so a bare ToolContext (tests, SDK) stays valid.
   */
  steer?: (text: string) => void;
  /**
   * Mark the session as having live background work. While any caller has
   * started without ending, `waitQuiescent` blocks — a session is not idle
   * while a detached eval can still produce output.
   */
  backgroundStarted?: () => void;
  /** Pair to `backgroundStarted`: the background work is done. */
  backgroundEnded?: () => void;
  /**
   * Cap on one tool result's text in chars (config `toolOutputCap`, default
   * 30000). Tools read this to bound their own output — the tool's choice of
   * how much to return, distinct from `toolPresentationCap` which the view
   * applies afterwards. The turn loop populates it; a bare ToolContext gets
   * undefined meaning "no cap".
   */
  toolOutputCap?: number;
  /**
   * Cap on one `read` result's text in chars (config `readCap`, default 50000).
   * The `read` tool pages by line and reads this to bound its soft budget.
   * The turn loop populates it; a bare ToolContext gets undefined meaning
   * "use the default".
   */
  readCap?: number;
  get pty(): PtyState | undefined;
  set pty(v: PtyState | undefined);
}

export interface ToolResult {
  ok: boolean;
  output: string;
  /** binary attachments (e.g. an image `read` returns for a vision-capable model) */
  media?: MediaPart[];
  /**
   * The tool already applied its own, caller-chosen output budget — so the
   * harness must not apply its per-result tail cap on top (`exec` sets this
   * for `full: true`). Without it, the cap `full` exists to lift was silently
   * re-applied in the turn loop, and the "whole output" came back tail-cut
   * with no marker saying so. Presentation truncation (a view op, reversible
   * and labelled) still applies.
   */
  uncapped?: boolean;
}

export interface Tool {
  def: ToolDef;
  run(args: any, ctx: ToolContext): Promise<ToolResult | string>;
}
