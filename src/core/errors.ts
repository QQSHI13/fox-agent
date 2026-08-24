export class FoxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** A tool failed; message is shown back to the model. */
export class ToolError extends FoxError {}

/** Invalid user/harness configuration. */
export class ConfigError extends FoxError {}

/** Provider/transport failure. `retriable` drives loop retry policy. */
export class ProviderError extends FoxError {
  constructor(
    message: string,
    readonly status?: number,
    readonly retriable = false,
    /**
     * Full untruncated text (and stack, for internal errors) for the session
     * log. `message` is what the transcript shows; this is what you read when
     * filing a bug. Persisted to messages.error.
     */
    readonly detail?: string,
  ) {
    super(message);
  }
}

/**
 * A timeout we raised ourselves because the provider went quiet. Distinct from
 * an AbortError: the user did not interrupt anything, so the turn must retry
 * rather than end as "aborted".
 */
export class ProviderTimeoutError extends ProviderError {
  constructor(idleMs: number) {
    super(`provider timed out after ${Math.round(idleMs / 1000)}s with no response`, undefined, true);
  }
}

export const isTimeout = (e: unknown): e is ProviderTimeoutError => e instanceof ProviderTimeoutError;

const RETRIABLE_PATTERNS = [
  /429/,
  /rate.?limit/i,
  /too many requests/i,
  /overloaded/i,
  /timeout/i,
  /timed out/i,
  /econnreset/i,
  /econnrefused/i,
  /epipe/i,
  /socket hang ?up/i,
  /fetch failed/i,
  /network/i,
  /\b50[234]\b/,
  // transport failures Bun/undici actually produce. Without these the most
  // common mid-stream disconnects were classified permanent and never retried.
  /socket connection was closed/i,
  /connection closed/i,
  /stream (was )?closed/i,
  /other side closed/i,
  /premature close/i,
  /^terminated$/i,
  /etimedout/i,
  /ehostunreach/i,
  /enetunreach/i,
  /eai_again/i,
];

/** Programmer errors — a bug in fox, not a provider fault. */
const INTERNAL_NAMES = new Set(["TypeError", "ReferenceError", "SyntaxError", "RangeError"]);

/** SDK debugging tails that are noise in a chat transcript. */
const NOISE = [
  // note: does not consume the preceding "." — that period terminates the real
  // message and dropping it leaves a sentence with no end
  /\s*For more information,? pass `?verbose: true`?[^.]*\.?/gi,
  /\s*\(see https?:\/\/\S+\)/gi,
];

const clean = (s: string): string => {
  let out = s.replace(/\s+/g, " ");
  for (const re of NOISE) out = out.replace(re, "");
  return out.trim();
};

/** Fold a nested `cause` chain into one line; undici hides the real reason there. */
function withCause(e: unknown, msg: string): string {
  const seen = new Set<unknown>([e]);
  let cur = (e as { cause?: unknown })?.cause;
  const parts: string[] = [];
  while (cur && !seen.has(cur) && parts.length < 3) {
    seen.add(cur);
    const cm = clean(String((cur as Error)?.message ?? cur ?? ""));
    if (cm && cm !== msg && !parts.includes(cm) && !msg.includes(cm)) parts.push(cm);
    cur = (cur as { cause?: unknown })?.cause;
  }
  return parts.length ? `${msg}: ${parts.join(": ")}` : msg;
}

export function classifyProviderError(e: unknown): ProviderError {
  if (e instanceof ProviderError) return e;
  const src = e as { statusCode?: number; status?: number; isRetryable?: boolean; message?: string; name?: string; stack?: string } | undefined;
  const status = typeof src?.statusCode === "number" ? src.statusCode : typeof src?.status === "number" ? src.status : undefined;
  const name = typeof src?.name === "string" ? src.name : "";

  const rawMsg = String(src?.message ?? e ?? "");
  const base = clean(rawMsg).slice(0, 500);
  const msg = withCause(e, base).slice(0, 500);

  // A TypeError with no HTTP status and nothing network-shaped is our bug.
  // Reporting it as a provider error hides real defects, so say so plainly and
  // keep the raw text + stack in `detail` for the session log.
  const networkish = RETRIABLE_PATTERNS.some((p) => p.test(msg));
  if (INTERNAL_NAMES.has(name) && status === undefined && !networkish) {
    const detail = [`${name}: ${rawMsg}`, src?.stack ?? ""].filter(Boolean).join("\n");
    return new ProviderError("internal error — details saved to the session", undefined, false, detail);
  }

  // never render an empty marker: fall back to the error's own name
  const finalMsg = msg || name || "unknown provider error";
  const retriable =
    src?.isRetryable === true || (typeof status === "number" ? status === 429 || status >= 500 : networkish);
  return new ProviderError(finalMsg, status, retriable, rawMsg.length > finalMsg.length ? clean(rawMsg) : undefined);
}

export function errMsg(e: unknown): string {
  return (e instanceof Error ? e.message : String(e)).slice(0, 500);
}
