/**
 * The plugin surface, re-exported from `../sdk.ts` so an author writes
 * `import type { FoxPlugin } from "fox-agent/sdk"`.
 *
 * Three extension points, chosen because each already had a seam:
 *
 *   tools     — a `Tool` is `{ def, run }`, structurally identical to a built-in,
 *               so there is no adapter layer. `buildSystemPrompt` derives the
 *               roster from the live registry, so a plugin tool describes itself
 *               to the model with no prompt-side work.
 *   hooks     — three points in the turn loop, deliberately *additive* (see below).
 *   providers — `resolveChat` is a 4-line dispatcher on `cfg.provider`; a plugin
 *               can register a name it dispatches to.
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
import type { ChatFn, ChatMessage, ToolDef } from "../providers/types.ts";

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
}

export interface FoxPlugin {
  /** identifies the plugin in warnings; the only required field */
  name: string;
  tools?: Tool[];
  hooks?: PluginHooks;
  /** custom providers, keyed by the value a config's `provider` would name */
  providers?: Record<string, ChatFn>;
}
