// Back-compat facade over runTurnCore. The TUI and CLI call runTurn();
// tests and the SDK use runTurnCore directly for injection.
import type { ProviderConfig } from "../providers/types.ts";
import type { AgentEvent } from "../core/events.ts";
import type { Config } from "../core/config.ts";
import type { UiBridge } from "../core/ui.ts";
import { runTurnCore } from "./turn.ts";
export { VERSION } from "./prompt.ts";

export async function* runTurn(
  sessionId: string,
  cfg: ProviderConfig,
  userText: string,
  signal?: AbortSignal,
  config?: Config,
  ui?: UiBridge,
  lockKind?: string,
): AsyncGenerator<AgentEvent> {
  yield* runTurnCore(sessionId, cfg, userText, signal, {
    maxSteps: config?.maxSteps,
    lockKind,
    // the facade's only callers are the TUI and the CLI, and both name their
    // surface through lockKind already — so the input hook gets the same answer
    // without a second parameter to thread
    source: lockKind ?? "tui",
    retryLimit: config?.retryLimit,
    compactWarnAt: config?.compactWarnAt,
    compactCtxOnlyAt: config?.compactCtxOnlyAt,
    projectInstructions: config?.projectInstructions,
    ui,
    // pass the whole config so MCP servers merge into the registry
    config,
  });
}
