/**
 * Idle-progress watchdog for provider streams.
 *
 * The failure this exists for: a provider accepts the TCP connection and then
 * never sends a byte. Without a clock the turn hangs forever — the TUI's
 * `finally { setBusy(false) }` never runs and the status bar sticks on
 * "thinking" with no way out but ESC.
 *
 * The clock measures time *without progress*, not total duration. A reasoning
 * model streaming for ten minutes is healthy as long as parts keep arriving;
 * one that goes quiet past the window is not. A total-duration cap would kill
 * long legitimate answers mid-sentence.
 */
import { ProviderTimeoutError } from "../core/errors.ts";

export interface Watchdog {
  /** Pass to the SDK as `abortSignal` — fires on caller abort OR idle timeout. */
  readonly signal: AbortSignal | undefined;
  /** Call on every streamed part to rearm the timer. */
  progress(): void;
  /** True when we aborted for idleness (not the user). Check BEFORE signal.aborted. */
  readonly timedOut: boolean;
  /** The error to throw when timedOut. */
  error(): ProviderTimeoutError;
  /** Always call in a finally — an armed timer keeps the process alive. */
  done(): void;
}

export function startWatchdog(idleMs: number | undefined, caller?: AbortSignal): Watchdog {
  // 0/undefined disables the timeout; then we just pass the caller's signal through
  if (!idleMs || idleMs <= 0) {
    return {
      signal: caller,
      progress() {},
      timedOut: false,
      error: () => new ProviderTimeoutError(0),
      done() {},
    };
  }

  const ac = new AbortController();
  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const arm = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timedOut = true;
      ac.abort();
    }, idleMs);
    // don't hold the event loop open on our account
    (timer as { unref?: () => void }).unref?.();
  };
  arm();

  // AbortSignal.any lets the caller's ESC still win. Without it, forward the
  // caller's abort into ours by hand — returning `caller` alone would silently
  // drop the timeout, which is the whole point of this module.
  let unlink: (() => void) | null = null;
  let signal: AbortSignal;
  if (!caller) signal = ac.signal;
  else if (typeof AbortSignal.any === "function") signal = AbortSignal.any([caller, ac.signal]);
  else {
    const onAbort = () => ac.abort();
    if (caller.aborted) ac.abort();
    else {
      caller.addEventListener("abort", onAbort, { once: true });
      unlink = () => caller.removeEventListener("abort", onAbort);
    }
    signal = ac.signal;
  }

  return {
    signal,
    progress: arm,
    get timedOut() {
      return timedOut;
    },
    error: () => new ProviderTimeoutError(idleMs),
    done() {
      if (timer) clearTimeout(timer);
      timer = null;
      unlink?.();
      unlink = null;
    },
  };
}
