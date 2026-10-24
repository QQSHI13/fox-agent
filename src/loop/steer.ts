/**
 * Turns and steering — owner of "what the agent does next" for a session.
 *
 * A steered message is a normal user message that arrived while the agent was
 * busy (or between turns), so this module treats it as exactly that: text goes
 * on the session's queue, and this module makes sure a turn consumes it. No
 * client decides whether a turn happens; a client only says how to *render*
 * one and how to reach the model (see `SessionHost`).
 *
 * Why the lifecycle lives here and not in the clients
 * ---------------------------------------------------
 * Six fixes in 19 commits went into "a steered message never arrives"
 * (a0b3cd6, 9db7e32, 9bbd1a4, 841f6f2, b132b88, d5db285, d18317b/a84f63a,
 * eabab95 → reverted by bb8a6f4, 918745d, b4b2d5b). Every one of them patched
 * the window it was reported from, because the queue was written by anyone,
 * drained only by a running turn, and left ownerless while idle. One of them
 * (eabab95) even tried starting a turn from a client — and was reverted
 * because it re-entered the *turn* from inside the turn's own `finally`.
 *
 * The durable shape is the opposite: the queue, the turn registry, the
 * dispatch decision and the turn driver are all here, in core; the client
 * supplies a render sink and a provider. Re-entrancy is avoided structurally —
 * dispatch runs from a macrotask and is guarded by `running`.
 *
 * Invariants
 * ----------
 * 1. A steer is never dropped. Delivery either happens or the text is put
 *    back with `requeueSteer`; `failTurn` does the latter.
 * 2. Exactly one drainer acts on a given steer: draining is atomic, and
 *    dispatch is suppressed while `running`.
 * 3. A session is QUIESCENT only when no turn runs, no steer is queued and no
 *    background job is live. One-shot clients (ACP prompt, A2A send) and
 *    `--print` wait for that before finishing — see `waitQuiescent`.
 */
import { debugWarn } from "../core/debuglog.ts";
import type { AgentEvent } from "../core/events.ts";
import type { Config } from "../core/config.ts";
import type { UiBridge } from "../core/ui.ts";
import type { ProviderConfig, ChatFn } from "../providers/types.ts";
import { runTurnCore } from "./turn.ts";

const pending = new Map<string, string[]>();

/** Queue text for this session's agent. Starts a turn if none is running. */
export function steer(sessionId: string, text: string): void {
  push(sessionId, text);
  // asking again is the right retry signal after a failed dispatch
  blocked.delete(sessionId);
  pump(sessionId);
}

/**
 * Snapshot of this session's still-undelivered steers, oldest first.
 *
 * A UI renders these above its input dock so a steered message stays visible
 * until it is consumed. Read-only: a drainer must use `drainSteer`, which is
 * the atomic claim (peeking and then taking can race another drainer).
 */
export function peekSteer(sessionId: string): string[] {
  const q = pending.get(sessionId);
  return q ? [...q] : [];
}

/** True without allocating — for a per-frame poll. */
export function hasSteer(sessionId: string): boolean {
  return (pending.get(sessionId)?.length ?? 0) > 0;
}

/**
 * Withdraw the most recently steered message (the back of the queue) before a
 * turn consumes it, so a UI can hand it back to the editor. Undefined when
 * there is nothing to withdraw — the queue is empty, or a turn already drained
 * it into the context.
 */
export function withdrawSteer(sessionId: string): string | undefined {
  const q = pending.get(sessionId);
  if (!q?.length) return undefined;
  const text = q.pop();
  if (!q.length) pending.delete(sessionId);
  return text;
}

/**
 * Atomically take everything steered since the last claim. The caller owns the
 * returned texts and must deliver them, or put them back with `requeueSteer`.
 */
export function drainSteer(sessionId: string): string[] {
  const q = pending.get(sessionId);
  if (!q?.length) return [];
  pending.delete(sessionId);
  return q;
}

/** Put texts back at the FRONT of the queue (a failed delivery, oldest first). */
export function requeueSteer(sessionId: string, texts: string[]): void {
  if (!texts.length) return;
  const q = pending.get(sessionId) ?? [];
  pending.set(sessionId, [...texts, ...q]);
}

// ---- session hosts: how to talk to the model, and where output goes -------

/**
 * What a client contributes to a session it owns.
 *
 * Deliberately narrow: the client does not decide *if* or *when* a turn runs,
 * only how one is rendered (`sink`) and how the model is reached (`provider`,
 * `chat`). Provider is a thunk because the TUI's `/model` and `/login` replace
 * it live — a captured copy would keep calling the old endpoint forever.
 */
