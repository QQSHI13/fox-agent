import { appendMessage, appendOps, getSession, recordUsage } from "../store/db.ts";
import { estimateTokens } from "../providers/models.ts";
import type { ProviderConfig, ChatMessage, ToolDef, ToolCall, ChatFn } from "../providers/types.ts";
import { resolveChat } from "../providers/index.ts";
import { classifyProviderError, diagnoseProviderError, FoxError, isTimeout, isTruncated } from "../core/errors.ts";
import { debugInfo, debugWarn, debugError } from "../core/debuglog.ts";
import type { AgentEvent } from "../core/events.ts";
import type { Tool, ToolContext, ToolResult, PtyState } from "../tools/types.ts";
import { validateArgs } from "../tools/types.ts";
import { outCap } from "../tools/files.ts";
import { buildRegistry } from "../tools/index.ts";
import { drainSteer, peekSteer, turnEnded, turnStarted } from "./steer.ts";
import { VERSION } from "../core/version.ts";
import type { Config } from "../core/config.ts";
import { defaultConfig } from "../core/config.ts";
import type { FoxPlugin } from "../plugins/types.ts";
import { loadPlugins } from "../plugins/load.ts";
import type { UiBridge } from "../core/ui.ts";
import { buildSystemPrompt, buildRuntimeHeader } from "./prompt.ts";
import { renderContext, stripEchoedMarkers } from "../context/render.ts";
import { truncateToolResult, DEFAULT_PRESENTATION_CAP } from "../context/truncate.ts";
import { checkBudget, sessionContextTokens, type BudgetThresholds } from "../context/budget.ts";

export interface TurnOptions {
  maxSteps?: number;
  retryLimit?: number;
  /** fraction at which the header tells the agent to compact (absent = the config's value) */
  compactWarnAt?: number;
  /** fraction at which only `ctx` stays callable (absent = the config's value) */
  compactCtxOnlyAt?: number;
  /** suppress step/retry chatter (subagents) */
  quiet?: boolean;
  /** dependency injection — tests mock the provider here */
  chat?: ChatFn;
  registryOverride?: Map<string, Tool>;
  /**
   * Plugins to run hooks from, bypassing config. Mirrors `registryOverride`: a
   * test injects a plugin object without writing one to disk and pointing a
   * global config at it. When set, config-named plugins are not loaded.
   */
  pluginsOverride?: FoxPlugin[];
  projectInstructions?: string;
  /** full config enables MCP tool merging */
  config?: Config;
  /**
   * Interactive host's question bridge, handed to tools as `ctx.ui`. Absent on
   * headless hosts — a tool must not expect it.
   */
  ui?: UiBridge;
}

interface StepOutcome {
  text: string;
  calls: ToolCall[];
  /** `cached_tokens` is not optional here: the wire event may omit it (a
   *  plugin's `ChatFn` never heard of caches), so the step folds `?? 0` once
   *  and everything downstream — storage, the status bar — gets a number. */
  usage: { prompt_tokens: number; completion_tokens: number; cached_tokens: number } | null;
  finish: string;
  reasoning: string;
}

/**
 * Single token estimator, shared with the render/compact/budget paths.
 *
 * This used to be its own `Math.ceil(s.length / 4)`, a second estimator that
 * disagreed with `estimateTokens` (which is CJK-aware: non-ASCII counts 1) by
 * up to 4x on CJK-dense history. Both write and read sides now agree, so a
 * stored `tokens` figure and a live `nodeTokenEstimate` of the same text can
 * never diverge. The append-side formula is otherwise unchanged.
 */
const estTok = estimateTokens;

/**
 * A queue for events a tool emits while it is still running.
 *
 * Tools are awaited together in a `Promise.all`, so a tool cannot yield into the
 * turn's generator directly — it can only call a callback. This buffers those
 * calls and lets the loop interleave them with the await, which is the difference
 * between a delegated agent's progress appearing live and appearing all at once
 * when it finishes.
 */
class EventQueue {
  private items: AgentEvent[] = [];
  private wake: (() => void) | null = null;
  private closed = false;

  push = (ev: AgentEvent): void => {
    this.items.push(ev);
    this.wake?.();
  };

  /** no more events will arrive; unblocks a pending `ready()` */
  close(): void {
    this.closed = true;
    this.wake?.();
  }

  drain(): AgentEvent[] {
    const out = this.items;
    this.items = [];
    return out;
  }

  /** resolves when something is queued or the queue closes */
  ready(): Promise<void> {
    if (this.items.length || this.closed) return Promise.resolve();
    return new Promise<void>((resolve) => {
      this.wake = () => {
        this.wake = null;
        resolve();
      };
    });
  }

  get done(): boolean {
    return this.closed && this.items.length === 0;
  }
}

/**
 * Drain one model step, streaming text/reasoning through to the consumer,
 * accumulating everything, and retrying retriable provider errors — but
 * only while nothing has been emitted yet (a mid-stream failure keeps its
 * partials and ends the step with an error finish).
 */
