/**
 * Timers that do not lie about long durations.
 *
 * `setTimeout` stores its delay in a signed 32-bit int: anything above
 * 2_147_483_647 ms (~24.8 days) overflows and fires after **1 ms** instead —
 * with only a `TimeoutOverflowWarning` on stderr to show for it. A tool that
 * accepts a caller-chosen timeout (`repl`'s `timeout_ms`, `exec`'s) therefore
 * cannot simply hand the number to `setTimeout`: a huge budget meant "wait
 * forever" and turns into "fail instantly", which is the opposite of what the
 * caller asked for.
 *
 * `setLongTimeout` arms a chain of bounded timers, so the deadline is honoured
 * at any magnitude. The returned handle clears whichever hop is pending.
 */

/** The largest delay `setTimeout` honours without overflow. */
export const MAX_DELAY_MS = 2_147_483_647;

export interface LongTimeout {
  /** Cancel the pending hop. Safe to call after it fired. */
  clear: () => void;
  /** Same contract as a Node timer: don't keep the event loop alive for it. */
  unref: () => void;
}

/**
 * `setTimeout`, but correct for `ms > MAX_DELAY_MS`.
 *
 * Deadlines are measured against `Date.now()` at each hop rather than counted
 * down blindly, so a long chain cannot drift past its target.
 */
export function setLongTimeout(fn: () => void, ms: number): LongTimeout {
  let handle: ReturnType<typeof setTimeout> | undefined;
  let cleared = false;
  const deadline = Date.now() + Math.max(0, ms);
  let unrefWanted = false;

  const arm = () => {
    if (cleared) return;
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      handle = undefined;
      fn();
      return;
    }
    // one bounded hop: step the clock forward at most MAX_DELAY_MS at a time
    handle = setTimeout(() => arm(), Math.min(remaining, MAX_DELAY_MS));
    if (unrefWanted) (handle as { unref?: () => void }).unref?.();
  };
  arm();

  return {
    clear: () => {
      cleared = true;
      if (handle !== undefined) clearTimeout(handle);
      handle = undefined;
    },
    unref: () => {
      unrefWanted = true;
      if (handle !== undefined) (handle as { unref?: () => void }).unref?.();
    },
  };
}

/**
 * A delay `setTimeout` can actually honour. Callers that pass a budget straight
 * to `setTimeout` (or to `vm`'s `timeout`, which has the same limit) use this to
 * clamp to the ceiling; `setLongTimeout` is the better answer when the full
 * duration matters.
 */
export function safeDelay(ms: number): number {
  return Math.min(Math.max(0, ms), MAX_DELAY_MS);
}
