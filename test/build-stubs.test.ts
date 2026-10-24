// Build-time stub modules (`build/stubs/`) are substituted for real packages by
// `build.ts`, so nothing else in the suite ever imports them — a stub can drift
// from the interface the real package exposes and no test would notice until a
// user hit the one code path that touches it.
//
// That is exactly what happened: `ai` calls the STATIC `GatewayError.isInstance`
// (from `shouldRetry`) and `GatewayAuthenticationError.isInstance` (from
// `wrapGatewayError`), but the stub exported bare `class … extends Error {}`.
// Both calls therefore threw `TypeError: isInstance is not a function` instead
// of reporting the real provider error. It stayed invisible because the retry
// check short-circuits on `APICallError` first — which is what a normal provider
// failure is — so only a non-API error reaching `shouldRetry`, or any error at
// all reaching `wrapGatewayError`, took the broken branch.
//
// These assertions pin the SURFACE the real package must keep providing, not the
// stub's internals.
import { describe, expect, test } from "bun:test";

describe("build stubs", () => {
  test("ai-sdk-gateway: the statics `ai` actually calls exist and answer false", async () => {
    const m = await import("../build/stubs/ai-sdk-gateway.ts");
    const err = new Error("boom");

    // `false` is the semantically right answer, not a dummy value: a gateway
    // error cannot exist when the gateway is not in the bundle, so no value
    // could ever carry this module's marker.
    expect((m.GatewayError as unknown as { isInstance(e: unknown): boolean }).isInstance(err)).toBe(false);
    expect(
      (m.GatewayAuthenticationError as unknown as { isInstance(e: unknown): boolean }).isInstance(err),
    ).toBe(false);

    // and it must not throw on the odd inputs `ai` passes (null, undefined, the
    // error-shaped object it sometimes gets from a stream instead of an Error)
    for (const v of [null, undefined, {}, "err", 0]) {
      expect((m.GatewayError as unknown as { isInstance(e: unknown): boolean }).isInstance(v)).toBe(false);
    }
  });

  test("ai-sdk-gateway: reaching the provider itself names the fix instead of failing obscurely", async () => {
    const m = await import("../build/stubs/ai-sdk-gateway.ts");
    // The stub's whole contract: if fox ever takes the global-default-provider
    // path, the error says why and what to do, rather than the SDK's
    // "no API key configured" path that would send a reader hunting for a key.
    expect(() => (m.createGateway as unknown as () => unknown)()).toThrow(/not bundled in fox-agent/);
    // the proxy form must refuse too, not return undefined for a method call
    const gw = m.gateway as Record<string, unknown>;
    expect(() => (gw.languageModel as unknown as (id: string) => unknown)("x")).toThrow(/not bundled/);
  });

  test("mcp-ajv-validator: accepts every input, which is the honest no-op", async () => {
    const m = await import("../build/stubs/mcp-ajv-validator.ts");
    const v = new m.AjvJsonSchemaValidator();
    const validate = v.getValidator({ type: "object" });
    // fox never consumed the validator's verdict, so "accepts everything" is the
    // behavior nothing was ever derived from — but the shape must hold, or the
    // MCP client's cacheToolMetadata throws while registering a tool.
    expect(validate({ anything: true })).toBe(true);
    expect(validate(undefined)).toBe(true);
    // a boolean, never undefined — the SDK branches on the return value, so a
    // falsy-but-not-false return would read as "invalid" instead of "accepted"
    expect(typeof validate(null)).toBe("boolean");
  });
});
