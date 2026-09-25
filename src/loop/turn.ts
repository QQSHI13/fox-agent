import { appendMessage, getSession, recordUsage } from "../store/db.ts";
import type { ProviderConfig, ChatMessage, ToolDef, ToolCall, ChatFn } from "../providers/types.ts";
import { resolveChat } from "../providers/index.ts";
import { classifyProviderError, FoxError, isTimeout } from "../core/errors.ts";
import type { AgentEvent } from "../core/events.ts";
import type { Tool, ToolContext, ToolResult, PtyState } from "../tools/types.ts";
import { outCap } from "../tools/files.ts";
import { buildRegistry } from "../tools/index.ts";
import { drainSteer, peekSteer } from "./steer.ts";
import { VERSION } from "../core/version.ts";
import type { Config } from "../core/config.ts";
import { defaultConfig } from "../core/config.ts";
import type { FoxPlugin } from "../plugins/types.ts";
import { loadPlugins } from "../plugins/load.ts";
import type { UiBridge } from "../core/ui.ts";
import { buildSystemPrompt } from "./prompt.ts";
import { renderContext, stripEchoedMarkers } from "../context/render.ts";
import { compactIfNeeded } from "../context/compact.ts";
import { checkBudget } from "../context/budget.ts";

export interface TurnOptions {
  maxSteps?: number;
  retryLimit?: number;
  compactAt?: number;
  /** suppress step/retry/compaction chatter (subagents) */
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
  usage: { prompt_tokens: number; completion_tokens: number } | null;
  finish: string;
  reasoning: string;
}

