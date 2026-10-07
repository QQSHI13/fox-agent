/**
 * The plugin surface, re-exported from `../sdk.ts` so an author writes
 * `import type { FoxPlugin } from "fox-agent/sdk"`.
 *
 * Extension points, chosen because each already had a seam:
 *
 *   tools     — a `Tool` is `{ def, run }`, structurally identical to a built-in,
 *               so there is no adapter layer. `buildSystemPrompt` derives the
 *               roster from the live registry, so a plugin tool describes itself
 *               to the model with no prompt-side work.
 *   hooks     — seven points in the turn loop, deliberately *additive* (see below).
 *   providers — `resolveChat` is one lookup over the bundled formats plus this
 *               map; a plugin can register a name it dispatches to.
 *   themes    — selectable via `/theme` or the `theme` config key.
 *   mcpServers/agents — integration packs: servers and delegation targets
 *               without a config file. Explicit config wins on collision.
 *   commands  — slash commands run through the same result as built-ins.
 *
 * ## Why hooks are patch-based
 *
 * `renderContext` reconstructs the provider message list from the session DAG,
 * and its load-bearing invariant is that every assistant `tool_call` is followed
 * by the matching `tool_result`. A provider rejects the request outright if one
 * is orphaned. A hook that could return a rewritten message array would put that
 * invariant in the hands of every plugin author, and the failure mode is a hard
 * 400 from the provider with nothing pointing at the plugin.
 *
 * So a hook returns a *patch*, and the patches are additive by construction:
 * `beforeLLMCall` may append to the system prompt, `afterTool` may replace one
 * tool's output text. Neither can reorder, drop, or insert a message, so the
 * pairing holds whatever a plugin does.
 */
import type { Tool } from "../tools/types.ts";
import type { Style } from "../tui/screen.ts";
import type { ChatFn, ChatMessage, ToolDef } from "../providers/types.ts";
import type { ExternalAgentConfig, McpServerConfig } from "../core/config.ts";

/** Context a plugin slash command runs with — the session it acts in, nothing else. */
export interface PluginCommandContext {
  sessionId: string;
  cwd: string;
}

/**
 * A slash command contributed by a plugin (`/deploy`, …).
 *
 * Matched exactly like a built-in (case-insensitive, `/`-prefixed) and run
 * through the same `CommandResult` — output floats, `newSessionId` switches,
 * `task` runs async work — so a plugin command behaves like a native one.
 * A name colliding with a built-in never fires (the built-in wins) and is
 * reported at registry build.
 */
export interface PluginCommand {
  /** "/deploy" — must start with "/" and contain no spaces */
  name: string;
  /** one line, shown in /help and the hint popup */
  description: string;
  /** argument syntax, if any; shown in /help and as the argument hint */
  usage?: string;
  /** longer /help line; falls back to `description` */
  help?: string;
  run: (arg: string, ctx: PluginCommandContext) => import("../commands.ts").CommandResult;
}

/** Fires once per session, on the turn whose user message is the session's first. */
export interface SessionStartContext {
  sessionId: string;
  cwd: string;
  model: string;
}

/**
 * Before each provider request. `messages` and `tools` are readonly — they are
 * there to *decide* with, not to edit; the return value is the only channel.
 */
export interface BeforeLLMCallContext {
  sessionId: string;
  /** 1-based step within the turn, so a hook can act only on the first */
  step: number;
  messages: readonly ChatMessage[];
  tools: readonly ToolDef[];
}

export interface BeforeLLMCallPatch {
  /** appended to the system prompt for this request only */
  appendSystem?: string;
}

/**
 * After a tool ran, before its output is stored. `output` is post-cap, i.e. the
 * exact text that would otherwise be written to the transcript.
 */
export interface AfterToolContext {
  sessionId: string;
  name: string;
  args: unknown;
  ok: boolean;
  output: string;
}

export interface AfterToolPatch {
  /** replaces the tool's output everywhere: transcript, model, and `tool_end` */
  output?: string;
}

export interface PluginHooks {
  onSessionStart?(c: SessionStartContext): void | Promise<void>;
  beforeLLMCall?(c: BeforeLLMCallContext): BeforeLLMCallPatch | void | Promise<BeforeLLMCallPatch | void>;
  afterTool?(c: AfterToolContext): AfterToolPatch | void | Promise<AfterToolPatch | void>;
  /** once per turn, after the user message is stored, before the first request */
  onTurnStart?(c: TurnStartContext): void | Promise<void>;
  /** once per turn, after the loop ends — any reason, including errors and aborts */
  onTurnEnd?(c: TurnEndContext): void | Promise<void>;
  /**
   * The session is going away: fox-agent exiting, the user switching sessions,
   * or the session being deleted. Where a plugin releases what it holds — the
   * bundled pty plugin kills its tmux session here.
   */
  onSessionEnd?(c: SessionEndContext): void | Promise<void>;
  /**
   * Before a tool runs. The patch may replace the args, or supply `output` to
   * skip the run entirely (a guard plugin's veto). Additive-only like the rest:
   * it cannot touch the transcript.
   */
  beforeTool?(c: BeforeToolContext): BeforeToolPatch | void | Promise<BeforeToolPatch | void>;
}

