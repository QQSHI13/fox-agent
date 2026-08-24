import { describe, expect, test } from "bun:test";
import { classifyProviderError, isTimeout, ProviderError, ProviderTimeoutError } from "../src/core/errors.ts";

describe("classifyProviderError", () => {
  test("passes ProviderError through untouched", () => {
    const pe = new ProviderError("already classified", 429, true);
    expect(classifyProviderError(pe)).toBe(pe);
  });

  // The reported bug: raw SDK text landed in the chat transcript verbatim,
  // including debugging advice aimed at whoever called fetch().
  test("strips SDK debugging tails from the transcript message", () => {
    const raw =
      "The socket connection was closed unexpectedly. For more information, pass `verbose: true` in the second argument to fetch()";
    const pe = classifyProviderError(new TypeError(raw));
    expect(pe.message).toBe("The socket connection was closed unexpectedly.");
    expect(pe.message).not.toMatch(/verbose/);
    expect(pe.message).not.toMatch(/fetch\(\)/);
  });

  test("unwraps cause so the real reason survives", () => {
    const e = new TypeError("fetch failed");
    (e as { cause?: unknown }).cause = new Error("HeadersTimeoutError: Headers Timeout Error");
    const pe = classifyProviderError(e);
    // previously the cause was dropped and the user saw only "fetch failed"
    expect(pe.message).toContain("fetch failed");
    expect(pe.message).toContain("Headers Timeout Error");
  });

  test("a bare TypeError never renders as an empty marker", () => {
    // regression: message "" produced a transcript line of just "✗ error "
    const pe = classifyProviderError(new TypeError());
    expect(pe.message.length).toBeGreaterThan(0);
  });

  test("collapses whitespace and caps length", () => {
    const pe = classifyProviderError(new Error("a\n\n  b\tc"));
    expect(pe.message).toBe("a b c");
    expect(classifyProviderError(new Error("x".repeat(900))).message.length).toBeLessThanOrEqual(500);
  });

  test("non-Error values still classify", () => {
    expect(classifyProviderError("plain string boom").message).toBe("plain string boom");
    expect(classifyProviderError(undefined).message).toBe("unknown provider error");
    expect(classifyProviderError(null).message).toBe("unknown provider error");
  });
});

describe("code bugs are not disguised as provider faults", () => {
  test("a real TypeError is reported as internal, with detail off-transcript", () => {
    let caught: unknown;
    try {
      (undefined as unknown as { foo: { bar: number } }).foo.bar;
    } catch (e) {
      caught = e;
    }
    const pe = classifyProviderError(caught);
    // the transcript must not carry raw interpreter text
    expect(pe.message).toBe("internal error — details saved to the session");
    expect(pe.message).not.toMatch(/undefined is not an object/);
    // ...but the detail is preserved for the session log / bug reports
    expect(pe.detail).toMatch(/TypeError/);
    expect(pe.detail).toMatch(/undefined is not an object/);
    // never retry a deterministic bug
    expect(pe.retriable).toBe(false);
  });

  test("ReferenceError and SyntaxError are treated the same way", () => {
    for (const e of [new ReferenceError("x is not defined"), new SyntaxError("Unexpected token")]) {
      const pe = classifyProviderError(e);
      expect(pe.message).toBe("internal error — details saved to the session");
      expect(pe.retriable).toBe(false);
    }
  });

  test("a network-shaped TypeError is still a provider error, not internal", () => {
    // TypeError("fetch failed") is how undici reports transport death — it is
    // NOT a code bug, so it must keep its message and stay retriable
    const pe = classifyProviderError(new TypeError("fetch failed"));
    expect(pe.message).toBe("fetch failed");
    expect(pe.retriable).toBe(true);
  });

  test("an HTTP status means it came from the provider, never internal", () => {
    const e = new TypeError("weird upstream");
    (e as { status?: number }).status = 500;
    const pe = classifyProviderError(e);
    expect(pe.message).toBe("weird upstream");
    expect(pe.retriable).toBe(true);
  });
});

describe("retriable classification", () => {
  // every string below was captured from a real Bun/undici failure; before the
  // fix all but the timeout ones were classified permanent and never retried
  const transport = [
    "The socket connection was closed unexpectedly.",
    "terminated",
    "Connection closed",
    "other side closed",
    "premature close",
    "The operation timed out.",
    "The operation was aborted due to timeout",
    "fetch failed",
    "read ECONNRESET",
    "connect ECONNREFUSED 127.0.0.1:443",
    "write EPIPE",
    "socket hang up",
    "getaddrinfo EAI_AGAIN api.example.com",
    "connect ETIMEDOUT",
    "connect EHOSTUNREACH",
    "connect ENETUNREACH",
  ];
  for (const msg of transport) {
    test(`retriable: ${msg.slice(0, 42)}`, () => {
      expect(classifyProviderError(new Error(msg)).retriable).toBe(true);
    });
  }

  test("429 and 5xx are retriable by status", () => {
    for (const status of [429, 500, 502, 503, 504]) {
      const e = new Error("upstream unhappy");
      (e as { status?: number }).status = status;
      expect(classifyProviderError(e).retriable).toBe(true);
    }
  });

  test("4xx client errors are NOT retriable", () => {
    for (const status of [400, 401, 403, 404, 422]) {
      const e = new Error("bad request");
      (e as { statusCode?: number }).statusCode = status;
      const pe = classifyProviderError(e);
      expect(pe.retriable).toBe(false);
      expect(pe.status).toBe(status);
    }
  });

  test("isRetryable from the SDK wins", () => {
    const e = new Error("a permanent-looking message");
    (e as { isRetryable?: boolean }).isRetryable = true;
    expect(classifyProviderError(e).retriable).toBe(true);
  });

  test("an ordinary refusal is not retriable", () => {
    expect(classifyProviderError(new Error("invalid model name")).retriable).toBe(false);
  });
});

describe("ProviderTimeoutError", () => {
  test("is retriable, readable, and not an AbortError", () => {
    const e = new ProviderTimeoutError(120_000);
    expect(e.retriable).toBe(true);
    expect(e.message).toBe("provider timed out after 120s with no response");
    // the turn loop keys on this: an AbortError name would end the turn as
    // "aborted" instead of retrying
    expect(e.name).not.toBe("AbortError");
    expect(isTimeout(e)).toBe(true);
  });

  test("isTimeout only matches our own timeout", () => {
    expect(isTimeout(new ProviderError("timed out", undefined, true))).toBe(false);
    const abort = new Error("aborted");
    abort.name = "AbortError";
    expect(isTimeout(abort)).toBe(false);
  });

  test("survives classifyProviderError unchanged", () => {
    const e = new ProviderTimeoutError(3_000);
    const pe = classifyProviderError(e);
    expect(pe).toBe(e);
    expect(isTimeout(pe)).toBe(true);
  });
});