export interface SessionHost {
  provider: () => ProviderConfig;
  config?: () => Config | undefined;
  chat?: ChatFn;
  ui?: UiBridge;
  /**
   * Drive one turn and yield its events. The client supplies this when it needs
   * to do its own work around the turn (the TUI renders incrementally and owns
   * its dock; ACP maps events to protocol notifications). Omit it and core runs
   * `runTurnCore` directly with `provider`/`config` — which is what a headless
   * client wants.
   *
   * Whatever it returns MUST be the same `runTurnCore` event stream: core relies
   * on `done`/`steered` semantics and on the turn registry inside runTurnCore.
   */
  turn?: (text: string, ctl: AbortController) => AsyncIterable<AgentEvent>;
  /** Render one turn event (used only when `turn` is omitted). */
  sink?: (ev: AgentEvent) => void;
  /** A turn is about to start (the client paints its own busy state). */
  onTurnStart?: (text: string) => void;
  /** A turn finished; `reason` is the `done` event's reason. */
  onTurnEnd?: (reason: string, error?: unknown) => void;
}

const hosts = new Map<string, SessionHost>();

/** Attach a client to a session. Starts a turn if a steer is already waiting. */
export function attachHost(sessionId: string, host: SessionHost): void {
  hosts.set(sessionId, host);
  pump(sessionId);
}

export function detachHost(sessionId: string): void {
  hosts.delete(sessionId);
  blocked.delete(sessionId);
  dispatching.delete(sessionId);
}

// ---- turn registry -------------------------------------------------------

/**
 * Turns in flight per session, by depth.
 *
 * Counted, not a set: everything between `runTurnCore` and the caller can nest
 * — a host's own `turn` implementation usually *wraps* `runTurnCore`, and
 * `startTurn` brackets the whole dispatch itself. With a set, the inner release
 * would clear the flag while the outer turn was still running, which is exactly
 * how a second turn could start on top of a live one.
 */
const running = new Map<string, number>();
const controllers = new Map<string, AbortController>();

export function turnStarted(sessionId: string): void {
  running.set(sessionId, (running.get(sessionId) ?? 0) + 1);
  dispatching.delete(sessionId); // this turn will drain whatever is parked
}

export function turnEnded(sessionId: string): void {
  const n = (running.get(sessionId) ?? 0) - 1;
  if (n > 0) {
    running.set(sessionId, n);
    return;
  }
  running.delete(sessionId);
  controllers.delete(sessionId);
  // a steer that arrived after the turn's last step boundary has no turn left
  // to reach — start one for it
  pump(sessionId);
  checkQuiescent(sessionId);
}

export function turnRunning(sessionId: string): boolean {
  return (running.get(sessionId) ?? 0) > 0;
}

/**
 * Adopt an externally created controller as the session's interrupt handle.
 *
 * A client that starts a turn itself (`session/prompt` in ACP) unifies two
 * cancellation sources — the protocol's `session/cancel` and the request's own
 * signal — into one controller it owns. Registering it here means `abortTurn`
 * reaches that turn too, so every cancel path is one call rather than each
 * client keeping its own map.
 */
export function adoptTurnController(sessionId: string, ctl: AbortController): void {
  controllers.set(sessionId, ctl);
}

/**
 * Abort the running turn for this session, if any. Here rather than in each
 * client so a cancel path (TUI esc, ACP `session/cancel`, A2A watchdog) is one
 * implementation.
 */
export function abortTurn(sessionId: string, reason = "cancelled"): boolean {
  const ctl = controllers.get(sessionId);
  if (!ctl) return false;
  debugWarn("turn", `aborting ${sessionId}: ${reason}`);
  ctl.abort();
  return true;
}

// ---- background work -----------------------------------------------------
//
// A session is not finished while a background job is still running: the job
// will steer on completion, which is what wakes the agent up. The counter
// lives here (not in the repl tool) so quiescence is one predicate, and so the
// repl can report its own lifecycle without this module importing it.

const background = new Map<string, number>();

export function backgroundStarted(sessionId: string): void {
  background.set(sessionId, (background.get(sessionId) ?? 0) + 1);
}

export function backgroundEnded(sessionId: string): void {
  const n = (background.get(sessionId) ?? 0) - 1;
  if (n > 0) background.set(sessionId, n);
  else background.delete(sessionId);
  checkQuiescent(sessionId);
}

export function backgroundCount(sessionId: string): number {
  return background.get(sessionId) ?? 0;
}

// ---- quiescence ----------------------------------------------------------

/**
 * Nothing left to do: no turn, no queued steer, no live background job.
 *
 * One-shot surfaces wait for this before finishing. `fox -p`, an ACP prompt and
 * an A2A `message/send` all want the same semantics — "answer, and keep going
 * while the answer is still producing work" — and that is exactly this
 * predicate, so it cannot drift between them.
 */
export function isQuiescent(sessionId: string): boolean {
  return !turnRunning(sessionId) && !hasSteer(sessionId) && backgroundCount(sessionId) === 0 && !dispatching.has(sessionId);
}

const quiesceWaiters = new Map<string, Array<() => void>>();

/** Resolve once the session is quiescent (immediately if it already is). */
export function waitQuiescent(sessionId: string): Promise<void> {
  if (isQuiescent(sessionId)) return Promise.resolve();
  return new Promise<void>((resolve) => {
    const list = quiesceWaiters.get(sessionId) ?? [];
    list.push(resolve);
    quiesceWaiters.set(sessionId, list);
  });
}