async function* drainStep(
  chat: ChatFn,
  cfg: ProviderConfig,
  messages: ChatMessage[],
  toolDefs: ToolDef[],
  signal: AbortSignal | undefined,
  retryLimit: number,
): AsyncGenerator<AgentEvent, StepOutcome> {
  const acc: StepOutcome = { text: "", calls: [], usage: null, finish: "", reasoning: "" };

  const attempt = async function* (): AsyncGenerator<AgentEvent> {
    for await (const ev of chat(cfg, messages, toolDefs, signal)) {
      if (ev.type === "reasoning") {
        acc.reasoning += ev.delta;
        yield { type: "reasoning", delta: ev.delta };
      } else if (ev.type === "text") {
        acc.text += ev.delta;
        yield { type: "text", delta: ev.delta };
      } else if (ev.type === "tool_call") acc.calls.push(ev.call);
      else if (ev.type === "usage")
        acc.usage = {
          prompt_tokens: ev.prompt_tokens,
          completion_tokens: ev.completion_tokens,
          cached_tokens: ev.cached_tokens ?? 0,
        };
      else if (ev.type === "done") acc.finish = ev.reason;
    }
  };

  for (let n = 0; ; n++) {
    try {
      if (n > 0) acc.text = "", (acc.calls = []), (acc.usage = null), (acc.finish = ""), (acc.reasoning = ""); // a retry re-streams from zero — a kept accumulator duplicated reasoning into the persisted think node
      debugInfo("turn", `provider attempt ${n + 1}`, `model=${cfg.model} messages=${messages.length} tools=${toolDefs.length}`);
      for await (const ev of attempt()) yield ev;
      return acc;
    } catch (e) {
      const err = e as Error;
      // ORDER MATTERS: an idle timeout is not a user interrupt. It must fall
      // through to the retry path below, so test it before the abort checks.
      // And only OUR abort counts: an HTTP client that throws AbortError for
      // its own reasons (internal timeout, connection reuse) must not end the
      // turn "aborted" — so the check gates on the signal, not the name.
      if (!isTimeout(e) && signal?.aborted) {
        // keep whatever streamed before the interrupt; caller persists it
        return { ...acc, finish: "aborted" };
      }
      const pe = classifyProviderError(e);
      // `emitted` normally blocks a retry once text has streamed: re-streaming
      // would duplicate what the user already watched. A TRUNCATED stream is the
      // exception, and the reason is the opposite: what streamed was cut off
      // mid-sentence, so keeping it means keeping a broken answer. Replacing it
      // is strictly better, so truncation retries even after text.
      const truncated = isTruncated(e);
      const emitted = acc.text.length > 0 || acc.calls.length > 0;
      if (!pe.retriable || n >= retryLimit || (emitted && !truncated)) {
        if (emitted) return { ...acc, finish: `error: ${pe.message}` }; // keep partials
        throw pe;
      }
      // Backoff: honor the provider's own Retry-After when it sent one, else
      // exponential with a LONG ceiling. The old ceiling was 8s, which is far
      // too short for the failures that actually need waiting — a quota window
      // resetting, a gateway shedding load — so the retries burned out inside a
      // few seconds and reported a permanent failure.
      const backoff = Math.min(60_000, 1_000 * 2 ** n) + Math.floor(Math.random() * 500);
      const delay = pe.retryAfterMs ?? backoff;
      debugWarn(
        "turn",
        `provider retry ${n + 1}/${retryLimit}`,
        `in ${delay}ms${pe.retryAfterMs !== undefined ? " (provider Retry-After)" : ""}${truncated ? " [truncated stream]" : ""}: ${pe.message}`,
      );
      yield { type: "retry", attempt: n + 1, delay_ms: delay, error: pe.message };
      // abort-aware sleep: ESC during a 4-8s backoff must not wait out the
      // whole delay before the interrupt is honored
      if (signal) {
        await new Promise<void>((resolve) => {
          const onAbort = () => {
            clearTimeout(t);
            signal.removeEventListener("abort", onAbort); // a completed backoff must not leave the listener attached
            resolve();
          };
          const t = setTimeout(onAbort, delay);
          signal.addEventListener("abort", onAbort, { once: true });
        });
      } else await Bun.sleep(delay);
    }
  }
}

function safeParseArgs(s: string): { args: any; error?: string } {
  if (!s || !s.trim()) return { args: {} };
  try {
    return { args: JSON.parse(s) };
  } catch {
    return { args: null, error: `invalid JSON arguments` };
  }
}

function missingRequired(def: ToolDef, args: any): string | null {
  return validateArgs(def.name, def, args);
}