export interface TurnStartContext {
  sessionId: string;
  cwd: string;
  model: string;
  userText: string;
}

export interface TurnEndContext {
  sessionId: string;
  /** the loop's done reason: "stop", "aborted", "max-steps", an error, … */
  reason: string;
  steps: number;
}

export interface SessionEndContext {
  sessionId: string;
  reason: "exit" | "switch" | "delete";
}

export interface BeforeToolContext {
  sessionId: string;
  name: string;
  args: unknown;
}

export interface BeforeToolPatch {
  /** replaces the args the tool runs with */
  args?: unknown;
  /** skip the run and record this as the tool's output instead */
  output?: string;
}

/**
 * A TUI screen region a plugin owns. The plane is clip-rect bounded — a
 * region can never paint outside `rect`, however buggy its painter, because
 * the clamp lives in the plane's write primitives. Paint runs on the frame
 * cadence only while the TUI is up; returning false hides the region for
 * that frame (the plane goes empty and the screen underneath shows through).
 */
export interface TuiRegion {
  /** stack order among regions; plugin regions should stay >= 50 (above all built-ins) */
  z: number;
  /**
   * The band this region owns, [x0, y0, x1, y1) in screen cells. y may be
   * negative or exceed the screen height — it is clamped against the live
   * screen size every paint, so "bottom-anchored" regions can express
   * themselves relative to a fixed max and simply not paint rows that do
   * not exist this frame.
   */
  rect: [number, number, number, number];
  /**
   * Stamp this frame's content. Return false to hide the region this frame.
   * Throwing is contained: the region is dropped for the frame and warned
   * once. Keep it cheap — it runs at frame rate while anything repaints.
   */
  paint: (p: TuiRegionPlane) => boolean | void;
}

/**
 * What a region's paint fn draws with: the same text/fillRow/restyle
 * primitives the built-in regions use, pre-clipped to the region's rect.
 */
export interface TuiRegionPlane {
  text(x: number, y: number, str: string, style: Style): void;
  fillRow(y: number, x0: number, x1: number, style: Style): void;
  /** highlight existing content with a background (selection-style) */
  restyle(y: number, x0: number, x1: number, bg: string): void;
  /** screen width/height this frame */
  readonly w: number;
  readonly h: number;
}

export interface FoxPlugin {
  /** identifies the plugin in warnings; the only required field */
  name: string;
  tools?: Tool[];
  hooks?: PluginHooks;
  /** custom providers, keyed by the value a config's `provider` would name */
  providers?: Record<string, ChatFn>;
  /** TUI themes (keyed by name), selectable via `/theme` or the `theme` config key */
  themes?: Record<string, import("../tui/themes.ts").Theme>;
  /**
   * MCP servers this plugin packs (`[mcpServers.*]` entries without a config
   * file) — the marketplace shape for "install the Postgres tools". Merged
   * before connecting; an explicitly configured server of the same name wins,
   * and the collision is reported.
   */
  mcpServers?: Record<string, McpServerConfig>;
  /**
   * Delegation targets this plugin packs (`[agents.*]` entries: an ACP
   * `command` or an A2A `url`) — the marketplace shape for "install a remote
   * reviewer". Same merge rule as `mcpServers`: explicit config wins.
   */
  agents?: Record<string, ExternalAgentConfig>;
  /** slash commands (`/deploy`, …) — run through the same result as built-ins */
  commands?: PluginCommand[];
  /**
   * Status bar slots this plugin contributes, by name — a config's `statusBar`
   * template lists segment names and any name registered here paints as a
   * ` · `-joined segment. Return null to hide the slot this repaint (a plugin
   * with nothing to say must not leave an empty `· ·` hole). Called on the
   * status repaint cadence (revision bump / 2s while busy), so keep it cheap —
   * read cached state, do not I/O. A throwing segment is dropped and warned
   * once per name.
   */
  statusSegments?: Record<string, () => string | null>;
  /**
   * TUI screen regions this plugin contributes, keyed by name — a panel, a
   * ticker, a custom status strip. Each gets its own compositing plane,
   * clipped to the `rect` the region declares; regions appear/disappear with
   * plugin load (`/reload` swaps them live) and hide per-frame by returning
   * false from `paint`.
   */
  regions?: Record<string, TuiRegion>;
}