function checkQuiescent(sessionId: string): void {
  if (!isQuiescent(sessionId)) return;
  const waiters = quiesceWaiters.get(sessionId);
  if (!waiters?.length) return;
  quiesceWaiters.delete(sessionId);
  for (const resolve of waiters) resolve();
}

/**
 * Drop every trace of a session. Undelivered text is RETURNED, not silently
 * discarded — the caller decides whether to persist it or report it.
 */
export function releaseSteer(sessionId: string): string[] {
  const left = drainSteer(sessionId);
  hosts.delete(sessionId);
  running.delete(sessionId);
  controllers.delete(sessionId);
  dispatching.delete(sessionId);
  blocked.delete(sessionId);
  background.delete(sessionId);
  const waiters = quiesceWaiters.get(sessionId);
  quiesceWaiters.delete(sessionId);
  for (const resolve of waiters ?? []) resolve();
  return left;
}

// ---- dispatch ------------------------------------------------------------

/** A session whose last dispatch threw: do not spin on it. */
const blocked = new Set<string>();
/** Sessions with a dispatch already scheduled — one pump at a time. */
const dispatching = new Set<string>();

function push(sessionId: string, text: string): void {
  const q = pending.get(sessionId);
  if (q) q.push(text);
  else pending.set(sessionId, [text]);
}

/**
 * Ensure something will consume the queue: a running turn already will (it
 * drains at its next step boundary), otherwise start one.
 *
 * Runs on a macrotask, never inline. `steer` is called from a tool completion
 * (repl), a key handler (TUI ctrl+s) and the turn loop's own exit path, so
 * inline work here would re-enter the turn machinery mid-frame — the exact
 * failure that got eabab95 reverted. The delay also lets a steer landing
 * during a turn's final peeks be picked up by that turn.
 */
function pump(sessionId: string): void {
  if (turnRunning(sessionId)) return; // a turn owns the queue
  if (dispatching.has(sessionId)) return;
  if (blocked.has(sessionId)) return;
  if (!hasSteer(sessionId)) return;
  if (!hosts.has(sessionId)) return; // nobody to render it yet: stay queued
  dispatching.add(sessionId);
  setTimeout(() => {
    dispatching.delete(sessionId);
    // re-check: the world moved during the macrotask
    if (turnRunning(sessionId) || blocked.has(sessionId) || !hasSteer(sessionId)) {
      checkQuiescent(sessionId);
      return;
    }
    void startTurn(sessionId);
  }, 0);
}

/**
 * Drain the queue into one turn and drive it.
 *
 * This is the ONLY place a turn starts without a client asking for it, and it
 * is why core — not the client — owns the decision. Steered text is a normal
 * user message: `runTurnCore` persists it as a user node and (with `quiet`
 * unset) emits the `user` event, so every client renders it the same way it
 * renders a typed message.
 */
async function startTurn(sessionId: string): Promise<void> {
  const host = hosts.get(sessionId);
  if (!host || turnRunning(sessionId)) return;
  const texts = drainSteer(sessionId);
  if (!texts.length) {
    checkQuiescent(sessionId);
    return;
  }
  const text = texts.join("\n");
  const ctl = new AbortController();
  controllers.set(sessionId, ctl);
  const cfg = host.config?.();
  let reason = "stop";
  host.onTurnStart?.(text);
  // Bracket the WHOLE dispatch, not just runTurnCore: a host may supply its own
  // `turn` generator (the TUI and ACP do), and a turn nobody registered is a
  // turn whose session looks idle — the precondition for a second one starting.
  turnStarted(sessionId);
  try {
    const stream =
      host.turn?.(text, ctl) ??
      runTurnCore(sessionId, host.provider(), text, ctl.signal, {
        maxSteps: cfg?.maxSteps,
        retryLimit: cfg?.retryLimit,
        compactWarnAt: cfg?.compactWarnAt,
        compactCtxOnlyAt: cfg?.compactCtxOnlyAt,
        projectInstructions: cfg?.projectInstructions,
        config: cfg,
        chat: host.chat,
        ui: host.ui,
      });
    for await (const ev of stream) {
      if (ev.type === "done") reason = ev.reason;
      if (!host.sink) continue;
      try {
        host.sink(ev);
      } catch (e) {
        // a broken renderer must not eat the turn's remaining events
        debugWarn("tui", `sink threw for ${sessionId}: ${(e as Error)?.message ?? e}`);
      }
    }
  } catch (e) {
    // Delivery failed: put the text back so it is answered later, and stop
    // retrying until something changes (a new steer, or a new host).
    requeueSteer(sessionId, texts);
    blocked.add(sessionId);
    host.onTurnEnd?.("error", e);
    debugWarn("turn", `steered turn failed for ${sessionId}: ${(e as Error)?.message ?? e}`);
    checkQuiescent(sessionId);
    return;
  } finally {
    turnEnded(sessionId);
  }
  host.onTurnEnd?.(reason);
  // turnEnded() (inside runTurnCore's finally) already pumped; check again so
  // a waiter that arrived during the last step is not left hanging
  checkQuiescent(sessionId);
}
