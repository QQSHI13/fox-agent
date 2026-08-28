// Library entry: embed fox-agent in other tools or scripts.
//   import { createAgent } from "fox-agent/sdk";
import { createSession, getSession } from "./store/db.ts";
import { loadConfig } from "./core/config.ts";
import { errMsg } from "./core/errors.ts";
import type { AgentEvent } from "./core/events.ts";
import type { ProviderConfig } from "./providers/types.ts";
import { resolveChat } from "./providers/index.ts";
import { runTurnCore, type TurnOptions } from "./loop/turn.ts";
import { shutdownTools } from "./tools/index.ts";

// The plugin surface. Re-exported here rather than only from src/plugins/ so a
// plugin author writes one import — `import type { FoxPlugin } from "fox-agent/sdk"`
// — and gets the tool and provider types a plugin needs along with it.
export type {
  FoxPlugin,
  PluginHooks,
  SessionStartContext,
  BeforeLLMCallContext,
  BeforeLLMCallPatch,
  AfterToolContext,
  AfterToolPatch,
} from "./plugins/types.ts";
export type { Tool, ToolContext, ToolResult } from "./tools/types.ts";
export { ok, fail } from "./tools/types.ts";
export type { ChatFn, ChatMessage, ProviderConfig, StreamEvent, ToolDef } from "./providers/types.ts";

export interface AgentRunResult {
  text: string;
  reason: string;
  usage: { prompt_tokens: number; completion_tokens: number } | null;
}

export interface FoxAgent {
  sessionId: string;
  cwd: string;
  config: ReturnType<typeof loadConfig>;
  provider: ProviderConfig;
  /** Run one prompt to completion. Events stream via onEvent. */
  run(prompt: string, opts?: { signal?: AbortSignal; onEvent?: (ev: AgentEvent) => void; turn?: TurnOptions }): Promise<AgentRunResult>;
  close(): Promise<void>;
}

export async function createAgent(opts: {
  cwd?: string;
  model?: string;
  baseUrl?: string;
  apiKey?: string;
  provider?: ProviderConfig["provider"];
  maxSteps?: number;
} = {}): Promise<FoxAgent> {
  const cwd = opts.cwd ?? process.cwd();
  const config = loadConfig({ cwd, ...opts });
  if (!config.apiKey) throw new Error("fox-agent: no API key (set FOX_AGENT_API_KEY / OPENAI_API_KEY / ANTHROPIC_API_KEY)");

  const provider: ProviderConfig = { baseUrl: config.baseUrl, apiKey: config.apiKey, model: config.model, provider: config.provider };
  const sessionId = createSession(cwd, config.model).id;
  getSession(sessionId);

  return {
    sessionId,
    cwd,
    config,
    provider,
    async run(prompt, runOpts = {}) {
      let text = "";
      let reason = "";
      let usage: AgentRunResult["usage"] = null;
      for await (const ev of runTurnCore(sessionId, provider, prompt, runOpts.signal, {
        maxSteps: runOpts.turn?.maxSteps ?? config.maxSteps,
        retryLimit: runOpts.turn?.retryLimit ?? config.retryLimit,
        compactAt: runOpts.turn?.compactAt ?? config.compactAt,
        projectInstructions: config.projectInstructions,
        config,
        chat: resolveChat,
        ...runOpts.turn,
      })) {
        runOpts.onEvent?.(ev);
        if (ev.type === "text") text += ev.delta;
        else if (ev.type === "usage") usage = { prompt_tokens: ev.prompt_tokens, completion_tokens: ev.completion_tokens };
        else if (ev.type === "done") reason = ev.reason;
      }
      return { text: text.trim(), reason, usage };
    },
    async close() {
      try {
        await shutdownTools(sessionId);
      } catch (e) {
        console.error(`fox-agent: cleanup: ${errMsg(e)}`);
      }
    },
  };
}
