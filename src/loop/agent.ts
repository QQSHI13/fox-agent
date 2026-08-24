// Back-compat facade over runTurnCore. The TUI and CLI call runTurn();
// tests and the SDK use runTurnCore directly for injection.
import type { ProviderConfig } from "../providers/types.ts";
import type { AgentEvent } from "../core/events.ts";
import type { Config } from "../core/config.ts";
import { runTurnCore } from "./turn.ts";
export { VERSION } from "./prompt.ts";

export async function* runTurn(
  sessionId: string,
  cfg: ProviderConfig,
  userText: string,
  signal?: AbortSignal,
  config?: Config,
): AsyncGenerator<AgentEvent> {
  yield* runTurnCore(sessionId, cfg, userText, signal, {
    maxSteps: config?.maxSteps,
    retryLimit: config?.retryLimit,
    compactAt: config?.compactAt,
    projectInstructions: config?.projectInstructions,
    // pass the whole config so MCP servers merge into the registry
    config,
  });
}
