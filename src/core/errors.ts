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
  ) {
    super(message);
  }
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
];

export function classifyProviderError(e: unknown): ProviderError {
  if (e instanceof ProviderError) return e;
  const src = e as { statusCode?: number; status?: number; isRetryable?: boolean; message?: string } | undefined;
  const msg = String(src?.message ?? e ?? "unknown provider error").replace(/\s+/g, " ").slice(0, 500);
  const status = typeof src?.statusCode === "number" ? src.statusCode : typeof src?.status === "number" ? src.status : undefined;
  const retriable =
    src?.isRetryable === true ||
    (typeof status === "number" ? status === 429 || status >= 500 : RETRIABLE_PATTERNS.some((p) => p.test(msg)));
  return new ProviderError(msg, status, retriable);
}

export function errMsg(e: unknown): string {
  return (e instanceof Error ? e.message : String(e)).slice(0, 500);
}
