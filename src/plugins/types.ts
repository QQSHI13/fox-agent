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
import type { Tool } from "../core/tool.ts";
import type { Style } from "../core/style.ts";
import type { ChatFn, ChatMessage, ToolDef } from "../providers/types.ts";
import type { ExternalAgentConfig, McpServerConfig } from "../core/config.ts";
// Type-only: store/ sits below plugins/ in the layer order, and a type import
// is erased at build time, so this adds a vocabulary dependency without a
// runtime one. `ViewOp` is the context-surgery primitive `beforeContext` hands
// back — reusing the store's own type is what keeps a plugin's compaction
// indistinguishable from one the `ctx` tool wrote.
import type { ViewOp } from "../store/db.ts";

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
 * Before the step's context is assembled — the ONE hook that can change what
 * the model sees on THIS step.
 *
 * `beforeLLMCall` runs after `renderContext`, so a plugin that hides or rewrites
 * a message there is a step too late: the array it was handed is already built.
 * This hook runs first, and its patch is a list of view ops the harness appends
 * before projecting, so the effect is immediate.
 *
 * ## Why view ops and not a message array
 *
 * Same reason every other hook is a patch: a plugin that could return a message
 * array would own the call/result pairing invariant, and a provider hard-400s
 * on an orphan with nothing pointing at the plugin. A view op cannot break it —
 * `projectView` recomputes orphans after applying ops, so hiding an assistant
 * turn also hides its now-unpaired results, and a restored turn brings them
 * back. Whatever a plugin does, the request stays well-formed.
 *
 * ## What this unlocks
 *
 * Auto-compaction and every custom compaction policy (summarize old turns, keep
 * a recent tail), branch projection (re-root the transcript at an earlier
 * point), and selective redaction — all with the harness's own undo and replay
 * intact, because ops are appended rather than applied destructively.
 */
export interface BeforeContextContext {
  sessionId: string;
  /** 1-based step within the turn, so a hook can act only on the first */
  step: number;
  /**
   * How full the window is, from the provider's own report — the same figure the
   * runtime header shows. A compaction policy decides against this rather than
   * re-estimating; `stage` is where the harness's own thresholds landed.
   */
  budget: {
    reported: number;
    limit: number;
    ratio: number;
    stage: "none" | "warn" | "ctxOnly";
  };
  /** the visible transcript, oldest first — read to decide what to compact */
  nodes: readonly { seq: number; role: string; content: string; tokens: number }[];
}