/**
 * How much of a tool call's arguments rides on tool_start/tool_end.
 *
 * The store keeps the full arguments (the assistant node's tool_calls JSON),
 * but events are a live display + protocol path: ACP's rawInput and the TUI's
 * expandable head both read them. Capping at 200 chars truncated mid-JSON so
 * often that streaming clients routinely showed different content than the
 * settled transcript. 4_000 matches the TUI expanded-view cap (argsFull), so
 * streaming and settled show the same content for everything but giant calls,
 * while a 100KB `write` still doesn't ride every event.
 */
const EVENT_ARGS_CAP = 4_000;
function eventArgs(args: string): string {
  return args.length > EVENT_ARGS_CAP ? args.slice(0, EVENT_ARGS_CAP) : args;
}

async function execToolCall(call: ToolCall, tools: Map<string, Tool>, tctx: ToolContext): Promise<ToolResult> {
  const tool = tools.get(call.name);
  if (!tool) {
    debugWarn("tools", `unknown tool ${call.name}`);
    return { ok: false, output: `error: unknown tool ${call.name}` };
  }

  const { args, error: parseErr } = safeParseArgs(call.arguments);
  if (parseErr) {
    debugWarn("tools", `${call.name}: bad arguments`, parseErr);
    return { ok: false, output: `error: ${parseErr} for ${call.name}; send valid JSON matching the schema` };
  }
  const reqErr = missingRequired(tool.def, args);
  if (reqErr) {
    debugWarn("tools", `${call.name}: missing required argument`, reqErr);
    return { ok: false, output: `error: ${reqErr}` };
  }

  const t0 = Date.now();
  debugInfo("tools", `→ ${call.name}`, `args=${JSON.stringify(args).slice(0, 400)}`);
  try {
    const r = await tool.run(args, tctx);
    const result = typeof r === "string" ? { ok: true, output: r } : r;
    const output = result.output.length > outCap() * 2 ? result.output.slice(-outCap() * 2) : result.output; // tail-cap
    debugInfo("tools", `← ${call.name}`, `ok=${result.ok} ms=${Date.now() - t0} bytes=${result.output.length}`);
    return { ok: result.ok, output, media: result.media };
  } catch (e) {
    debugError("tools", `${call.name} threw`, `${(e as Error).stack ?? (e as Error).message}`);
    return { ok: false, output: `error: ${(e as Error).message}` };
  }
}

function fallbackConfig(cfg: ProviderConfig, opts: TurnOptions): Config {
  return defaultConfig({
    model: cfg.model,
    baseUrl: cfg.baseUrl,
    apiKey: cfg.apiKey,
    provider: cfg.provider ?? "openai-compatible",
    maxSteps: opts.maxSteps ?? 0, // 0 = no cap
    retryLimit: opts.retryLimit ?? 3,
    compactWarnAt: opts.compactWarnAt ?? 0.8,
    compactCtxOnlyAt: opts.compactCtxOnlyAt ?? 0.9,
    requestTimeoutMs: cfg.requestTimeoutMs ?? 120_000,
    projectInstructions: "",
  });
}

/**
 * Run one plugin hook, converting any failure into a warning.
 *
 * Every hook goes through here, and that is the whole contract: a plugin is
 * third-party code running inside fox-agent's turn loop, so a hook that throws must
 * cost the user a `warn` line and nothing else. Without this, a plugin with a
 * typo in `afterTool` would reject the `Promise.all` in the tool step and take
 * down a turn that had already done real work.
 *
 * `warn` is a callback rather than a yield because `afterTool` is called from
 * inside that `Promise.all` closure, where yielding is not possible — the
 * existing `EventQueue` is how a tool already reports mid-flight.
 */
async function runHook<T>(
  plugin: FoxPlugin,
  which: string,
  fn: () => T | Promise<T>,
  warn: (message: string) => void,
): Promise<T | null> {
  try {
    return await fn();
  } catch (e) {
    warn(`plugin '${plugin.name}' ${which} failed: ${(e as Error).message.slice(0, 200)}`);
    return null;
  }
}

/**
 * Resolve when `signal` aborts (immediately if it already has). Used to race a
 * tool batch so an interrupt is not held hostage by a tool that never checks
 * `ctx.signal`.
 */
function whenAborted(signal: AbortSignal | undefined): Promise<void> {
  if (!signal) return new Promise<void>(() => {});
  if (signal.aborted) return Promise.resolve();
  return new Promise<void>((resolve) => signal.addEventListener("abort", () => resolve(), { once: true }));
}

/**
 * Run one turn. Brackets the work with the steer layer's turn registry, so a
 * steer that arrives while nothing is running can be recognised as "needs a
 * turn of its own" rather than sitting in the queue until the user happens to
 * type something (see ./steer.ts for the history of that bug).
 *
 * The registry call sits INSIDE the generator body on purpose: an async
 * generator does not run until it is first iterated, and `for await` runs the
 * `finally` on early exit, so a turn is registered for exactly as long as
 * someone is consuming it.
 */
