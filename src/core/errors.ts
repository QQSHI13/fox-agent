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
    /**
     * How long the provider asked us to wait, in ms (a `Retry-After` header).
     * Absent when the response carried none — the caller then uses its own
     * backoff. A rate-limited gateway that says "wait 60s" should be believed.
     */
    readonly retryAfterMs?: number,
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

/**
 * A stream that ENDED without ever delivering a finish reason.
 *
 * The AI SDK's `fullStream` enqueues a `finish` part when the response
 * completes. No `finish` part therefore means the connection was cut
 * mid-answer — and reporting that as `reason: "stop"` claimed a clean success
 * on a truncated reply, so the turn never retried it. `truncated` marks it so
 * the turn loop may retry even after text has streamed: half an answer from a
 * dropped socket is worth replacing, not keeping.
 */
export class TruncatedStreamError extends ProviderError {
  readonly truncated = true;
  constructor(model: string) {
    super(`the stream ended with no finish reason (${model}) — the connection dropped mid-answer`, undefined, true);
  }
}

export const isTruncated = (e: unknown): e is TruncatedStreamError => e instanceof TruncatedStreamError;

/** Read a `Retry-After` header (seconds or an HTTP date) into ms, if present. */
export function retryAfterMs(headers: unknown): number | undefined {
  const h = headers as { get?: (k: string) => string | null } | Record<string, string> | undefined;
  if (!h) return undefined;
  const raw = typeof (h as { get?: unknown }).get === "function" ? (h as { get: (k: string) => string | null }).get("retry-after") : (h as Record<string, string>)["retry-after"];
  if (!raw) return undefined;
  const secs = Number(raw);
  if (Number.isFinite(secs) && secs >= 0) return Math.round(secs * 1000);
  // an HTTP-date form
  const at = Date.parse(raw);
  return Number.isFinite(at) ? Math.max(0, at - Date.now()) : undefined;
}

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

/** Programmer errors — a bug in fox-agent, not a provider fault. */
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
  const src = e as {
    statusCode?: number;
    status?: number;
    isRetryable?: boolean;
    message?: string;
    name?: string;
    stack?: string;
    responseHeaders?: unknown;
  } | undefined;
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
  let finalMsg = msg || name || "unknown provider error";
  // The HTTP status is the first thing a provider error needs to say — a bare
  // "预扣费额度失败" or "Unauthorized" hides whether it's auth, quota, or rate
  // limiting. Prefix it unless the message already carries it.
  if (typeof status === "number" && !new RegExp(`\\b${status}\\b`).test(finalMsg)) {
    finalMsg = `HTTP ${status}: ${finalMsg}`;
  }
  const retriable =
    src?.isRetryable === true || (typeof status === "number" ? status === 429 || status >= 500 : networkish);
  return new ProviderError(
    finalMsg,
    status,
    retriable,
    rawMsg.length > finalMsg.length ? clean(rawMsg) : undefined,
    // a gateway that says "wait 60s" should be believed over our own backoff
    retryAfterMs(src?.responseHeaders),
  );
}

/**
 * A provider error, explained: what most likely went wrong and what to do.
 *
 * A raw upstream string ("Upstream request failed: [invalid_request_error]
 * Invalid max_tokens value…") is technically complete and practically useless —
 * it names a field, not a cause or a fix. These are the common shapes, mapped to
 * the thing the user can actually change.
 */
const DIAGNOSES: { test: RegExp; cause: string; fix: string }[] = [
  { test: /max_tokens|max_output_tokens|maximum context|too long|context length/i, cause: "the request asked for more output tokens than this endpoint allows", fix: "lower sampling.maxOutputTokens in your config, or let the provider pick its own default" },
  { test: /invalid api key|unauthorized|401|authentication|api key not valid|incorrect api key/i, cause: "the API key was rejected", fix: "check the key for this profile (/login re-runs the setup wizard, /model switches profiles)" },
  { test: /insufficient|quota|credit|billing|payment|余额|额度/i, cause: "the account is out of quota or credit", fix: "top up the account, or switch to another profile with /model" },
  { test: /rate.?limit|429|too many requests/i, cause: "the endpoint is rate-limiting this key", fix: "wait, or use another profile; the turn is retried automatically a few times" },
  { test: /model.*not found|unknown model|does not exist|no such model/i, cause: "the endpoint does not serve this model id", fix: "pick a model the endpoint lists (/model, or /models to see the list)" },
  { test: /endpoint is unavailable|service unavailable|overloaded|502|503|504/i, cause: "the provider is down or overloaded", fix: "retry, or switch profile with /model" },
  { test: /fetch failed|ENOTFOUND|ECONNREFUSED|network|socket|dns/i, cause: "the endpoint could not be reached", fix: "check the base URL and the network (a proxy or VPN may be needed)" },
  { test: /timed? ?out|timeout/i, cause: "the provider went quiet before answering", fix: "raise request-timeout-ms, or use a faster model" },
  { test: /stream.*(closed|ended)|connection closed|premature/i, cause: "the provider closed the stream mid-answer", fix: "usually transient — the turn is retried; if it repeats, try another profile" },
  { test: /content.?filter|content.?policy|content_policy|safety|refusal/i, cause: "the request was refused by the provider's safety filter", fix: "rephrase, or use a model without that filter" },
  { test: /tool|function.*(invalid|schema)|json.*invalid/i, cause: "the provider rejected the tool definitions", fix: "an MCP server may be sending a malformed schema; check /mcp" },
];

/**
 * Explain a provider error: the status, the likely cause, and the fix.
 * Returns null when nothing matches — the raw message is then the best we have.
 */
export function diagnoseProviderError(message: string, status?: number): { cause: string; fix: string } | null {
  for (const d of DIAGNOSES) {
    if (d.test.test(message)) return { cause: d.cause, fix: d.fix };
  }
  if (status === 401 || status === 403) return { cause: "the endpoint refused the request (auth or permission)", fix: "check the key and the profile's permissions (/login, /model)" };
  if (status === 404) return { cause: "the endpoint does not have that path or model", fix: "check the base URL and the model id (/model)" };
  if (status !== undefined && status >= 500) return { cause: "the provider is failing on its side", fix: "retry, or switch profile with /model" };
  return null;
}

export function errMsg(e: unknown): string {
  return (e instanceof Error ? e.message : String(e)).slice(0, 500);
}