export interface BeforeContextPatch {
  /**
   * View ops to append before this step is projected. Same primitives the `ctx`
   * tool uses, so a compaction written here is undoable and replayable.
   */
  ops?: ViewOp[];
  /**
   * Set when the ops are a *derived* compaction rather than a deliberate edit:
   * the harness records this policy version on its replace ops, so a replay can
   * re-derive when the policy changes and the UI can reveal the stored original.
   */
  policyVersion?: number;
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
  /**
   * Before the step's context is assembled — the only hook that changes what
   * the model sees on THIS step. Runs before `beforeLLMCall`, and its view ops
   * are appended before projection, so a compaction written here lands now
   * rather than a step later.
   */
  beforeContext?(c: BeforeContextContext): BeforeContextPatch | void | Promise<BeforeContextPatch | void>;
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
 * region can never paint outside `rect`, however buggy its writer, because
 * the clamp lives in the plane's write primitives.
 *
 * PULL contract: `paint` is a pure function of the signals it reads. It runs
 * once at registration and again whenever a signal it read during its previous
 * run changed; the plane is cleared before every call, so `paint` must draw a
 * complete picture of the region rather than a delta. Dependencies are never
 * declared — reading a signal IS subscribing to it — so a region cannot go
 * stale because someone forgot to list a dependency.
 *
 * Create state with `regionSignal` in MODULE scope, not inside `paint`: a signal
 * created during a run would be a fresh one every frame, resetting to its
 * initial value and subscribing to nothing.
 *
 * A slow or stuck plugin still cannot freeze the screen: its effect runs inside
 * the flush with every other region, and a throw from `paint` is caught and
 * warned about once per region.
 */
export interface TuiRegion {
  /** stack order among regions; plugin regions should stay >= 50 (above all built-ins) */
  z: number;
  /**
   * The band this region owns, [x0, y0, x1, y1) in screen cells. y may be
   * negative or exceed the screen height — it is clamped against the live
   * screen size, so "bottom-anchored" regions can express themselves relative
   * to a fixed max and simply not paint rows that do not exist.
   */
  rect: [number, number, number, number];
  /**
   * Draw the region. Called at registration and on every change to a signal it
   * read last time. Throwing is contained: the region is warned once and keeps
   * the rest of the screen alive.
   *
   * `p.w`/`p.h` are the live screen size and are also dependencies — a resize
   * repaints every region automatically, so a plugin never has to poll for it.
   * `p.wrap` breaks lines exactly where the transcript and input box do.
   */
  paint: (p: TuiRegionPlane) => void;
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
  /**
   * Screen width/height. Reading either SUBSCRIBES the region to resizes, so a
   * plugin that lays out against them repaints when the terminal moves and
   * never has to poll for it.
   */
  readonly w: number;
  readonly h: number;
  /**
   * Wrap plain text to a column budget — the TUI's own wrapper, so a panel
   * breaks lines exactly where the transcript, the input box and the wizard do.
   *
   * Hand-rolling this is how a plugin panel ends up one column narrower than
   * everything around it, or loses the leading spaces of an indented block. Pass
   * the region's own width (usually `p.w`) and the padding you reserve.
   *
   * `opts` (all optional): `reserve` columns to leave free on the right,
   * `keepLeadSpaces` to preserve indentation, `lossless` to never drop a space,
   * `exactWidth` to use the final column instead of leaving it empty.
   */
  wrap(text: string, width: number, opts?: TuiWrapOptions): string[];
}

/** Options for {@link TuiRegionPlane.wrap} — mirrors the core wrapper's. */
export interface TuiWrapOptions {
  /** columns reserved on the right (a border, a gutter, a scrollbar) */
  reserve?: number;
  /** keep leading spaces — needed for indented code or YAML */
  keepLeadSpaces?: boolean;
  /** never drop a character: a space that does not fit carries to the next line */
  lossless?: boolean;
  /** use the last column rather than leaving a ragged right edge */
  exactWidth?: boolean;
}

/**
 * What a gateway contribution gets when a client calls one of its RPC methods.
 *
 * Deliberately plain data + two functions: a `GatewayContribution` lives in the
 * plugin (a separate program), while the gateway that serves it is another
 * plugin, so neither can import the other. The shape here is the contract both
 * satisfy structurally.
 */
export interface GatewayMethodContext {
  /** the session the client called from, when it named one */
  sessionId?: string;
  /** the contributing plugin's own name — so a method need not repeat it */
  plugin: string;
  /** push an event to every connected gateway client (`{event, ...}`) */
  broadcast(event: Record<string, unknown>): void;
}

/**
 * The web surface a non-gateway plugin can contribute to the gateway.
 *
 * The gateway owns the wire; a plugin owns its own corner of it. Everything is
 * namespaced by the contributing plugin's `name` so two plugins cannot collide:
 *
 *   methods  -> RPC `plugin.<name>.<method>`, params/reply passed through
 *   routes   -> `GET|POST /plugin/<name>/<path>`
 *   panels   -> an HTML document at `/plugin/<name>/<panelId>.html`, shown in a
 *               sandboxed iframe inside the gateway UI
 *
 * All three are optional; a plugin with none of them is simply not listed.
 */
export interface GatewayContribution {
  /** RPC handlers, keyed by the method name the client appends after `plugin.<name>.` */
  methods?: Record<string, (params: unknown, ctx: GatewayMethodContext) => unknown | Promise<unknown>>;
  /** HTTP handlers, keyed by the path segment after `/plugin/<name>/` */
  routes?: Record<string, (req: Request) => Response | Promise<Response>>;
  /**
   * UI panels, keyed by id. `html` is either the document itself or a thunk
   * (so a panel can read a file on each request). It is served from the
   * gateway's origin but rendered in a sandboxed iframe with no same-origin
   * access; it talks to the gateway only through the documented postMessage
   * bridge, which can reach this plugin's `methods` and nothing else.
   */
  panels?: Record<string, { title: string; html: string | (() => string) }>;
}

export interface FoxPlugin {
  /** identifies the plugin in warnings; the only required field */
  name: string;
  /**
   * Tools this plugin contributes — a list, or a function of the registry as it
   * stands when this plugin is merged.
   *
   * ## Why it can be a function
   *
   * A plain list can only ADD or REPLACE: `mergeTools` does `map.set(name, tool)`,
   * so a plugin that declares `exec` makes the built-in unreachable. It cannot
   * decorate it — every shadowing plugin would have to reimplement whatever it
   * shadows, and then drift from it.
   *
   * The function form receives a COPY of the registry as it exists at merge time,
   * which is the only moment the previously-registered tool is still reachable:
   *
   *     export const tools = (current: ReadonlyMap<string, Tool>) => {
   *       const inner = current.get("exec");
   *       if (!inner) return [];
   *       return [{ def: inner.def, run: async (a, c) => {
   *         const veto = guard(a, c);
   *         return veto ?? inner.run(a, c);
   *       }}];
   *     };
   *
   * Same `def`, so the model sees no change and the prompt cache is untouched.
   * Later plugins see earlier plugins' output, so middlewares chain.
   *
   * ## The one trap
   *
   * CAPTURE the previous tool from the argument. Looking it up later —
   * `ctx.tools.get("exec")` inside `run` — returns YOUR tool, because the
   * registry was already overwritten. That is silent infinite recursion ending
   * in a stack overflow, not an error message.
   */
  tools?: Tool[] | ((current: ReadonlyMap<string, Tool>) => Tool[]);
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
   * `command`) — the marketplace shape for "install a remote
   * reviewer". Same merge rule as `mcpServers`: explicit config wins.
   */
  agents?: Record<string, ExternalAgentConfig>;
  /** slash commands (`/deploy`, …) — run through the same result as built-ins */
  commands?: PluginCommand[];
  /**
   * A top-level CLI subcommand this plugin serves (`gateway`, `web`, …) — invoked
   * as `fox <name> [args]`, before the TUI starts, without entering a session. The
   * hook receives the args after the subcommand and a minimal context. Only bundled
   * / explicitly trusted plugins should bind a subcommand; it runs with full machine
   * access and no TUI. A name colliding with a built-in subcommand never fires (the
   * built-in wins) and is reported at registry build.
   */
  cliCommand?: {
    name: string;
    /** shown in `fox --help` under "plugin commands" */
    description?: string;
    run: (args: string[], ctx: { config: unknown; provider: unknown; flags?: Map<string, string | boolean> }) => Promise<void> | void;
  };
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
  /**
   * This plugin's corner of the gateway's web surface (`fox gateway`): RPC
   * methods, HTTP routes, and UI panels, all namespaced by `name`. Ignored by
   * every other front end; a plugin that omits it is untouched by the gateway.
   */
  gateway?: GatewayContribution;
}