export async function* runTurnCore(
  sessionId: string,
  cfg: ProviderConfig,
  userText: string,
  signal?: AbortSignal,
  opts: TurnOptions = {},
): AsyncGenerator<AgentEvent> {
  turnStarted(sessionId);
  try {
    yield* turnBody(sessionId, cfg, userText, signal, opts);
  } finally {
    turnEnded(sessionId);
  }
}

async function* turnBody(
  sessionId: string,
  cfg: ProviderConfig,
  userText: string,
  signal?: AbortSignal,
  opts: TurnOptions = {},
): AsyncGenerator<AgentEvent> {
  const session = getSession(sessionId);
  if (!session) throw new FoxError(`no session ${sessionId}`);

  const chat = opts.chat ?? resolveChat;
  const effCfg = opts.config ?? fallbackConfig(cfg, opts);
  let setupWarnings: string[] = [];
  let tools: Map<string, Tool>;
  let agents = effCfg.agents;
  let plugins: FoxPlugin[] = opts.pluginsOverride ?? [];
  if (opts.registryOverride) {
    tools = opts.registryOverride;
    // an override skips buildRegistry, so config-named plugins are loaded here —
    // otherwise a test that injects a registry would silently lose every hook
    if (!opts.pluginsOverride && effCfg.plugins?.length) {
      const res = await loadPlugins(effCfg.plugins);
      plugins = res.plugins;
      setupWarnings = [...(effCfg.warnings ?? []), ...res.warnings];
      // buildRegistry registers plugin providers; the override path must too,
      // or provider=<plugin> throws unknown-provider here but works in prod.
      // registerPluginProviders is the one shared copy of the rule.
      const { registerPluginProviders } = await import("../tools/index.ts");
      registerPluginProviders(plugins);
    } else {
      setupWarnings = [...(effCfg.warnings ?? [])];
    }
  } else {
    const built = await buildRegistry(effCfg);
    tools = built.tools;
    setupWarnings = built.warnings;
    // plugin-packed delegation targets ride along: `task` reads this table,
    // so a packed remote agent is delegable with no config file
    agents = built.agents;
    if (!opts.pluginsOverride) plugins = built.plugins;
  }
  // markers off = ctx has no addresses to edit; the prompt gates itself on
  // the live registry, so removing the tool here removes the doctrine too
  if (effCfg.contextMarkers === false) {
    tools.delete("ctx");
  }
  const toolDefs = [...tools.values()].map((t) => t.def);
  const hooked = plugins.filter((p) => p.hooks);

  const userNode = appendMessage(sessionId, {
    parent_id: null,
    role: "user",
    content: userText,
    tokens: estTok(userText),
  });

  let ptyState: PtyState | undefined;
  // 0 means no cap — a turn ends when the model stops calling tools, not when
  // a counter runs out. The guard below only fires for a positive limit.
  const maxSteps = opts.maxSteps ?? 0;
  // Presentation budget for one tool result in the VIEW. 0 disables the
  // truncation op entirely; the stored row is whole either way, so this only
  // decides how much of it the model and transcript read by default.
  const presentationCap = effCfg.toolPresentationCap ?? DEFAULT_PRESENTATION_CAP;
  const quiet = opts.quiet ?? false;
  // Compaction policy resolves config-first, option-second, so a host that
  // passes `config` (every host does) cannot silently lose a threshold by
  // forgetting to forward one field.
  const thresholds: BudgetThresholds = {
    warnAt: opts.compactWarnAt ?? effCfg.compactWarnAt,
    ctxOnlyAt: opts.compactCtxOnlyAt ?? effCfg.compactCtxOnlyAt,
  };

  // Every provider request identifies itself and its conversation: gateways
  // (opencode's among them) route and cache on these. OpenRouter's token
  // rankings attribute volume to an app via `X-Title` + `HTTP-Referer`, so a
  // fox-agent session only counts toward the rank when both are present. The
  // user's own [providers.*] headers win over all of these.
  const reqCfg: ProviderConfig = {
    ...cfg,
    // carried explicitly (not just as a header) because OpenAI-shaped providers
    // take it as a BODY field, `prompt_cache_key`, for prompt-cache affinity
    sessionId,
    headers: {
      "user-agent": `fox-agent/${VERSION}`,
      "x-opencode-session": sessionId,
      "x-title": "fox-agent",
      "http-referer": "https://github.com/QQSHI13/fox-agent",
      ...cfg.headers,
    },
  };

  // Warnings a hook raises after the turn's first yield cannot be yielded from
  // where they happen (`afterTool` runs inside a Promise.all), so they queue here
  // and drain at the next point the loop is yielding anyway.
  const pendingWarnings: string[] = [];
  const hookWarn = (message: string) => {
    if (!quiet) pendingWarnings.push(message);
  };

  // surface MCP, plugin and config warnings once, at the top of the turn
  if (!quiet) for (const w of setupWarnings) yield { type: "warn", message: w };
  // the user message now has a seq — emit it so a live UI stamps the [N] marker
  // on the in-flight user line instead of waiting for the turn to settle
  if (!quiet) yield { type: "user", seq: userNode.seq, text: userText };

  /** Fire onTurnEnd everywhere the loop ends; the done event goes out after. */
  const endTurn = async (reason: string, steps: number) => {
    for (const p of hooked) {
      if (!p.hooks?.onTurnEnd) continue;
      await runHook(p, "onTurnEnd", () => p.hooks!.onTurnEnd!({ sessionId, reason, steps }), hookWarn);
    }
    return { type: "done" as const, reason };
  };

  // A steer parked while the provider call was in flight is drained at the next
  // step boundary — but an interrupt ends the turn WITHOUT reaching that boundary,
  // silently dropping the user's message. Persisting it here (as a real user node,
  // parented like a steered message) keeps it in the context so it is answered on
  // the next turn instead of vanishing. Called on every abort exit path.
  // Returns true when it drained at least one steer (so the caller can decide to
  // answer it now rather than leave it for a later turn).
  const persistParkedSteers = (parentId: string): boolean => {
    let drained = false;
    for (const text of drainSteer(sessionId)) {
      drained = true;
      appendMessage(sessionId, { parent_id: parentId, role: "user", content: text, tokens: estTok(text) });
    }
    return drained;
  };

  for (const p of hooked) {
    if (!p.hooks?.onTurnStart) continue;
    await runHook(p, "onTurnStart", () => p.hooks!.onTurnStart!({ sessionId, cwd: session.cwd, model: cfg.model, userText }), hookWarn);
  }
  if (!quiet) for (const w of pendingWarnings.splice(0)) yield { type: "warn", message: w };

  // `onSessionStart` fires when this turn's user message is the session's first,
  // which is exactly `seq === 1` — no extra state to keep, and it stays correct
  // for a session resumed in a new process.
  if (userNode.seq === 1) {
    for (const p of hooked) {
      if (!p.hooks?.onSessionStart) continue;
      await runHook(p, "onSessionStart", () => p.hooks!.onSessionStart!({ sessionId, cwd: session.cwd, model: cfg.model }), hookWarn);
    }
    if (!quiet) for (const w of pendingWarnings.splice(0)) yield { type: "warn", message: w };
  }

  // the parent of each step's assistant node: the user turn for step 1, then
  // the previous step's tool results, so the chain reflects actual lineage
  let stepParentId: string = userNode.id;

  for (let step = 1; ; step++) {
    if (signal?.aborted) {
      persistParkedSteers(stepParentId); // a steer parked mid-call must survive the interrupt
      yield await endTurn("aborted", step);
      return;
    }

    // the cap gates BEFORE steering and compaction: a steered message drained
    // here would be persisted as a user node and then left unanswered when
    // the turn ends on the cap, and a compaction would spend a billable
    // summarization call on a turn that is about to stop anyway
    if (maxSteps > 0 && step > maxSteps) {
      // A steer parked while the LAST permitted step's tool ran is still queued
      // here: the drain above only runs when there IS a step to drain it into.
      // Without this it was stranded forever — nobody drained it, the TUI kept
      // rendering "steering 1/1" under a turn that had already ended, and some
      // later turn answered it (or never did). Same persist an abort takes.
      persistParkedSteers(stepParentId);
      appendMessage(sessionId, { parent_id: null, role: "system", content: `fox-agent: step limit (${maxSteps}) reached mid-turn`, tokens: 16 });
      yield { type: "warn", message: `step limit ${maxSteps} reached` };
      yield await endTurn("max_steps", step);
      return;
    }

    // Mid-turn steering (ctrl+s in the TUI): parked user text becomes a real
    // user message here, at a step boundary — never mid-tool-call, where it
    // would split a call/result pair.
    for (const text of drainSteer(sessionId)) {
      const node = appendMessage(sessionId, { parent_id: stepParentId, role: "user", content: text, tokens: estTok(text) });
      stepParentId = node.id;
      if (!quiet) yield { type: "steered", text };
    }

    // Measure context size ONCE this step and share it with the header —
    // re-walking the view here would compute the same number twice.
    const ctxTokens = sessionContextTokens(sessionId);
    if (!quiet) yield { type: "step", n: step };

    // The harness does not compact. It measures and it reports: past the warn
    // threshold the header says so, and past the ctx-only threshold the tool
    // list is cut to `ctx` alone, because the agent's one useful move is to
    // shrink the window itself.
    const budget = checkBudget(sessionId, cfg.model, thresholds, ctxTokens);
    const ctxOnly = budget.stage === "ctxOnly";
    // `ctx` is the way out, so it is the one tool that survives the gate. A
    // registry without ctx (a reduced subagent) keeps everything instead of
    // being left with no callable tool at all — a locked door with no key is
    // worse than a full window.
    const callableTools: ToolDef[] =
      ctxOnly && tools.has("ctx") ? [tools.get("ctx")!.def] : toolDefs;
    // Step-stable by construction: identity, project instructions, tool roster
    // and doctrine. Nothing in here moves between steps, which is what lets the
    // provider cache it (loop/prompt.ts buildSystemPrompt).
    const sysPrompt = buildSystemPrompt({
      tools: callableTools,
      projectInstructions: opts.projectInstructions ?? "",
    });
    const messages = renderContext(sessionId, sysPrompt, {
      markers: effCfg.contextMarkers !== false,
      // everything that moves — cwd, date, model, version, todos, and the
      // budget figure, which moves EVERY step — rides in the tail
      trailing: buildRuntimeHeader({
        sessionId,
        cwd: session.cwd,
        model: cfg.model,
        provider: { name: cfg.label, format: cfg.provider },
        tools: callableTools,
        // the agent manages its own window, so it gets the same number the status
        // bar shows: the provider's own report, never an estimate
        budget,
      }),
    });

    // `beforeLLMCall`: additive only. The patch appends to the system message
    // rather than replacing the array, so `renderContext`'s invariant — every
    // assistant tool_call followed by its tool_result — cannot be broken by a
    // plugin. `messages` is passed for the hook to *decide* with.
    for (const p of hooked) {
      if (!p.hooks?.beforeLLMCall) continue;
      const patch = await runHook(
        p,
        "beforeLLMCall",
        () => p.hooks!.beforeLLMCall!({ sessionId, step, messages, tools: callableTools }),
        hookWarn,
      );
      const extra = patch?.appendSystem;
      if (typeof extra !== "string" || !extra.trim()) continue;
      // the system message is index 0 by construction in renderContext; appending
      // there keeps the prompt deterministic per step, so caching still works
      if (messages[0]?.role === "system") messages[0].content += `\n\n${extra.trim()}`;
      else messages.unshift({ role: "system", content: extra.trim() });
    }
    if (!quiet) for (const w of pendingWarnings.splice(0)) yield { type: "warn", message: w };

    let outcome: StepOutcome;
    try {
      outcome = yield* drainStep(chat, reqCfg, messages, callableTools, signal, opts.retryLimit ?? 3);
    } catch (e) {
      const pe = classifyProviderError(e);
      // the transcript gets the short line PLUS the diagnosis (what went wrong
      // and what to do); the full text/stack goes to messages.error so a bug is
      // still recoverable from the session
      const diag = diagnoseProviderError(pe.message, pe.status);
      const explained = diag ? `${pe.message} — ${diag.cause}; ${diag.fix}` : pe.message;
      appendMessage(sessionId, {
        parent_id: null,
        role: "system",
        content: `fox-agent: provider error: ${explained}`,
        tokens: 24,
        error: pe.detail ?? pe.message,
      });
      yield await endTurn(`error ${pe.message}`, step);
      return;
    }

    // weak models open their reply by echoing the [N] marker they saw on every
    // message; storing it would render "[13] [12] …" next step and feed the loop
    if (outcome.text) outcome.text = stripEchoedMarkers(outcome.text);

    if (outcome.finish === "aborted") {
      // esc interrupts mid-stream: keep whatever the model had produced so far —
      // a partial answer is real work, and dropping it on an interrupt used to
      // lose the turn's only output. The think block is saved too (it streams
      // before the reply and is just as much partial state as the text).
      if (outcome.reasoning.trim()) {
        appendMessage(sessionId, { parent_id: stepParentId, role: "think", content: outcome.reasoning, tokens: estTok(outcome.reasoning) });
      }
      if (outcome.text) appendMessage(sessionId, { parent_id: stepParentId, role: "assistant", content: outcome.text, tokens: estTok(outcome.text) });
      persistParkedSteers(stepParentId); // steer parked during this in-flight call
      yield await endTurn("aborted", step);
      return;
    }

    if (outcome.finish.startsWith("error")) outcome.calls = []; // never execute calls from a broken stream

    let thinkSeq = 0;
    if (outcome.reasoning.trim()) {
      // Stage 3: capture the think node's seq — the assistant event carries it
      // so a live UI can anchor the think block to the store (not a minted item)
      thinkSeq = appendMessage(sessionId, { parent_id: stepParentId, role: "think", content: outcome.reasoning, tokens: estTok(outcome.reasoning) }).seq;
    }

    // `beforeTool` resolves BEFORE the assistant node is persisted, so a guard
    // plugin's arg rewrite (or veto) lands in the stored tool_calls JSON —
    // what ran, what the transcript stores, and what `tool_end` reports are
    // one text. Persisting first and patching the local afterwards left the DB
    // holding the pre-rewrite args next to the post-rewrite result.
    const prepared: { call: ToolCall; veto?: ToolResult }[] = [];
    const preWarns: string[] = [];
    for (const call of outcome.calls) {
      let c = call;
      let veto: ToolResult | undefined;
      // The ctx-only rail is enforced HERE, not just advertised in the prompt and
      // the tool list. A model that ignores its instructions (or answers from a
      // cached step whose tool list predated the threshold) would otherwise call
      // whatever it liked at exactly the moment the window cannot take it. The
      // veto keeps tool_call/tool_result pairing intact, so the transcript stays
      // well-formed and the model reads a plain reason instead of a dead call.
      if (ctxOnly && c.name !== "ctx") {
        veto = {
          ok: false,
          output:
            `error: context window is ${Math.round(budget.ratio * 100)}% full (limit ${Math.round(thresholds.ctxOnlyAt * 100)}%) — ` +
            `every tool except ctx is disabled. Compact your view now: hide used tool output and replace large results ` +
            `with their conclusions via ctx, then continue.`,
        };
      }
      for (const p of hooked) {
        if (!p.hooks?.beforeTool) continue;
        const patch = await runHook(
          p,
          "beforeTool",
          () => p.hooks!.beforeTool!({ sessionId, name: c.name, args: safeParseArgs(c.arguments).args }),
          (message) => preWarns.push(message),
        );
        if (patch?.args !== undefined) c = { ...c, arguments: JSON.stringify(patch.args) };
        // a veto answers for the tool outright — the skipped run still lands
        // in the transcript so tool_call/tool_result pairing holds
        if (typeof patch?.output === "string") veto = { ok: true, output: patch.output };
      }
      prepared.push({ call: c, veto });
    }
    for (const w of preWarns) yield { type: "warn", message: w };

    const asstNode = appendMessage(sessionId, {
      parent_id: stepParentId,
      role: "assistant",
      content: outcome.text,
      tool_calls: prepared.length ? JSON.stringify(prepared.map((p) => p.call)) : null,
      tokens: estTok(outcome.text) + prepared.reduce((a, p) => a + estTok(p.call.arguments), 0),
    });
    if (!quiet) yield { type: "assistant", seq: asstNode.seq, thinkSeq };
    if (outcome.usage) recordUsage(sessionId, asstNode.id, outcome.usage.prompt_tokens, outcome.usage.completion_tokens, outcome.usage.cached_tokens);
    if (outcome.usage && !quiet) yield { type: "usage", ...outcome.usage };

    if (!prepared.length) {
      // A steer parked during this call (ctrl+s, a background task finishing)
      // deserves an ANSWER, not just a save. `continue` re-enters the loop: the
      // top-of-loop drain persists the steer and emits `steered`, and the next
      // call answers it. This is the "steer at end of turn" fix — keep taking
      // steps while a steer is waiting, instead of peeking once and stranding a
      // steer that arrives after the final reply resolved. The cap still bounds
      // it: an over-cap turn ends without consuming the steer.
      if (peekSteer(sessionId).length > 0 && (maxSteps <= 0 || step + 1 <= maxSteps)) continue;
      // A steer can arrive in the window between the peek above and the turn's
      // return. Re-peek rather than persist-and-continue: `persistParkedSteers`
      // DRAINS the queue, so a `continue` after it finds nothing at the top of
      // the loop — the steer was persisted as an orphan user node and answered
      // only by a later turn (the "my steer was ignored" bug). Re-peeking lets
      // `continue` reach the top-of-loop drain, which injects it as a real
      // step-boundary user message AND emits `steered`, so the next call
      // answers it in this turn.
      if (peekSteer(sessionId).length > 0 && (maxSteps <= 0 || step + 1 <= maxSteps)) continue;
      // A background job can finish on the macrotask right AFTER the reply
      // resolved — its completion steer queues a tick later than the synchronous
      // peeks above, so they miss it and the turn ends with the notification
      // stranded (the "steering isn't sent" report). Yield one macrotask before
      // giving up so a just-finished job's steer lands, then re-check once.
      await new Promise((r) => setTimeout(r, 0));
      if (peekSteer(sessionId).length > 0 && (maxSteps <= 0 || step + 1 <= maxSteps)) continue;
      // Actually ending (no steer, or the cap refuses the extra step): persist
      // whatever is parked so it survives to be answered next turn.
      persistParkedSteers(asstNode.id);
      yield await endTurn(outcome.finish.startsWith("error") ? outcome.finish : outcome.finish || "stop", step);
      return;
    }

    // ---- execute all calls in parallel; failures isolated per call ----
    // announce every call before awaiting any of them, so consumers can show
    // work as in-flight rather than only after the whole batch settles
    for (const { call } of prepared) {
      yield { type: "tool_start", id: call.id, name: call.name, args: eventArgs(call.arguments) };
    }

    const liveEvents = new EventQueue();
    const settled = Promise.all(
      prepared.map(async ({ call, veto }) => {
        let res: ToolResult | undefined = veto;
        res ??= await execToolCall(call, tools, {
          sessionId,
          cwd: session.cwd,
          signal,
          providerCfg: cfg,
          agents,
          tools,
          lsp: effCfg.lsp,
          diagnostics: effCfg.diagnostics,
          emit: quiet ? undefined : liveEvents.push,
          callId: call.id,
          ui: opts.ui,
          get pty() {
            return ptyState;
          },
          set pty(v: PtyState | undefined) {
            ptyState = v;
          },
        } satisfies ToolContext);

        // `afterTool` runs HERE — after the tool, before appendMessage. That
        // ordering is the point: the patched output becomes the only version in
        // the system, so what the transcript stores, what the model reads on the
        // next step, and what `tool_end` reports are all the same text. Patching
        // after the append would leave the DB holding the unpatched output and
        // the model seeing it on every subsequent step.
        for (const p of hooked) {
          if (!p.hooks?.afterTool) continue;
          const patch = await runHook(
            p,
            "afterTool",
            () => p.hooks!.afterTool!({ sessionId, name: call.name, args: safeParseArgs(call.arguments).args, ok: res.ok, output: res.output }),
            // a warning from inside this closure cannot be yielded, so it takes
            // the same route a tool's own progress does
            (message) => liveEvents.push({ type: "warn", message }),
          );
          if (typeof patch?.output === "string") res.output = patch.output;
        }

        const node = appendMessage(sessionId, {
          parent_id: asstNode.id,
          role: "tool",
          content: res.output,
          tool_call_id: call.id,
          media: res.media?.length ? JSON.stringify(res.media) : undefined,
          // media is billed at a flat estimate: chars/4 of base64 would report
          // ~3/4 of the raw file size as "tokens", drowning the real figure
          tokens: estTok(res.output) + (res.media?.length ?? 0) * 1500,
          error: res.ok ? null : res.output.slice(0, 200),
        });

        // Presentation truncation, as a VIEW op rather than a rewrite: the row
        // above keeps `res.output` whole, and this op makes the model (and the
        // transcript) read a head+tail excerpt of it. The original is never
        // lost — `ctx restore` re-exposes it, and so does /undo.
        //
        // An op, not a smaller stored string, for three reasons: storage stays
        // append-only and replay stays deterministic; the budget is config, so
        // changing it must not require rewriting history; and the model needs
        // to be able to UNDO it, which is exactly what the existing op log
        // already supports for the ctx tool.
        //
        // `version` records which policy produced the text, so a session
        // truncated by an older policy is identifiable (and re-derivable).
        const trunc = truncateToolResult(call.name, res.output, presentationCap);
        if (trunc) {
          appendOps(sessionId, [{ kind: "replace", id: node.seq, content: trunc.text, version: trunc.version }]);
          // the model reads the view, not the row, so the truncated text is
          // what must ALSO ride tool_end — otherwise the live UI shows the
          // full body while the next step sees the excerpt
          res.output = trunc.text;
        }
        return { call, node, res };
      }),
    );

    // Interleave whatever the tools emit with waiting for them, rather than
    // awaiting `settled` and flushing at the end — the latter would show a
    // delegated agent's whole run in one burst after it had finished.
    const finished = settled.finally(() => liveEvents.close());

    // An interrupt must not wait on the tools. exec, fetch and task honor
    // ctx.signal, but a tool that does not — an LSP server call with a cold
    // start, a question wizard waiting on the user, any plugin code — leaves the
    // turn pinned to its full runtime. ESC then looked broken: the tool kept
    // running, nothing was appended, and the UI sat on an in-flight call the
    // user had already told it to stop. So the abort is RACED here: it ends the
    // turn, and the orphaned tool keeps running detached (its own cleanup still
    // fires) but can no longer hold the loop.
    if (signal) {
      // raced by VALUE, not by mutating a flag: assigning inside a .then()
      // defeats control-flow analysis, so a `winner` variable would be typed
      // as the literal "tools" at the read and the comparison would not compile
      const outcome = await Promise.race([
        finished.then(() => "tools" as const),
        whenAborted(signal).then(() => "abort" as const),
      ]);
      if (outcome === "abort") {
        liveEvents.close();
        persistParkedSteers(asstNode.id);
        yield await endTurn("aborted", step);
        return;
      }
    }

    while (!liveEvents.done) {
      await liveEvents.ready();
      for (const ev of liveEvents.drain()) yield ev;
    }
    const results = await finished;

    for (const { call, node, res } of results) {
      yield { type: "tool_end", id: call.id, seq: node.seq, name: call.name, args: eventArgs(call.arguments), output: res.output, ok: res.ok };
    }

    // next step's assistant hangs off the last tool result of this step
    stepParentId = results[results.length - 1]?.node.id ?? asstNode.id;

    if (signal?.aborted) {
      yield await endTurn("aborted", step);
      return;
    }
  }
}