const estTok = (s: string) => Math.ceil(s.length / 4);

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
      else if (ev.type === "usage") acc.usage = { prompt_tokens: ev.prompt_tokens, completion_tokens: ev.completion_tokens };
      else if (ev.type === "done") acc.finish = ev.reason;
    }
  };

  for (let n = 0; ; n++) {
    try {
      if (n > 0) acc.text = "", (acc.calls = []), (acc.usage = null), (acc.finish = ""), (acc.reasoning = ""); // a retry re-streams from zero — a kept accumulator duplicated reasoning into the persisted think node
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
      const emitted = acc.text.length > 0 || acc.calls.length > 0;
      if (!pe.retriable || n >= retryLimit || emitted) {
        if (emitted) return { ...acc, finish: `error: ${pe.message}` }; // keep partials
        throw pe;
      }
      // compute the backoff first so the event reports the real wait
      const delay = Math.min(8_000, 500 * 2 ** n) + Math.floor(Math.random() * 250);
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
  const required = (def.parameters?.required as string[] | undefined) ?? [];
  if (!required.length) return null;
  if (!args || typeof args !== "object") return `arguments must be a JSON object`;
  for (const key of required) if (args[key] === undefined) return `missing required argument "${key}"`;
  return null;
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
  if (!tool) return { ok: false, output: `error: unknown tool ${call.name}` };

  const { args, error: parseErr } = safeParseArgs(call.arguments);
  if (parseErr) return { ok: false, output: `error: ${parseErr} for ${call.name}; send valid JSON matching the schema` };
  const reqErr = missingRequired(tool.def, args);
  if (reqErr) return { ok: false, output: `error: ${call.name}: ${reqErr}` };

  try {
    const r = await tool.run(args, tctx);
    const result = typeof r === "string" ? { ok: true, output: r } : r;
    const output = result.output.length > outCap() * 2 ? result.output.slice(-outCap() * 2) : result.output; // tail-cap
    return { ok: result.ok, output, media: result.media };
  } catch (e) {
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
    compactAt: opts.compactAt ?? 0.85,
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

export async function* runTurnCore(
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
      const { setCustomProviders } = await import("../providers/index.ts");
      const custom = new Map();
      for (const p of plugins) {
        for (const [name, fn] of Object.entries(p.providers ?? {})) {
          if (typeof fn === "function") custom.set(name, fn);
        }
      }
      setCustomProviders(custom);
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
    tools.delete("ctx_edit");
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
  const quiet = opts.quiet ?? false;

  // Every provider request identifies itself and its conversation: gateways
  // (opencode's among them) route and cache on these. The user's own
  // [providers.*] headers win over both.
  const reqCfg: ProviderConfig = {
    ...cfg,
    headers: {
      "user-agent": `fox-agent/${VERSION}`,
      "x-opencode-session": sessionId,
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

  /** Fire onTurnEnd everywhere the loop ends; the done event goes out after. */
  const endTurn = async (reason: string, steps: number) => {
    for (const p of hooked) {
      if (!p.hooks?.onTurnEnd) continue;
      await runHook(p, "onTurnEnd", () => p.hooks!.onTurnEnd!({ sessionId, reason, steps }), hookWarn);
    }
    return { type: "done" as const, reason };
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
      yield await endTurn("aborted", step);
      return;
    }

    // the cap gates BEFORE steering and compaction: a steered message drained
    // here would be persisted as a user node and then left unanswered when
    // the turn ends on the cap, and a compaction would spend a billable
    // summarization call on a turn that is about to stop anyway
    if (maxSteps > 0 && step > maxSteps) {
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

    // compaction is not chatter — subagents need it too or they hard-fail on
    // a full window. Only the *event* is suppressed when quiet.
    const cEv = await compactIfNeeded(sessionId, reqCfg, chat, { compactAt: opts.compactAt, signal }).catch(() => null);
    if (!quiet) {
      if (cEv && cEv.type === "compacted" && cEv.removed.length) yield cEv;
      yield { type: "step", n: step };
    }

    const sysPrompt = buildSystemPrompt({
      sessionId,
      cwd: session.cwd,
      model: cfg.model,
      tools: toolDefs,
      projectInstructions: opts.projectInstructions ?? "",
      // the agent manages its own window, so it gets the same number the status
      // bar shows: the provider's own report, never an estimate
      budget: checkBudget(sessionId, cfg.model, 0, opts.compactAt ?? 0.85),
    });
    const messages = renderContext(sessionId, sysPrompt, { markers: effCfg.contextMarkers !== false });

    // `beforeLLMCall`: additive only. The patch appends to the system message
    // rather than replacing the array, so `renderContext`'s invariant — every
    // assistant tool_call followed by its tool_result — cannot be broken by a
    // plugin. `messages` is passed for the hook to *decide* with.
    for (const p of hooked) {
      if (!p.hooks?.beforeLLMCall) continue;
      const patch = await runHook(
        p,
        "beforeLLMCall",
        () => p.hooks!.beforeLLMCall!({ sessionId, step, messages, tools: toolDefs }),
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
      outcome = yield* drainStep(chat, reqCfg, messages, toolDefs, signal, opts.retryLimit ?? 3);
    } catch (e) {
      const pe = classifyProviderError(e);
      // the transcript gets the short line; the full text/stack goes to
      // messages.error so a bug is still recoverable from the session
      appendMessage(sessionId, {
        parent_id: null,
        role: "system",
        content: `fox-agent: provider error: ${pe.message}`,
        tokens: 24,
        error: pe.detail ?? pe.message,
      });
      yield await endTurn(`error ${pe.message}`, step);
      return;
    }

    // weak models open their reply by echoing the [mN] marker they saw on every
    // message; storing it would render "[m13] [m12] …" next step and feed the loop
    if (outcome.text) outcome.text = stripEchoedMarkers(outcome.text);

    if (outcome.finish === "aborted") {
      if (outcome.text) appendMessage(sessionId, { parent_id: stepParentId, role: "assistant", content: outcome.text, tokens: estTok(outcome.text) });
      yield await endTurn("aborted", step);
      return;
    }

    if (outcome.finish.startsWith("error")) outcome.calls = []; // never execute calls from a broken stream

    if (outcome.reasoning.trim()) {
      appendMessage(sessionId, { parent_id: stepParentId, role: "think", content: outcome.reasoning, tokens: estTok(outcome.reasoning) });
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
    if (outcome.usage) recordUsage(sessionId, asstNode.id, outcome.usage.prompt_tokens, outcome.usage.completion_tokens);
    if (outcome.usage && !quiet) yield { type: "usage", ...outcome.usage };

    if (!prepared.length) {
      // A steer parked during this final provider call (ctrl+s, or a background
      // task finishing) would sit undelivered if the turn ended here — the
      // drain at the top of the loop only runs when there IS a next step. Peek
      // instead: steered text deserves an answer, so fall through to one more
      // step (the top-of-loop drain persists it and emits `steered`). The cap
      // is still honored — an over-cap turn ends without consuming the steer.
      const steeredWaiting = peekSteer(sessionId).length > 0;
      const capOk = maxSteps <= 0 || step + 1 <= maxSteps;
      if (steeredWaiting && capOk) continue;
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
        return { call, node, res };
      }),
    );

    // Interleave whatever the tools emit with waiting for them, rather than
    // awaiting `settled` and flushing at the end — the latter would show a
    // delegated agent's whole run in one burst after it had finished.
    const finished = settled.finally(() => liveEvents.close());
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
